// TradeOS — in-process auto-sync scheduler for persistent-server deployments
// (Railway, VPS, Docker). Started once from instrumentation.ts when the Next.js
// server boots. On serverless platforms this is skipped: Vercel sets VERCEL=1
// and its cron hits /api/cron/sync instead — both paths share syncConnection().
//
// This is the 30-minute FILL sync. The 60-second near-live read of positions and
// balance is a separate timer in src/lib/live/poller.ts.
//
// Config:
//   AUTO_SYNC_INTERVAL_MIN  interval in minutes (default 30 in production;
//                           set 0 to disable; fractional values allowed, which
//                           is mainly useful in tests)

import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/connectors/sync";
import { withSingleRunner } from "@/lib/single-runner";

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

// ── Single-runner guard for horizontal scaling ───────────────────────────────
// When TradeOS runs as several Railway instances, each one boots this same
// scheduler, so without a guard every connection would be synced N times per
// interval — wasted work and extra load on the broker's API. Whichever instance
// takes the Postgres advisory lock runs the sweep; the rest skip this tick.
//
// The guard lives in src/lib/single-runner.ts, shared with the 60-second live
// poller. It uses a transaction-scoped lock: the old session-level lock could be
// "unlocked" on a different pooled database session, leaving it stuck on an idle
// one, and every later sweep on another session would then skip silently.
const AUTO_SYNC_LOCK_KEY = 4927001; // arbitrary but stable 32-bit key for the fill sweep
// The sweep holds its lock for as long as it runs; never abandon it sooner than this.
const SWEEP_MAX_RUN_MS = 2 * 60 * 60_000;

async function sweepWork(): Promise<void> {
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

export async function runSweep(): Promise<void> {
  await withSingleRunner(AUTO_SYNC_LOCK_KEY, "auto-sync", sweepWork, SWEEP_MAX_RUN_MS);
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
