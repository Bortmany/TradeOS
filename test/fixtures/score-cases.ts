// Fixed discipline-score fixtures shared by the "same fixture, same numbers" test.
// Everything is hard-coded (dates, ids, P&L) so the numbers never drift.

import type { TradeRecord } from "@/lib/types";
import type { EvalResult } from "@/lib/rules/engine";

function trade(id: string, day: string, pnl: number, emotions: string | null = null, open = false): TradeRecord {
  return {
    id,
    userId: "u1",
    accountId: "a1",
    symbol: "ES",
    side: "long",
    entryPrice: 5000,
    exitPrice: open ? null : 5010,
    quantity: 1,
    entryTime: new Date(`${day}T14:00:00Z`),
    exitTime: open ? null : new Date(`${day}T15:00:00Z`),
    fees: 0,
    pnl,
    pnlGross: pnl,
    strategyTag: "orb",
    notes: null,
    emotions,
    tags: null,
    source: "manual",
    externalId: null,
    isWin: pnl > 0,
    complianceScore: null,
    violationCount: 0,
  };
}

function ev(status: EvalResult["status"], severity: EvalResult["severity"] = "medium"): EvalResult {
  return { ruleId: "r1", ruleName: "rule", status, severity, explanation: "x" };
}

export interface ScoreCase {
  name: string;
  trades: TradeRecord[];
  evaluations: Record<string, EvalResult[]>;
}

/** Cases where at least one rule was checked: the score must not move. */
export const SCORED_CASES: ScoreCase[] = [
  {
    name: "all wins, all rules pass",
    trades: [trade("t1", "2026-07-01", 100), trade("t2", "2026-07-02", 250), trade("t3", "2026-07-03", 80)],
    evaluations: { t1: [ev("pass"), ev("pass")], t2: [ev("pass")] },
  },
  {
    name: "all losses, mixed rules",
    trades: [trade("t1", "2026-07-01", -100), trade("t2", "2026-07-02", -250), trade("t3", "2026-07-03", -80)],
    evaluations: { t1: [ev("fail"), ev("pass")] },
  },
  {
    name: "every evaluation failing",
    trades: [trade("t1", "2026-07-01", 50), trade("t2", "2026-07-02", -50)],
    evaluations: { t1: [ev("fail"), ev("fail")], t2: [ev("fail")] },
  },
  {
    name: "mixed with negative emotions and severities",
    trades: [
      trade("t1", "2026-07-01", 120, "confident"),
      trade("t2", "2026-07-01", -60, "revenge"),
      trade("t3", "2026-07-02", 40, "fomo"),
      trade("t4", "2026-07-03", -200, "greedy"),
    ],
    evaluations: {
      t1: [ev("pass", "low"), ev("fail", "high")],
      t2: [ev("pass", "medium"), ev("not_applicable")],
      t4: [ev("fail", "medium")],
    },
  },
  {
    name: "one rule, one trade (the smallest scored case)",
    trades: [trade("t1", "2026-07-01", 75)],
    evaluations: { t1: [ev("pass")] },
  },
  {
    name: "open trade with a checked rule",
    trades: [trade("t1", "2026-07-01", 0, null, true), trade("t2", "2026-07-02", 90)],
    evaluations: { t1: [ev("fail", "high")], t2: [ev("pass", "high")] },
  },
];

/** Cases where no rule applied to anything: the new "not scored yet" state. */
export const UNSCORED_CASES: ScoreCase[] = [
  { name: "no trades, no rules", trades: [], evaluations: {} },
  {
    name: "trades but no evaluations at all (no rulebook)",
    trades: [trade("t1", "2026-07-01", 100), trade("t2", "2026-07-02", -40)],
    evaluations: {},
  },
  {
    name: "rules exist but every check was not applicable",
    trades: [trade("t1", "2026-07-01", 100)],
    evaluations: { t1: [ev("not_applicable"), ev("not_applicable", "high")] },
  },
  {
    name: "open trades only",
    trades: [trade("t1", "2026-07-01", 0, null, true)],
    evaluations: {},
  },
];
