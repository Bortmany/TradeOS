// Discipline score — the core-guarantee suite for src/lib/discipline/score.ts.
//
// Proves the promise on the score: overall and all four components ALWAYS land
// in 0..100 no matter what trades are fed in, and every score always ships with
// a non-empty human-readable breakdown detail per component (explainability).

import { describe, it, expect } from "vitest";
import { computeDisciplineScore } from "@/lib/discipline/score";
import type { TradeRecord } from "@/lib/types";
import type { EvalResult } from "@/lib/rules/engine";

let seq = 0;
function mkTrade(o: Partial<TradeRecord> = {}): TradeRecord {
  seq += 1;
  return {
    id: `t${seq}`,
    userId: "u1",
    accountId: "a1",
    symbol: "ES",
    side: "long",
    entryPrice: 5000,
    exitPrice: 5010,
    quantity: 1,
    entryTime: new Date("2026-07-01T14:00:00Z"),
    exitTime: new Date("2026-07-01T15:00:00Z"),
    fees: 0,
    pnl: 100,
    pnlGross: 100,
    strategyTag: "orb",
    notes: null,
    emotions: null,
    tags: null,
    source: "manual",
    externalId: null,
    isWin: true,
    complianceScore: null,
    violationCount: 0,
    ...o,
  };
}

function evalResult(status: EvalResult["status"]): EvalResult {
  return { ruleId: "r1", ruleName: "rule", status, severity: "medium", explanation: "x" };
}

// A trade on a given ET day with a given P&L and optional emotion tags.
function tradeOn(day: string, pnl: number, emotions: string | null = null): TradeRecord {
  return mkTrade({
    entryTime: new Date(`${day}T14:00:00Z`),
    exitTime: new Date(`${day}T15:00:00Z`),
    pnl,
    emotions,
  });
}

type Scenario = { name: string; trades: TradeRecord[]; evaluations: Record<string, EvalResult[]> };

const scenarios: Scenario[] = [
  { name: "zero trades", trades: [], evaluations: {} },
  {
    name: "all wins",
    trades: [tradeOn("2026-07-01", 100), tradeOn("2026-07-02", 250), tradeOn("2026-07-03", 80)],
    evaluations: { t: [evalResult("pass"), evalResult("pass")] },
  },
  {
    name: "all losses",
    trades: [tradeOn("2026-07-01", -100), tradeOn("2026-07-02", -250), tradeOn("2026-07-03", -80)],
    evaluations: { t: [evalResult("fail"), evalResult("pass")] },
  },
  {
    name: "all evaluations failing",
    trades: [tradeOn("2026-07-01", 50), tradeOn("2026-07-02", -50)],
    evaluations: { a: [evalResult("fail"), evalResult("fail")], b: [evalResult("fail")] },
  },
  {
    name: "mixed with negative emotions",
    trades: [
      tradeOn("2026-07-01", 120, "confident"),
      tradeOn("2026-07-01", -60, "revenge"),
      tradeOn("2026-07-02", 40, "fomo"),
      tradeOn("2026-07-03", -200, "greedy"),
    ],
    evaluations: {
      a: [evalResult("pass"), evalResult("fail")],
      b: [evalResult("pass"), evalResult("not_applicable")],
    },
  },
  {
    name: "extreme magnitudes",
    trades: [tradeOn("2026-07-01", 1_000_000), tradeOn("2026-07-02", -999_999)],
    evaluations: { a: [evalResult("pass")], b: [evalResult("fail")] },
  },
  {
    name: "open trades only (nothing closed)",
    trades: [mkTrade({ exitTime: null, exitPrice: null, pnl: 0 })],
    evaluations: {},
  },
];

const COMPONENTS = ["ruleAdherence", "riskDiscipline", "emotionalDiscipline", "consistency"] as const;

describe.each(scenarios)("discipline score — $name", (scn) => {
  const score = computeDisciplineScore({ trades: scn.trades, evaluations: scn.evaluations });

  it("overall is an integer within 0..100", () => {
    expect(Number.isInteger(score.overall)).toBe(true);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it("every component is an integer within 0..100", () => {
    for (const c of COMPONENTS) {
      expect(Number.isInteger(score[c])).toBe(true);
      expect(score[c]).toBeGreaterThanOrEqual(0);
      expect(score[c]).toBeLessThanOrEqual(100);
    }
  });

  it("breakdown has one non-empty detail per component", () => {
    expect(score.breakdown).toHaveLength(4);
    for (const b of score.breakdown) {
      expect(typeof b.detail).toBe("string");
      expect(b.detail.trim().length).toBeGreaterThan(0);
      expect(b.score).toBeGreaterThanOrEqual(0);
      expect(b.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("all-fail evaluations drive rule adherence to 0 (a real floor, not a crash)", () => {
  const score = computeDisciplineScore({
    trades: [tradeOn("2026-07-01", 10)],
    evaluations: { a: [evalResult("fail"), evalResult("fail")] },
  });
  it("ruleAdherence is exactly 0", () => expect(score.ruleAdherence).toBe(0));
  it("overall still within bounds", () => {
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });
});
