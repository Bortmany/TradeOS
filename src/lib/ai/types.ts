// TradeOS — AI coaching layer (Phase 4). ARCHITECTURE ONLY — DISABLED BY DEFAULT.
// These interfaces let the rest of the app call into a coaching provider without
// any AI dependency existing in core logic. The default provider is a no-op that
// reports the feature as disabled. A real provider (Claude/OpenAI) can be dropped
// in later behind this same contract without touching callers.

import type { TradeRecord, DisciplineScore, PerformanceMetrics } from "@/lib/types";

export interface CoachingContext {
  userId: string;
  trades: TradeRecord[];
  metrics: PerformanceMetrics;
  discipline: DisciplineScore;
  /** Failing rule explanations already computed by the deterministic engine. */
  violations: { ruleName: string; explanation: string; severity: string }[];
  timeframe: { from: Date; to: Date };
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

export interface CoachingResult<T> {
  enabled: boolean;
  data: T | null;
  /** Present when disabled or on error, so the UI can explain gracefully. */
  message?: string;
}

// The contract every coaching provider implements. Deterministic core features
// (analytics, rules, discipline) NEVER depend on this — it is strictly additive.
export interface CoachingProvider {
  readonly enabled: boolean;
  summarizeTrade(ctx: CoachingContext, tradeId: string): Promise<CoachingResult<TradeSummary>>;
  clusterMistakes(ctx: CoachingContext): Promise<CoachingResult<MistakeCluster[]>>;
  summarizeDay(ctx: CoachingContext, date: string): Promise<CoachingResult<DailyJournalSummary>>;
  suggestImprovements(ctx: CoachingContext): Promise<CoachingResult<CoachingSuggestion[]>>;
}
