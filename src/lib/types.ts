// TradeOS — shared domain types & runtime validation.
// This is the single source of truth for the "enum-like" string unions that the
// Prisma schema stores as plain strings. Every module (ingestion, analytics,
// rules, UI) imports from here so the contract stays consistent.

import { z } from "zod";

// --------------------------------------------------------------------------
// Enum-like unions
// --------------------------------------------------------------------------

export const SIDES = ["long", "short"] as const;
export type Side = (typeof SIDES)[number];

export const TRADE_SOURCES = ["csv", "api", "manual", "broker"] as const;
export type TradeSource = (typeof TRADE_SOURCES)[number];

export const BROKERS = [
  "topstepx",
  "tradovate",
  "ninjatrader",
  "rithmic",
  "ibkr",
  "mt5",
  "generic",
  "manual",
] as const;
export type Broker = (typeof BROKERS)[number];

// What kind of instrument a trade is. Stored as a plain string on Trade.assetClass;
// null/absent means futures (every trade saved before forex/CFD support).
export const ASSET_CLASSES = ["futures", "forex", "cfd"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

// Which clock the times in an MT5 file use (MetaTrader shows the broker's server
// clock, not UTC). "ny_close" = GMT+2 winter / GMT+3 summer (New York close);
// "offset" is a fixed whole number of hours from UTC.
export const ServerTimeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ny_close") }),
  z.object({ mode: z.literal("utc") }),
  z.object({ mode: z.literal("offset"), hours: z.number().int().min(-12).max(14) }),
]);
export type ServerTime = z.infer<typeof ServerTimeSchema>;

export const ACCOUNT_KINDS = ["live", "funded", "evaluation", "demo"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const PLANS = ["free", "pro", "elite"] as const;
export type Plan = (typeof PLANS)[number];

export const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

// How often a paid plan is billed. Lives here (not in the plans or provider
// modules) so the client-safe plan table and the server-only provider module can
// both use the word without importing each other.
export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RULE_TYPES = [
  "time_window",
  "risk_limit",
  "max_trades",
  "max_contracts",
  "max_daily_loss",
  "indicator",
  "behavioral",
  "setup_validation",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const EVAL_STATUSES = ["pass", "fail", "not_applicable"] as const;
export type EvalStatus = (typeof EVAL_STATUSES)[number];

export const PROP_FIRMS = ["topstep", "apex", "tpt", "custom"] as const;
export type PropFirm = (typeof PROP_FIRMS)[number];

export const DRAWDOWN_TYPES = ["trailing", "static", "eod_trailing"] as const;
export type DrawdownType = (typeof DRAWDOWN_TYPES)[number];

export const PERIODS = ["day", "week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const EMOTIONS = [
  "confident",
  "calm",
  "focused",
  "fomo",
  "greedy",
  "fearful",
  "revenge",
  "impatient",
  "hesitant",
  "bored",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

// --------------------------------------------------------------------------
// The normalized trade — the internal schema every connector maps into.
// This is the canonical shape produced by ingestion adapters BEFORE it is
// persisted (ids/user/account are attached at persistence time).
// --------------------------------------------------------------------------

// Sane absolute limits shared by the manual-trade route and the CSV importer.
// Two jobs: (1) `.finite()` keeps Infinity/NaN out of the database — an overflow
// row (e.g. huge price × huge quantity) that computed to `Infinity` used to slip
// past validation, throw on insert, and get swallowed as a fake "dedupe"; now it
// is rejected up front and reported as a real error. (2) The upper bounds reject
// absurd values long before they can overflow a later multiplication.
export const MAX_TRADE_PRICE = 1_000_000_000; // $1B — beyond any real instrument price
export const MAX_TRADE_QUANTITY = 10_000_000; // 10M units in a single trade
export const MAX_TRADE_FEES = 10_000_000; // $10M of fees on a single trade
export const MAX_TRADE_PNL = 1_000_000_000_000; // $1T absolute cap on computed P&L

export const NormalizedTradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(SIDES),
  entryPrice: z.number().finite().min(-MAX_TRADE_PRICE).max(MAX_TRADE_PRICE),
  exitPrice: z.number().finite().min(-MAX_TRADE_PRICE).max(MAX_TRADE_PRICE).nullable().optional(),
  quantity: z.number().finite().positive().max(MAX_TRADE_QUANTITY),
  entryTime: z.coerce.date(),
  exitTime: z.coerce.date().nullable().optional(),
  fees: z.number().finite().min(-MAX_TRADE_FEES).max(MAX_TRADE_FEES).default(0),
  pnl: z.number().finite().min(-MAX_TRADE_PNL).max(MAX_TRADE_PNL).optional(), // computed if omitted
  pnlGross: z.number().finite().min(-MAX_TRADE_PNL).max(MAX_TRADE_PNL).nullable().optional(),
  strategyTag: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  emotions: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  source: z.enum(TRADE_SOURCES).default("csv"),
  externalId: z.string().nullable().optional(),
  assetClass: z.enum(ASSET_CLASSES).nullable().optional(),
});
export type NormalizedTrade = z.infer<typeof NormalizedTradeSchema>;

// A trade as read from the DB / passed to analytics & rules. Kept structurally
// compatible with the Prisma `Trade` model but decoupled so pure functions can
// be unit-tested without a DB.
export interface TradeRecord {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  side: Side;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: Date;
  exitTime: Date | null;
  fees: number;
  pnl: number;
  pnlGross?: number | null;
  strategyTag: string | null;
  notes: string | null;
  emotions: string | null;
  tags?: string | null;
  source: TradeSource;
  externalId?: string | null;
  assetClass?: AssetClass | null;
  isWin: boolean | null;
  complianceScore?: number | null;
  violationCount?: number;
}

// --------------------------------------------------------------------------
// Rule engine config shapes (the `Rule.config` JSON blob, keyed by rule.type)
// --------------------------------------------------------------------------

// "HH:MM" 24-hour, hours 00-23 and minutes 00-59 only — a plain \d{2}:\d{2}
// regex would also accept impossible times like "99:99".
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

// "HH:MM" (already regex-validated) → minutes since midnight, for comparing the
// two ends of a time window.
function timeOfDayToMinutes(v: string): number {
  const [h, m] = v.split(":");
  return Number(h) * 60 + Number(m);
}

export const TimeWindowConfig = z
  .object({
    start: z.string().regex(TIME_OF_DAY, "Enter a valid time (HH:MM, 00:00-23:59)."), // "09:30" local exchange time
    end: z.string().regex(TIME_OF_DAY, "Enter a valid time (HH:MM, 00:00-23:59)."),
    timezone: z.string().default("America/New_York"),
  })
  // A window whose start is AFTER its end (e.g. 16:00–09:00) can never match any
  // trade — the engine fails every trade as both "before open" and "after close",
  // so the rule silently never passes. Overnight/wraparound windows aren't
  // supported, so reject the impossible config instead of accepting a dead rule.
  .refine((c) => timeOfDayToMinutes(c.start) <= timeOfDayToMinutes(c.end), {
    message: "The window's start time must be at or before its end time (overnight windows aren't supported).",
    path: ["end"],
  });

export const RiskLimitConfig = z.object({
  maxLossPerTrade: z.number().positive().optional(),
  maxRiskPct: z.number().positive().optional(), // % of account
});

export const MaxTradesConfig = z.object({
  maxPerDay: z.number().int().positive(),
});

export const MaxContractsConfig = z.object({
  maxContracts: z.number().positive(),
});

export const MaxDailyLossConfig = z.object({
  maxDailyLoss: z.number().positive(), // absolute currency
});

export const BehavioralConfig = z.object({
  // kind: revenge_trading | overtrading | no_stop_widening
  kind: z.enum(["revenge_trading", "overtrading"]),
  // revenge: a losing trade followed by another within `withinMinutes`
  withinMinutes: z.number().positive().default(5),
  // overtrading: more than `threshold` trades inside `windowMinutes`
  threshold: z.number().positive().default(3),
  windowMinutes: z.number().positive().default(15),
});

export const IndicatorConfig = z.object({
  // Deterministic, self-declared setup validation (no live market data in MVP):
  // the trader tags whether their setup condition was met; the rule checks the tag.
  requireTag: z.string(), // e.g. "vwap_reclaim" — must be present in trade.tags
});

export const SetupValidationConfig = z.object({
  requireStrategyTag: z.boolean().default(true),
  requireNotes: z.boolean().default(false),
  requireScreenshot: z.boolean().default(false),
});

export type RuleConfig =
  | z.infer<typeof TimeWindowConfig>
  | z.infer<typeof RiskLimitConfig>
  | z.infer<typeof MaxTradesConfig>
  | z.infer<typeof MaxContractsConfig>
  | z.infer<typeof MaxDailyLossConfig>
  | z.infer<typeof BehavioralConfig>
  | z.infer<typeof IndicatorConfig>
  | z.infer<typeof SetupValidationConfig>;

export const RULE_CONFIG_SCHEMAS: Record<RuleType, z.ZodTypeAny> = {
  time_window: TimeWindowConfig,
  risk_limit: RiskLimitConfig,
  max_trades: MaxTradesConfig,
  max_contracts: MaxContractsConfig,
  max_daily_loss: MaxDailyLossConfig,
  indicator: IndicatorConfig,
  behavioral: BehavioralConfig,
  setup_validation: SetupValidationConfig,
};

// --------------------------------------------------------------------------
// Backtesting (the Testing Portal) — kinds, candle shape, run configs and the
// stored result shape. Configs/results live in BacktestRun.config/.results as
// JSON strings; parse/serialize at the boundary like Rule.config.
// --------------------------------------------------------------------------

export const BACKTEST_KINDS = ["replay", "simulation"] as const;
export type BacktestKind = (typeof BACKTEST_KINDS)[number];

export const BACKTEST_STATUSES = ["completed", "failed"] as const;
export type BacktestStatus = (typeof BACKTEST_STATUSES)[number];

export const SIM_STRATEGIES = [
  "opening_range_breakout",
  "ma_cross",
  "prev_day_level",
] as const;
export type SimStrategy = (typeof SIM_STRATEGIES)[number];

// Canonical session keys as returned by classifySession (labels are UI-only).
export const SESSION_KEYS = [
  "pre",
  "rth_am",
  "lunch",
  "rth_pm",
  "post",
  "overnight",
] as const;
export type SessionKey = (typeof SESSION_KEYS)[number];

// One OHLC bar. `t` is unix seconds (an instant — ET reasoning is derived).
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export const CandleSchema = z
  .object({
    // Bounded to ~1990–2099 so a malformed timestamp can never reach Prisma
    // as an Invalid Date.
    t: z.number().int().min(631_152_000).max(4_102_444_799),
    o: z.number().finite(),
    h: z.number().finite(),
    l: z.number().finite(),
    c: z.number().finite(),
    v: z.number().finite().optional(),
  })
  .refine((c) => c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c), {
    message: "high/low must contain open and close",
  });

export const ReplayConfigSchema = z.object({
  kind: z.literal("replay"),
  accountId: z.string().min(1).optional(),
  strategyTags: z.array(z.string().min(1).max(120)).max(20).optional(),
  symbols: z.array(z.string().min(1).max(20)).max(20).optional(),
  sessions: z.array(z.enum(SESSION_KEYS)).max(6).optional(),
  // ET weekdays, 1 = Monday .. 5 = Friday (matching buckets.ts numbering).
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  side: z.enum(SIDES).optional(),
  // Plain dates, interpreted as ET calendar days: `from` = ET midnight,
  // `to` = ET end-of-day (inclusive) — never host/UTC day boundaries.
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Optional rulebook: trades that would have FAILED any of its rules are
  // excluded from the variant ("what if I had followed my rules").
  ruleBookId: z.string().min(1).optional(),
});
export type ReplayConfig = z.infer<typeof ReplayConfigSchema>;

export const SimConfigSchema = z.object({
  kind: z.literal("simulation"),
  datasetId: z.string().min(1),
  strategy: z.enum(SIM_STRATEGIES),
  direction: z.enum(["long", "short", "both"]).default("both"),
  contracts: z.coerce.number().int().positive().max(100).default(1),
  // Bracket exits, in points. Optional — omitted legs never trigger.
  stopPoints: z.coerce.number().positive().max(10000).optional(),
  targetPoints: z.coerce.number().positive().max(10000).optional(),
  // ORB: minutes after the 09:30 ET open that define the opening range.
  rangeMinutes: z.coerce.number().int().positive().max(180).default(15),
  // ma_cross parameters.
  fastPeriod: z.coerce.number().int().min(2).max(200).default(9),
  slowPeriod: z.coerce.number().int().min(3).max(400).default(21),
  maType: z.enum(["sma", "ema"]).default("sma"),
  // prev_day_level: which side of the previous ET trading day's range to trade.
  levelSide: z.enum(["high", "low", "both"]).default("both"),
  // Flatten any open position at this ET wall-clock time each day.
  flattenAt: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .default("15:55"),
  feesPerSide: z.coerce.number().min(0).max(1000).default(2.25),
  slippageTicks: z.coerce.number().int().min(0).max(100).default(0),
  tickSize: z.coerce.number().positive().max(1000).default(0.25),
});
export type SimConfig = z.infer<typeof SimConfigSchema>;

export type BacktestConfig = ReplayConfig | SimConfig;

// Stored metrics: PerformanceMetrics with non-finite values (profitFactor can
// be Infinity, ratios can be NaN on degenerate inputs) sanitized to null so
// the JSON round-trip is explicit and typed.
export type StoredMetrics = {
  [K in keyof PerformanceMetrics]: number | null;
};

export interface BacktestTradeRow {
  id: string;
  symbol: string;
  side: Side;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string; // ISO
  exitTime: string | null; // ISO
  fees: number;
  pnl: number;
  strategyTag: string | null;
}

export interface BacktestExclusionRow {
  tradeId: string;
  symbol: string;
  entryTime: string; // ISO
  pnl: number;
  failedRules: string[];
}

// The BacktestRun.results JSON shape. Equity curves are downsampled to at most
// 2,000 points; trade/exclusion lists are samples of at most 500 rows (the
// *CountTotal fields carry the real totals). Drawdown is derived at render
// time from the stored equity curve.
export interface BacktestResults {
  variant: StoredMetrics;
  baseline: StoredMetrics | null;
  equityVariant: EquityPoint[];
  equityBaseline: EquityPoint[];
  bySession: BucketPerformance[];
  byHour: BucketPerformance[];
  byWeekday: BucketPerformance[];
  trades: BacktestTradeRow[];
  tradeCountTotal: number;
  exclusions: BacktestExclusionRow[];
  excludedCountTotal: number;
  // True when the source query hit the 10k-trade cap — results may be partial.
  truncated?: boolean;
  error?: string;
}

// --------------------------------------------------------------------------
// Analytics result shapes (produced by src/lib/analytics)
// --------------------------------------------------------------------------

export interface EquityPoint {
  time: number; // unix seconds — lightweight-charts friendly
  value: number; // cumulative equity
}

export interface PerformanceMetrics {
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number; // 0-1
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number; // grossProfit / |grossLoss|
  expectancy: number; // avg $ per trade
  payoffRatio: number; // avgWin / |avgLoss|
  avgTradePnl: number;
  maxDrawdown: number; // absolute currency, positive number
  maxDrawdownPct: number;
  currentStreak: number; // + wins / - losses
  totalFees: number;
  avgHoldMinutes: number;
}

export interface BucketPerformance {
  key: string; // label for the bucket (e.g. "09:30", "Monday", "VWAP")
  netPnl: number;
  tradeCount: number;
  winRate: number;
}

export interface DisciplineScore {
  overall: number; // 0-100
  ruleAdherence: number;
  riskDiscipline: number;
  emotionalDiscipline: number;
  consistency: number;
  breakdown: {
    label: string;
    score: number;
    weight: number;
    detail: string;
  }[];
}

// --------------------------------------------------------------------------
// Feature gating — the money layer. Keep gates declarative & centralized.
// --------------------------------------------------------------------------

export interface PlanFeatures {
  maxAccounts: number; // Infinity for unlimited
  maxTradesPerImport: number;
  historyDays: number; // analytics look-back cap (Infinity = unlimited)
  maxRuleBooks: number; // Infinity for unlimited
  maxRules: number; // counted across ALL of a user's rulebooks; Infinity = unlimited
  // "This product has a rule engine" — true on every tier. What differs between
  // tiers is how many rulebooks and rules you get (the two caps above).
  ruleEngine: boolean;
  propFirmModule: boolean;
  reports: boolean;
  advancedAnalytics: boolean;
  backtesting: boolean;
  aiCoaching: boolean;
}
