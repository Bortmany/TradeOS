// The near-live reader, end to end against a FAKED gateway (recorded-style
// responses in test/fixtures/projectx.ts). No real network, no funded or
// personal account. Covers: open P&L estimated from a bar, MCL "not priced",
// one login a day, the 60-second floor, the call budget (many connections),
// 429 back-off and resume, an unreachable broker, a rejected key, alerts
// following reads, and two consecutive ticks both running.

import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { runLiveTick } from "@/lib/live/poller";
import { CallBudget } from "@/lib/live/budget";
import { clearSessionTokens } from "@/lib/connectors/session";
import { REJECTED_MESSAGE, UNREACHABLE_MESSAGE } from "@/lib/live/messages";
import {
  FAKE_KEY,
  FAKE_TOKEN,
  MES,
  MCL,
  ES,
  installFakeGateway,
  fill,
} from "./fixtures/projectx";
import { addClosedTrade, cleanup, connect, makeTrader, metaOf, openAlerts } from "./fixtures/live-helpers";

const T0 = new Date("2026-10-02T18:00:00Z"); // 2:00 PM New York
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

let gw: ReturnType<typeof installFakeGateway>;
let logs: string[];

function budgetAt(clock: { t: number }) {
  return new CallBudget(100, () => clock.t);
}

beforeEach(async () => {
  await prisma.brokerConnection.deleteMany(); // the test DB is throwaway
  clearSessionTokens();
  logs = [];
  vi.useFakeTimers({ toFake: ["Date"] }); // pretend clock = T0 (see live-fixes.test.ts)
  vi.setSystemTime(T0);
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
    });
  }
});

afterEach(() => {
  gw?.restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(cleanup);

describe("a good read", () => {
  it("saves balance and positions; estimates open P&L from the latest 1-minute bar", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({
      balances: { "123": 50123.45 },
      // 2 MES long from 5210.25; the 1-minute bar closed at 5198.25 => -12 pts x 2 x $5 = -$120
      positions: { "123": [{ contractId: MES, type: 1, size: 2, averagePrice: 5210.25 }] },
      bars: { [MES]: 5198.25 },
    });

    const stats = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(stats).toMatchObject({ reads: 1, failed: 0 });

    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.lastBalance).toBe(50123.45);
    expect(row.lastLiveAt?.toISOString()).toBe(T0.toISOString());
    expect(row.liveStatus).toBe("ok");
    expect(row.lastLiveError).toBeNull();

    const snaps = await prisma.positionSnapshot.findMany({ where: { connectionId: conn.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      symbol: "MES",
      side: "long",
      size: 2,
      avgPrice: 5210.25,
      lastPrice: 5198.25,
      priceSource: "bar",
      openPnl: -120,
      notPricedReason: null,
    });
    expect(gw.violations).toEqual([]);
  });

  it("uses the broker's own price when it sends one (no price lookup at all)", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({
      balances: { "123": 50000 },
      positions: { "123": [{ contractId: ES, type: 2, size: 1, averagePrice: 5000, currentPrice: 4990 }] },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(gw.count("/api/History/retrieveBars")).toBe(0);
    const [snap] = await prisma.positionSnapshot.findMany({ where: { userId: t.userId } });
    expect(snap).toMatchObject({ priceSource: "broker", openPnl: 500 }); // short 1 ES, 10 pts x $50
  });

  it("MCL has no point value: stored as 'not priced', no price lookup spent on it", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({
      balances: { "123": 50000 },
      positions: {
        "123": [
          { contractId: MCL, type: 1, size: 1, averagePrice: 70 },
          { contractId: MES, type: 1, size: 1, averagePrice: 5200 },
        ],
      },
      bars: { [MCL]: 71, [MES]: 5195 },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const snaps = await prisma.positionSnapshot.findMany({ where: { userId: t.userId }, orderBy: { symbol: "asc" } });
    const mcl = snaps.find((s) => s.symbol === "MCL")!;
    expect(mcl.openPnl).toBeNull();
    expect(mcl.notPricedReason).toBe("no_point_value");
    expect(gw.count("/api/History/retrieveBars")).toBe(1); // MES only
    expect(snaps.find((s) => s.symbol === "MES")?.openPnl).toBe(-25);
  });

  it("each read replaces the snapshot (no history kept)", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({
      balances: { "123": 50000 },
      positions: { "123": [{ contractId: MES, type: 1, size: 1, averagePrice: 5200 }] },
      bars: { [MES]: 5200 },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    gw.state.positions["123"] = []; // flat now
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(await prisma.positionSnapshot.count({ where: { connectionId: conn.id } })).toBe(0);
  });
});

describe("one login a day, and the 60-second floor", () => {
  it("two ticks a minute apart log in ONCE (the token is reused)", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    await runLiveTick({ now: at(122), budget: budgetAt({ t: 122_000 }) });
    expect(gw.count("/api/Auth/loginKey")).toBe(1);
    expect(gw.count("/api/Position/searchOpen")).toBe(3);
  });

  it("a rejected token is replaced with one fresh login, once", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    gw.state.expireTokenOnce = true;
    const stats = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(stats.reads).toBe(1);
    expect(gw.count("/api/Auth/loginKey")).toBe(2);
  });

  it("never reads an account faster than once a minute", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const before = gw.calls.length;
    const stats = await runLiveTick({ now: at(20), budget: budgetAt({ t: 20_000 }) });
    expect(stats.reads).toBe(0);
    expect(gw.calls.length).toBe(before);
  });

  it("switching Near-live off stops reads at the next tick", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { nearLive: false } });
    const before = gw.calls.length;
    const stats = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(stats.groups).toBe(0);
    expect(gw.calls.length).toBe(before);
  });
});

describe("the call budget", () => {
  it("with 40 traders the first minute stays within 100 calls, then the rest are served (stalest first)", async () => {
    const t = await makeTrader();
    // 40 connections on 40 broker accounts under 40 different broker usernames: 3 calls each.
    const accounts: string[] = [t.accountId];
    for (let i = 1; i < 40; i++) {
      const extra = await prisma.tradingAccount.create({
        data: { userId: t.userId, name: `Extra ${i}`, broker: "topstepx", kind: "funded" },
      });
      accounts.push(extra.id);
    }
    for (let i = 0; i < 40; i++) {
      await connect(
        { userId: t.userId, accountId: accounts[i] },
        { username: `bulk-${i}-${Date.now()}`, externalAccountId: String(1000 + i) }
      );
    }
    const balances: Record<string, number> = {};
    for (let i = 0; i < 40; i++) balances[String(1000 + i)] = 50000;
    gw = installFakeGateway({ balances });

    const clock = { t: 0 };
    const budget = budgetAt(clock);
    const first = await runLiveTick({ now: T0, budget });
    expect(gw.calls.length).toBeLessThanOrEqual(100);
    expect(first.reads).toBeLessThan(40);
    expect(first.reads).toBeGreaterThan(0);

    clock.t = 61_000;
    const second = await runLiveTick({ now: at(61), budget });
    expect(gw.calls.length).toBeLessThanOrEqual(200);
    // The ones not served first are served now: everyone has been read at least once.
    const unread = await prisma.brokerConnection.count({ where: { userId: t.userId, lastLiveAt: null } });
    expect(unread).toBe(0);
    expect(first.reads + second.reads).toBeGreaterThanOrEqual(40);
  });

  it("a 429 makes the poller wait (Retry-After honoured), then resume", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "rate-limit", retryAfter: "90" });
    const clock = { t: 0 };
    const budget = budgetAt(clock);

    const hit = await runLiveTick({ now: T0, budget });
    expect(hit.reads).toBe(0);
    expect(budget.inBackoff()).toBe(true);
    expect(budget.backoffRemainingMs()).toBe(90_000);

    // Still waiting: the next tick makes no calls at all.
    const before = gw.calls.length;
    clock.t = 61_000;
    const waiting = await runLiveTick({ now: at(61), budget });
    expect(waiting.skipped).toBe("backoff");
    expect(gw.calls.length).toBe(before);

    // Wait is over and the broker is back: reads resume.
    gw.state.mode = "ok";
    clock.t = 95_000;
    const resumed = await runLiveTick({ now: at(95), budget });
    expect(resumed.reads).toBe(1);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("ok");
  });

  it("without a Retry-After the wait is 30 seconds, then longer", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "rate-limit" });
    const clock = { t: 0 };
    const budget = budgetAt(clock);
    await runLiveTick({ now: T0, budget });
    expect(budget.backoffRemainingMs()).toBe(30_000);
  });
});

describe("when the broker cannot be reached or the key is bad", () => {
  it("unreachable: marked, nothing crashes, alerts and the old snapshot stay", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, -850, T0); // 85% of the $1,000 daily limit, closed only
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const before = await openAlerts(t.userId);
    expect(before.find((a) => metaOf(a).measure === "daily_loss")).toBeTruthy();

    gw.state.mode = "network";
    const stats = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(stats.failed).toBe(1);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("unreachable");
    expect(row.lastLiveError).toBe(UNREACHABLE_MESSAGE);
    expect(row.lastLiveAt?.toISOString()).toBe(T0.toISOString()); // the last GOOD read time is kept

    const after = await openAlerts(t.userId);
    expect(after.map((a) => a.id).sort()).toEqual(before.map((a) => a.id).sort());
    // A failed read touches neither the 30-minute sync's status nor its error.
    expect(row.status).toBe("connected");
    expect(row.lastError).toBeNull();
  });

  it("a server error is reported as unreachable too, with a fixed message", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "server-error" });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("unreachable");
    expect(row.lastLiveError).toContain("Can't reach TopstepX");
  });

  it("a rejected key stops reads until the trader reconnects (no retry loop)", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ mode: "reject-login" });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("rejected");
    expect(row.lastLiveError).toBe(REJECTED_MESSAGE);

    const before = gw.calls.length;
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    await runLiveTick({ now: at(122), budget: budgetAt({ t: 122_000 }) });
    expect(gw.calls.length).toBe(before); // not one more call
  });
});

describe("alerts follow reads", () => {
  it("an open loss moves the daily-loss alert to 80% within the read, and it clears itself when flat", async () => {
    const t = await makeTrader();
    await connect(t);
    await addClosedTrade(t, -700, at(-3600));
    gw = installFakeGateway({
      balances: { "123": 1 },
      positions: { "123": [{ contractId: MES, type: 1, size: 2, averagePrice: 5210.25 }] },
      bars: { [MES]: 5198.25 }, // -$120 open
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });

    const dl = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(dl).toHaveLength(1);
    expect(metaOf(dl[0])).toMatchObject({
      step: 80,
      value: 820,
      limit: 1000,
      left: 180,
      usedPct: 82,
      source: "live",
      openCount: 1,
      openEstimated: true,
      unpricedCount: 0,
      asAt: T0.toISOString(),
    });
    expect(dl[0].message).toContain("82% used");
    const firstId = dl[0].id;

    // Position closed but its closed trade has not arrived yet: the -$120 open loss stays
    // counted (the warning must not drop in the gap). Same row, still 80%.
    gw.state.positions["123"] = [];
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    const mid = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(mid).toHaveLength(1);
    expect(mid[0].id).toBe(firstId);
    expect(metaOf(mid[0])).toMatchObject({ step: 80, value: 820, openCount: 0, pendingCloseLoss: -120 });

    // The fills arrive (-$120 realized): the closed trade replaces the protected open loss.
    gw.state.fills["123"] = [
      fill(1, MES, 0, 2, 5210.25, at(-60)),
      fill(2, MES, 1, 2, 5198.25, at(90), -120),
    ];
    await runLiveTick({ now: at(122), budget: budgetAt({ t: 122_000 }) });
    const landed = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(landed[0].id).toBe(firstId);
    expect(metaOf(landed[0])).toMatchObject({ step: 80, value: 820, pendingCloseLoss: 0 });

    // The loss recovers below half: the alert closes itself.
    await addClosedTrade(t, 400, at(130));
    await runLiveTick({ now: at(183), budget: budgetAt({ t: 183_000 }) });
    const end = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(end).toHaveLength(0);
    const resolved = await prisma.alert.findUniqueOrThrow({ where: { id: firstId } });
    expect(resolved.status).toBe("resolved");
  });

  it("an unpriced contract is counted and said so, not guessed", async () => {
    const t = await makeTrader();
    await connect(t);
    await addClosedTrade(t, -600, T0);
    gw = installFakeGateway({
      balances: { "123": 1 },
      positions: { "123": [{ contractId: MCL, type: 1, size: 3, averagePrice: 70 }] },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const dl = (await openAlerts(t.userId)).find((a) => metaOf(a).measure === "daily_loss")!;
    expect(metaOf(dl)).toMatchObject({ value: 600, openCount: 1, unpricedCount: 1, source: "live" });
  });
});

describe("two consecutive ticks both run", () => {
  it("the single-runner guard is released after each tick", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    const a = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const b = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(a.skipped).toBeUndefined();
    expect(b.skipped).toBeUndefined();
    expect(a.reads).toBe(1);
    expect(b.reads).toBe(1);
  });
});

describe("keys and tokens never leak", () => {
  it("nothing logged or stored for the trader contains the key or the session token", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    gw.state.mode = "network";
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    gw.state.mode = "reject-login";
    clearSessionTokens();
    await runLiveTick({ now: at(122), budget: budgetAt({ t: 122_000 }) });

    for (const line of logs) {
      expect(line).not.toContain(FAKE_KEY);
      expect(line).not.toContain(FAKE_TOKEN);
    }
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    const plain = JSON.stringify({ ...row, apiKeyEnc: undefined });
    expect(plain).not.toContain(FAKE_KEY);
    expect(plain).not.toContain(FAKE_TOKEN);
    expect(row.apiKeyEnc).not.toContain(FAKE_KEY); // encrypted at rest
  });
});
