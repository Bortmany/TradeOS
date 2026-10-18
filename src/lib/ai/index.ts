// TradeOS — coaching provider resolver. Returns the disabled no-op provider
// unless AI_COACHING_ENABLED is explicitly "true" AND a real provider is wired.
// The Anthropic provider (./anthropic.ts) is used only when the flag is "true"
// AND ANTHROPIC_API_KEY is set; otherwise the no-op provider answers.

import { anthropicConfigured, anthropicProvider } from "./anthropic";
import type {
  CoachingProvider,
  CoachingContext,
  CoachingResult,
  TradeSummary,
  MistakeCluster,
  DailyJournalSummary,
  CoachingSuggestion,
  WeeklyCoachingSummary,
} from "./types";

const DISABLED_MESSAGE =
  "AI coaching isn't switched on for this site yet. Your scores, rules and analytics work without it.";

function disabled<T>(): CoachingResult<T> {
  return { enabled: false, data: null, message: DISABLED_MESSAGE };
}

class NullCoachingProvider implements CoachingProvider {
  readonly enabled = false;
  async summarizeTrade(_ctx: CoachingContext, _tradeId: string): Promise<CoachingResult<TradeSummary>> {
    return disabled();
  }
  async clusterMistakes(_ctx: CoachingContext): Promise<CoachingResult<MistakeCluster[]>> {
    return disabled();
  }
  async summarizeDay(_ctx: CoachingContext, _date: string): Promise<CoachingResult<DailyJournalSummary>> {
    return disabled();
  }
  async suggestImprovements(_ctx: CoachingContext): Promise<CoachingResult<CoachingSuggestion[]>> {
    return disabled();
  }
  async summarizeWeek(_ctx: CoachingContext, _weekStart: string): Promise<CoachingResult<WeeklyCoachingSummary>> {
    return disabled();
  }
}

const nullProvider = new NullCoachingProvider();

export function isCoachingEnabled(): boolean {
  // Read fresh each call: flag on AND a key present.
  return anthropicConfigured();
}

export function getCoachingProvider(): CoachingProvider {
  return isCoachingEnabled() ? anthropicProvider : nullProvider;
}

export type { CoachingProvider, CoachingContext, CoachingResult } from "./types";
