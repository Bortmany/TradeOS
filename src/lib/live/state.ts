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
 * Has a closed trade arrived for this account since the position vanished
 * (`pendingCloseAt` = the last read that still saw it open)? However it came:
 * the poller's immediate fill sync, the 30-minute sweep, or a manual import.
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

/** The "position just closed" loss still to count right now (0 once its trade has landed or it lapsed). */
async function pendingLossNow(
  userId: string,
  c: { accountId: string; pendingCloseLoss: number | null; pendingCloseAt: Date | null },
  now: Date
): Promise<number> {
  const loss = pendingLossOf(c, now);
  if (loss === 0 || !c.pendingCloseAt) return 0;
  return (await pendingLanded(userId, c.accountId, c.pendingCloseAt)) ? 0 : loss;
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
