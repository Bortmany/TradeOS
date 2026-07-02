// TradeOS — Analytics: equity curve & drawdown series.
// Pure, deterministic. Only closed trades (exitTime !== null) contribute.

import type { EquityPoint, TradeRecord } from "@/lib/types";

/** Closed trades sorted by exitTime ascending (stable, deterministic). */
function closedByExit(trades: TradeRecord[]): TradeRecord[] {
  return trades
    .filter((t): t is TradeRecord & { exitTime: Date } => t.exitTime !== null)
    .slice()
    .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());
}

/**
 * Builds a cumulative equity curve from realized P&L.
 * One point per closed trade, timestamped at its exitTime (unix seconds),
 * with `value` = startingBalance + cumulative net pnl up to and including it.
 * Returns [] for no closed trades.
 */
export function buildEquityCurve(
  trades: TradeRecord[],
  startingBalance = 0
): EquityPoint[] {
  const closed = closedByExit(trades);
  const points: EquityPoint[] = [];
  let equity = startingBalance;
  for (const t of closed) {
    equity += t.pnl;
    points.push({
      time: Math.floor((t.exitTime as Date).getTime() / 1000),
      value: equity,
    });
  }
  return points;
}

/**
 * Computes the peak-to-current drawdown at each equity point.
 * `drawdown` is a non-negative currency amount (running peak − current value).
 * Returns [] for an empty curve.
 */
export function computeDrawdownSeries(
  equity: EquityPoint[]
): { time: number; drawdown: number }[] {
  const series: { time: number; drawdown: number }[] = [];
  let peak = -Infinity;
  for (const p of equity) {
    if (p.value > peak) peak = p.value;
    const drawdown = peak - p.value;
    series.push({ time: p.time, drawdown: drawdown > 0 ? drawdown : 0 });
  }
  return series;
}
