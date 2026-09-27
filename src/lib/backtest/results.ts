// TradeOS — Backtesting: result assembly for storage.
// Pure and deterministic. Runs the existing analytics over the variant (and
// optional baseline) trades and packs a BacktestRun.results payload with hard
// size caps: equity curves are downsampled to ≤ 2,000 points, trade/exclusion
// lists are ≤ 500-row samples (totals ride alongside), drawdown is derived at
// render time from the stored curve. Non-finite numbers (profitFactor can be
// Infinity; degenerate inputs can yield NaN) are sanitized to null — an
// unsanitized JSON.stringify would null them silently, this makes it typed.

import type {
  BacktestResults,
  BacktestTradeRow,
  BacktestExclusionRow,
  EquityPoint,
  PerformanceMetrics,
  StoredMetrics,
  TradeRecord,
} from "@/lib/types";
import {
  computeMetrics,
  buildEquityCurve,
  byHourOfDay,
  bySession,
  byWeekday,
} from "@/lib/analytics";
import type { ReplayExclusion } from "./replay";

export const MAX_EQUITY_POINTS = 2000;
export const MAX_ROW_SAMPLE = 500;

export function sanitizeMetrics(m: PerformanceMetrics): StoredMetrics {
  const out = {} as Record<string, number | null>;
  for (const [key, value] of Object.entries(m)) {
    out[key] = Number.isFinite(value) ? (value as number) : null;
  }
  return out as StoredMetrics;
}

/** Uniform-stride downsample that always keeps the final point, ≤ max total. */
export function downsampleEquity(points: EquityPoint[], max = MAX_EQUITY_POINTS): EquityPoint[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out: EquityPoint[] = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  // Replace (not append) the last sample with the true final point so the
  // curve ends exactly where the data does without breaching the cap.
  out[out.length - 1] = points[points.length - 1];
  return out;
}

function toTradeRow(t: TradeRecord): BacktestTradeRow {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime ? t.exitTime.toISOString() : null,
    fees: t.fees,
    pnl: t.pnl,
    strategyTag: t.strategyTag,
  };
}

export function assembleResults(args: {
  variant: TradeRecord[];
  baseline: TradeRecord[] | null;
  exclusions: ReplayExclusion[];
  truncated?: boolean;
}): BacktestResults {
  const { variant, baseline, exclusions } = args;

  // Chronological order reads naturally on curves and trade lists.
  const sortedVariant = [...variant].sort(
    (a, b) => a.entryTime.getTime() - b.entryTime.getTime()
  );
  const sortedBaseline = baseline
    ? [...baseline].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime())
    : null;

  return {
    variant: sanitizeMetrics(computeMetrics(sortedVariant)),
    baseline: sortedBaseline ? sanitizeMetrics(computeMetrics(sortedBaseline)) : null,
    // Starting balance 0 for both curves: cumulative net P&L, comparable.
    equityVariant: downsampleEquity(buildEquityCurve(sortedVariant, 0)),
    equityBaseline: sortedBaseline
      ? downsampleEquity(buildEquityCurve(sortedBaseline, 0))
      : [],
    bySession: bySession(sortedVariant),
    byHour: byHourOfDay(sortedVariant),
    byWeekday: byWeekday(sortedVariant),
    trades: sortedVariant.slice(0, MAX_ROW_SAMPLE).map(toTradeRow),
    tradeCountTotal: sortedVariant.length,
    exclusions: exclusions.slice(0, MAX_ROW_SAMPLE).map(
      (x): BacktestExclusionRow => ({
        tradeId: x.trade.id,
        symbol: x.trade.symbol,
        entryTime: x.trade.entryTime.toISOString(),
        pnl: x.trade.pnl,
        failedRules: x.failedRules,
      })
    ),
    excludedCountTotal: exclusions.length,
    ...(args.truncated ? { truncated: true } : {}),
  };
}
