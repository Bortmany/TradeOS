// Cross-user data isolation — the data-layer half of TradeOS's core guarantee.
//
// Mirrors Cut's (Health-Tracker) two-user pattern in consumerPolish.test.js:
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
