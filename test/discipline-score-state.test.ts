// Discipline score — the explicit "not scored yet" state (core-guarantee file:
// src/lib/discipline/score.ts).
//
// 1) SAME FIXTURE, SAME NUMBERS: every case where at least one rule was checked
//    still produces exactly the numbers it produced before this state existed.
//    The golden numbers below were taken from the pre-change score.ts (the test
//    was written by running both versions on these fixtures and comparing).
// 2) The new state: with no applicable rule check the stored numbers are still
//    the same, but `scored` is false and `ruleChecks` is 0, so screens show
//    "Not scored yet" instead of a flattering 91.

import { describe, it, expect } from "vitest";
import { computeDisciplineScore } from "@/lib/discipline/score";
import { SCORED_CASES, UNSCORED_CASES } from "./fixtures/score-cases";

// [overall, ruleAdherence, riskDiscipline, emotionalDiscipline, consistency]
const GOLDEN: Record<string, number[]> = {
  "all wins, all rules pass": [96, 100, 100, 100, 79],
  "all losses, mixed rules": [67, 50, 56, 100, 79],
  "every evaluation failing": [45, 0, 76, 100, 30],
  "mixed with negative emotions and severities": [37, 38, 46, 25, 35],
  "one rule, one trade (the smallest scored case)": [100, 100, 100, 100, 100],
  "open trade with a checked rule": [83, 50, 100, 100, 100],
  "no trades, no rules": [100, 100, 100, 100, 100],
  "trades but no evaluations at all (no rulebook)": [82, 100, 84, 100, 30],
  "rules exist but every check was not applicable": [100, 100, 100, 100, 100],
  "open trades only": [100, 100, 100, 100, 100],
};

function numbers(c: { trades: never[] | unknown; evaluations: unknown }, s: ReturnType<typeof computeDisciplineScore>) {
  void c;
  return [s.overall, s.ruleAdherence, s.riskDiscipline, s.emotionalDiscipline, s.consistency];
}

describe("same fixture, same numbers (scored cases)", () => {
  for (const c of SCORED_CASES) {
    it(`${c.name}: numbers identical to before, and marked scored`, () => {
      const s = computeDisciplineScore({ trades: c.trades, evaluations: c.evaluations });
      expect(numbers(c, s)).toEqual(GOLDEN[c.name]);
      expect(s.scored).toBe(true);
      expect(s.ruleChecks).toBeGreaterThan(0);
      expect(s.breakdown.map((b) => b.score)).toEqual([
        s.ruleAdherence,
        s.riskDiscipline,
        s.emotionalDiscipline,
        s.consistency,
      ]);
    });
  }

  it("is deterministic: the same fixture twice gives the identical object", () => {
    for (const c of SCORED_CASES) {
      const a = computeDisciplineScore({ trades: c.trades, evaluations: c.evaluations });
      const b = computeDisciplineScore({ trades: c.trades, evaluations: c.evaluations });
      expect(a).toEqual(b);
    }
  });
});

describe("no applicable rules: the explicit 'not scored yet' state", () => {
  for (const c of UNSCORED_CASES) {
    it(`${c.name}: scored=false, ruleChecks=0, stored numbers unchanged`, () => {
      const s = computeDisciplineScore({ trades: c.trades, evaluations: c.evaluations });
      expect(s.scored).toBe(false);
      expect(s.ruleChecks).toBe(0);
      // Display-only flag: the stored numbers are exactly what they were.
      expect(numbers(c, s)).toEqual(GOLDEN[c.name]);
      expect(s.ruleAdherence).toBe(100);
    });
  }

  it("a single applicable check flips the state to scored without moving the other numbers", () => {
    const c = UNSCORED_CASES[1]; // trades, no evaluations
    const before = computeDisciplineScore({ trades: c.trades, evaluations: {} });
    const after = computeDisciplineScore({
      trades: c.trades,
      evaluations: {
        t1: [{ ruleId: "r1", ruleName: "rule", status: "pass", severity: "low", explanation: "x" }],
      },
    });
    expect(before.scored).toBe(false);
    expect(after.scored).toBe(true);
    expect(after.ruleChecks).toBe(1);
    expect(after.riskDiscipline).toBe(before.riskDiscipline);
    expect(after.emotionalDiscipline).toBe(before.emotionalDiscipline);
    expect(after.consistency).toBe(before.consistency);
    expect(after.overall).toBe(before.overall); // a pass keeps adherence at 100
  });
});
