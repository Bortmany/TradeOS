// TradeOS — Discipline score.
// Pure, deterministic, explainable. Blends four sub-scores (each 0..100) into an
// overall discipline rating and fills a `breakdown` array so every number can be
// traced back to its inputs.
//
//   ruleAdherence      — % of weighted rule evaluations that passed
//   riskDiscipline     — loss control + drawdown behavior (from trade P&L)
//   emotionalDiscipline— emotion tags (revenge/fomo/greedy penalize)
//   consistency        — daily-P&L variance + day-to-day win-rate stability

import { clamp, parseTags } from "@/lib/utils";
import type { DisciplineScore, Severity, TradeRecord } from "@/lib/types";
import type { EvalResult } from "@/lib/rules/engine";

// Component blend weights (sum to 1).
const WEIGHTS = {
  ruleAdherence: 0.35,
  riskDiscipline: 0.25,
  emotionalDiscipline: 0.2,
  consistency: 0.2,
} as const;

// Severity → weight used for the adherence roll-up.
const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

const NEGATIVE_EMOTIONS = new Set(["fomo", "greedy", "revenge", "fearful", "impatient", "bored", "hesitant"]);

const ET_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function etDay(d: Date): string {
  return ET_DAY_FMT.format(d);
}

function isClosed(t: TradeRecord): boolean {
  return t.exitTime !== null && t.exitPrice !== null;
}

function round(n: number): number {
  return Math.round(clamp(n, 0, 100));
}

export function computeDisciplineScore(args: {
  trades: TradeRecord[];
  evaluations: Record<string, EvalResult[]>;
}): DisciplineScore {
  const { trades, evaluations } = args;

  const rule = ruleAdherence(evaluations);
  const risk = riskDiscipline(trades);
  const emo = emotionalDiscipline(trades);
  const cons = consistency(trades);

  const overall = round(
    rule.score * WEIGHTS.ruleAdherence +
      risk.score * WEIGHTS.riskDiscipline +
      emo.score * WEIGHTS.emotionalDiscipline +
      cons.score * WEIGHTS.consistency
  );

  return {
    overall,
    ruleAdherence: rule.score,
    riskDiscipline: risk.score,
    emotionalDiscipline: emo.score,
    consistency: cons.score,
    breakdown: [
      { label: "Rule adherence", score: rule.score, weight: WEIGHTS.ruleAdherence, detail: rule.detail },
      { label: "Risk discipline", score: risk.score, weight: WEIGHTS.riskDiscipline, detail: risk.detail },
      { label: "Emotional discipline", score: emo.score, weight: WEIGHTS.emotionalDiscipline, detail: emo.detail },
      { label: "Consistency", score: cons.score, weight: WEIGHTS.consistency, detail: cons.detail },
    ],
  };
}

// --------------------------------------------------------------------------
// Rule adherence — weighted pass rate over applicable evaluations
// --------------------------------------------------------------------------

function ruleAdherence(evaluations: Record<string, EvalResult[]>): { score: number; detail: string } {
  let passWeight = 0;
  let totalWeight = 0;
  let passCount = 0;
  let applicable = 0;
  for (const results of Object.values(evaluations)) {
    for (const r of results) {
      if (r.status === "not_applicable") continue;
      const w = SEVERITY_WEIGHT[r.severity];
      totalWeight += w;
      applicable += 1;
      if (r.status === "pass") {
        passWeight += w;
        passCount += 1;
      }
    }
  }
  if (applicable === 0) {
    return { score: 100, detail: "No applicable rule evaluations — nothing to violate." };
  }
  const score = round((100 * passWeight) / totalWeight);
  return {
    score,
    detail: `${passCount}/${applicable} rule checks passed (severity-weighted ${passWeight}/${totalWeight}).`,
  };
}

// --------------------------------------------------------------------------
// Risk discipline — loss control + drawdown depth (derived from P&L)
// Note: EvalResult does not carry the rule's `type`, so this component is
// computed from realized trade P&L rather than filtering risk-typed evals.
// --------------------------------------------------------------------------

function riskDiscipline(trades: TradeRecord[]): { score: number; detail: string } {
  const closed = trades.filter(isClosed);
  if (closed.length === 0) {
    return { score: 100, detail: "No closed trades — no realized risk taken." };
  }

  // Loss control: share of losses that stayed near the typical loss size.
  const losses = closed.filter((t) => t.pnl < 0).map((t) => Math.abs(t.pnl));
  let controlRate = 1;
  let controlDetail = "no losing trades";
  if (losses.length > 0) {
    const median = medianOf(losses);
    const cap = median * 1.5;
    const controlled = losses.filter((l) => l <= cap || median === 0).length;
    controlRate = controlled / losses.length;
    controlDetail = `${controlled}/${losses.length} losses within 1.5x median`;
  }

  // Drawdown: peak-to-trough of the cumulative realized-P&L curve.
  const ordered = [...closed].sort(
    (a, b) => (a.exitTime ?? a.entryTime).getTime() - (b.exitTime ?? b.entryTime).getTime()
  );
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of ordered) {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  const net = cum;
  // Drawdown score: shallow drawdown relative to net profit scores high.
  let ddScore: number;
  if (maxDD <= 0) ddScore = 1;
  else if (net > 0) ddScore = net / (net + maxDD);
  else ddScore = 0.4; // net loss with drawdown — muted, not zero

  const score = round(100 * (0.6 * controlRate + 0.4 * ddScore));
  return {
    score,
    detail: `Loss control ${(controlRate * 100).toFixed(0)}% (${controlDetail}); max drawdown ${maxDD.toFixed(0)}.`,
  };
}

// --------------------------------------------------------------------------
// Emotional discipline — penalize negative emotion tags
// --------------------------------------------------------------------------

function emotionalDiscipline(trades: TradeRecord[]): { score: number; detail: string } {
  if (trades.length === 0) {
    return { score: 100, detail: "No trades logged." };
  }
  let negTrades = 0;
  let tagged = 0;
  for (const t of trades) {
    const emotions = parseTags(t.emotions).map((e) => e.toLowerCase());
    if (emotions.length > 0) tagged += 1;
    if (emotions.some((e) => NEGATIVE_EMOTIONS.has(e))) negTrades += 1;
  }
  const score = round(100 * (1 - negTrades / trades.length));
  return {
    score,
    detail: `${negTrades}/${trades.length} trades flagged a negative emotion (revenge/fomo/greedy…); ${tagged} tagged.`,
  };
}

// --------------------------------------------------------------------------
// Consistency — daily-P&L variance + day-to-day win-rate stability
// --------------------------------------------------------------------------

function consistency(trades: TradeRecord[]): { score: number; detail: string } {
  const closed = trades.filter(isClosed);
  if (closed.length === 0) {
    return { score: 100, detail: "No closed trades to assess consistency." };
  }

  // Aggregate per ET day.
  const byDay = new Map<string, { pnl: number; wins: number; count: number }>();
  for (const t of closed) {
    const key = etDay(t.entryTime);
    const agg = byDay.get(key) ?? { pnl: 0, wins: 0, count: 0 };
    agg.pnl += t.pnl;
    agg.count += 1;
    if (t.pnl > 0) agg.wins += 1;
    byDay.set(key, agg);
  }
  const days = [...byDay.values()];
  if (days.length < 2) {
    return { score: 100, detail: "Single trading day — consistency not yet measurable." };
  }

  const pnls = days.map((d) => d.pnl);
  const mean = avg(pnls);
  const sd = stddev(pnls, mean);
  const denom = avg(pnls.map((p) => Math.abs(p))) || 1;
  const cv = sd / denom; // coefficient of variation (scale-free)
  const varScore = 100 / (1 + cv); // cv 0 -> 100, cv 1 -> 50, cv 3 -> 25

  const dailyWinRates = days.map((d) => d.wins / d.count);
  const wrSd = stddev(dailyWinRates, avg(dailyWinRates));
  const wrScore = 100 * (1 - Math.min(1, wrSd * 2)); // wrSd 0.5 -> 0

  const score = round(0.6 * varScore + 0.4 * wrScore);
  return {
    score,
    detail: `${days.length} trading days; daily P&L CV ${cv.toFixed(2)}, win-rate σ ${wrSd.toFixed(2)}.`,
  };
}

// --------------------------------------------------------------------------
// Small numeric helpers
// --------------------------------------------------------------------------

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], mean: number): number {
  if (xs.length === 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  return Math.sqrt(variance);
}

function medianOf(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
