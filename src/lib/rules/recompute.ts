// TradeOS — Compliance recompute.
// The one DB-touching module in Package B. Loads a user's trades + active
// rulebooks, runs the pure engine, then persists:
//   • RuleEvaluation rows (unique [tradeId, ruleId]) — stale ones removed
//   • denormalized Trade.complianceScore / violationCount / isWin
//   • DisciplineSnapshot rows for day / week / month / all periods
//
// Rulebook `scope` (all | strategy | account, with `scopeValue`) decides which
// trades a rulebook applies to; day-context grouping happens inside the engine.

import { prisma } from "@/lib/db";
import type { Side, TradeSource, Severity, RuleType, TradeRecord } from "@/lib/types";
import { evaluateTrades, etDayKey, type RuleLike, type EvalResult, type EvalContext } from "./engine";
import { coerceConfig } from "./config";
import { computeDisciplineScore } from "@/lib/discipline/score";

export async function recomputeUserCompliance(userId: string): Promise<void> {
  // ---- load ---------------------------------------------------------------
  const [dbTrades, ruleBooks, screenshots] = await Promise.all([
    prisma.trade.findMany({ where: { userId } }),
    prisma.ruleBook.findMany({
      where: { userId, isActive: true },
      include: { rules: { where: { isActive: true } } },
    }),
    prisma.attachment.findMany({
      where: { kind: "screenshot", trade: { userId } },
      select: { tradeId: true },
    }),
  ]);

  const trades: TradeRecord[] = dbTrades.map(toTradeRecord);
  const tradeById = new Map(trades.map((t) => [t.id, t]));

  const ctxByTradeId: Record<string, EvalContext> = {};
  for (const s of screenshots) ctxByTradeId[s.tradeId] = { hasScreenshot: true };

  // Global rule metadata (for per-trade compliance weighting).
  const ruleWeight = new Map<string, number>();

  // ---- evaluate (per rulebook, respecting scope) --------------------------
  const evalsByTrade: Record<string, EvalResult[]> = {};
  for (const rb of ruleBooks) {
    if (rb.rules.length === 0) continue;
    const scoped = scopeTrades(trades, rb.scope, rb.scopeValue);
    if (scoped.length === 0) continue;

    const rules: RuleLike[] = rb.rules.map((r) => {
      ruleWeight.set(r.id, r.weight);
      return {
        id: r.id,
        name: r.name,
        type: r.type as RuleType,
        severity: r.severity as Severity,
        weight: r.weight,
        config: coerceConfig(r.config),
      };
    });

    const results = evaluateTrades(scoped, rules, ctxByTradeId);
    for (const [tradeId, evals] of Object.entries(results)) {
      (evalsByTrade[tradeId] ??= []).push(...evals);
    }
  }

  // ---- persist RuleEvaluation rows ---------------------------------------
  const produced = new Set<string>();
  const upserts: Promise<unknown>[] = [];
  for (const [tradeId, evals] of Object.entries(evalsByTrade)) {
    for (const e of evals) {
      produced.add(`${tradeId}:${e.ruleId}`);
      upserts.push(
        prisma.ruleEvaluation.upsert({
          where: { tradeId_ruleId: { tradeId, ruleId: e.ruleId } },
          create: {
            userId,
            tradeId,
            ruleId: e.ruleId,
            status: e.status,
            severity: e.severity,
            explanation: e.explanation,
          },
          update: { status: e.status, severity: e.severity, explanation: e.explanation },
        })
      );
    }
  }

  // Remove evaluations that no longer apply (rules/trades removed or rescoped).
  const existingEvals = await prisma.ruleEvaluation.findMany({
    where: { userId },
    select: { id: true, tradeId: true, ruleId: true },
  });
  const staleEvalIds = existingEvals
    .filter((e) => !produced.has(`${e.tradeId}:${e.ruleId}`))
    .map((e) => e.id);
  if (staleEvalIds.length > 0) {
    await prisma.ruleEvaluation.deleteMany({ where: { id: { in: staleEvalIds } } });
  }
  await Promise.all(upserts);

  // ---- update denormalized Trade compliance cache ------------------------
  await Promise.all(
    trades.map((t) => {
      const evals = evalsByTrade[t.id] ?? [];
      const applicable = evals.filter((e) => e.status !== "not_applicable");
      const violationCount = evals.filter((e) => e.status === "fail").length;

      let complianceScore = 100;
      if (applicable.length > 0) {
        let passW = 0;
        let totalW = 0;
        for (const e of applicable) {
          const w = ruleWeight.get(e.ruleId) ?? 1;
          totalW += w;
          if (e.status === "pass") passW += w;
        }
        complianceScore = totalW > 0 ? Math.round((100 * passW) / totalW) : 100;
      }

      const isWin = isClosed(t) ? t.pnl > 0 : null;
      return prisma.trade.update({
        where: { id: t.id },
        data: { complianceScore, violationCount, isWin },
      });
    })
  );

  // ---- discipline snapshots ----------------------------------------------
  await writeSnapshots(userId, trades, evalsByTrade, tradeById);
}

// --------------------------------------------------------------------------
// Snapshots
// --------------------------------------------------------------------------

interface Bucket {
  period: "day" | "week" | "month" | "all";
  start: Date;
  end: Date;
  tradeIds: string[];
}

async function writeSnapshots(
  userId: string,
  trades: TradeRecord[],
  evalsByTrade: Record<string, EvalResult[]>,
  tradeById: Map<string, TradeRecord>
): Promise<void> {
  const buckets = buildBuckets(trades);

  const producedKeys = new Set<string>();
  const ops: Promise<unknown>[] = [];
  for (const b of buckets) {
    const bTrades = b.tradeIds.map((id) => tradeById.get(id)!).filter(Boolean);
    const evaluations: Record<string, EvalResult[]> = {};
    for (const id of b.tradeIds) if (evalsByTrade[id]) evaluations[id] = evalsByTrade[id];

    const score = computeDisciplineScore({ trades: bTrades, evaluations });
    producedKeys.add(`${b.period}|${b.start.toISOString()}`);

    const data = {
      period: b.period,
      periodStart: b.start,
      periodEnd: b.end,
      overall: Math.round(score.overall),
      ruleAdherence: Math.round(score.ruleAdherence),
      riskDiscipline: Math.round(score.riskDiscipline),
      emotionalDiscipline: Math.round(score.emotionalDiscipline),
      consistency: Math.round(score.consistency),
      breakdown: JSON.stringify(score.breakdown),
    };
    ops.push(
      prisma.disciplineSnapshot.upsert({
        where: { userId_period_periodStart: { userId, period: b.period, periodStart: b.start } },
        create: { userId, ...data },
        update: data,
      })
    );
  }

  // Drop snapshots for periods that no longer have any trades.
  const existing = await prisma.disciplineSnapshot.findMany({
    where: { userId },
    select: { id: true, period: true, periodStart: true },
  });
  const staleIds = existing
    .filter((s) => !producedKeys.has(`${s.period}|${s.periodStart.toISOString()}`))
    .map((s) => s.id);
  if (staleIds.length > 0) {
    await prisma.disciplineSnapshot.deleteMany({ where: { id: { in: staleIds } } });
  }
  await Promise.all(ops);
}

/** Bucket trades into day/week/month/all periods, keyed by ET calendar day. */
function buildBuckets(trades: TradeRecord[]): Bucket[] {
  if (trades.length === 0) return [];

  const days = new Map<string, string[]>(); // dayKey -> tradeIds
  const weeks = new Map<string, string[]>();
  const months = new Map<string, string[]>();
  const all: string[] = [];

  for (const t of trades) {
    const dk = etDayKey(t.entryTime);
    push(days, dk, t.id);
    push(weeks, isoWeekStartKey(dk), t.id);
    push(months, dk.slice(0, 7), t.id);
    all.push(t.id);
  }

  const buckets: Bucket[] = [];
  for (const [dk, ids] of days) {
    const start = dayStart(dk);
    buckets.push({ period: "day", start, end: addDays(start, 1), tradeIds: ids });
  }
  for (const [wk, ids] of weeks) {
    const start = dayStart(wk);
    buckets.push({ period: "week", start, end: addDays(start, 7), tradeIds: ids });
  }
  for (const [mk, ids] of months) {
    const start = dayStart(`${mk}-01`);
    buckets.push({ period: "month", start, end: monthEnd(mk), tradeIds: ids });
  }
  const allDays = [...days.keys()].sort();
  const allStart = dayStart(allDays[0]);
  const allEnd = addDays(dayStart(allDays[allDays.length - 1]), 1);
  buckets.push({ period: "all", start: allStart, end: allEnd, tradeIds: all });

  return buckets;
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function push(map: Map<string, string[]>, key: string, id: string): void {
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

/** A stable Date instant for an ET day key "YYYY-MM-DD" (UTC-midnight anchor). */
function dayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function monthEnd(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map((x) => parseInt(x, 10));
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return new Date(`${nextY}-${pad2(nextM)}-01T00:00:00.000Z`);
}

/** Monday-anchored ISO-week start day key for an ET day key. */
function isoWeekStartKey(dayKey: string): string {
  const d = dayStart(dayKey);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = (dow + 6) % 7; // days since Monday
  const monday = addDays(d, -offset);
  return monday.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isClosed(t: TradeRecord): boolean {
  return t.exitTime !== null && t.exitPrice !== null;
}

/** Map a Prisma Trade row into the pure-function `TradeRecord` shape. */
function toTradeRecord(t: {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: Date;
  exitTime: Date | null;
  fees: number;
  pnl: number;
  pnlGross: number | null;
  strategyTag: string | null;
  notes: string | null;
  emotions: string | null;
  tags: string | null;
  source: string;
  externalId: string | null;
  isWin: boolean | null;
  complianceScore: number | null;
  violationCount: number;
}): TradeRecord {
  return {
    id: t.id,
    userId: t.userId,
    accountId: t.accountId,
    symbol: t.symbol,
    side: t.side as Side,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    fees: t.fees,
    pnl: t.pnl,
    pnlGross: t.pnlGross,
    strategyTag: t.strategyTag,
    notes: t.notes,
    emotions: t.emotions,
    tags: t.tags,
    source: t.source as TradeSource,
    externalId: t.externalId,
    isWin: t.isWin,
    complianceScore: t.complianceScore,
    violationCount: t.violationCount,
  };
}

/** Filter trades by rulebook scope. */
function scopeTrades(trades: TradeRecord[], scope: string, scopeValue: string | null): TradeRecord[] {
  switch (scope) {
    case "strategy":
      return scopeValue ? trades.filter((t) => t.strategyTag === scopeValue) : [];
    case "account":
      return scopeValue ? trades.filter((t) => t.accountId === scopeValue) : [];
    case "all":
    default:
      return trades;
  }
}
