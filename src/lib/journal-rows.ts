// TradeOS — the slim trade shape one journal row needs, shared by the server
// page (first page) and the "Load older trades" route (every later page).
//
// Pure and client-safe. Only what the list prints travels to the browser —
// notes, emotions, tags and broker ids stay on the server.

import { TRADE_SOURCES, type Side, type TradeRecord } from "@/lib/types";
import { isDayKey } from "@/lib/et-days";

/** Journal page sizes: 50 on a laptop, 25 on a phone, never more than 100. */
export const JOURNAL_PAGE_SIZE = 50;
export const JOURNAL_PHONE_PAGE_SIZE = 25;
export const JOURNAL_PAGE_MAX = 100;

export interface JournalRow {
  id: string;
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  /** ISO instant. */
  entryTime: string;
  /** ISO instant, null while open. */
  exitTime: string | null;
  pnl: number;
  complianceScore: number | null;
  violationCount: number;
  strategyTag: string | null;
}

export function toJournalRow(t: TradeRecord): JournalRow {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime ? t.exitTime.toISOString() : null,
    pnl: t.pnl,
    complianceScore: t.complianceScore ?? null,
    violationCount: t.violationCount ?? 0,
    strategyTag: t.strategyTag,
  };
}

/** The journal filters as they appear in the address bar / route query. */
export const JOURNAL_FILTER_KEYS = [
  "account",
  "symbol",
  "strategy",
  "source",
  "outcome",
  "from",
  "to",
] as const;
export type JournalFilterKey = (typeof JOURNAL_FILTER_KEYS)[number];

/** Journal filters in data-layer terms (see getTradesPage in src/lib/data.ts). */
export interface JournalFilter {
  accountId?: string;
  symbol?: string;
  strategyTag?: string;
  source?: string;
  /** win = closed with pnl > 0; loss = closed with pnl < 0. */
  outcome?: "win" | "loss";
  /** New York calendar days ("YYYY-MM-DD"), inclusive, same boundary as etDayKey. */
  fromDay?: string;
  toDay?: string;
}

function text(v: string | undefined, max: number): string | undefined {
  const t = v?.trim();
  return t && t.length <= max ? t : undefined;
}

/**
 * Read the journal filters from the address bar, dropping anything malformed
 * (the page then simply shows that filter as unpicked). Mirrors the strict
 * checks of GET /api/trades/page, so the first page and every later page
 * always ask for the same thing.
 */
export function parseJournalFilters(sp: Partial<Record<JournalFilterKey, string>>): JournalFilter {
  const source = text(sp.source, 40);
  let fromDay = isDayKey(sp.from) ? sp.from : undefined;
  let toDay = isDayKey(sp.to) ? sp.to : undefined;
  if (fromDay && toDay && fromDay > toDay) {
    fromDay = undefined;
    toDay = undefined;
  }
  return {
    accountId: text(sp.account, 64),
    symbol: text(sp.symbol, 40),
    strategyTag: text(sp.strategy, 120),
    source: source && (TRADE_SOURCES as readonly string[]).includes(source) ? source : undefined,
    outcome: sp.outcome === "win" || sp.outcome === "loss" ? sp.outcome : undefined,
    fromDay,
    toDay,
  };
}

/** The same filters back as a query string (address-bar keys), for the route. */
export function journalFilterQuery(f: JournalFilter): string {
  const qs = new URLSearchParams();
  if (f.accountId) qs.set("account", f.accountId);
  if (f.symbol) qs.set("symbol", f.symbol);
  if (f.strategyTag) qs.set("strategy", f.strategyTag);
  if (f.source) qs.set("source", f.source);
  if (f.outcome) qs.set("outcome", f.outcome);
  if (f.fromDay) qs.set("from", f.fromDay);
  if (f.toDay) qs.set("to", f.toDay);
  return qs.toString();
}
