// Fix round for the live links, all against a FAKED gateway (no real network):
//  - a position that closes between reads keeps its open loss counted until the closed
//    trade arrives, and the poller fetches the fills at once (counted in the budget)
//  - the tick and the sweep stop on their own deadline; a failing tick is visible
//  - a warning is protected even when the broker REJECTED the key (24-hour cap kept)
//  - only the login's explicit "bad key" answer is a rejected key; a bare 401/403 is
//    "unreachable" with a back-off
//  - the 30-minute sweep draws from the same budget and starts the shared back-off
//  - phone warnings are sent after the pass, not inside it

import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { runLiveTick, clearFailureBackoff } from "@/lib/live/poller";
import { runSweep } from "@/lib/auto-sync";
import { syncConnection } from "@/lib/connectors/sync";
import { CallBudget } from "@/lib/live/budget";
import { clearSessionTokens } from "@/lib/connectors/session";
import { generateAlerts } from "@/lib/alerts/generate";
import { positionsLeft } from "@/lib/live/closed-between";
import { runnerHealth } from "@/lib/single-runner";
import { REFUSED_MESSAGE, REJECTED_MESSAGE } from "@/lib/live/messages";
import * as pushAlerts from "@/lib/push/alerts";
import * as firms from "@/lib/connectors/firms";
import { MES, fill, installFakeGateway } from "./fixtures/projectx";
import { addClosedTrade, cleanup, connect, makeTrader, metaOf, openAlerts } from "./fixtures/live-helpers";

const T0 = new Date("2026-10-02T18:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const budgetAt = (clock: { t: number }) => new CallBudget(100, () => clock.t);

let gw: ReturnType<typeof installFakeGateway>;
let logs: string[];

beforeEach(async () => {
  await prisma.brokerConnection.deleteMany();
  await prisma.runnerLease.deleteMany({ where: { name: { in: ["runner:4927001", "runner:4927002"] } } });
  clearSessionTokens();
  clearFailureBackoff();
  // The tests run on a pretend clock (T0). Only Date is faked, so everything that reads
  // "now" itself (a recompute after a sync) agrees with the tick's clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  logs = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  }
});
afterEach(() => {
  gw?.restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(cleanup);

const dailyLoss = async (userId: string) =>
  (await openAlerts(userId)).filter((a) => metaOf(a).measure === "daily_loss");

describe("a position that closes between reads (open loss must not vanish before the trade lands)", () => {
  it("$900 open loss on a $1,000 limit: warning stays after the position closes, until the fills arrive, then shows the realized loss", async () => {
    const t = await makeTrader(); // $1,000 daily limit
    const conn = await connect(t);
    gw = installFakeGateway({
      balances: { "123": 1 },
      // 3 MES long from 5260.25; bar 5200.25 => -60 pts x 3 x $5 = -$900
      positions: { "123": [{ contractId: MES, type: 1, size: 3, averagePrice: 5260.25 }] },
      bars: { [MES]: 5200.25 },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    let [a] = await dailyLoss(t.userId);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 900, usedPct: 90, openCount: 1 });
    const id = a.id;

    // The position is closed at the broker, but its fills are not in the trade list yet.
    gw.state.positions["123"] = [];
    const clock = { t: 61_000 };
    const budget = budgetAt(clock);
    const callsBefore = gw.calls.length;
    const tick2 = await runLiveTick({ now: at(61), budget });
    expect(tick2.fillSyncs).toBe(1); // an immediate fill sync, not a 30-minute wait
    expect(gw.count("/api/Trade/search")).toBe(1);
    expect(budget.used()).toBe(gw.calls.length - callsBefore); // every call this tick (and only those) was counted
    [a] = await dailyLoss(t.userId);
    expect(a.id).toBe(id);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 900, openCount: 0, pendingCloseLoss: -900 });
    expect(a.message).toContain("90% used");

    // Still no fills a minute later: still protected, and it asks again.
    clock.t = 122_000;
    const tick3 = await runLiveTick({ now: at(122), budget });
    expect(tick3.fillSyncs).toBe(1);
    [a] = await dailyLoss(t.userId);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 900, pendingCloseLoss: -900 });

    // The fills arrive: realized loss is $915 (a slightly worse exit), and replaces the protected figure.
    gw.state.fills["123"] = [
      fill(1, MES, 0, 3, 5260.25, at(-120)),
      fill(2, MES, 1, 3, 5199.25, at(100)), // -61 pts x 3 x $5 = -$915
    ];
    clock.t = 183_000;
    await runLiveTick({ now: at(183), budget });
    [a] = await dailyLoss(t.userId);
    expect(a.id).toBe(id);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 915, usedPct: 92, pendingCloseLoss: 0 });
    const closed = await prisma.trade.findMany({ where: { accountId: t.accountId } });
    expect(closed).toHaveLength(1);
    expect(closed[0].pnl).toBe(-915);

    // And it is tidied: no leftover protection on the connection.
    clock.t = 244_000;
    await runLiveTick({ now: at(244), budget });
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.pendingCloseAt).toBeNull();
    expect(row.pendingCloseLoss).toBeNull();
  });

  it("when the budget has no room the fill sync waits (loss stays protected); a position that only shrinks is protected pro rata", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({
      balances: { "123": 1 },
      positions: { "123": [{ contractId: MES, type: 1, size: 4, averagePrice: 5260.25 }] },
      bars: { [MES]: 5200.25 }, // -60 x 4 x 5 = -$1,200... use limit-safe check below
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    // Half of it closes (2 of 4 contracts); the budget only has 3 calls left this minute.
    gw.state.positions["123"] = [{ contractId: MES, type: 1, size: 2, averagePrice: 5260.25 }];
    const tight = new CallBudget(3, () => 61_000); // balance + positions + 1 bar; none left for fills
    const stats = await runLiveTick({ now: at(61), budget: tight });
    expect(stats.fillSyncs).toBe(1);
    expect(gw.count("/api/Trade/search")).toBe(0); // deferred, not forced
    const [a] = await dailyLoss(t.userId);
    // Remaining 2 contracts: -$600 open; the 2 that left: -$600 protected. Total $1,200, not $600.
    expect(metaOf(a)).toMatchObject({ value: 1200, openCount: 1, pendingCloseLoss: -600 });
    expect(metaOf(a).step).toBe(100);
  });

  it("a trade that was already imported (30-minute sweep) before the position vanished is not double counted", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({
      balances: { "123": 1 },
      positions: { "123": [{ contractId: MES, type: 1, size: 3, averagePrice: 5260.25 }] },
      bars: { [MES]: 5200.25 },
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    await addClosedTrade(t, -900, at(30)); // landed by some other path before the next read
    gw.state.positions["123"] = [];
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    const [a] = await dailyLoss(t.userId);
    expect(metaOf(a)).toMatchObject({ value: 900, pendingCloseLoss: 0 });
  });

  it("the pure comparison: only losses are kept, gone or smaller counts, a profit is never counted", () => {
    const p = (contractId: string, size: number, openPnl: number | null) => ({
      contractId,
      side: "long",
      size,
      openPnl,
    });
    expect(positionsLeft([p("A", 2, -100)], [p("A", 2, -50)])).toEqual({ left: false, loss: 0 });
    expect(positionsLeft([p("A", 2, -100)], [])).toEqual({ left: true, loss: -100 });
    expect(positionsLeft([p("A", 4, -200)], [p("A", 1, -50)])).toEqual({ left: true, loss: -150 });
    expect(positionsLeft([p("A", 2, 300)], [])).toEqual({ left: true, loss: 0 });
    expect(positionsLeft([p("A", 1, null)], [])).toEqual({ left: true, loss: 0 }); // unpriced: unknown, still syncs
    expect(positionsLeft([], [p("A", 1, 5)])).toEqual({ left: false, loss: 0 }); // opening one is not a close
  });
});

describe("a warning is protected when the key was REJECTED too (24-hour cap kept)", () => {
  it("rejected key: the raised warning is not lowered or cleared for a day, then it ends", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, -700, new Date(T0.getTime() - 3600_000));
    await prisma.positionSnapshot.create({
      data: {
        userId: t.userId, connectionId: conn.id, contractId: MES, symbol: "MES", side: "long", size: 2,
        avgPrice: 5210.25, lastPrice: 5198.25, priceSource: "bar", openPnl: -120, readAt: T0,
      },
    });
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { lastLiveAt: T0, liveStatus: "ok" } });
    await generateAlerts(t.userId, T0);
    let [a] = await dailyLoss(t.userId);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 820 });

    // The broker now rejects the key: the open figure is unknown, so nothing may be lowered.
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { liveStatus: "rejected", lastLiveError: REJECTED_MESSAGE },
    });
    await prisma.positionSnapshot.deleteMany({ where: { connectionId: conn.id } });
    await generateAlerts(t.userId, at(600));
    [a] = await dailyLoss(t.userId);
    expect(metaOf(a)).toMatchObject({ step: 80, value: 820 });

    // 24 hours later the protection has lapsed: closed trades alone (70%) now rule.
    await generateAlerts(t.userId, new Date(T0.getTime() + 25 * 3600_000));
    const after = await dailyLoss(t.userId);
    // (a new ET day by then, so the old day's loss no longer counts: the alert has ended)
    expect(after.length === 0 || (metaOf(after[0]).step as number) < 80).toBe(true);
  });
});

describe("only an explicit bad-key answer rejects a connection", () => {
  it("login says success:false => rejected (existing behaviour kept)", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ mode: "reject-login" });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("rejected");
  });

  it("a bare 401 on the login call is 'unreachable', not rejected, and is retried next tick", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "login-401" });
    const a = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(a.rejected).toBe(0);
    expect(a.failed).toBe(1);
    let row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("unreachable");
    expect(row.lastLiveError).toBe(REFUSED_MESSAGE);

    gw.state.mode = "ok";
    const b = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(b.reads).toBe(1);
    row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("ok");
  });

  it("a bare 401 on every data call (after a fresh login) is 'unreachable' too, never permanent", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "data-401" });
    const a = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(a.rejected).toBe(0);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("unreachable");
    gw.state.mode = "ok";
    const b = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(b.reads).toBe(1);
  });

  it("repeated failures back off (first retry next tick, then it waits longer)", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "network" });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) }); // fail 1
    const c1 = gw.calls.length;
    await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) }); // retried next tick: fail 2
    const c2 = gw.calls.length;
    expect(c2).toBeGreaterThan(c1);
    await runLiveTick({ now: at(122), budget: budgetAt({ t: 122_000 }) }); // backing off now
    expect(gw.calls.length).toBe(c2);
    gw.state.mode = "ok";
    const later = await runLiveTick({ now: at(61 + 300), budget: budgetAt({ t: 361_000 }) });
    expect(later.reads).toBe(1); // back after the wait
  });

  it("the 30-minute sync: a bare 401 marks only its own sync state; success:false also stops live reads", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "login-401" });
    await expect(syncConnection(conn.id, t.userId)).rejects.toThrow();
    let row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.status).toBe("error");
    expect(row.liveStatus).toBe("ok"); // not rejected

    gw.state.mode = "reject-login";
    await expect(syncConnection(conn.id, t.userId)).rejects.toThrow();
    row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.liveStatus).toBe("rejected");
  });
});

describe("the connector refuses redirects", () => {
  it("every gateway request is sent with redirect: 'error'", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(gw.calls.length).toBeGreaterThan(0);
    for (const c of gw.calls) expect(c.redirect).toBe("error");
  });
});

describe("a failing tick or sweep is visible, not 'ran'", () => {
  it("if the tick cannot even load its connections: clear error, stats.error, health row; the next tick recovers", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    // (a database failure inside the tick, injected where the tick walks its connections)
    vi.spyOn(firms, "getFirm").mockImplementationOnce(() => {
      throw new Error("pool timeout");
    });
    const bad = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(bad.error).toBeTruthy();
    expect(bad.reads).toBe(0);
    expect(logs.join("\n")).toContain("[live-poll] run FAILED");
    expect((await runnerHealth(4927002))?.lastError).toContain("pool timeout");

    const good = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(good.error).toBeUndefined();
    expect(good.reads).toBe(1);
    expect((await runnerHealth(4927002))?.lastError).toBeNull();
  });

  it("a sweep where EVERY connection fails to sync is a failed run with a health flag (not 'ran')", async () => {
    for (let i = 0; i < 3; i++) {
      const t = await makeTrader();
      await connect(t, { username: `sweep-fail-${i}` });
    }
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "network" });
    expect(await runSweep(budgetAt({ t: 0 }))).toBe("failed");
    expect(logs.join("\n")).toContain("[auto-sync] run FAILED");
    expect((await runnerHealth(4927001))?.lastError).toContain("every one of 3 connections failed");
    // and one good sweep afterwards clears the flag
    gw.state.mode = "ok";
    expect(await runSweep(budgetAt({ t: 0 }))).toBe("ran");
    expect((await runnerHealth(4927001))?.lastError).toBeNull();
  });
});

describe("the tick stops on its own deadline and never overlaps", () => {
  it("a slow broker cannot make runs overlap: the second tick is refused while the first still works", async () => {
    const t = await makeTrader();
    await connect(t);
    gw = installFakeGateway({ balances: { "123": 1 } });
    // Slow the broker's first answer by 400 ms.
    const real = globalThis.fetch;
    let first = true;
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 400));
      }
      return real(...args);
    });
    const slow = runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    await new Promise((r) => setTimeout(r, 50));
    const overlap = await runLiveTick({ now: at(1), budget: budgetAt({ t: 1000 }) });
    expect(overlap.skipped).toBe("already-running");
    const done = await slow;
    expect(done.reads).toBe(1);
    // and the in-process flag is released only after the work really ended
    const next = await runLiveTick({ now: at(61), budget: budgetAt({ t: 61_000 }) });
    expect(next.skipped).toBeUndefined();
  });
});

describe("the 30-minute sweep shares the server-wide budget and the 429 back-off", () => {
  it("every broker call the sweep makes is counted in the budget", async () => {
    const a = await makeTrader();
    const b = await makeTrader();
    await connect(a, { username: "sweep-a" });
    await connect(b, { username: "sweep-b" });
    gw = installFakeGateway({ balances: { "123": 1 } });
    const budget = budgetAt({ t: 0 });
    expect(await runSweep(budget)).toBe("ran");
    expect(gw.calls.length).toBe(4); // 2 logins + 2 fill reads
    expect(budget.used()).toBe(gw.calls.length);
  });

  it("a 429 seen by the sweep starts the shared back-off, and the sweep stops asking", async () => {
    const a = await makeTrader();
    const b = await makeTrader();
    await connect(a, { username: "sweep-c" });
    await connect(b, { username: "sweep-d" });
    gw = installFakeGateway({ balances: { "123": 1 }, mode: "rate-limit", retryAfter: "600" });
    const budget = budgetAt({ t: 0 });
    await runSweep(budget);
    expect(gw.calls.length).toBe(1); // the second connection was not even tried
    expect(budget.inBackoff()).toBe(true);
    expect(budget.backoffRemainingMs()).toBe(600_000); // a Retry-After beyond 5 minutes is honoured
    // ...so the live tick also waits.
    const tick = await runLiveTick({ now: at(5), budget });
    expect(tick.skipped).toBe("backoff");
  });
});

describe("phone warnings go out after the pass, outside the lease", () => {
  it("the alert pass does not send; the send happens once after the tick's work and lease are done", async () => {
    const t = await makeTrader();
    await connect(t);
    await addClosedTrade(t, -850, at(-3600));
    gw = installFakeGateway({ balances: { "123": 1 } });
    let leaseHeldDuringSend: boolean | null = null;
    const send = vi.spyOn(pushAlerts, "notifyAlertSteps").mockImplementation(async () => {
      const row = await prisma.runnerLease.findUnique({ where: { name: "runner:4927002" } });
      leaseHeldDuringSend = !!row && row.expiresAt.getTime() > Date.now();
    });
    await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(t.userId);
    expect(leaseHeldDuringSend).toBe(false);
  });

  it("a push service that hangs cannot hold the tick for more than its cap", async () => {
    const t = await makeTrader();
    await connect(t);
    await addClosedTrade(t, -850, at(-3600));
    gw = installFakeGateway({ balances: { "123": 1 } });
    vi.spyOn(pushAlerts, "notifyAlertSteps").mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const stats = await runLiveTick({ now: T0, budget: budgetAt({ t: 0 }), pushCapMs: 250 });
    expect(stats.reads).toBe(1);
    expect(Date.now() - started).toBeLessThan(3_000); // returned after the cap, not never
  });
});
