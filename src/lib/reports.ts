// TradeOS — period report builder.
// Aggregates a trailing window of trades into a print-friendly report payload:
// realized metrics, per-strategy / per-session breakdowns, best/worst trades,
// a daily P&L series, rule-compliance stats, and an emotional summary.
//
// Server-only: reads trades & active rules via the data layer. All calendar-day
// reasoning is anchored to America/New_York (ET) so buckets are stable across
// server timezones.

import "server-only";
import { getTrades, getActiveRules } from "@/lib/data";
import { computeMetrics, byStrategy, bySession } from "@/lib/analytics";
import { evaluateTrades, etDayKey } from "@/lib/rules/engine";
import type { TradeRecord, PerformanceMetrics, BucketPerformance } from "@/lib/types";
import { parseTags } from "@/lib/utils";

export type ReportPeriod = "day" | "week" | "month";

export interface DailyPnlPoint {
  date: string; // ET calendar day, "YYYY-MM-DD"
  pnl: number; // realized net P&L booked that day
  trades: number; // closed trades that day
}

export interface ComplianceSummary {
  adherencePct: number; // 0-100, pass / (pass + fail)
  totalFails: number;
  topViolations: { ruleName: string; count: number }[];
}

export interface EmotionSummary {
  tag: string;
  count: number;
  netPnl: number;
}

export interface ReportData {
  period: ReportPeriod;
  from: Date;
  to: Date;
  tradeCount: number;
  metrics: PerformanceMetrics;
  byStrategy: BucketPerformance[];
  bySession: BucketPerformance[];
  best: TradeRecord[];
  worst: TradeRecord[];
  dailyPnl: DailyPnlPoint[];
  compliance: ComplianceSummary;
  emotions: EmotionSummary[];
}

/**
 * Buckets closed trades into ET calendar-day realized P&L points, sorted by
 * date ascending. Open trades (no exitTime) are ignored. Exported for reuse by
 * the analytics P&L calendar.
 */
export function dailyPnlSeries(trades: TradeRecord[]): DailyPnlPoint[] {
  const map = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    if (t.exitTime === null) continue;
    const date = etDayKey(t.entryTime);
    const acc = map.get(date) ?? { pnl: 0, trades: 0 };
    acc.pnl += t.pnl;
    acc.trades += 1;
    map.set(date, acc);
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, pnl: v.pnl, trades: v.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Lower bound of the fetch window for a period (with a small buffer for `day`). */
function windowFrom(period: ReportPeriod, now: Date): Date {
  const d = new Date(now);
  if (period === "day") d.setDate(d.getDate() - 1); // buffer; refined by ET-day filter
  else if (period === "week") d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d;
}

/**
 * Builds the aggregated report for a user over the trailing window of `period`
 * (day = today ET, week = last 7d, month = last 30d), optionally scoped to one
 * account. Never throws; returns zeroed sections for an empty window.
 */
export async function buildReport(
  userId: string,
  period: ReportPeriod,
  accountId?: string
): Promise<ReportData> {
  const now = new Date();
  const from = windowFrom(period, now);

  const [loaded, rules] = await Promise.all([
    getTrades(userId, { from, ...(accountId ? { accountId } : {}) }),
    getActiveRules(userId),
  ]);

  // For the intraday view, keep only trades whose ET calendar day is today.
  const todayKey = etDayKey(now);
  const trades =
    period === "day" ? loaded.filter((t) => etDayKey(t.entryTime) === todayKey) : loaded;

  const closed = trades.filter((t) => t.exitTime !== null);

  // Best / worst by realized P&L (closed only).
  const bySignedPnl = closed.slice().sort((a, b) => b.pnl - a.pnl);
  const best = bySignedPnl.slice(0, 5);
  const worst = bySignedPnl.slice(-5).reverse().filter((t) => t.pnl < 0);

  // Compliance — evaluate the whole window against the active rulebook.
  const evaluations = evaluateTrades(trades, rules);
  let pass = 0;
  let fail = 0;
  const violationCounts = new Map<string, number>();
  for (const evs of Object.values(evaluations)) {
    for (const e of evs) {
      if (e.status === "pass") pass += 1;
      else if (e.status === "fail") {
        fail += 1;
        violationCounts.set(e.ruleName, (violationCounts.get(e.ruleName) ?? 0) + 1);
      }
    }
  }
  const totalEvals = pass + fail;
  const compliance: ComplianceSummary = {
    adherencePct: totalEvals > 0 ? (pass / totalEvals) * 100 : 100,
    totalFails: fail,
    topViolations: Array.from(violationCounts.entries())
      .map(([ruleName, count]) => ({ ruleName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };

  // Emotional summary — split the emotions tag string per closed trade.
  const emotionMap = new Map<string, { count: number; netPnl: number }>();
  for (const t of closed) {
    for (const tag of parseTags(t.emotions)) {
      const acc = emotionMap.get(tag) ?? { count: 0, netPnl: 0 };
      acc.count += 1;
      acc.netPnl += t.pnl;
      emotionMap.set(tag, acc);
    }
  }
  const emotions: EmotionSummary[] = Array.from(emotionMap.entries())
    .map(([tag, v]) => ({ tag, count: v.count, netPnl: v.netPnl }))
    .sort((a, b) => b.count - a.count);

  return {
    period,
    from,
    to: now,
    tradeCount: trades.length,
    metrics: computeMetrics(closed),
    byStrategy: byStrategy(closed),
    bySession: bySession(closed),
    best,
    worst,
    dailyPnl: dailyPnlSeries(closed),
    compliance,
    emotions,
  };
}
