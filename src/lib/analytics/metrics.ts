// TradeOS — Analytics: aggregate performance metrics.
// Pure & deterministic. Only closed trades (exitTime !== null) count toward
// realized metrics; open trades are ignored. Never throws, never divides by zero.

import type { PerformanceMetrics, TradeRecord } from "@/lib/types";
import { buildEquityCurve } from "./equity";

const ZERO_METRICS: PerformanceMetrics = {
  netPnl: 0,
  grossProfit: 0,
  grossLoss: 0,
  tradeCount: 0,
  winCount: 0,
  lossCount: 0,
  breakevenCount: 0,
  winRate: 0,
  avgWin: 0,
  avgLoss: 0,
  largestWin: 0,
  largestLoss: 0,
  profitFactor: 0,
  expectancy: 0,
  payoffRatio: 0,
  avgTradePnl: 0,
  maxDrawdown: 0,
  maxDrawdownPct: 0,
  currentStreak: 0,
  totalFees: 0,
  avgHoldMinutes: 0,
};

/**
 * Computes realized performance metrics over the closed trades in `trades`.
 * Returns a fully-zeroed metrics object for empty / all-open input.
 *
 * Sign conventions:
 *  - grossProfit ≥ 0, grossLoss ≥ 0 (magnitude of losses).
 *  - avgLoss ≤ 0, largestLoss ≤ 0 (kept signed for display).
 *  - profitFactor = grossProfit / grossLoss, → Infinity when there are wins but
 *    no losses, → 0 when there are no wins.
 */
export function computeMetrics(trades: TradeRecord[]): PerformanceMetrics {
  const closed = trades.filter((t) => t.exitTime !== null);
  if (closed.length === 0) return { ...ZERO_METRICS };

  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0; // positive magnitude of losing pnl
  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let largestWin = 0;
  let largestLoss = 0; // most-negative pnl (≤ 0)
  let totalFees = 0;

  // Hold time: averaged only over trades that have both timestamps.
  let holdMinutesSum = 0;
  let holdCount = 0;

  for (const t of closed) {
    netPnl += t.pnl;
    totalFees += t.fees;

    if (t.pnl > 0) {
      winCount += 1;
      grossProfit += t.pnl;
      if (t.pnl > largestWin) largestWin = t.pnl;
    } else if (t.pnl < 0) {
      lossCount += 1;
      grossLoss += -t.pnl;
      if (t.pnl < largestLoss) largestLoss = t.pnl;
    } else {
      breakevenCount += 1;
    }

    if (t.exitTime !== null) {
      const ms = t.exitTime.getTime() - t.entryTime.getTime();
      if (ms >= 0) {
        holdMinutesSum += ms / 60000;
        holdCount += 1;
      }
    }
  }

  const tradeCount = closed.length;
  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? -grossLoss / lossCount : 0; // ≤ 0

  // profitFactor: guard the zero-loss case per contract.
  let profitFactor: number;
  if (grossLoss > 0) {
    profitFactor = grossProfit / grossLoss;
  } else {
    profitFactor = winCount > 0 ? Infinity : 0;
  }

  const payoffRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;
  const avgTradePnl = netPnl / tradeCount;

  const { maxDrawdown, maxDrawdownPct } = computeMaxDrawdown(trades);

  return {
    netPnl,
    grossProfit,
    grossLoss,
    tradeCount,
    winCount,
    lossCount,
    breakevenCount,
    winRate: winCount / tradeCount,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    profitFactor,
    expectancy: avgTradePnl,
    payoffRatio,
    avgTradePnl,
    maxDrawdown,
    maxDrawdownPct,
    currentStreak: computeCurrentStreak(trades),
    totalFees,
    avgHoldMinutes: holdCount > 0 ? holdMinutesSum / holdCount : 0,
  };
}

/**
 * Max peak-to-trough drawdown of the realized equity curve (starting at 0).
 * `maxDrawdown` is a positive currency amount; `maxDrawdownPct` is the largest
 * drawdown relative to its running peak (0 when the peak is non-positive).
 */
function computeMaxDrawdown(trades: TradeRecord[]): {
  maxDrawdown: number;
  maxDrawdownPct: number;
} {
  const curve = buildEquityCurve(trades, 0);
  let peak = -Infinity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const p of curve) {
    if (p.value > peak) peak = p.value;
    const dd = peak - p.value;
    if (dd > maxDrawdown) maxDrawdown = dd;
    // Percentage only meaningful against a positive peak.
    if (peak > 0) {
      const pct = dd / peak;
      if (pct > maxDrawdownPct) maxDrawdownPct = pct;
    }
  }
  return { maxDrawdown, maxDrawdownPct };
}

/**
 * Current win/loss streak from the most recent closed trades (by exitTime).
 * Positive = consecutive wins, negative = consecutive losses. A breakeven
 * trade (pnl === 0) or the absence of closed trades yields 0.
 */
function computeCurrentStreak(trades: TradeRecord[]): number {
  const closed = trades
    .filter((t): t is TradeRecord & { exitTime: Date } => t.exitTime !== null)
    .slice()
    .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());
  if (closed.length === 0) return 0;

  let streak = 0;
  // Walk backwards from most recent while direction is consistent.
  for (let i = closed.length - 1; i >= 0; i--) {
    const pnl = closed[i].pnl;
    if (pnl > 0) {
      if (streak < 0) break;
      streak += 1;
    } else if (pnl < 0) {
      if (streak > 0) break;
      streak -= 1;
    } else {
      break; // breakeven ends the streak
    }
  }
  return streak;
}
