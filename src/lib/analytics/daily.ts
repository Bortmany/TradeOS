// TradeOS — Analytics: daily realized P&L series.
// Pure and deterministic. Days are America/New_York (ET) calendar days so the
// buckets never shift with the server's timezone. Used by the analytics P&L
// calendar (via getDashboardData) and by period reports.

import type { TradeRecord } from "@/lib/types";
import { etDayKey } from "@/lib/rules/engine";

export interface DailyPnlPoint {
  date: string; // ET calendar day, "YYYY-MM-DD"
  pnl: number; // realized net P&L booked that day
  trades: number; // closed trades that day
}

/**
 * Buckets closed trades into ET calendar-day realized P&L points, sorted by
 * date ascending. Open trades (no exitTime) are ignored.
 */
export function dailyPnlSeries(trades: TradeRecord[]): DailyPnlPoint[] {
  const map = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    if (t.exitTime === null) continue;
    const date = etDayKey(t.entryTime);
    const acc = map.get(date) ?? { pnl: 0, trades: 0 };
    acc.pnl += t.pnl;
    acc.trades += 1;
    map.set(date, acc);
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, pnl: v.pnl, trades: v.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
