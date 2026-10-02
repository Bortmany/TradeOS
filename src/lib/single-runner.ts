// TradeOS — "only one server copy runs this job" guard.
//
// When TradeOS runs as several Railway instances, each one boots the same
// schedulers; without a guard every connection would be worked N times per tick.
//
// Why a transaction-scoped lock (this replaced a session-level lock): a Postgres
// advisory lock taken at session level belongs to ONE database session,
// but Prisma pools connections, so the matching unlock call could land on
// a different session and do nothing, leaving the lock held by an idle pooled
// session. At a 30-minute rhythm that went unnoticed; at a 60-second rhythm the
// next tick (on another session) would find the lock taken and quietly skip,
// so polling would silently stop. pg_try_advisory_xact_lock inside an interactive
// transaction pins ONE connection for the whole run and Postgres releases the
// lock itself when the transaction ends, even if the process dies. It also works
// behind a transaction-mode pooler (PgBouncer).
//
// SQLite (dev) has no advisory locks and is single-instance by design, so the
// work just runs. If the lock check itself fails (database hiccup) we run anyway
// rather than silently stop: the jobs are idempotent.

import { prisma } from "@/lib/db";

export function isPostgres(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres");
}

export type RunnerOutcome = "ran" | "skipped";

export async function withSingleRunner(
  lockKey: number,
  label: string,
  work: () => Promise<void>,
  /** Longest the run may take before its pinned transaction is abandoned. */
  maxRunMs: number
): Promise<RunnerOutcome> {
  if (!isPostgres()) {
    await work();
    return "ran";
  }
  let ran = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked
        `;
        if (rows[0]?.locked !== true) return; // another instance owns this run
        ran = true;
        await work();
      },
      { maxWait: 5_000, timeout: maxRunMs }
    );
  } catch (err) {
    if (ran) {
      // The work ran; only the transaction wrapper complained. Nothing to redo.
      console.error(`[${label}] runner finished with a lock error:`, (err as Error).message);
      return "ran";
    }
    console.error(`[${label}] advisory lock check failed:`, (err as Error).message);
    await work();
    return "ran";
  }
  return ran ? "ran" : "skipped";
}
