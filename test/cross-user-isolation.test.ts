// Cross-user data isolation — the data-layer half of TradeOS's core guarantee.
//
// Mirrors the two-user isolation pattern used in the owner's other apps:
// build two synthetic traders with their own accounts, trades, rulebooks/rules
// and alerts in the THROWAWAY test database, then call the very functions the
// real pages use and assert each trader only ever sees their own rows. Positive
// controls are included so "isolated" can never be confused with "broken".

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  getTrades,
  getAccounts,
  getActiveRules,
  getDashboardData,
  getOpenAlerts,
} from "@/lib/data";
import { dailyPnlSeries } from "@/lib/analytics/daily";

// Hard rail: this file writes to a database. Refuse to run if that database is
// the seeded dev DB — the suite must only ever touch the throwaway file.
const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();

type Fixture = {
  userId: string;
  accountId: string;
  ruleIds: string[];
  alertId: string;
  tradeCount: number;
};

async function makeUser(label: string, tradePnls: number[]): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { email: `iso-${label}-${stamp}@example.com`, passwordHash: "x", displayName: label },
  });
  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, name: `${label} account`, startingBalance: 50000 },
  });

  let i = 0;
  for (const pnl of tradePnls) {
    i += 1;
    await prisma.trade.create({
      data: {
        userId: user.id,
        accountId: account.id,
        symbol: "ES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5000 + pnl / 50,
        quantity: 1,
        entryTime: new Date(`2026-07-0${i}T14:00:00Z`),
        exitTime: new Date(`2026-07-0${i}T15:00:00Z`),
        fees: 0,
        pnl,
        source: "manual",
      },
    });
  }

  const book = await prisma.ruleBook.create({
    data: { userId: user.id, name: `${label} book` },
  });
  const ruleA = await prisma.rule.create({
    data: {
      ruleBookId: book.id,
      name: `${label} max contracts`,
      type: "max_contracts",
      severity: "medium",
      config: JSON.stringify({ maxContracts: 3 }),
    },
  });
  const ruleB = await prisma.rule.create({
    data: {
      ruleBookId: book.id,
      name: `${label} time window`,
      type: "time_window",
      severity: "low",
      config: JSON.stringify({ start: "09:30", end: "16:00" }),
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: user.id,
      accountId: account.id,
      type: "rule_violation",
      title: `${label} alert`,
      message: "open alert",
      status: "open",
    },
  });
  // A resolved alert that must never surface in getOpenAlerts.
  await prisma.alert.create({
    data: { userId: user.id, type: "drawdown", title: `${label} resolved`, message: "x", status: "resolved" },
  });

  return { userId: user.id, accountId: account.id, ruleIds: [ruleA.id, ruleB.id], alertId: alert.id, tradeCount: tradePnls.length };
}

let alice: Fixture;
let bob: Fixture;

beforeAll(async () => {
  alice = await makeUser("alice", [100, -50, 200]); // 3 trades
  bob = await makeUser("bob", [-30, 75]); // 2 trades
});

afterAll(async () => {
  // Tidy up (the throwaway DB is deleted by global teardown regardless).
  for (const u of [alice, bob]) {
    if (!u) continue;
    await prisma.$transaction([
      prisma.alert.deleteMany({ where: { userId: u.userId } }),
      prisma.trade.deleteMany({ where: { userId: u.userId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe("getTrades", () => {
  it("each trader sees exactly their own trades (positive control)", async () => {
    expect((await getTrades(alice.userId)).length).toBe(3);
    expect((await getTrades(bob.userId)).length).toBe(2);
  });
  it("no trade ever carries the other trader's userId", async () => {
    const aTrades = await getTrades(alice.userId);
    const bTrades = await getTrades(bob.userId);
    expect(aTrades.every((t) => t.userId === alice.userId)).toBe(true);
    expect(bTrades.every((t) => t.userId === bob.userId)).toBe(true);
    const aIds = new Set(aTrades.map((t) => t.id));
    expect(bTrades.some((t) => aIds.has(t.id))).toBe(false);
  });
});

describe("getAccounts", () => {
  it("each trader sees only their own account", async () => {
    const aAccts = await getAccounts(alice.userId);
    const bAccts = await getAccounts(bob.userId);
    expect(aAccts.map((a) => a.id)).toEqual([alice.accountId]);
    expect(bAccts.map((a) => a.id)).toEqual([bob.accountId]);
    expect(aAccts.every((a) => a.userId === alice.userId)).toBe(true);
  });
});

describe("getActiveRules", () => {
  it("each trader sees only their own rules (positive control: 2 each)", async () => {
    const aRules = await getActiveRules(alice.userId);
    const bRules = await getActiveRules(bob.userId);
    expect(aRules.length).toBe(2);
    expect(bRules.length).toBe(2);
    const aRuleIds = new Set(aRules.map((r) => r.id));
    expect(bob.ruleIds.some((id) => aRuleIds.has(id))).toBe(false);
    expect(alice.ruleIds.every((id) => aRuleIds.has(id))).toBe(true);
  });
});

describe("getOpenAlerts", () => {
  it("each trader sees only their own OPEN alerts", async () => {
    const aAlerts = await getOpenAlerts(alice.userId);
    const bAlerts = await getOpenAlerts(bob.userId);
    expect(aAlerts.map((a) => a.id)).toEqual([alice.alertId]);
    expect(bAlerts.map((a) => a.id)).toEqual([bob.alertId]);
    expect(aAlerts.every((a) => a.userId === alice.userId && a.status === "open")).toBe(true);
  });
});

describe("getDashboardData", () => {
  it("dashboard trade counts are scoped per trader", async () => {
    const aDash = await getDashboardData(alice.userId);
    const bDash = await getDashboardData(bob.userId);
    expect(aDash.tradeCount).toBe(3);
    expect(bDash.tradeCount).toBe(2);
  });
});

describe("getDashboardData — daily P&L calendar", () => {
  // The analytics page's P&L calendar now comes out of getDashboardData instead
  // of a second trade load. It must be correct and hold only the trader's own days.
  it("returns each trader's own realized P&L per ET day, oldest first", async () => {
    const aDash = await getDashboardData(alice.userId);
    expect(aDash.dailyPnl).toEqual([
      { date: "2026-07-01", pnl: 100, trades: 1 },
      { date: "2026-07-02", pnl: -50, trades: 1 },
      { date: "2026-07-03", pnl: 200, trades: 1 },
    ]);
    const bDash = await getDashboardData(bob.userId);
    expect(bDash.dailyPnl).toEqual([
      { date: "2026-07-01", pnl: -30, trades: 1 },
      { date: "2026-07-02", pnl: 75, trades: 1 },
    ]);
  });

  it("matches what the old separate trade load produced", async () => {
    for (const u of [alice, bob]) {
      const dash = await getDashboardData(u.userId);
      expect(dash.dailyPnl).toEqual(dailyPnlSeries(await getTrades(u.userId)));
      const scoped = await getDashboardData(u.userId, u.accountId);
      expect(scoped.dailyPnl).toEqual(
        dailyPnlSeries(await getTrades(u.userId, { accountId: u.accountId }))
      );
    }
  });

  it("never includes another trader's trades, even when asking for their account", async () => {
    const cross = await getDashboardData(bob.userId, alice.accountId);
    expect(cross.dailyPnl).toEqual([]);
    const aTotal = (await getDashboardData(alice.userId)).dailyPnl.reduce((s, d) => s + d.trades, 0);
    expect(aTotal).toBe(alice.tradeCount);
  });
});

describe("getDashboardData — recent violations", () => {
  // Carol breaks her own 3-contract limit on six of seven days. The dashboard's
  // "Recent Violations" feed now comes straight out of getDashboardData (no
  // second trade load), so it must be newest-first, capped at 5, and hers only.
  let carolId = "";
  let carolTradeIds = new Set<string>();

  beforeAll(async () => {
    const carol = await prisma.user.create({
      data: { email: `iso-carol-${stamp}@example.com`, passwordHash: "x", displayName: "carol" },
    });
    carolId = carol.id;
    const account = await prisma.tradingAccount.create({
      data: { userId: carol.id, name: "carol account", startingBalance: 50000 },
    });
    for (let day = 1; day <= 7; day += 1) {
      const t = await prisma.trade.create({
        data: {
          userId: carol.id,
          accountId: account.id,
          symbol: "NQ",
          side: "long",
          entryPrice: 20000,
          exitPrice: 20001,
          quantity: day === 7 ? 1 : 5, // day 7 is the only clean trade
          entryTime: new Date(`2026-07-0${day}T14:00:00Z`),
          exitTime: new Date(`2026-07-0${day}T15:00:00Z`),
          fees: 0,
          pnl: day * 10,
          source: "manual",
        },
      });
      carolTradeIds.add(t.id);
    }
    const book = await prisma.ruleBook.create({ data: { userId: carol.id, name: "carol book" } });
    await prisma.rule.create({
      data: {
        ruleBookId: book.id,
        name: "carol max contracts",
        type: "max_contracts",
        severity: "high",
        config: JSON.stringify({ maxContracts: 3 }),
      },
    });
  });

  afterAll(async () => {
    if (!carolId) return;
    await prisma.trade.deleteMany({ where: { userId: carolId } });
    carolTradeIds = new Set();
  });

  it("returns the 5 newest failed checks, newest first, with their trade details", async () => {
    const dash = await getDashboardData(carolId);
    expect(dash.recentViolations).toHaveLength(5);
    // Day 7 is clean, so the feed runs day 6 → day 2.
    expect(dash.recentViolations.map((v) => v.pnl)).toEqual([60, 50, 40, 30, 20]);
    for (const v of dash.recentViolations) {
      expect(v.status).toBe("fail");
      expect(v.ruleName).toBe("carol max contracts");
      expect(v.symbol).toBe("NQ");
      expect(v.isOpen).toBe(false);
      expect(carolTradeIds.has(v.tradeId)).toBe(true);
    }
  });

  it("never shows another trader's violations", async () => {
    // Alice and Bob keep their rules, so their feeds are empty — and never
    // contain one of Carol's trades.
    for (const u of [alice, bob]) {
      const dash = await getDashboardData(u.userId);
      expect(dash.recentViolations.some((v) => carolTradeIds.has(v.tradeId))).toBe(false);
      expect(dash.recentViolations).toEqual([]);
    }
    // Asking for Alice's account with Carol's user id yields nothing at all.
    const cross = await getDashboardData(carolId, alice.accountId);
    expect(cross.tradeCount).toBe(0);
    expect(cross.recentViolations).toEqual([]);
  });
});
