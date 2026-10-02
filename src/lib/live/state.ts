// TradeOS — the live (near-live) state of a trader's broker connections, read
// from the database: when each connection was last read, whether that read is
// fresh, and the latest open-positions snapshot.
//
// Used by the alert generator, the Prop page, GET /api/alerts and the
// dashboard, so every screen agrees about what is "live".
//
// Node-safe (no server-only import): the alert generator is also called from
// scripts. Every query is scoped to the user id.

import { prisma } from "@/lib/db";
import { LIVE_FRESH_MS, type OpenState } from "@/lib/risk/limits";

/**
 * live     = a good read in the last 3 minutes
 * stale    = linked and on, but the last good read is older than 3 minutes
 * waiting  = linked and on, no good read yet
 * rejected = the broker refused the key; reads stopped until the trader reconnects
 * off      = near-live switched off (the 30-minute fill sync only)
 */
export type LiveHealth = "live" | "stale" | "waiting" | "rejected" | "off";

export interface ConnectionLive {
  connectionId: string;
  accountId: string;
  accountName: string;
  nearLive: boolean;
  health: LiveHealth;
  lastLiveAt: Date | null;
  lastError: string | null;
  lastBalance: number | null;
  lastSyncAt: Date | null;
  livePeakEquity: number | null;
  /** Loss (<= 0) of a position that just closed whose fills have not landed yet; 0 when none. */
  pendingCloseLoss: number;
}

/**
 * How long a "position just closed" loss stays counted while we wait for the
 * closed trade to arrive: one full 30-minute fill sweep plus a margin. After
 * that the sweep has surely had its say and the protection lapses.
 */
export const PENDING_GONE_MAX_MS = 35 * 60_000;

export function pendingLossOf(
  c: { pendingCloseLoss: number | null; pendingCloseAt: Date | null },
  now: Date
): number {
  if (c.pendingCloseLoss == null || !c.pendingCloseAt) return 0;
  if (now.getTime() - c.pendingCloseAt.getTime() >= PENDING_GONE_MAX_MS) return 0;
  return Math.min(0, c.pendingCloseLoss);
}




/**
 * Legacy check for rows saved before per-position tracking (no `pendingCloseItems`): has
 * ANY closed trade arrived for this account since the read that still saw the position
 * open? New rows are matched position by position (`unlandedPending`) instead.
 */
export async function pendingLanded(
  userId: string,
  accountId: string,
  pendingCloseAt: Date
): Promise<boolean> {
  const n = await prisma.trade.count({
    where: {
      userId,
      accountId,
      exitTime: { gte: pendingCloseAt },
    },
  });
  return n > 0;
}

/** A position (or part of one) that left between two reads and whose closed trade has not landed. */
export interface PendingItem {
  /** The broker's position or contract id. */
  key: string;
  /** For an MT5 position: the externalId its trade carries ("mt5:<positionId>"). */
  ext?: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  /** <= 0 */
  loss: number;
  /** ISO time of the last read that still saw it open. */
  at: string;
}

export function parsePendingItems(json: string | null | undefined): PendingItem[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: PendingItem[] = [];
    for (const r of raw as Record<string, unknown>[]) {
      if (
        r &&
        typeof r.key === "string" &&
        typeof r.symbol === "string" &&
        (r.side === "long" || r.side === "short") &&
        typeof r.size === "number" &&
        typeof r.loss === "number" &&
        typeof r.at === "string" &&
        Number.isFinite(Date.parse(r.at))
      ) {
        out.push({
          key: r.key,
          ...(typeof r.ext === "string" ? { ext: r.ext } : {}),
          symbol: r.symbol,
          side: r.side,
          size: r.size,
          loss: Math.min(0, r.loss),
          at: r.at,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const SIZE_EPS = 1e-9;

/**
 * Which of these pending positions are still waiting for their closed trade? A
 * position is matched by its OWN trade: the same MT5 position id, or else the same
 * symbol and side, with a size that adds up. A trade that closed something else does
 * not clear it, so two positions closing in the same minute can not drop one loss early.
 * A position whose trade covers only part of it keeps the rest of its loss (pro rata),
 * and one older than the lapse window is dropped. Returns the items still waiting.
 */
export async function unlandedPending(
  userId: string,
  accountId: string,
  items: PendingItem[],
  now: Date
): Promise<PendingItem[]> {
  const live = items.filter((i) => now.getTime() - Date.parse(i.at) < PENDING_GONE_MAX_MS);
  if (live.length === 0) return [];
  const since = new Date(Math.min(...live.map((i) => Date.parse(i.at))));
  const trades = await prisma.trade.findMany({
    where: { userId, accountId, exitTime: { gte: since } },
    select: { symbol: true, side: true, quantity: true, externalId: true, exitTime: true },
    orderBy: { exitTime: "asc" },
  });
  const left = trades.map((t) => t.quantity);
  const remaining: PendingItem[] = [];
  const ordered = [...live].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const item of ordered) {
    const at = Date.parse(item.at);
    let need = item.size;
    trades.forEach((t, idx) => {
      if (need <= SIZE_EPS || left[idx] <= SIZE_EPS) return;
      if (!t.exitTime || t.exitTime.getTime() < at) return;
      const mine = item.ext
        ? t.externalId === item.ext || (t.externalId ?? "").startsWith(`${item.ext}:`)
        : !t.externalId?.startsWith("mt5:") &&
          t.symbol.toUpperCase() === item.symbol.toUpperCase() &&
          t.side === item.side;
      if (!mine) return;
      const take = Math.min(need, left[idx]);
      need -= take;
      left[idx] -= take;
    });
    if (need > SIZE_EPS) {
      const frac = item.size > 0 ? need / item.size : 1;
      remaining.push({
        ...item,
        size: Math.round(need * 1e8) / 1e8,
        loss: Math.round(item.loss * frac * 100) / 100,
      });
    }
  }
  return remaining;
}

/**
 * The "position just closed" loss still to count right now, and the positions behind
 * it. Rows saved by an older version (no item list) fall back to the old rule.
 */
export async function pendingStateNow(
  userId: string,
  c: {
    accountId: string;
    pendingCloseLoss: number | null;
    pendingCloseAt: Date | null;
    pendingCloseItems?: string | null;
  },
  now: Date
): Promise<{ loss: number; items: PendingItem[] }> {
  const items = parsePendingItems(c.pendingCloseItems);
  if (items.length > 0) {
    const rest = await unlandedPending(userId, c.accountId, items, now);
    const loss = rest.reduce((s, i) => s + i.loss, 0);
    return { loss: Math.round(Math.min(0, loss) * 100) / 100, items: rest };
  }
  const loss = pendingLossOf(c, now);
  if (loss === 0 || !c.pendingCloseAt) return { loss: 0, items: [] };
  return { loss: (await pendingLanded(userId, c.accountId, c.pendingCloseAt)) ? 0 : loss, items: [] };
}

/** The "position just closed" loss still to count right now (0 once its trade has landed or it lapsed). */
async function pendingLossNow(
  userId: string,
  c: {
    accountId: string;
    pendingCloseLoss: number | null;
    pendingCloseAt: Date | null;
    pendingCloseItems: string | null;
  },
  now: Date
): Promise<number> {
  return (await pendingStateNow(userId, c, now)).loss;
}

export interface PositionView {
  id: string;
  connectionId: string;
  accountId: string;
  accountName: string;
  contractId: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  avgPrice: number;
  lastPrice: number | null;
  priceSource: "broker" | "bar" | null;
  openPnl: number | null;
  notPricedReason: "no_point_value" | "no_price" | null;
  readAt: Date;
}

export function healthOf(
  c: { nearLive: boolean; liveStatus: string; lastLiveAt: Date | null },
  now: Date
): LiveHealth {
  if (!c.nearLive) return "off";
  if (c.liveStatus === "rejected") return "rejected";
  if (!c.lastLiveAt) return "waiting";
  return now.getTime() - c.lastLiveAt.getTime() < LIVE_FRESH_MS ? "live" : "stale";
}

export async function loadLiveState(
  userId: string,
  now: Date = new Date()
): Promise<{ connections: ConnectionLive[]; positions: PositionView[] }> {
  const rows = await prisma.brokerConnection.findMany({
    where: { userId },
    include: { account: { select: { name: true } }, positionSnapshots: true },
    orderBy: { createdAt: "asc" },
  });
  const connections: ConnectionLive[] = [];
  const positions: PositionView[] = [];
  for (const c of rows) {
    connections.push({
      connectionId: c.id,
      accountId: c.accountId,
      accountName: c.account.name,
      nearLive: c.nearLive,
      health: healthOf(c, now),
      lastLiveAt: c.lastLiveAt,
      lastError: c.lastLiveError,
      lastBalance: c.lastBalance,
      lastSyncAt: c.lastSyncAt,
      livePeakEquity: c.livePeakEquity,
      pendingCloseLoss: await pendingLossNow(userId, c, now),
    });
    for (const p of c.positionSnapshots) {
      positions.push({
        id: p.id,
        connectionId: c.id,
        accountId: c.accountId,
        accountName: c.account.name,
        contractId: p.contractId,
        symbol: p.symbol,
        side: p.side === "short" ? "short" : "long",
        size: p.size,
        avgPrice: p.avgPrice,
        lastPrice: p.lastPrice,
        priceSource: p.priceSource === "bar" || p.priceSource === "broker" ? p.priceSource : null,
        openPnl: p.openPnl,
        notPricedReason:
          p.notPricedReason === "no_point_value" || p.notPricedReason === "no_price"
            ? p.notPricedReason
            : null,
        readAt: p.readAt,
      });
    }
  }
  return { connections, positions };
}

/**
 * The open state to put into the shared limit maths for one account: only when
 * its connection is live (a fresh good read). Otherwise null = closed trades
 * only.
 */
export function openStateFor(
  conn: ConnectionLive | undefined,
  positions: PositionView[]
): OpenState | null {
  if (!conn || conn.health !== "live") return null;
  const mine = positions.filter((p) => p.connectionId === conn.connectionId);
  let openPnl = 0;
  let unpriced = 0;
  let estimated = false;
  for (const p of mine) {
    if (p.openPnl == null) unpriced++;
    else {
      openPnl += p.openPnl;
      if (p.priceSource === "bar") estimated = true;
    }
  }
  // A position that just closed: its loss stays counted until the closed trade lands.
  const pending = conn.pendingCloseLoss;
  return {
    openPnl: Math.round((openPnl + pending) * 100) / 100,
    openCount: mine.length,
    unpricedCount: unpriced,
    estimated,
    ...(pending < 0 ? { pendingCloseLoss: pending } : {}),
  };
}
