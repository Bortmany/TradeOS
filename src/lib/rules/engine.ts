// TradeOS — Rule evaluation engine.
// Pure, deterministic, DB-free. Given a trade, its same-account same-ET-day
// sibling trades, and a set of rules, produce one `EvalResult` per rule.
//
// All calendar-day and time-of-day reasoning is anchored to the America/New_York
// exchange calendar (US futures), derived via `Intl` so there is no dependency
// on the host timezone.

import { formatCurrency, parseTags } from "@/lib/utils";
import type { RuleType, Severity, EvalStatus, TradeRecord } from "@/lib/types";
import {
  timeWindowConfig,
  riskLimitConfig,
  maxTradesConfig,
  maxContractsConfig,
  maxDailyLossConfig,
  behavioralConfig,
  indicatorConfig,
  setupValidationConfig,
} from "./config";

// --------------------------------------------------------------------------
// Public shapes (per CONTRACTS.md — Package B)
// --------------------------------------------------------------------------

export interface RuleLike {
  id: string;
  name: string;
  type: RuleType;
  severity: Severity;
  weight: number;
  config: unknown; // parsed object (or raw JSON string — both accepted)
}

export interface EvalResult {
  ruleId: string;
  ruleName: string;
  status: EvalStatus;
  severity: Severity;
  explanation: string;
}

export interface EvalContext {
  hasScreenshot?: boolean;
}

// --------------------------------------------------------------------------
// ET calendar / clock helpers
// --------------------------------------------------------------------------

const ET_TZ = "America/New_York";

const ET_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ET_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ET calendar day as "YYYY-MM-DD". */
export function etDayKey(d: Date): string {
  return ET_DAY_FMT.format(d);
}

/** Minutes-past-midnight and "HH:MM" label for a Date, in ET. */
export function etClock(d: Date): { minutes: number; label: string } {
  const parts = ET_TIME_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // guard against h23 edge output
  const minute = parseInt(get("minute"), 10);
  return { minutes: hour * 60 + minute, label: `${pad2(hour)}:${pad2(minute)}` };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function isClosed(t: TradeRecord): boolean {
  return t.exitTime !== null && t.exitPrice !== null;
}

/** Magnitude of money, e.g. "$320.00". */
function money(n: number): string {
  return formatCurrency(Math.abs(n));
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

// --------------------------------------------------------------------------
// evaluateTrade — evaluate one trade against all rules
// --------------------------------------------------------------------------

/**
 * @param trade      the trade under evaluation
 * @param dayTrades  same-account trades on the same ET calendar day, sorted by
 *                   entryTime ascending (the caller guarantees this)
 * @param rules      rules to apply
 * @param ctx        optional per-trade context (e.g. screenshot presence)
 */
export function evaluateTrade(
  trade: TradeRecord,
  dayTrades: TradeRecord[],
  rules: RuleLike[],
  ctx?: EvalContext
): EvalResult[] {
  return rules.map((rule) => {
    try {
      return { ruleId: rule.id, ruleName: rule.name, severity: rule.severity, ...evalOne(rule, trade, dayTrades, ctx) };
    } catch {
      // A malformed rule config should never break a recompute.
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        status: "not_applicable" as EvalStatus,
        explanation: "Rule configuration is invalid — not evaluated.",
      };
    }
  });
}

type Verdict = { status: EvalStatus; explanation: string };

function evalOne(
  rule: RuleLike,
  trade: TradeRecord,
  dayTrades: TradeRecord[],
  ctx?: EvalContext
): Verdict {
  switch (rule.type) {
    case "time_window":
      return evalTimeWindow(rule, trade);
    case "risk_limit":
      return evalRiskLimit(rule, trade);
    case "max_trades":
      return evalMaxTrades(rule, trade, dayTrades);
    case "max_contracts":
      return evalMaxContracts(rule, trade);
    case "max_daily_loss":
      return evalMaxDailyLoss(rule, trade, dayTrades);
    case "behavioral":
      return evalBehavioral(rule, trade, dayTrades);
    case "indicator":
      return evalIndicator(rule, trade);
    case "setup_validation":
      return evalSetupValidation(rule, trade, ctx);
    default:
      return { status: "not_applicable", explanation: "Unknown rule type — not evaluated." };
  }
}

// --- individual rule evaluators -------------------------------------------

function evalTimeWindow(rule: RuleLike, trade: TradeRecord): Verdict {
  const cfg = timeWindowConfig(rule.config);
  const { minutes, label } = etClock(trade.entryTime);
  const start = hmToMinutes(cfg.start);
  const end = hmToMinutes(cfg.end);
  if (minutes < start) {
    return { status: "fail", explanation: `Entered ${label} ET — before the ${cfg.start} window opens.` };
  }
  if (minutes > end) {
    return { status: "fail", explanation: `Entered ${label} ET — after the ${cfg.end} window closes.` };
  }
  return { status: "pass", explanation: `Entered ${label} ET — within the ${cfg.start}–${cfg.end} window.` };
}

function evalRiskLimit(rule: RuleLike, trade: TradeRecord): Verdict {
  if (!isClosed(trade)) {
    return { status: "not_applicable", explanation: "Trade is still open — no realized P&L to assess." };
  }
  const cfg = riskLimitConfig(rule.config);
  if (cfg.maxLossPerTrade == null) {
    if (cfg.maxRiskPct != null) {
      return {
        status: "not_applicable",
        explanation: "Percent-of-balance risk limit requires account balance — not evaluated.",
      };
    }
    return { status: "not_applicable", explanation: "No per-trade risk limit configured." };
  }
  const limit = cfg.maxLossPerTrade;
  const loss = -trade.pnl; // positive when the trade lost money
  if (loss <= 0) {
    return { status: "pass", explanation: `No loss taken — within the ${money(limit)} per-trade risk limit.` };
  }
  if (loss > limit) {
    return {
      status: "fail",
      explanation: `Lost ${money(loss)} on this trade — over the ${money(limit)} per-trade risk limit.`,
    };
  }
  return { status: "pass", explanation: `Risk of ${money(loss)} within the ${money(limit)} per-trade limit.` };
}

function evalMaxTrades(rule: RuleLike, trade: TradeRecord, dayTrades: TradeRecord[]): Verdict {
  const cfg = maxTradesConfig(rule.config);
  const ordinal = indexOf(trade, dayTrades) + 1;
  if (ordinal > cfg.maxPerDay) {
    return { status: "fail", explanation: `Trade #${ordinal} of the day — over the ${cfg.maxPerDay}-per-day limit.` };
  }
  return { status: "pass", explanation: `Trade #${ordinal} of ${cfg.maxPerDay} allowed today.` };
}

function evalMaxContracts(rule: RuleLike, trade: TradeRecord): Verdict {
  const cfg = maxContractsConfig(rule.config);
  if (trade.quantity > cfg.maxContracts) {
    return {
      status: "fail",
      explanation: `Traded ${fmtQty(trade.quantity)} contracts — over the ${fmtQty(cfg.maxContracts)} limit.`,
    };
  }
  return {
    status: "pass",
    explanation: `${fmtQty(trade.quantity)} contracts within the ${fmtQty(cfg.maxContracts)} limit.`,
  };
}

function evalMaxDailyLoss(rule: RuleLike, trade: TradeRecord, dayTrades: TradeRecord[]): Verdict {
  const cfg = maxDailyLossConfig(rule.config);
  const closed = dayTrades.filter(isClosed);
  if (closed.length === 0) {
    return { status: "not_applicable", explanation: "No closed trades on this day — daily loss cannot be assessed." };
  }
  // Worst point of the running cumulative P&L over the day.
  let running = 0;
  let trough = 0;
  for (const t of closed) {
    running += t.pnl;
    if (running < trough) trough = running;
  }
  if (trough <= -cfg.maxDailyLoss) {
    return {
      status: "fail",
      explanation: `Daily P&L reached -${money(trough)} — breached the ${money(cfg.maxDailyLoss)} daily loss limit.`,
    };
  }
  return {
    status: "pass",
    explanation: `Day stayed within the ${money(cfg.maxDailyLoss)} daily loss limit (worst -${money(trough)}).`,
  };
}

function evalBehavioral(rule: RuleLike, trade: TradeRecord, dayTrades: TradeRecord[]): Verdict {
  const cfg = behavioralConfig(rule.config);
  if (cfg.kind === "revenge_trading") return evalRevenge(cfg.withinMinutes, trade, dayTrades);
  return evalOvertrading(cfg.threshold, cfg.windowMinutes, trade, dayTrades);
}

function evalRevenge(withinMinutes: number, trade: TradeRecord, dayTrades: TradeRecord[]): Verdict {
  const idx = indexOf(trade, dayTrades);
  if (idx <= 0) {
    return { status: "pass", explanation: "First trade of the day — no prior loss to react to." };
  }
  const prior = dayTrades[idx - 1];
  if (!isClosed(prior)) {
    return { status: "pass", explanation: "Preceding trade is still open — no confirmed loss to react to." };
  }
  if (prior.pnl >= 0) {
    return { status: "pass", explanation: "Preceding trade was not a loss — no revenge risk." };
  }
  const priorRef = prior.exitTime ?? prior.entryTime;
  const gapMin = Math.max(0, (trade.entryTime.getTime() - priorRef.getTime()) / 60000);
  if (gapMin <= withinMinutes) {
    return {
      status: "fail",
      explanation: `Entered ${Math.round(gapMin)} min after a losing trade — inside the ${withinMinutes}-min revenge window.`,
    };
  }
  return {
    status: "pass",
    explanation: `Waited ${Math.round(gapMin)} min after the prior loss — outside the ${withinMinutes}-min revenge window.`,
  };
}

function evalOvertrading(
  threshold: number,
  windowMinutes: number,
  trade: TradeRecord,
  dayTrades: TradeRecord[]
): Verdict {
  const end = trade.entryTime.getTime();
  const start = end - windowMinutes * 60000;
  // Count trades whose entry falls in the trailing window ending at this trade.
  const count = dayTrades.filter((t) => {
    const ts = t.entryTime.getTime();
    return ts >= start && ts <= end;
  }).length;
  if (count > threshold) {
    return {
      status: "fail",
      explanation: `${count} trades within ${windowMinutes} min — over the limit of ${threshold}.`,
    };
  }
  return {
    status: "pass",
    explanation: `${count} trade(s) in the last ${windowMinutes} min — within the limit of ${threshold}.`,
  };
}

function evalIndicator(rule: RuleLike, trade: TradeRecord): Verdict {
  const cfg = indicatorConfig(rule.config);
  const tags = parseTags(trade.tags);
  if (tags.includes(cfg.requireTag)) {
    return { status: "pass", explanation: `Required tag '${cfg.requireTag}' present.` };
  }
  return { status: "fail", explanation: `Missing required tag '${cfg.requireTag}'.` };
}

function evalSetupValidation(rule: RuleLike, trade: TradeRecord, ctx?: EvalContext): Verdict {
  const cfg = setupValidationConfig(rule.config);
  const missing: string[] = [];
  if (cfg.requireStrategyTag && !nonEmpty(trade.strategyTag)) missing.push("strategy tag");
  if (cfg.requireNotes && !nonEmpty(trade.notes)) missing.push("notes");
  if (cfg.requireScreenshot && !ctx?.hasScreenshot) missing.push("screenshot");
  if (missing.length > 0) {
    return { status: "fail", explanation: `Setup incomplete — missing ${missing.join(", ")}.` };
  }
  return { status: "pass", explanation: "Setup documented as required." };
}

// --- shared helpers --------------------------------------------------------

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function indexOf(trade: TradeRecord, dayTrades: TradeRecord[]): number {
  return dayTrades.findIndex((t) => t.id === trade.id);
}

// --------------------------------------------------------------------------
// evaluateTrades — batch evaluation, grouped by account + ET calendar day
// --------------------------------------------------------------------------

/**
 * Evaluate many trades at once. Trades are grouped internally by
 * `accountId` + ET calendar day so day-context rules (max_trades, daily loss,
 * revenge, overtrading) see the correct sibling set.
 *
 * @param ctxByTradeId optional per-trade context (screenshot presence, …). This
 *   optional parameter is a backward-compatible superset of the contract
 *   signature so `recomputeUserCompliance` can supply screenshot info.
 */
export function evaluateTrades(
  trades: TradeRecord[],
  rules: RuleLike[],
  ctxByTradeId?: Record<string, EvalContext>
): Record<string, EvalResult[]> {
  const groups = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const key = `${t.accountId}|${etDayKey(t.entryTime)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  const out: Record<string, EvalResult[]> = {};
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => {
      const d = a.entryTime.getTime() - b.entryTime.getTime();
      return d !== 0 ? d : a.id.localeCompare(b.id); // stable tie-break
    });
    for (const trade of bucket) {
      out[trade.id] = evaluateTrade(trade, bucket, rules, ctxByTradeId?.[trade.id]);
    }
  }
  return out;
}
