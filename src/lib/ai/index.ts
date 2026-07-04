// TradeOS — coaching provider resolver. Returns the disabled no-op provider
// unless AI_COACHING_ENABLED is explicitly "true" AND a real provider is wired.
// Today only the NullCoachingProvider exists, so coaching is always reported as
// disabled — by design (Phase 4). No AI dependency is imported here.

import type {
  CoachingProvider,
  CoachingContext,
  CoachingResult,
  TradeSummary,
  MistakeCluster,
  DailyJournalSummary,
  CoachingSuggestion,
} from "./types";

const DISABLED_MESSAGE =
  "AI coaching is part of the Elite roadmap and isn't enabled yet. Your analytics, rules, and discipline scoring work entirely without it.";

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
}

const nullProvider = new NullCoachingProvider();

export function isCoachingEnabled(): boolean {
  // Enabled only when the flag is on AND a real provider has been registered.
  // No real provider exists yet, so this returns false.
  return process.env.AI_COACHING_ENABLED === "true" && false;
}

export function getCoachingProvider(): CoachingProvider {
  // When a real provider is added, return it here when isCoachingEnabled().
  return nullProvider;
}

export type { CoachingProvider, CoachingContext, CoachingResult } from "./types";
