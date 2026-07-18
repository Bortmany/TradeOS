// TradeOS — server-side data-access layer. Thin functions that pages/route
// handlers call. Maps Prisma rows into the pure `TradeRecord`/`RuleLike` shapes
// the analytics & rule engines consume, so those engines stay DB-agnostic.

import "server-only";
import { prisma } from "@/lib/db";
import type { TradeRecord, Side, TradeSource, Severity, RuleType } from "@/lib/types";
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
import { evaluateTrades, type RuleLike, type EvalResult } from "@/lib/rules/engine";
import { parseRuleConfig } from "@/lib/rules/config";
import { computeDisciplineScore } from "@/lib/discipline/score";

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
  evaluations: Record<string, EvalResult[]>;
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
    evaluations,
  };
}

export async function getOpenAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId, status: "open" },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
}
