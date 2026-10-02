// TradeOS — server-side data-access layer. Thin functions that pages/route
// handlers call. Maps Prisma rows into the pure `TradeRecord`/`RuleLike` shapes
// the analytics & rule engines consume, so those engines stay DB-agnostic.

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { TradeRecord, AssetClass, Side, TradeSource, Severity, RuleType } from "@/lib/types";
import {
  computeMetrics,
  buildEquityCurve,
  computeDrawdownSeries,
  byHourOfDay,
  byWeekday,
  bySession,
  byStrategy,
  bySymbol,
} from "@/lib/analytics";
import { dailyPnlSeries } from "@/lib/analytics/daily";
import { evaluateTrades, type RuleLike, type EvalResult } from "@/lib/rules/engine";
import { parseRuleConfig } from "@/lib/rules/config";
import { computeDisciplineScore } from "@/lib/discipline/score";
import { etDayKey } from "@/lib/rules/engine";
import { etDateStartUtc, etDateEndUtc } from "@/lib/backtest/time";
import { isDayKey } from "@/lib/et-days";
import { JOURNAL_PAGE_MAX, type JournalFilter } from "@/lib/journal-rows";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTrade(t: any): TradeRecord {
  return {
    id: t.id,
    userId: t.userId,
    accountId: t.accountId,
    symbol: t.symbol,
    side: t.side as Side,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice ?? null,
    quantity: t.quantity,
    entryTime: t.entryTime,
    exitTime: t.exitTime ?? null,
    fees: t.fees,
    pnl: t.pnl,
    pnlGross: t.pnlGross ?? null,
    strategyTag: t.strategyTag ?? null,
    notes: t.notes ?? null,
    emotions: t.emotions ?? null,
    tags: t.tags ?? null,
    source: t.source as TradeSource,
    externalId: t.externalId ?? null,
    assetClass: (t.assetClass ?? null) as AssetClass | null,
    isWin: t.isWin ?? null,
    complianceScore: t.complianceScore ?? null,
    violationCount: t.violationCount ?? 0,
  };
}

export interface TradeFilter {
  accountId?: string;
  strategyTag?: string;
  symbol?: string;
  from?: Date;
  to?: Date;
  onlyClosed?: boolean;
}

export async function getAccounts(userId: string) {
  return prisma.tradingAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTrades(userId: string, filter: TradeFilter = {}) {
  const rows = await prisma.trade.findMany({
    where: {
      userId,
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
      ...(filter.strategyTag ? { strategyTag: filter.strategyTag } : {}),
      ...(filter.symbol ? { symbol: filter.symbol } : {}),
      ...(filter.onlyClosed ? { exitTime: { not: null } } : {}),
      ...(filter.from || filter.to
        ? { entryTime: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    },
    orderBy: { entryTime: "desc" },
    // Memory guard at scale: cap one query at the 10,000 most recent trades — analytics below the cap are unchanged.
    take: 10000,
  });
  return rows.map(mapTrade);
}

// ── Journal paging ─────────────────────────────────────────────────────────
//
// The journal reads trades one page at a time, newest first. Every filter is
// pushed into the database query (never applied in memory), and every query
// starts from `userId` — the caller's own id from the session, never a value
// the browser sent. The [userId, entryTime] index serves both the filter and
// the order.

/** Journal filters (defined client-safe in journal-rows.ts; same shape). */
export type TradePageFilter = JournalFilter;

/** Where a page stopped: the last row's entry time plus its id (the tie-break). */
export interface TradePageCursor {
  entryTime: Date;
  id: string;
}

/** Thrown for a cursor that isn't one we issued (the route answers 400). */
export class InvalidCursorError extends Error {
  constructor() {
    super("That page marker isn't valid. Reload the journal and try again.");
    this.name = "InvalidCursorError";
  }
}

const CURSOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Opaque, URL-safe cursor text for the next page. */
export function encodeTradeCursor(c: TradePageCursor): string {
  return Buffer.from(`${c.entryTime.getTime()}:${c.id}`, "utf8").toString("base64url");
}

/** Reads a cursor back; anything malformed throws InvalidCursorError. */
export function decodeTradeCursor(raw: string): TradePageCursor {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  ) {
    throw new InvalidCursorError();
  }
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const sep = text.indexOf(":");
  if (sep <= 0) throw new InvalidCursorError();
  const msText = text.slice(0, sep);
  const id = text.slice(sep + 1);
  if (!/^-?\d{1,16}$/.test(msText) || !CURSOR_ID.test(id)) throw new InvalidCursorError();
  const entryTime = new Date(Number(msText));
  if (Number.isNaN(entryTime.getTime())) throw new InvalidCursorError();
  return { entryTime, id };
}

/** The database filter for one user's journal. Always starts from `userId`. */
export function tradePageWhere(userId: string, f: TradePageFilter = {}): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = { userId };
  if (f.accountId) where.accountId = f.accountId;
  if (f.symbol) where.symbol = f.symbol;
  if (f.strategyTag) where.strategyTag = f.strategyTag;
  if (f.source) where.source = f.source;
  if (f.outcome === "win") {
    where.exitTime = { not: null };
    where.pnl = { gt: 0 };
  } else if (f.outcome === "loss") {
    where.exitTime = { not: null };
    where.pnl = { lt: 0 };
  }
  const from = f.fromDay && isDayKey(f.fromDay) ? etDateStartUtc(f.fromDay) : null;
  const to = f.toDay && isDayKey(f.toDay) ? etDateEndUtc(f.toDay) : null;
  if (from || to) {
    where.entryTime = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  return where;
}

export interface TradePage {
  rows: TradeRecord[];
  /** Cursor for the next (older) page, or null when this page reaches the first trade. */
  nextCursor: string | null;
  /** How many trades match the filters in total (not just this page). */
  total: number;
}

/** Clamp a requested page size to 1..JOURNAL_PAGE_MAX (the server-side cap). */
export function clampPageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return JOURNAL_PAGE_MAX;
  return Math.min(JOURNAL_PAGE_MAX, Math.max(1, Math.floor(limit)));
}

/**
 * One page of the signed-in user's trades, newest first (entryTime desc, then
 * id desc). Paging is by a compound cursor (entryTime + id), so trades that
 * share the exact same entry time are never skipped or repeated across pages.
 * A cursor only marks a position: the query is always scoped to `userId`, so a
 * cursor built from someone else's trade can never return their trades.
 */
export async function getTradesPage(
  userId: string,
  opts: { filter?: TradePageFilter; limit?: number; cursor?: string | null } = {}
): Promise<TradePage> {
  const limit = clampPageSize(opts.limit);
  const base = tradePageWhere(userId, opts.filter);
  const after = opts.cursor ? decodeTradeCursor(opts.cursor) : null;
  const where: Prisma.TradeWhereInput = after
    ? {
        AND: [
          base,
          {
            OR: [
              { entryTime: { lt: after.entryTime } },
              { entryTime: after.entryTime, id: { lt: after.id } },
            ],
          },
        ],
      }
    : base;

  const [found, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ entryTime: "desc" }, { id: "desc" }],
      take: limit + 1, // one extra row says whether an older page exists
    }),
    prisma.trade.count({ where: base }),
  ]);

  const hasMore = found.length > limit;
  const rows = (hasMore ? found.slice(0, limit) : found).map(mapTrade);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor:
      hasMore && last ? encodeTradeCursor({ entryTime: last.entryTime, id: last.id }) : null,
    total,
  };
}

/**
 * The values the journal's filter lists offer — only values that exist in this
 * user's trades (scoped to one account when one is picked). Grouped in the
 * database, so no trade rows are loaded.
 */
export async function getJournalFilterOptions(
  userId: string,
  accountId?: string
): Promise<{ symbols: string[]; strategies: string[]; sources: string[] }> {
  const where: Prisma.TradeWhereInput = { userId, ...(accountId ? { accountId } : {}) };
  const [symbols, strategies, sources] = await Promise.all([
    prisma.trade.groupBy({ by: ["symbol"], where, orderBy: { symbol: "asc" } }),
    prisma.trade.groupBy({
      by: ["strategyTag"],
      where: { ...where, strategyTag: { not: null } },
      orderBy: { strategyTag: "asc" },
    }),
    prisma.trade.groupBy({ by: ["source"], where, orderBy: { source: "asc" } }),
  ]);
  return {
    symbols: symbols.map((r) => r.symbol),
    strategies: strategies.map((r) => r.strategyTag).filter((s): s is string => !!s),
    sources: sources.map((r) => r.source),
  };
}

/**
 * The New York calendar day ("YYYY-MM-DD", via the rule engine's etDayKey) of
 * this user's most recent trade — optionally in one account — or null when
 * there are no trades. Reports open on this day.
 */
export async function getLatestTradeDayKey(
  userId: string,
  accountId?: string
): Promise<string | null> {
  const latest = await prisma.trade.findFirst({
    where: { userId, ...(accountId ? { accountId } : {}) },
    orderBy: [{ entryTime: "desc" }, { id: "desc" }],
    select: { entryTime: true },
  });
  return latest ? etDayKey(latest.entryTime) : null;
}

// Build the active RuleLike[] for a user (respecting rulebook scope at a coarse
// level — 'all' books always apply; scoped books are filtered by the caller when
// needed). For dashboards we evaluate against all active rules.
export async function getActiveRules(userId: string): Promise<RuleLike[]> {
  const books = await prisma.ruleBook.findMany({
    where: { userId, isActive: true },
    include: { rules: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  const rules: RuleLike[] = [];
  for (const book of books) {
    for (const r of book.rules) {
      rules.push({
        id: r.id,
        name: r.name,
        type: r.type as RuleType,
        severity: r.severity as Severity,
        weight: r.weight,
        config: safeConfig(r.type as RuleType, r.config),
      });
    }
  }
  return rules;
}

function safeConfig(type: RuleType, raw: string): unknown {
  try {
    return parseRuleConfig(type, JSON.parse(raw));
  } catch {
    return {};
  }
}

export interface DashboardData {
  metrics: ReturnType<typeof computeMetrics>;
  equity: ReturnType<typeof buildEquityCurve>;
  drawdown: ReturnType<typeof computeDrawdownSeries>;
  discipline: ReturnType<typeof computeDisciplineScore>;
  bySession: ReturnType<typeof bySession>;
  byWeekday: ReturnType<typeof byWeekday>;
  byHour: ReturnType<typeof byHourOfDay>;
  byStrategy: ReturnType<typeof byStrategy>;
  bySymbol: ReturnType<typeof bySymbol>;
  tradeCount: number;
  openCount: number;
  /** Active rules across the trader's active rulebooks (0 = no rulebook yet). */
  activeRuleCount: number;
  evaluations: Record<string, EvalResult[]>;
  /** Realized P&L per ET calendar day, oldest first (the analytics P&L calendar). */
  dailyPnl: ReturnType<typeof dailyPnlSeries>;
  /** Up to 5 failed rule checks, newest trade first, with the trade they belong to. */
  recentViolations: RecentViolation[];
}

/** One failed rule check plus enough of its trade to read like a journal entry. */
export interface RecentViolation extends EvalResult {
  tradeId: string;
  symbol: string;
  side: Side;
  entryTime: Date;
  pnl: number;
  isOpen: boolean;
}

/**
 * The newest failed rule checks across `trades` (which must already be sorted
 * newest first, as getTrades returns them), capped at `limit`. Pure.
 */
export function recentViolationsOf(
  trades: TradeRecord[],
  evaluations: Record<string, EvalResult[]>,
  limit = 5
): RecentViolation[] {
  const out: RecentViolation[] = [];
  for (const t of trades) {
    for (const e of evaluations[t.id] ?? []) {
      if (e.status !== "fail") continue;
      out.push({
        tradeId: t.id,
        symbol: t.symbol,
        side: t.side,
        entryTime: t.entryTime,
        pnl: t.pnl,
        isOpen: t.exitTime === null,
        ...e,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function getDashboardData(
  userId: string,
  accountId?: string
): Promise<DashboardData> {
  const [account, trades, rules] = await Promise.all([
    accountId ? prisma.tradingAccount.findFirst({ where: { id: accountId, userId } }) : null,
    getTrades(userId, accountId ? { accountId } : {}),
    getActiveRules(userId),
  ]);

  const closed = trades.filter((t) => t.exitTime !== null);
  const startingBalance = account?.startingBalance ?? 0;
  const evaluations = evaluateTrades(trades, rules);
  const discipline = computeDisciplineScore({ trades, evaluations });

  return {
    metrics: computeMetrics(closed),
    equity: buildEquityCurve(closed, startingBalance),
    drawdown: computeDrawdownSeries(buildEquityCurve(closed, startingBalance)),
    discipline,
    bySession: bySession(closed),
    byWeekday: byWeekday(closed),
    byHour: byHourOfDay(closed),
    byStrategy: byStrategy(closed),
    bySymbol: bySymbol(closed),
    tradeCount: trades.length,
    openCount: trades.length - closed.length,
    activeRuleCount: rules.length,
    evaluations,
    dailyPnl: dailyPnlSeries(trades),
    recentViolations: recentViolationsOf(trades, evaluations),
  };
}

/** How many of this user's trades came from "Load sample data" (user-scoped). */
export async function countSampleTrades(userId: string): Promise<number> {
  return prisma.trade.count({ where: { userId, source: "sample" } });
}

export async function getOpenAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId, status: "open", dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
