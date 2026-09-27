// Testing Portal ownership, through the REAL routes and page data loaders.
//
// One trader must never be able to view, rename, delete, or run a test on
// another trader's backtest run or market dataset. Every attempt must come
// back "not found" (404) — never revealing the other trader's data — and the
// other trader's rows must be byte-for-byte unchanged afterwards. Positive
// controls prove the same calls DO work on the trader's own data, so "blocked"
// can never be confused with "broken".
//
// Same approach as backtest-data-rights.test.ts: call the handlers against the
// throwaway SQLite database with a settable "who is signed in".

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
}));

import { PATCH as updateRun, DELETE as deleteRun } from "@/app/api/backtests/[id]/route";
import { DELETE as deleteDataset } from "@/app/api/backtests/datasets/route";
import { POST as createRun } from "@/app/api/backtests/route";
import { getBacktestRun, getBacktestRuns, getMarketDatasets } from "@/lib/backtest-data";
import { resetRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();

type Trader = { id: string; email: string; runId: string; datasetId: string };

async function makeTrader(label: string): Promise<Trader> {
  const email = `bt-own-${label}-${stamp}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: label, plan: "pro" },
  });
  const dataset = await prisma.marketDataset.create({
    data: {
      userId: user.id,
      name: `${label} ES 5m`,
      symbol: "ES",
      candleCount: 1,
      candles: JSON.stringify([{ t: 1751808600, o: 1, h: 2, l: 0.5, c: 1.5 }]),
    },
  });
  const run = await prisma.backtestRun.create({
    data: {
      userId: user.id,
      name: `${label} ORB test`,
      kind: "simulation",
      config: "{}",
      results: "{}",
      notes: `${label}'s private note`,
      datasetId: dataset.id,
    },
  });
  return { id: user.id, email, runId: run.id, datasetId: dataset.id };
}

function signIn(t: Trader) {
  session.current = {
    id: t.id,
    email: t.email,
    displayName: null,
    plan: "pro",
    billingStatus: "active",
    timezone: "UTC",
    trialEndsAt: null,
  };
}

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/backtests", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// A full snapshot of the victim's rows, so "unchanged" means every column.
async function snapshot(t: Trader) {
  return {
    run: await prisma.backtestRun.findUnique({ where: { id: t.runId } }),
    dataset: await prisma.marketDataset.findUnique({ where: { id: t.datasetId } }),
    runCount: await prisma.backtestRun.count({ where: { userId: t.id } }),
  };
}

let alice: Trader;
let bob: Trader;
let bobBefore: Awaited<ReturnType<typeof snapshot>>;

beforeAll(async () => {
  alice = await makeTrader("alice");
  bob = await makeTrader("bob");
  bobBefore = await snapshot(bob);
});

beforeEach(() => {
  for (const t of [alice, bob]) {
    resetRateLimit(`backtests:${t.id}`);
    resetRateLimit(`backtests-datasets:${t.id}`);
    resetRateLimit(`backtests-datasets-delete:${t.id}`);
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `bt-own-` } } });
  await prisma.$disconnect();
});

describe("one trader cannot touch another trader's Testing Portal data", () => {
  it("cannot view another trader's run or dataset", async () => {
    // The results page loads through getBacktestRun and shows "not found" on null.
    expect(await getBacktestRun(alice.id, bob.runId)).toBeNull();
    // Positive control: the owner can view it.
    expect((await getBacktestRun(bob.id, bob.runId))?.notes).toBe("bob's private note");

    const runIds = (await getBacktestRuns(alice.id)).map((r) => r.id);
    expect(runIds).toEqual([alice.runId]);
    const datasetIds = (await getMarketDatasets(alice.id)).map((d) => d.id);
    expect(datasetIds).toEqual([alice.datasetId]);
  });

  it("cannot rename or re-note another trader's run", async () => {
    signIn(alice);
    const res = await updateRun(
      json("PATCH", { name: "hijacked", notes: "overwritten" }),
      ctx(bob.runId)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("bob");
    expect(await snapshot(bob)).toEqual(bobBefore);
  });

  it("cannot delete another trader's run", async () => {
    signIn(alice);
    const res = await deleteRun(json("DELETE", {}), ctx(bob.runId));
    expect(res.status).toBe(404);
    expect(await snapshot(bob)).toEqual(bobBefore);
  });

  it("cannot delete another trader's dataset", async () => {
    signIn(alice);
    const res = await deleteDataset(json("DELETE", { id: bob.datasetId }));
    expect(res.status).toBe(404);
    expect(await snapshot(bob)).toEqual(bobBefore);
  });

  it("cannot run a simulation on another trader's dataset", async () => {
    signIn(alice);
    const res = await createRun(
      json("POST", {
        kind: "simulation",
        name: "borrowed data",
        datasetId: bob.datasetId,
        strategy: "opening_range_breakout",
      })
    );
    expect(res.status).toBe(404);
    expect(await prisma.backtestRun.count({ where: { userId: alice.id } })).toBe(1);
    expect(await snapshot(bob)).toEqual(bobBefore);
  });

  it("positive control: the owner can rename and delete their own run and dataset", async () => {
    signIn(alice);
    const renamed = await updateRun(json("PATCH", { name: "alice renamed" }), ctx(alice.runId));
    expect(renamed.status).toBe(200);
    expect((await prisma.backtestRun.findUnique({ where: { id: alice.runId } }))?.name).toBe(
      "alice renamed"
    );

    expect((await deleteDataset(json("DELETE", { id: alice.datasetId }))).status).toBe(200);
    expect(await prisma.marketDataset.findUnique({ where: { id: alice.datasetId } })).toBeNull();

    expect((await deleteRun(json("DELETE", {}), ctx(alice.runId))).status).toBe(200);
    expect(await prisma.backtestRun.findUnique({ where: { id: alice.runId } })).toBeNull();

    // Bob is still untouched after all of Alice's activity.
    expect(await snapshot(bob)).toEqual(bobBefore);
  });
});

describe("dataset delete has its own rate limit", () => {
  it("using up the upload allowance does not block deleting a dataset", async () => {
    signIn(bob);
    // Exhaust the upload bucket with (cheap, invalid) upload attempts.
    const { POST: upload } = await import("@/app/api/backtests/datasets/route");
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await upload(json("POST", {}))).status;
    expect(last).toBe(429);

    const extra = await prisma.marketDataset.create({
      data: { userId: bob.id, name: "spare", symbol: "ES", candleCount: 0, candles: "[]" },
    });
    const res = await deleteDataset(json("DELETE", { id: extra.id }));
    expect(res.status).toBe(200);
    expect(await prisma.marketDataset.findUnique({ where: { id: extra.id } })).toBeNull();
  });
});
