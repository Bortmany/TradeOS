/// <reference types="vite/client" />
// THE SAFETY LINE. Every broker connection is read-only: TradeOS only reads
// fills, positions and balances and never places, changes or cancels an order or
// closes a position. Proved four ways: (1) no module exports such a function,
// (2) the source has no order address and every gateway path it names is on the
// allow-list, (3) a full poll + sync against a faked network only ever makes
// permitted requests to registry hosts, (4) keys and session tokens never reach a
// log or an API response. All with recorded-style fixtures: no real network, no
// funded or personal account.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { ALLOWED_HOSTS, FIRMS } from "@/lib/connectors/firms";
import { ALLOWED_PATHS, pxLogin, pxPost, ConnectorError } from "@/lib/connectors/topstepx";
import { syncConnection } from "@/lib/connectors/sync";
import { runLiveTick } from "@/lib/live/poller";
import { CallBudget } from "@/lib/live/budget";
import { clearSessionTokens } from "@/lib/connectors/session";
import { FAKE_KEY, FAKE_TOKEN, MES, installFakeGateway } from "./fixtures/projectx";
import { cleanup, connect, makeTrader } from "./fixtures/live-helpers";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));
vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (u: unknown, ...a: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) =>
      handler(session.current, ...args),
  requireUser: async () => session.current,
  getCurrentUser: async () => session.current,
}));

const T0 = new Date("2026-10-02T18:00:00Z");
const FORBIDDEN_NAME = /order|close|flatten|cancel|place|modify|liquidate|reduce/i;

const dirs = ["../src/lib/connectors", "../src/lib/live"];
const files = dirs.flatMap((d) =>
  readdirSync(fileURLToPath(new URL(d, import.meta.url)))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: `${d.split("/").pop()}/${f}`, path: fileURLToPath(new URL(`${d}/${f}`, import.meta.url)) }))
);

let gw: ReturnType<typeof installFakeGateway>;
let logs: string[];

beforeEach(async () => {
  await prisma.brokerConnection.deleteMany();
  clearSessionTokens();
  logs = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  }
});
afterEach(() => {
  gw?.restore();
  vi.restoreAllMocks();
});
afterAll(cleanup);

describe("no order function, no order address", () => {
  const modules = import.meta.glob("../src/lib/{connectors,live}/*.ts") as Record<
    string,
    () => Promise<Record<string, unknown>>
  >;

  it("looks at every connector and live module (the walk is not empty)", () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(8);
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const [path, load] of Object.entries(modules)) {
    it(`${path.replace("../src/lib/", "")} exports nothing that places, changes, cancels or closes`, async () => {
      const mod = await load();
      for (const name of Object.keys(mod)) {
        expect(name, `${path} exports "${name}"`).not.toMatch(FORBIDDEN_NAME);
      }
    });
  }

  it("no source file in the connector or live folders names an order or close-position address", () => {
    for (const f of files) {
      const src = readFileSync(f.path, "utf8");
      expect(src, f.name).not.toMatch(/Order\//);
      expect(src, f.name).not.toMatch(/closeContract|partialClose|\/api\/Order/i);
    }
  });

  it("the allow-list is the ONLY list of gateway paths: every /api/... address in the source is on it", () => {
    expect([...ALLOWED_PATHS].sort()).toEqual(
      [
        "/api/Account/search",
        "/api/Auth/loginKey",
        "/api/History/retrieveBars",
        "/api/Position/searchOpen",
        "/api/Trade/search",
      ].sort()
    );
    for (const f of files) {
      const src = readFileSync(f.path, "utf8");
      for (const m of src.matchAll(/["'`](\/api\/[A-Za-z]+\/[A-Za-z]+)["'`]/g)) {
        expect(ALLOWED_PATHS, `${f.name} names ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it("the HTTP helper itself refuses a path that is not on the list (no request is made)", async () => {
    gw = installFakeGateway();
    const orderPath = "/api/" + "Ord" + "er/place"; // built here so no source file names it
    await expect(pxPost("https://api.topstepx.com", orderPath, {}, FAKE_TOKEN)).rejects.toThrow(ConnectorError);
    await expect(pxPost("https://api.topstepx.com", "/api/Position/closeIt", {}, FAKE_TOKEN)).rejects.toThrow(
      ConnectorError
    );
    expect(gw.calls).toHaveLength(0);
  });
});

describe("only registry hosts are called", () => {
  it("the allow-list is exactly the firm registry (and no bridge host sneaked in)", () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(FIRMS.map((f) => new URL(f.apiBase).hostname).sort());
    for (const h of ALLOWED_HOSTS) expect(h).not.toMatch(/metaapi|mt5|metatrader/i);
  });

  it("a host that is not on the registry is refused before any request", async () => {
    gw = installFakeGateway();
    await expect(pxLogin("https://evil.example.com", "u", FAKE_KEY)).rejects.toThrow(ConnectorError);
    await expect(pxLogin("http://api.topstepx.com", "u", FAKE_KEY)).rejects.toThrow(ConnectorError);
    await expect(pxLogin("https://169.254.169.254", "u", FAKE_KEY)).rejects.toThrow(ConnectorError);
    expect(gw.calls).toHaveLength(0);
  });

  it("a stored connection with a bad address is never fetched and is marked, not retried", async () => {
    const t = await makeTrader();
    const conn = await connect(t, { baseUrl: "https://evil.example.com" });
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(gw.calls).toHaveLength(0);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("rejected");
  });
});

describe("a full poll and sync make only permitted requests", () => {
  it("every request is a POST to a registry host on an allow-listed read path", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({
      balances: { "123": 50000 },
      positions: { "123": [{ contractId: MES, type: 1, size: 2, averagePrice: 5210.25 }] },
      bars: { [MES]: 5198.25 },
    });
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    await syncConnection(conn.id, t.userId);
    await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget: new CallBudget(100, () => 61_000) });

    expect(gw.calls.length).toBeGreaterThan(4);
    expect(gw.violations).toEqual([]);
    for (const c of gw.calls) {
      expect(c.method).toBe("POST");
      expect(ALLOWED_HOSTS.has(c.host)).toBe(true);
      expect(ALLOWED_PATHS).toContain(c.path);
    }
    const paths = new Set(gw.calls.map((c) => c.path));
    expect(paths).toEqual(
      new Set([
        "/api/Auth/loginKey",
        "/api/Account/search",
        "/api/Position/searchOpen",
        "/api/History/retrieveBars",
        "/api/Trade/search",
      ])
    );
  });
});

describe("keys never logged or returned", () => {
  it("connect, poll, failure and the API responses never carry the key or a token", async () => {
    const t = await makeTrader({ prefix: "keys" });
    session.current = { id: t.userId, email: t.email, plan: "elite", billingStatus: "active" };
    gw = installFakeGateway({ balances: { "123": 50000 } });
    const responses: string[] = [];
    const take = async (res: Response) => {
      responses.push(await res.clone().text());
      return res;
    };

    const connectors = await import("@/app/api/connectors/route");
    const alertsRoute = await import("@/app/api/alerts/route");
    const post = (body: unknown) =>
      new Request("http://localhost/api/connectors", { method: "POST", body: JSON.stringify(body) });

    // Discover and connect with the recognisable fake key.
    await take(await connectors.POST(post({ action: "discover", firm: "topstepx", username: "u1", apiKey: FAKE_KEY })));
    await take(
      await connectors.POST(
        post({
          action: "connect",
          firm: "topstepx",
          username: "u1",
          apiKey: FAKE_KEY,
          externalAccountId: "123",
          externalAccountName: "Practice 123",
        })
      )
    );
    // A poll, a failing poll, a rejected key.
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    gw.state.mode = "network";
    await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget: new CallBudget(100, () => 61_000) });
    gw.state.mode = "reject-login";
    clearSessionTokens();
    await take(await connectors.POST(post({ action: "discover", firm: "topstepx", username: "u1", apiKey: FAKE_KEY })));
    await take(await connectors.GET());
    await take(await alertsRoute.GET());

    expect(responses.length).toBeGreaterThanOrEqual(5);
    for (const body of responses) {
      expect(body).not.toContain(FAKE_KEY);
      expect(body).not.toContain(FAKE_TOKEN);
      expect(body).not.toContain("apiKeyEnc");
    }
    for (const line of logs) {
      expect(line).not.toContain(FAKE_KEY);
      expect(line).not.toContain(FAKE_TOKEN);
    }
    // The saved row holds the key only encrypted.
    const rows = await prisma.brokerConnection.findMany({ where: { userId: t.userId } });
    expect(rows.length).toBe(1);
    expect(rows[0].apiKeyEnc).not.toContain(FAKE_KEY);
  });
});
