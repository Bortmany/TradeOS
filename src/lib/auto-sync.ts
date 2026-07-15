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

// ── Single-runner guard for horizontal scaling ───────────────────────────────
// When TradeOS runs as several Railway instances, each one boots this same
// scheduler, so without a guard every connection would be synced N times per
// interval — wasted work and extra load on the broker's API.
//
// Choice: a Postgres *advisory lock*, not an env "leader" flag. The advisory
// lock needs zero configuration (the owner isn't a developer, so per-instance
// env flags are easy to get wrong) and self-corrects if an instance dies. Each
// sweep tries to grab one shared lock; whichever instance gets it runs the
// sweep, the rest skip this tick. It only applies on Postgres (prod) — SQLite
// (dev) has no such function and is single-instance by design, so we skip the
// lock there entirely. Result: no behavior change on a single instance.
//
// Note on connection pooling: pg advisory locks are held by the DB session that
// took them. Prisma pools connections, so the unlock may land on a different
// session and be a no-op; that's harmless here because (a) the lock also frees
// automatically when a session/instance ends, and (b) syncConnection de-dupes
// at the trade level, so a rare double-sweep imports nothing twice. The lock is
// an optimization, not a correctness dependency.
const AUTO_SYNC_LOCK_KEY = 4927001; // arbitrary but stable 32-bit key for our one lock

function isPostgres(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres");
}

async function runSweep(): Promise<void> {
  // Try to become the single runner for this tick (Postgres/prod only).
  let holdsLock = false;
  if (isPostgres()) {
    try {
      const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_lock(${AUTO_SYNC_LOCK_KEY}) AS locked
      `;
      holdsLock = rows[0]?.locked === true;
      if (!holdsLock) return; // another instance owns this sweep — skip quietly
    } catch (err) {
      // If the lock call itself fails, don't silently stop syncing — fall
      // through and run (worst case a duplicate sweep, which is idempotent).
      console.error("[auto-sync] advisory lock check failed:", (err as Error).message);
    }
  }

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
  } finally {
    // Release the advisory lock so the next tick (this or another instance) can
    // take it. Best-effort — see the pooling note above.
    if (holdsLock) {
      try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${AUTO_SYNC_LOCK_KEY})`;
      } catch {
        /* lock frees on session end regardless */
      }
    }
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
