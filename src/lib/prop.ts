// TradeOS — Prop firm evaluation tracker (Elite-tier).
// Deterministic, DB-agnostic compute layer for prop-firm compliance: how much
// profit-target progress a funded/evaluation account has, and — the number that
// actually matters to a funded trader — how much *buffer* remains before a
// trailing-drawdown or daily-loss breach blows the account.

import "server-only";
import { prisma } from "@/lib/db";
import type { PropFirm, DrawdownType } from "@/lib/types";

// --------------------------------------------------------------------------
// Presets — ready-made firm rule sets. Field shapes mirror the PropAccount model.
// --------------------------------------------------------------------------

export interface PropPreset {
  firm: PropFirm;
  presetName: string;
  accountSize: number;
  profitTarget?: number;
  maxDailyLoss?: number;
  maxDrawdown?: number;
  drawdownType: DrawdownType;
  minTradingDays?: number;
  consistencyPct?: number;
  phase: string;
}

export type PropPresetKey = "topstep50k" | "apex100k" | "tpt50k";

export const PROP_PRESETS: Record<PropPresetKey, PropPreset> = {
  topstep50k: {
    firm: "topstep",
    presetName: "Topstep 50K",
    accountSize: 50_000,
    profitTarget: 3_000,
    maxDailyLoss: 1_000,
    maxDrawdown: 2_000,
    drawdownType: "trailing",
    minTradingDays: 5,
    consistencyPct: 0.5,
    phase: "evaluation",
  },
  apex100k: {
    firm: "apex",
    presetName: "Apex 100K",
    accountSize: 100_000,
    profitTarget: 6_000,
    maxDailyLoss: undefined,
    maxDrawdown: 3_000,
    drawdownType: "trailing",
    minTradingDays: undefined,
    consistencyPct: 0.3,
    phase: "evaluation",
  },
  tpt50k: {
    firm: "tpt",
    presetName: "TPT 50K",
    accountSize: 50_000,
    profitTarget: 3_000,
    maxDailyLoss: 1_250,
    maxDrawdown: 2_000,
    drawdownType: "eod_trailing",
    minTradingDays: undefined,
    consistencyPct: undefined,
    phase: "evaluation",
  },
};

// --------------------------------------------------------------------------
// Status shapes
// --------------------------------------------------------------------------

export type PropStatusLevel = "passed" | "breached" | "at_risk" | "on_track";

export interface PropGuardrailMeter {
  /** Amount consumed against the limit (e.g. drawdown used, today's loss). */
  used: number;
  /** The limit / total for this guardrail. */
  limit: number;
  /** limit − used. The headline number for funded traders. */
  buffer: number;
  /** buffer / limit, clamped 0..1. */
  bufferPct: number;
  /** True when buffer has run out (or been exceeded). */
  breached: boolean;
  /** True when buffer < 25% of the limit. */
  atRisk: boolean;
}

export interface PropStatus {
  id: string;
  accountId: string;
  accountName: string;
  firm: PropFirm;
  presetName: string;
  phase: string;
  size: number;
  startingBalance: number;

  tradeCount: number;
  netProfit: number;
  currentEquity: number;
  peakEquity: number;

  // Profit target
  profitTarget: number | null;
  profitTargetPct: number; // 0..1+ (netProfit / target)

  // Trailing drawdown
  maxDrawdown: number | null;
  drawdownType: DrawdownType;
  currentDrawdown: number;
  drawdownBuffer: number;
  drawdown: PropGuardrailMeter | null;

  // Daily loss
  maxDailyLoss: number | null;
  todayLoss: number; // magnitude of today's loss (>=0), 0 if flat/green
  todayPnl: number; // signed today P&L
  worstDayLoss: number; // magnitude of worst single day (>=0)
  dailyLossBuffer: number;
  dailyLoss: PropGuardrailMeter | null;
  dailyLossEverExceeded: boolean;

  // Consistency
  consistencyPct: number | null; // allowed cap
  largestDayProfit: number;
  consistencyRatio: number; // largestDayProfit / totalProfit
  consistencyOk: boolean;
  consistency: {
    largestDayProfit: number;
    totalProfit: number;
    ratio: number;
    cap: number;
    ok: boolean;
  } | null;

  // Trading days
  minTradingDays: number | null;
  tradingDays: number;
  tradingDaysOk: boolean;

  status: PropStatusLevel;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// Calendar day key in US Eastern time (prop firms reset on the ET session day).
const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function etDayKey(d: Date): string {
  return ET_DAY.format(d);
}

function meter(used: number, limit: number): PropGuardrailMeter {
  const buffer = limit - used;
  const bufferPct = limit > 0 ? Math.max(0, Math.min(1, buffer / limit)) : 0;
  return {
    used,
    limit,
    buffer,
    bufferPct,
    breached: buffer <= 0,
    atRisk: buffer > 0 && bufferPct < 0.25,
  };
}

// --------------------------------------------------------------------------
// getPropStatus — the whole feature, computed deterministically per account.
// --------------------------------------------------------------------------

export async function getPropStatus(userId: string): Promise<PropStatus[]> {
  const props = await prisma.propAccount.findMany({
    where: { userId },
    include: { account: true },
    orderBy: { createdAt: "asc" },
  });
  if (props.length === 0) return [];

  const todayKey = etDayKey(new Date());

  const results: PropStatus[] = [];

  for (const p of props) {
    const trades = await prisma.trade.findMany({
      where: { userId, accountId: p.accountId, exitTime: { not: null } },
      orderBy: { exitTime: "asc" },
    });

    const startingBalance = p.account.startingBalance ?? 0;

    // Running equity, peak & drawdown over the closed-trade series.
    let equity = startingBalance;
    let peak = startingBalance;
    let netProfit = 0;
    const dayPnl = new Map<string, number>();

    for (const t of trades) {
      netProfit += t.pnl;
      equity += t.pnl;
      if (equity > peak) peak = equity;
      const key = etDayKey(t.exitTime as Date);
      dayPnl.set(key, (dayPnl.get(key) ?? 0) + t.pnl);
    }

    const currentEquity = equity;
    const currentDrawdown = Math.max(0, peak - currentEquity);

    // Day-bucketed metrics.
    let worstDay = 0; // most negative day total (signed)
    let largestDayProfit = 0;
    let dailyLossEverExceeded = false;
    const maxDailyLoss = p.maxDailyLoss ?? null;
    for (const total of dayPnl.values()) {
      if (total < worstDay) worstDay = total;
      if (total > largestDayProfit) largestDayProfit = total;
      if (maxDailyLoss != null && -total > maxDailyLoss) dailyLossEverExceeded = true;
    }
    const worstDayLoss = Math.max(0, -worstDay);
    const todayPnl = dayPnl.get(todayKey) ?? 0;
    const todayLoss = Math.max(0, -todayPnl);

    // Profit target.
    const profitTarget = p.profitTarget ?? null;
    const profitTargetPct = profitTarget && profitTarget > 0 ? netProfit / profitTarget : 0;

    // Guardrail meters.
    const maxDrawdown = p.maxDrawdown ?? null;
    const drawdown = maxDrawdown != null ? meter(currentDrawdown, maxDrawdown) : null;
    const drawdownBuffer = maxDrawdown != null ? maxDrawdown - currentDrawdown : Infinity;

    const dailyLoss = maxDailyLoss != null ? meter(todayLoss, maxDailyLoss) : null;
    const dailyLossBuffer = maxDailyLoss != null ? maxDailyLoss - todayLoss : Infinity;

    // Consistency: largest single green day as a share of total (net) profit.
    const consistencyPct = p.consistencyPct ?? null;
    const totalProfit = Math.max(0, netProfit);
    const consistencyRatio = totalProfit > 0 ? largestDayProfit / totalProfit : 0;
    const consistencyOk = consistencyPct == null || consistencyRatio <= consistencyPct;
    const consistency =
      consistencyPct != null
        ? {
            largestDayProfit,
            totalProfit,
            ratio: consistencyRatio,
            cap: consistencyPct,
            ok: consistencyOk,
          }
        : null;

    // Trading days.
    const minTradingDays = p.minTradingDays ?? null;
    const tradingDays = dayPnl.size;
    const tradingDaysOk = minTradingDays == null || tradingDays >= minTradingDays;

    // Overall status.
    const breached =
      (maxDrawdown != null && drawdownBuffer <= 0) ||
      dailyLossEverExceeded ||
      (dailyLoss?.breached ?? false);

    const anyAtRisk = (drawdown?.atRisk ?? false) || (dailyLoss?.atRisk ?? false);

    let status: PropStatusLevel;
    if (breached) status = "breached";
    else if (profitTarget != null && profitTargetPct >= 1) status = "passed";
    else if (anyAtRisk) status = "at_risk";
    else status = "on_track";

    results.push({
      id: p.id,
      accountId: p.accountId,
      accountName: p.account.name,
      firm: p.firm as PropFirm,
      presetName: p.presetName,
      phase: p.phase,
      size: p.accountSize,
      startingBalance,
      tradeCount: trades.length,
      netProfit,
      currentEquity,
      peakEquity: peak,
      profitTarget,
      profitTargetPct,
      maxDrawdown,
      drawdownType: p.drawdownType as DrawdownType,
      currentDrawdown,
      drawdownBuffer,
      drawdown,
      maxDailyLoss,
      todayLoss,
      todayPnl,
      worstDayLoss,
      dailyLossBuffer,
      dailyLoss,
      dailyLossEverExceeded,
      consistencyPct,
      largestDayProfit,
      consistencyRatio,
      consistencyOk,
      consistency,
      minTradingDays,
      tradingDays,
      tradingDaysOk,
      status,
    });
  }

  return results;
}
