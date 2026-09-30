// The real recompute path (src/lib/rules/recompute.ts) must give the same
// compliance scores, rule verdicts and discipline snapshots for a forex trade
// whether or not its assetClass label is set: the label is never read by scoring.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { recomputeUserCompliance } from "@/lib/rules/recompute";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();
let userId = "";
let tradeIds: string[] = [];

async function snapshot() {
  await recomputeUserCompliance(userId);
  const trades = await prisma.trade.findMany({ where: { userId }, orderBy: { entryTime: "asc" } });
  const evals = await prisma.ruleEvaluation.findMany({
    where: { userId },
    orderBy: [{ tradeId: "asc" }, { ruleId: "asc" }],
  });
  const snaps = await prisma.disciplineSnapshot.findMany({
    where: { userId },
    orderBy: [{ period: "asc" }, { periodStart: "asc" }],
  });
  return {
    trades: trades.map((t) => ({ score: t.complianceScore, violations: t.violationCount, isWin: t.isWin })),
    evals: evals.map((e) => ({
      trade: tradeIds.indexOf(e.tradeId),
      status: e.status,
      severity: e.severity,
      explanation: e.explanation,
    })),
    snaps: snaps.map((s) => ({ period: s.period, start: s.periodStart, overall: s.overall, breakdown: s.breakdown })),
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `fx-recompute-${stamp}@example.com`, passwordHash: "x", displayName: "fx" },
  });
  userId = user.id;
  const account = await prisma.tradingAccount.create({
    data: { userId, name: "fx account", startingBalance: 10000 },
  });
  const book = await prisma.ruleBook.create({ data: { userId, name: "fx rules", isActive: true } });
  await prisma.rule.createMany({
    data: [
      { ruleBookId: book.id, name: "Max lots", type: "max_contracts", severity: "medium", weight: 1, config: JSON.stringify({ maxContracts: 1 }) },
      { ruleBookId: book.id, name: "Risk limit", type: "risk_limit", severity: "high", weight: 2, config: JSON.stringify({ maxLossPerTrade: 300 }) },
    ],
  });
  const mk = (n: number, symbol: string, qty: number, pnl: number, assetClass: string) =>
    prisma.trade.create({
      data: {
        userId,
        accountId: account.id,
        symbol,
        side: "long",
        entryPrice: 1.1,
        exitPrice: 1.105,
        quantity: qty,
        entryTime: new Date(`2026-09-1${n}T06:15:00Z`),
        exitTime: new Date(`2026-09-1${n}T08:40:00Z`),
        fees: 3.5,
        pnl,
        source: "csv",
        externalId: `mt5:fxr${n}-${stamp}`,
        assetClass,
      },
    });
  const a = await mk(4, "EURUSD", 1, 493, "forex");
  const b = await mk(5, "GBPUSD", 2, -511.9, "forex");
  const c = await mk(6, "XAUUSD", 0.5, 104, "cfd");
  tradeIds = [a.id, b.id, c.id];
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
});

describe("recompute ignores the asset-class label", () => {
  it("scores, verdicts and snapshots are identical with assetClass set and with it null", async () => {
    const labelled = await snapshot();
    // Sanity: the rules really fire (2 lots and the -511.90 loss fail).
    expect(labelled.evals.some((e) => e.status === "fail")).toBe(true);
    expect(labelled.snaps.length).toBeGreaterThan(0);

    await prisma.trade.updateMany({ where: { userId }, data: { assetClass: null } });
    const plain = await snapshot();

    expect(plain).toEqual(labelled);
  });
});
