// TradeOS — Prop firm evaluation tracker (Pro and above).
// Deterministic, DB-agnostic compute layer for prop-firm compliance: how much
// profit-target progress a funded/evaluation account has, and — the number that
// actually matters to a funded trader — how much *buffer* remains before a
// trailing-drawdown or daily-loss breach blows the account.

import "server-only";
import { prisma } from "@/lib/db";
import type { PropFirm, DrawdownType } from "@/lib/types";
import { computeLimitFigures } from "@/lib/risk/limits";
import {
  loadLiveState,
  openStateFor,
  type LiveHealth,
  type PositionView,
} from "@/lib/live/state";

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

/** The near-live side of one tracker: what the open-position read added, and how fresh it is. */
export interface PropLive {
  /** The account has a broker connection at all. */
  linked: boolean;
  nearLive: boolean;
  health: LiveHealth | "none";
  lastLiveAt: Date | null;
  lastError: string | null;
  /** True when the figures below include open P&L (a fresh read). */
  includesOpen: boolean;
  openPnl: number;
  openCount: number;
  unpricedCount: number;
  estimated: boolean;
  /** The last known positions (shown even when stale). */
  positions: PositionView[];
}

export interface PropStatus {
  id: string;
  accountId: string;
  accountName: string;
  /** The account's own status (TradingAccount.kind) — the truth for "status". */
  accountKind: string;
  /** Stored broker key; shown through brokerLabel(). */
  accountBroker: string;
  firm: PropFirm;
  presetName: string;
  /** The tracker's own phase — shown only as "Eval progress", never as a status. */
  phase: string;
  size: number;
  startingBalance: number;

  tradeCount: number;
  /** Closed profit only; the profit target never counts open P&L. */
  netProfit: number;
  /** Includes open P&L when the live read is fresh. */
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
  todayLoss: number; // magnitude of today's loss (>=0), 0 if flat/green; includes open P&L when fresh
  todayPnl: number; // signed today P&L (closed + open when fresh)
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

  live: PropLive;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

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

  const now = new Date();
  const live = await loadLiveState(userId, now);

  const results: PropStatus[] = [];

  for (const p of props) {
    const trades = await prisma.trade.findMany({
      where: { userId, accountId: p.accountId, exitTime: { not: null } },
      orderBy: { exitTime: "asc" },
    });

    const startingBalance = p.account.startingBalance ?? 0;

    // The ONE shared calculation (also used by the alert generator), so this
    // page and the dashboard alert always show the same daily buffer.
    const conn = live.connections.find((c) => c.accountId === p.accountId);
    const open = openStateFor(conn, live.positions);
    const f = computeLimitFigures({
      startingBalance,
      trades: trades.map((t) => ({ pnl: t.pnl, exitTime: t.exitTime as Date })),
      now,
      open,
      livePeakEquity: conn?.livePeakEquity ?? null,
    });
    const netProfit = f.netProfit;
    const currentEquity = f.equity;
    const peak = f.peak;
    const currentDrawdown = f.currentDrawdown;
    const dayPnl = f.dayPnl;

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
    const todayPnl = f.todayPnl;
    const todayLoss = f.todayLoss;

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
      accountKind: p.account.kind,
      accountBroker: p.account.broker,
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
      live: {
        linked: !!conn,
        nearLive: conn?.nearLive ?? false,
        health: conn ? conn.health : "none",
        lastLiveAt: conn?.lastLiveAt ?? null,
        lastError: conn?.lastError ?? null,
        includesOpen: open != null,
        openPnl: open?.openPnl ?? 0,
        openCount: open?.openCount ?? 0,
        unpricedCount: open?.unpricedCount ?? 0,
        estimated: open?.estimated ?? false,
        positions: conn ? live.positions.filter((x) => x.connectionId === conn.connectionId) : [],
      },
    });
  }

  return results;
}
