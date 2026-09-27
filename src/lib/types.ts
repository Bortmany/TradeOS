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
  "generic",
  "manual",
] as const;
export type Broker = (typeof BROKERS)[number];

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
  aiCoaching: boolean;
}
