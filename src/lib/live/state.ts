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
  return {
    openPnl: Math.round(openPnl * 100) / 100,
    openCount: mine.length,
    unpricedCount: unpriced,
    estimated,
  };
}
