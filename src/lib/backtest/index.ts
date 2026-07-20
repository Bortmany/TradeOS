// TradeOS — Backtesting engine barrel (Package E, see docs/CONTRACTS.md).
// Everything here is pure and DB-free; persistence lives in the API routes and
// src/lib/backtest-data.ts.

export { parseCandleCsv, type ParsedCandles } from "./candles";
export { runSimulation } from "./simulate";
export {
  runReplay,
  type ReplayOutcome,
  type ReplayExclusion,
  type RuleScope,
} from "./replay";
export {
  assembleResults,
  sanitizeMetrics,
  downsampleEquity,
  MAX_EQUITY_POINTS,
  MAX_ROW_SAMPLE,
} from "./results";
export { etWeekday, hmToMinutes, etWallToUtc, etDateStartUtc, etDateEndUtc } from "./time";
export {
  SIM_STRATEGY_LABELS,
  SESSION_LABELS,
  BACKTEST_KIND_LABELS,
  WEEKDAY_SHORT,
} from "./labels";
