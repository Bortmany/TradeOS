// Grading never moves with the display zone (spec test 3).
//
// The profile's time zone is DISPLAY ONLY. For one fixture — trades that sit
// right on the New York midnight and session edges, where a zone slip would
// change the answer — the rule engine and the discipline score must return
// byte-identical results (JSON.stringify-equal):
//   * called directly, under several MACHINE zones (process.env.TZ), and
//   * through the real data layer, with the trader's saved zone set to New
//     York, Muscat and Tokyo.
// Rule explanations keep saying "ET".

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { evaluateTrades, type RuleLike } from "@/lib/rules/engine";
import { computeDisciplineScore } from "@/lib/discipline/score";
import { getDashboardData } from "@/lib/data";
import { prisma } from "@/lib/db";
import type { TradeRecord } from "@/lib/types";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const originalTZ = process.env.TZ;
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

// Times in UTC; comments give New York wall-clock (September = EDT, UTC-4).
type Leg = {
  entry: string;
  exit: string | null;
  pnl: number;
  qty?: number;
  emotions?: string | null;
  strategyTag?: string | null;
};
const LEGS: Leg[] = [
  { entry: "2026-09-15T03:50:00Z", exit: "2026-09-15T03:58:00Z", pnl: -300 }, // 23:50 ET Sep 14 (Muscat: Sep 15 07:50)
  { entry: "2026-09-15T04:05:00Z", exit: "2026-09-15T04:20:00Z", pnl: -250, emotions: "revenge" }, // 00:05 ET Sep 15
  { entry: "2026-09-15T13:29:00Z", exit: "2026-09-15T13:40:00Z", pnl: 120 }, // 09:29 ET — one minute early
  { entry: "2026-09-15T13:45:00Z", exit: "2026-09-15T14:05:00Z", pnl: -700, qty: 4 }, // 09:45 ET
  { entry: "2026-09-15T13:47:00Z", exit: "2026-09-15T14:10:00Z", pnl: -600, emotions: "fomo" }, // 09:47 ET revenge
  { entry: "2026-09-15T15:00:00Z", exit: "2026-09-15T15:30:00Z", pnl: 450, strategyTag: null }, // 11:00 ET
  { entry: "2026-09-15T19:59:00Z", exit: "2026-09-15T20:10:00Z", pnl: 90 }, // 15:59 ET
  { entry: "2026-09-16T03:59:00Z", exit: "2026-09-16T04:01:00Z", pnl: -80 }, // 23:59 ET Sep 15 → exit next ET day
  { entry: "2026-09-16T13:31:00Z", exit: null, pnl: 0 }, // open trade 09:31 ET Sep 16
];

function fixture(userId = "u1", accountId = "a1"): TradeRecord[] {
  return LEGS.map((l, i) => ({
    id: `z${i}`,
    userId,
    accountId,
    symbol: i % 2 ? "MES" : "ES",
    side: i % 3 ? "long" : "short",
    entryPrice: 5000,
    exitPrice: l.exit ? 5001 : null,
    quantity: l.qty ?? 1,
    entryTime: new Date(l.entry),
    exitTime: l.exit ? new Date(l.exit) : null,
    fees: 2,
    pnl: l.pnl,
    pnlGross: l.pnl + 2,
    strategyTag: l.strategyTag === undefined ? "ORB" : l.strategyTag,
    notes: null,
    emotions: l.emotions ?? null,
    tags: null,
    source: "manual",
    externalId: null,
    isWin: l.exit ? l.pnl > 0 : null,
    complianceScore: null,
    violationCount: 0,
  }));
}

const RULE_DEFS: Omit<RuleLike, "id">[] = [
  { name: "Morning window", type: "time_window", severity: "medium", weight: 2, config: { start: "09:30", end: "11:30", timezone: "America/New_York" } },
  { name: "Daily loss", type: "max_daily_loss", severity: "high", weight: 3, config: { maxDailyLoss: 1000 } },
  { name: "Max trades", type: "max_trades", severity: "medium", weight: 1, config: { maxPerDay: 3 } },
  { name: "Max contracts", type: "max_contracts", severity: "medium", weight: 1, config: { maxContracts: 3 } },
  { name: "No revenge", type: "behavioral", severity: "high", weight: 2, config: { kind: "revenge_trading", withinMinutes: 5, threshold: 3, windowMinutes: 15 } },
  { name: "Setup tagged", type: "setup_validation", severity: "low", weight: 1, config: { requireStrategyTag: true, requireNotes: false, requireScreenshot: false } },
];
const RULES: RuleLike[] = RULE_DEFS.map((r, i) => ({ ...r, id: `r${i}` }));

function grade(): string {
  const trades = fixture();
  const evaluations = evaluateTrades(trades, RULES);
  const score = computeDisciplineScore({ trades, evaluations });
  return JSON.stringify({ evaluations, score });
}

describe("rule engine + discipline score ignore the machine zone", () => {
  it("byte-identical under New York, Muscat, Tokyo, UTC, Kiritimati and Pago Pago machine zones", () => {
    const offsets = new Set<number>();
    const outputs: string[] = [];
    for (const tz of ["America/New_York", "Asia/Muscat", "Asia/Tokyo", "UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz;
      offsets.add(new Date("2026-09-15T12:00:00Z").getTimezoneOffset());
      outputs.push(grade());
    }
    expect(offsets.size).toBeGreaterThan(1); // the machine zone really moved
    for (const o of outputs) expect(o).toBe(outputs[0]);
  });

  it("the fixture really exercises the edges (some fails, some passes) and verdicts say ET", () => {
    const evaluations = evaluateTrades(fixture(), RULES);
    const all = Object.values(evaluations).flat();
    expect(all.some((e) => e.status === "fail")).toBe(true);
    expect(all.some((e) => e.status === "pass")).toBe(true);
    const windowVerdicts = all.filter((e) => e.ruleName === "Morning window" && e.status !== "not_applicable");
    expect(windowVerdicts.length).toBeGreaterThan(0);
    for (const e of windowVerdicts) expect(e.explanation).toMatch(/\bET\b/);
    // 09:29 ET is one minute before the window opens, whatever the zone.
    expect(evaluations.z2.find((e) => e.ruleName === "Morning window")?.status).toBe("fail");
    expect(evaluations.z3.find((e) => e.ruleName === "Morning window")?.status).toBe("pass");
  });
});

describe("the trader's saved zone does not change grading (through the data layer)", () => {
  const email = `zone-grade-${Date.now()}@example.com`;
  let userId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email, passwordHash: "x", plan: "pro" } });
    userId = user.id;
    const account = await prisma.tradingAccount.create({
      data: { userId, name: "Zone test", broker: "manual", kind: "evaluation", startingBalance: 50000 },
    });
    await prisma.trade.createMany({
      data: fixture(userId, account.id).map(({ id: _id, ...t }) => ({ ...t, complianceScore: null })),
    });
    await prisma.ruleBook.create({
      data: {
        userId,
        name: "Zone book",
        scope: "all",
        rules: {
          create: RULE_DEFS.map((r, i) => ({
            name: r.name,
            type: r.type,
            severity: r.severity,
            weight: r.weight,
            order: i,
            config: JSON.stringify(r.config),
          })),
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("New York, Muscat and Tokyo profiles get byte-identical evaluations and score", async () => {
    const outputs: string[] = [];
    for (const zone of ["America/New_York", "Asia/Muscat", "Asia/Tokyo"]) {
      await prisma.user.update({ where: { id: userId }, data: { timezone: zone } });
      for (const machine of ["UTC", "Asia/Muscat"]) {
        process.env.TZ = machine;
        const d = await getDashboardData(userId);
        // Same stored trades every run; sort by id so key order can't differ.
        const byTime = Object.entries(d.evaluations)
          .map(([tradeId, evals]) => ({ tradeId, evals }))
          .sort((a, b) => a.tradeId.localeCompare(b.tradeId));
        outputs.push(JSON.stringify({ discipline: d.discipline, evals: byTime, recent: d.recentViolations }));
      }
    }
    for (const o of outputs) expect(o).toBe(outputs[0]);
    expect(outputs[0]).toContain(" ET");
  });
});
