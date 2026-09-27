// TradeOS — Backtesting: journal replay ("what if" over recorded trades).
// Pure, deterministic, DB-free. Filters the user's closed trade history down to
// a strategy variant (tags / symbols / sessions / weekdays / side) and — when a
// rulebook is supplied — excludes trades that would have FAILED any of its
// rules, using the pure in-memory evaluator (never the persisting recompute
// path). The baseline is the same account + date window with no strategy
// filters, so variant vs. baseline is an apples-to-apples comparison.

import type { ReplayConfig, TradeRecord } from "@/lib/types";
import { classifySession } from "@/lib/analytics";
import { evaluateTrades, type EvalContext, type RuleLike } from "@/lib/rules/engine";
import { etDateEndUtc, etDateStartUtc, etWeekday } from "./time";

export interface ReplayExclusion {
  trade: TradeRecord;
  failedRules: string[];
}

export interface ReplayOutcome {
  variantTrades: TradeRecord[];
  baselineTrades: TradeRecord[];
  exclusions: ReplayExclusion[];
}

/** Rulebook scope, as stored on the RuleBook row (see recompute.ts). */
export interface RuleScope {
  scope: string; // all | strategy | account
  scopeValue: string | null;
}

// Same semantics as the private scopeTrades in rules/recompute.ts: a scoped
// book with an empty scopeValue matches nothing.
function inScope(t: TradeRecord, scope: RuleScope): boolean {
  if (scope.scope === "strategy") return !!scope.scopeValue && t.strategyTag === scope.scopeValue;
  if (scope.scope === "account") return !!scope.scopeValue && t.accountId === scope.scopeValue;
  return true;
}

export function runReplay(
  allTrades: TradeRecord[],
  config: ReplayConfig,
  rules: RuleLike[] | null,
  ruleScope?: RuleScope,
  ctxByTradeId?: Record<string, EvalContext>
): ReplayOutcome {
  // Baseline: closed trades in the account + date window only. The account and
  // date filters are usually applied at query time already — re-applying here
  // keeps the engine self-contained for tests. The window dates are ET
  // calendar days: from = ET midnight, to = ET end-of-day, inclusive.
  const from = config.from ? etDateStartUtc(config.from) : null;
  const to = config.to ? etDateEndUtc(config.to) : null;
  const baselineTrades = allTrades.filter((t) => {
    if (t.exitTime === null) return false;
    if (config.accountId && t.accountId !== config.accountId) return false;
    if (from && t.entryTime < from) return false;
    if (to && t.entryTime > to) return false;
    return true;
  });

  const tags = config.strategyTags?.length ? new Set(config.strategyTags) : null;
  const symbols = config.symbols?.length
    ? new Set(config.symbols.map((s) => s.trim().toUpperCase()))
    : null;
  const sessions = config.sessions?.length ? new Set<string>(config.sessions) : null;
  const weekdays = config.weekdays?.length ? new Set(config.weekdays) : null;

  const candidates = baselineTrades.filter((t) => {
    if (tags && (t.strategyTag === null || !tags.has(t.strategyTag))) return false;
    if (symbols && !symbols.has(t.symbol.trim().toUpperCase())) return false;
    if (sessions && !sessions.has(classifySession(t.entryTime))) return false;
    if (weekdays && !weekdays.has(etWeekday(t.entryTime))) return false;
    if (config.side && t.side !== config.side) return false;
    return true;
  });

  if (!rules || rules.length === 0) {
    return { variantTrades: candidates, baselineTrades, exclusions: [] };
  }

  // Rulebook exclusion: evaluate the candidate set in-memory (the honest
  // counterfactual — day-level rules see only the trades this strategy keeps)
  // and drop every trade with at least one failing rule. Trades outside the
  // book's scope pass through unexcluded.
  const scoped = ruleScope
    ? candidates.filter((t) => inScope(t, ruleScope))
    : candidates;
  const evaluations = evaluateTrades(scoped, rules, ctxByTradeId);

  const exclusions: ReplayExclusion[] = [];
  const excludedIds = new Set<string>();
  for (const t of scoped) {
    const failed = (evaluations[t.id] ?? [])
      .filter((e) => e.status === "fail")
      .map((e) => e.ruleName);
    if (failed.length > 0) {
      excludedIds.add(t.id);
      exclusions.push({ trade: t, failedRules: failed });
    }
  }

  const variantTrades = candidates.filter((t) => !excludedIds.has(t.id));
  return { variantTrades, baselineTrades, exclusions };
}
