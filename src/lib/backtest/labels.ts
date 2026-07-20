// TradeOS — Backtesting: display labels for the enum-like keys.
// Pure constants, safe to import from client components.

import type { SimStrategy, SessionKey, BacktestKind } from "@/lib/types";

export const SIM_STRATEGY_LABELS: Record<SimStrategy, string> = {
  opening_range_breakout: "Opening Range Breakout",
  ma_cross: "MA Cross",
  prev_day_level: "Prev-Day Level Break",
};

// Same labels bySession() uses (analytics/buckets.ts) — keys are canonical,
// labels are presentation-only.
export const SESSION_LABELS: Record<SessionKey, string> = {
  pre: "Pre",
  rth_am: "RTH AM",
  lunch: "Lunch",
  rth_pm: "RTH PM",
  post: "Post",
  overnight: "Overnight",
};

export const BACKTEST_KIND_LABELS: Record<BacktestKind, string> = {
  replay: "Replay",
  simulation: "Simulation",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};
