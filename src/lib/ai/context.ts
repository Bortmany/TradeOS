// TradeOS — builds the CoachingContext the provider is given. Read-only: the
// rule engine runs IN MEMORY (never recomputeUserCompliance, which writes).
// The deterministic core never imports from here.

import { getTrades, getActiveRules } from "@/lib/data";
import { evaluateTrades } from "@/lib/rules/engine";
import { computeMetrics } from "@/lib/analytics";
import { computeDisciplineScore } from "@/lib/discipline/score";
import type { CoachingContext } from "./types";

export async function buildCoachingContext(
  userId: string,
  range: { from: Date; to: Date }
): Promise<CoachingContext | null> {
  const trades = await getTrades(userId, { from: range.from, to: range.to });
  if (trades.length === 0) return null;
  const rules = await getActiveRules(userId);
  const evaluations = evaluateTrades(trades, rules);
  const violations = Object.values(evaluations)
    .flat()
    .filter((e) => e.status === "fail")
    .map((e) => ({ ruleName: e.ruleName, explanation: e.explanation, severity: e.severity }));
  return {
    userId,
    trades,
    metrics: computeMetrics(trades),
    discipline: computeDisciplineScore({ trades, evaluations }),
    violations,
    timeframe: { from: range.from, to: range.to },
  };
}
