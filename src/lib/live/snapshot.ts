// TradeOS — everything the dashboard's live cards need in one read: the user's
// open, not-dismissed alerts, the freshness of each live link and the latest
// open positions. Served by GET /api/alerts and rendered once on the server for
// the first paint. Every query is filtered by the signed-in user's id.

import { prisma } from "@/lib/db";
import { loadLiveState } from "@/lib/live/state";
import {
  sortAlertViews,
  toAlertView,
  toLiveAccountView,
  toPositionJson,
  type LiveSnapshot,
} from "@/lib/alerts/view";

export async function getLiveSnapshot(
  userId: string,
  now: Date = new Date()
): Promise<LiveSnapshot> {
  const [rows, accounts, live] = await Promise.all([
    prisma.alert.findMany({
      where: { userId, status: "open", dismissedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.tradingAccount.findMany({ where: { userId }, select: { id: true, name: true } }),
    loadLiveState(userId, now),
  ]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return {
    alerts: sortAlertViews(rows.map((r) => toAlertView(r, names, live.connections))),
    accounts: live.connections.map(toLiveAccountView),
    positions: live.positions.map(toPositionJson),
    now: now.toISOString(),
  };
}
