// TradeOS — period report builder.
// Aggregates a window of New York calendar days of trades into a print-friendly report payload:
// realized metrics, per-strategy / per-session breakdowns, best/worst trades,
// a daily P&L series, rule-compliance stats, and an emotional summary.
//
// Server-only: reads trades & active rules via the data layer. All calendar-day
// reasoning is anchored to America/New_York (ET) so buckets are stable across
// server timezones.

import "server-only";
import { z } from "zod";
import { getTrades, getActiveRules, getLatestTradeDayKey } from "@/lib/data";
import { etDateStartUtc, etDateEndUtc } from "@/lib/backtest/time";
import { isDayKey, reportWindowKeys } from "@/lib/et-days";
import { computeMetrics, byStrategy, bySession } from "@/lib/analytics";
import { evaluateTrades, etDayKey } from "@/lib/rules/engine";
import type { RuleLike } from "@/lib/rules/engine";
import { weekEndKey } from "@/lib/reviews";
import { dailyPnlSeries, type DailyPnlPoint } from "@/lib/analytics/daily";
import type { TradeRecord, PerformanceMetrics, BucketPerformance } from "@/lib/types";
import { parseTags } from "@/lib/utils";

// Re-exported so existing imports from "@/lib/reports" keep working.
export { dailyPnlSeries, type DailyPnlPoint };

export type ReportPeriod = "day" | "week" | "month";

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
  /** Midday UTC of the first / last ET day (prints as that calendar date anywhere). */
  from: Date;
  to: Date;
  /** First and last New York calendar day of the window ("YYYY-MM-DD"). */
  startKey: string;
  endKey: string;
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
 * The New York calendar day a report is anchored on, from the address bar's
 * `?date=YYYY-MM-DD`:
 *   - a real past-or-today day key is used as given;
 *   - a malformed or future value snaps to today (ET);
 *   - no value opens on the most recent ET day with trades for this user (and
 *     account, when one is picked) — `getLatestTradeDayKey`, which uses the
 *     rule engine's `etDayKey` boundary — or today when there are none.
 * `latestKey` is null when the user (or account) has no trades at all.
 */
export async function resolveReportAnchor(
  userId: string,
  rawDate: string | undefined,
  accountId?: string,
  now: Date = new Date()
): Promise<{ anchorKey: string; todayKey: string; latestKey: string | null }> {
  const todayKey = etDayKey(now);
  const latestFound = await getLatestTradeDayKey(userId, accountId);
  // A trade stamped in the future can't pull the report past today.
  const latestKey = latestFound && latestFound > todayKey ? todayKey : latestFound;
  let anchorKey: string;
  if (rawDate === undefined || rawDate === "") anchorKey = latestKey ?? todayKey;
  else {
    const parsed = ReportDateSchema.safeParse(rawDate);
    anchorKey = parsed.success && parsed.data <= todayKey ? parsed.data : todayKey;
  }
  return { anchorKey, todayKey, latestKey };
}

/** The `?date=` shape: a real calendar day written YYYY-MM-DD. */
export const ReportDateSchema = z.string().refine(isDayKey, "Use a real date in the form YYYY-MM-DD.");

/**
 * Builds the aggregated report for the window that ENDS on the New York day
 * `anchorKey` (Daily = that day, Weekly = the 7 days ending that day, Monthly
 * = the 30 days ending that day), optionally scoped to one account. A trade
 * belongs to the window when its entry's ET calendar day (`etDayKey`, the
 * rule engine's boundary) is inside it — never the machine's own dates. With
 * no anchor the window ends today (ET). Never throws on an empty window;
 * returns zeroed sections.
 */
export async function buildReport(
  userId: string,
  period: ReportPeriod,
  accountId?: string,
  anchorKey?: string
): Promise<ReportData> {
  const endKey = anchorKey && isDayKey(anchorKey) ? anchorKey : etDayKey(new Date());
  const { startKey } = reportWindowKeys(period, endKey);

  const [loaded, rules] = await Promise.all([
    getTrades(userId, {
      from: etDateStartUtc(startKey),
      to: etDateEndUtc(endKey),
      ...(accountId ? { accountId } : {}),
    }),
    getActiveRules(userId),
  ]);

  // Keep exactly the trades whose ET day is inside the window (the database
  // bounds above are the same ET midnights; this is the engine's own check).
  const trades = tradesInDayRange(loaded, startKey, endKey);
  const report = summarizeTrades(
    period,
    new Date(`${startKey}T12:00:00.000Z`),
    new Date(`${endKey}T12:00:00.000Z`),
    trades,
    rules
  );
  return { ...report, startKey, endKey };
}

/** Trades whose entry's ET calendar day is within [startKey, endKey]. Pure. */
export function tradesInDayRange(
  trades: TradeRecord[],
  startKey: string,
  endKey: string
): TradeRecord[] {
  return trades.filter((t) => {
    const day = etDayKey(t.entryTime);
    return day >= startKey && day <= endKey;
  });
}

/**
 * The trades whose ET calendar day falls inside the Monday–Sunday week that
 * starts at `weekKey` ("YYYY-MM-DD", a Monday). Pure — exported for tests.
 */
export function tradesInWeek(trades: TradeRecord[], weekKey: string): TradeRecord[] {
  const endKey = weekEndKey(weekKey);
  return trades.filter((t) => {
    const day = etDayKey(t.entryTime);
    return day >= weekKey && day <= endKey;
  });
}

/**
 * The report for one calendar week — Monday to Sunday in New York time — for
 * any week, past or present. Used by the Weekly Review so the numbers always
 * match the week named on the page, whatever the server clock says.
 */
export async function buildWeekReport(
  userId: string,
  weekKey: string,
  accountId?: string
): Promise<ReportData> {
  const endKey = weekEndKey(weekKey);
  // Fetch with a day of slack on each side (ET is 4–5h behind UTC), then keep
  // exactly the trades whose ET calendar day is inside the week.
  const fetchFrom = new Date(`${weekKey}T00:00:00.000Z`);
  fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 1);
  const fetchTo = new Date(`${endKey}T00:00:00.000Z`);
  fetchTo.setUTCDate(fetchTo.getUTCDate() + 2);

  const [loaded, rules] = await Promise.all([
    getTrades(userId, { from: fetchFrom, to: fetchTo, ...(accountId ? { accountId } : {}) }),
    getActiveRules(userId),
  ]);

  // Midday UTC of the Monday / Sunday — reads as the right calendar date anywhere.
  const from = new Date(`${weekKey}T12:00:00.000Z`);
  const to = new Date(`${endKey}T12:00:00.000Z`);
  return { ...summarizeTrades("week", from, to, tradesInWeek(loaded, weekKey), rules), startKey: weekKey, endKey };
}

/** Aggregates an already-filtered set of trades into the report payload. */
function summarizeTrades(
  period: ReportPeriod,
  from: Date,
  to: Date,
  trades: TradeRecord[],
  rules: RuleLike[]
): Omit<ReportData, "startKey" | "endKey"> {
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
    to,
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
