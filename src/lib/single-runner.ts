// TradeOS — "only one server copy runs this job" guard.
//
// When TradeOS runs as several Railway instances, each one boots the same
// schedulers; without a guard every connection would be worked N times per tick.
//
// How it works: a LEASE ROW in the database (table RunnerLease: job name, holder
// id, expiry). A copy takes the lease with an atomic conditional update/insert,
// renews it every few seconds while it works, and gives it back at the end. If a
// copy dies, its lease just runs out and the next tick takes over.
//
// Why a lease row and not a database lock:
//  - The earlier session-level advisory lock could be "unlocked" on a different
//    pooled connection and stay stuck, silently stopping a 60-second poll.
//  - The next version pinned one connection in a transaction for the whole run.
//    With the documented production URL (`?pgbouncer=true&connection_limit=1`)
//    the work then had no connection left to use and starved. A lease uses only
//    short, separate statements: the work never needs a second connection while
//    the lease is held, so it runs fine with a pool of 1, behind PgBouncer, on
//    Postgres and on SQLite (dev) alike.
//
// The work gets a RunContext: it must stop by `deadlineAt` (well under the lease)
// and when the lease was lost. The runner never abandons work that is still
// running, so the in-process "running" flags cannot clear while work continues.
//
// A failed run is logged and recorded on the lease row (lastError / lastOkAt),
// never reported as "ran". If the lease check itself fails (database hiccup) we
// run anyway rather than silently stop: the jobs are idempotent.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export function isPostgres(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres");
}

export type RunnerOutcome = "ran" | "skipped" | "failed";

export interface RunContext {
  /** Epoch ms by which the work must stop on its own. */
  deadlineAt: number;
  /** True once the deadline passed or the lease was lost: wrap up, start nothing new. */
  expired(): boolean;
  /** Milliseconds left before the deadline (never negative). */
  remainingMs(): number;
}

export interface RunnerOptions {
  /** How long the work may run before it must stop itself. */
  deadlineMs: number;
  /** Lease length; renewed while the work runs. Default 90 seconds. */
  leaseMs?: number;
  /** How often the lease is renewed. Default a third of the lease. */
  renewEveryMs?: number;
}

const DEFAULT_LEASE_MS = 90_000;
const EPOCH = new Date(0);

/** Short plain-English reason stored for a failed run (never raw broker text or secrets). */
function describe(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.replace(/[^\w .,:()/-]/g, "").slice(0, 160) || "unknown error";
}

async function acquire(name: string, holder: string, leaseMs: number): Promise<boolean> {
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + leaseMs);
  // Atomic: only an expired lease can be taken over (one row, one conditional UPDATE).
  const taken = await prisma.runnerLease.updateMany({
    where: { name, expiresAt: { lte: new Date(nowMs) } },
    data: { holder, expiresAt },
  });
  if (taken.count === 1) return true;
  // The row exists and has not expired: someone holds it (the normal "skip" case; no
  // insert is attempted, so a held lease never produces a database error line).
  if (await prisma.runnerLease.findUnique({ where: { name }, select: { name: true } })) return false;
  try {
    // First ever run of this job: the primary key makes exactly one insert win.
    await prisma.runnerLease.create({ data: { name, holder, expiresAt } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return false; // someone holds it
    throw err;
  }
}

async function renew(name: string, holder: string, leaseMs: number): Promise<boolean> {
  const r = await prisma.runnerLease.updateMany({
    where: { name, holder },
    data: { expiresAt: new Date(Date.now() + leaseMs) },
  });
  return r.count === 1;
}

async function finish(name: string, holder: string, error: string | null): Promise<void> {
  const now = new Date();
  await prisma.runnerLease.updateMany({
    where: { name, holder },
    data: {
      expiresAt: EPOCH, // given back
      lastRunAt: now,
      lastError: error,
      ...(error === null ? { lastOkAt: now } : {}),
    },
  });
}

export async function withSingleRunner(
  lockKey: number,
  label: string,
  work: (ctx: RunContext) => Promise<void>,
  opts: RunnerOptions
): Promise<RunnerOutcome> {
  const name = `runner:${lockKey}`;
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const renewEveryMs = opts.renewEveryMs ?? Math.max(1_000, Math.floor(leaseMs / 3));
  const holder = randomUUID();

  let leased = false;
  try {
    if (!(await acquire(name, holder, leaseMs))) return "skipped"; // another copy owns this run
    leased = true;
  } catch (err) {
    // Database hiccup on the lease check: run anyway (idempotent jobs), say so.
    console.error(`[${label}] lease check failed, running without it:`, describe(err));
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + opts.deadlineMs;
  let lost = false;
  const ctx: RunContext = {
    deadlineAt,
    expired: () => lost || Date.now() >= deadlineAt,
    remainingMs: () => Math.max(0, deadlineAt - Date.now()),
  };

  // Keep the lease alive while the work runs (short statements, no pinned connection).
  let renewing = false;
  const timer = leased
    ? setInterval(() => {
        if (renewing) return;
        renewing = true;
        renew(name, holder, leaseMs)
          .then((ok) => {
            if (!ok && !lost) {
              lost = true;
              console.error(`[${label}] lease was lost; the run is wrapping up`);
            }
          })
          .catch((err) => console.error(`[${label}] lease renewal failed:`, describe(err)))
          .finally(() => {
            renewing = false;
          });
      }, renewEveryMs)
    : null;
  timer?.unref?.();

  let error: string | null = null;
  try {
    await work(ctx);
  } catch (err) {
    error = describe(err);
    console.error(`[${label}] run FAILED:`, error);
  } finally {
    if (timer) clearInterval(timer);
  }
  if (leased) {
    try {
      await finish(name, holder, error);
    } catch (err) {
      console.error(`[${label}] could not give the lease back (it will run out):`, describe(err));
    }
  }
  return error === null ? "ran" : "failed";
}

/** Health of a job's last run, for the health route. null = never ran on this database. */
export async function runnerHealth(
  lockKey: number
): Promise<{ lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null } | null> {
  const row = await prisma.runnerLease.findUnique({ where: { name: `runner:${lockKey}` } });
  return row ? { lastRunAt: row.lastRunAt, lastOkAt: row.lastOkAt, lastError: row.lastError } : null;
}
