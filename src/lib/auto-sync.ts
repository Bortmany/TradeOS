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
import { syncConnection, SyncDeferred } from "@/lib/connectors/sync";
import { readableConnectionsWhere } from "@/lib/connectors/mt5-access";
import { withSingleRunner, type RunContext, type RunnerOutcome } from "@/lib/single-runner";
import { CallBudget, liveBudget } from "@/lib/live/budget";

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
// takes the lease (a row in the RunnerLease table) runs the sweep; the rest skip
// this tick.
//
// The guard lives in src/lib/single-runner.ts, shared with the 60-second live
// poller. It is a lease row, not a database lock: the old session-level lock got
// stuck on pooled sessions, and the pinned-transaction version starved the work
// behind PgBouncer's one-connection pool. A lease needs no pinned connection.
export const AUTO_SYNC_LOCK_KEY = 4927001; // arbitrary but stable 32-bit key for the fill sweep
// The sweep must stop on its own before the next one is due (the rest go first
// next time: connections are worked oldest-sync first). Its lease is renewed
// while it works, so this is a work limit, not a lock limit.
const SWEEP_DEADLINE_MS = 25 * 60_000;
const SWEEP_LEASE_MS = 2 * 60_000;
// A sweep where at least this many connections were tried and ALL failed is a
// failed run (a bad key for one trader is not).
const SWEEP_ALL_FAILED_MIN = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Before every broker call the sweep asks the same server-wide budget the live
 * poller uses. It waits briefly for room in the minute; when the broker is
 * backing off (or the sweep's own deadline hit) it stops and the rest wait for
 * the next sweep.
 */
function sweepGate(ctx: RunContext, budget: CallBudget): () => Promise<void> {
  return async () => {
    for (;;) {
      if (ctx.expired() || budget.inBackoff()) throw new SyncDeferred();
      if (budget.take()) return;
      await sleep(1_000);
    }
  };
}

async function sweepWork(ctx: RunContext, budget: CallBudget): Promise<void> {
  const connections = await prisma.brokerConnection.findMany({
    where: readableConnectionsWhere(), // MT5 rows only while the owner's switch is on and the plan allows
    orderBy: { lastSyncAt: "asc" },
    select: { id: true, userId: true, externalAccountName: true },
  });
  if (connections.length === 0) return;

  let imported = 0;
  let failed = 0;
  let tried = 0;
  const beforeCall = sweepGate(ctx, budget);
  for (const conn of connections) {
    if (ctx.expired()) break;
    try {
      const r = await syncConnection(conn.id, conn.userId, {
        beforeCall,
        onRateLimit: (s) => budget.onRateLimited(s),
      });
      tried++;
      imported += r.imported;
    } catch (err) {
      if (err instanceof SyncDeferred) break; // budget used / backing off: resume next sweep
      tried++;
      failed++; // recorded on the connection row by syncConnection
    }
  }
  const left = connections.length - tried;
  console.log(
    `[auto-sync] ${tried}/${connections.length} connection(s) swept: +${imported} trades, ${failed} failed` +
      (left > 0 ? `, ${left} left for the next sweep` : "")
  );
  if (failed > 0 && failed === tried && tried >= SWEEP_ALL_FAILED_MIN) {
    throw new Error(`every one of ${tried} connections failed to sync`);
  }
}

let sweeping = false;

export async function runSweep(budget: CallBudget = liveBudget): Promise<RunnerOutcome | "already-running"> {
  if (sweeping) return "already-running";
  sweeping = true;
  try {
    return await withSingleRunner(
      AUTO_SYNC_LOCK_KEY,
      "auto-sync",
      (ctx) => sweepWork(ctx, budget),
      { deadlineMs: SWEEP_DEADLINE_MS, leaseMs: SWEEP_LEASE_MS }
    );
  } finally {
    sweeping = false;
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
