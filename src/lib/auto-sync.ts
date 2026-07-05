// TradeOS — in-process auto-sync scheduler for persistent-server deployments
// (Railway, VPS, Docker). Started once from instrumentation.ts when the Next.js
// server boots. On serverless platforms this is skipped: Vercel sets VERCEL=1
// and its cron hits /api/cron/sync instead — both paths share syncConnection().
//
// Config:
//   AUTO_SYNC_INTERVAL_MIN  interval in minutes (default 30 in production;
//                           set 0 to disable; fractional values allowed, which
//                           is mainly useful in tests)

import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/connectors/sync";

// Survive dev hot-reloads / duplicate register() calls with a global singleton.
const globalScheduler = globalThis as unknown as {
  __tradeosAutoSync?: ReturnType<typeof setInterval>;
};

function intervalMinutes(): number {
  const raw = process.env.AUTO_SYNC_INTERVAL_MIN;
  if (raw !== undefined) {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return process.env.NODE_ENV === "production" ? 30 : 0;
}

async function runSweep(): Promise<void> {
  try {
    const connections = await prisma.brokerConnection.findMany({
      orderBy: { lastSyncAt: "asc" },
      select: { id: true, userId: true, externalAccountName: true },
    });
    if (connections.length === 0) return;

    let imported = 0;
    let failed = 0;
    for (const conn of connections) {
      try {
        const r = await syncConnection(conn.id, conn.userId);
        imported += r.imported;
      } catch {
        failed++; // recorded on the connection row by syncConnection
      }
    }
    console.log(
      `[auto-sync] ${connections.length} connection(s) swept: +${imported} trades, ${failed} failed`
    );
  } catch (err) {
    // Never let the scheduler take the server down.
    console.error("[auto-sync] sweep error:", (err as Error).message);
  }
}

export function startAutoSync(): void {
  if (globalScheduler.__tradeosAutoSync) return; // already running
  if (process.env.VERCEL) return; // serverless — Vercel Cron owns scheduling

  const minutes = intervalMinutes();
  if (minutes <= 0) return;

  const ms = Math.max(1000, Math.round(minutes * 60_000));
  console.log(`[auto-sync] scheduler started — every ${minutes} min`);
  const timer = setInterval(() => void runSweep(), ms);
  // Don't hold the process open just for the timer (clean shutdowns).
  timer.unref?.();
  globalScheduler.__tradeosAutoSync = timer;
}
