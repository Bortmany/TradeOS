// TradeOS — Analytics engine barrel.
// Pure, deterministic performance analytics over TradeRecord[].

export { computeMetrics } from "./metrics";
export { buildEquityCurve, computeDrawdownSeries } from "./equity";
export {
  byHourOfDay,
  byWeekday,
  bySession,
  byStrategy,
  bySymbol,
  classifySession,
} from "./buckets";
