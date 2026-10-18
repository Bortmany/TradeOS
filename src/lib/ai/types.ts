// TradeOS — AI coaching layer (Phase 4). ARCHITECTURE ONLY — DISABLED BY DEFAULT.
// These interfaces let the rest of the app call into a coaching provider without
// any AI dependency existing in core logic. The default provider is a no-op that
// reports the feature as disabled. A real provider (Claude/OpenAI) can be dropped
// in later behind this same contract without touching callers.

import type { TradeRecord, DisciplineScore, PerformanceMetrics } from "@/lib/types";

export const NOTE_KINDS = ["suggestions", "clusters", "day", "trade", "weekly"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const FOCUS_AREAS = ["rules", "sizing", "emotions", "journaling", "consistency"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const TONES = ["gentle", "direct"] as const;
export type CoachingTone = (typeof TONES)[number];

export interface CoachingContext {
  userId: string;
  trades: TradeRecord[];
  metrics: PerformanceMetrics;
  discipline: DisciplineScore;
  /** Failing rule explanations already computed by the deterministic engine. */
  violations: { ruleName: string; explanation: string; severity: string }[];
  timeframe: { from: Date; to: Date };
  /** number = this user's daily cap; null = scheduled job (skip the per-user gate); undefined = legacy env default. */
  limits?: { dailyCap: number | null };
  /** The user's fixed-label preferences (never free text). */
  preferences?: { tone: CoachingTone; focusAreas: FocusArea[] };
  /** The coach's own previous focus sentence (model-written, never user-typed). */
  previousFocus?: { text: string; done: boolean; ageDays: number } | null;
  /** Which note is being made (for the usage row). */
  kind?: NoteKind;
}

export interface TradeSummary {
  tradeId: string;
  headline: string;
  detail: string;
}

export interface MistakeCluster {
  label: string;
  count: number;
  exampleTradeIds: string[];
  suggestion: string;
}

export interface DailyJournalSummary {
  date: string;
  summary: string;
  wins: string[];
  mistakes: string[];
  focusTomorrow: string;
}

export interface CoachingSuggestion {
  title: string;
  body: string;
  priority: "low" | "medium" | "high";
}

export interface WeeklyCoachingSummary {
  weekStart: string;
  summary: string;
  wins: string[];
  mistakes: string[];
  focusNextWeek: string;
  previousFocusVerdict: string | null;
}

export interface CoachingResult<T> {
  enabled: boolean;
  data: T | null;
  /** Present when disabled or on error, so the UI can explain gracefully. */
  message?: string;
  /** Why there is no data, when it is a cap rather than a failure. */
  code?: "limit" | "global_limit" | "unavailable";
  /** Tokens used, taken from the Anthropic response. Filled on success. */
  usage?: { inputTokens: number; outputTokens: number; model: string };
  /** The AiUsage row this call used (internal; lets the service mark it failed). */
  usageId?: string;
}

// The contract every coaching provider implements. Deterministic core features
// (analytics, rules, discipline) NEVER depend on this — it is strictly additive.
export interface CoachingProvider {
  readonly enabled: boolean;
  summarizeTrade(ctx: CoachingContext, tradeId: string): Promise<CoachingResult<TradeSummary>>;
  clusterMistakes(ctx: CoachingContext): Promise<CoachingResult<MistakeCluster[]>>;
  summarizeDay(ctx: CoachingContext, date: string): Promise<CoachingResult<DailyJournalSummary>>;
  suggestImprovements(ctx: CoachingContext): Promise<CoachingResult<CoachingSuggestion[]>>;
  summarizeWeek(ctx: CoachingContext, weekStart: string): Promise<CoachingResult<WeeklyCoachingSummary>>;
}
