// The "only one server copy runs this" guard, tested with the REAL lease
// implementation against the throwaway database (nothing about the lock is faked).
//
// History: a session-level Postgres lock got stuck on pooled sessions; the next
// version pinned one connection in a transaction for the whole run, so with the
// documented production URL (`?pgbouncer=true&connection_limit=1`) the work had no
// connection left and starved (and the failure was swallowed, so polling silently
// never ran). The guard is now a lease row: short statements, no pinned
// connection. These tests prove: the work runs with a pool of exactly ONE
// connection; two runners cannot overlap (even when they race); a crashed copy's
// lease runs out; a failing run is visible, not reported as "ran".

import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { withSingleRunner, runnerHealth, type RunnerOptions } from "@/lib/single-runner";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const quick: RunnerOptions = { deadlineMs: 5_000, leaseMs: 5_000 };

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.runnerLease.deleteMany({ where: { name: { startsWith: "runner:9" } } });
});

describe("the lease (real database, no fakes)", () => {
  it("consecutive runs all run: the lease is given back at the end of each", async () => {
    let runs = 0;
    const out = [
      await withSingleRunner(9001, "t", async () => void runs++, quick),
      await withSingleRunner(9001, "t", async () => void runs++, quick),
      await withSingleRunner(9001, "t", async () => void runs++, quick),
    ];
    expect(out).toEqual(["ran", "ran", "ran"]);
    expect(runs).toBe(3);
    const row = await prisma.runnerLease.findUniqueOrThrow({ where: { name: "runner:9001" } });
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now()); // given back
    expect(row.lastError).toBeNull();
    expect(row.lastOkAt).not.toBeNull();
  });

  it("a second copy that arrives while the first is working skips; it runs once the first is done", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let secondRan = false;
    const first = withSingleRunner(9002, "t", () => gate, quick);
    await sleep(30);
    expect(await withSingleRunner(9002, "t", async () => void (secondRan = true), quick)).toBe("skipped");
    expect(secondRan).toBe(false);
    release();
    expect(await first).toBe("ran");
    expect(await withSingleRunner(9002, "t", async () => void (secondRan = true), quick)).toBe("ran");
    expect(secondRan).toBe(true);
  });

  it("eight runners racing for the same job: exactly ONE runs, the rest skip (no overlap)", async () => {
    let active = 0;
    let peak = 0;
    let ran = 0;
    const work = async () => {
      active++;
      peak = Math.max(peak, active);
      ran++;
      await sleep(150);
      active--;
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => withSingleRunner(9003, "t", work, quick))
    );
    expect(results.filter((r) => r === "ran")).toHaveLength(1);
    expect(results.filter((r) => r === "skipped")).toHaveLength(7);
    expect(ran).toBe(1);
    expect(peak).toBe(1);
  });

  it("the lease is renewed while the work runs: a slow run is not taken over mid-way", async () => {
    // Lease of 300 ms, renewed every 80 ms, work takes 900 ms: without renewal a second
    // copy could take over after 300 ms.
    const opts: RunnerOptions = { deadlineMs: 5_000, leaseMs: 300, renewEveryMs: 80 };
    let secondRan = 0;
    const first = withSingleRunner(9004, "t", () => sleep(900), opts);
    await sleep(500);
    expect(await withSingleRunner(9004, "t", async () => void secondRan++, opts)).toBe("skipped");
    await sleep(200);
    expect(await withSingleRunner(9004, "t", async () => void secondRan++, opts)).toBe("skipped");
    expect(await first).toBe("ran");
    expect(secondRan).toBe(0);
  });

  it("a crashed copy's lease simply runs out, and the next copy takes over", async () => {
    await prisma.runnerLease.create({
      data: { name: "runner:9005", holder: "dead-copy", expiresAt: new Date(Date.now() + 60_000) },
    });
    let ran = false;
    expect(await withSingleRunner(9005, "t", async () => void (ran = true), quick)).toBe("skipped");
    expect(ran).toBe(false);
    await prisma.runnerLease.update({ where: { name: "runner:9005" }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await withSingleRunner(9005, "t", async () => void (ran = true), quick)).toBe("ran");
    expect(ran).toBe(true);
  });

  it("two different jobs use different leases, so a slow sweep never blocks the live tick", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sweep = withSingleRunner(9006, "sweep", () => gate, quick);
    await sleep(30);
    let live = false;
    expect(await withSingleRunner(9007, "live", async () => void (live = true), quick)).toBe("ran");
    expect(live).toBe(true);
    release();
    await sweep;
  });

  it("the work gets a deadline it can see: expired() flips after deadlineMs", async () => {
    let early = true;
    let late = false;
    await withSingleRunner(9008, "t", async (ctx) => {
      early = ctx.expired();
      await sleep(120);
      late = ctx.expired();
      expect(ctx.remainingMs()).toBe(0);
    }, { deadlineMs: 60, leaseMs: 5_000 });
    expect(early).toBe(false);
    expect(late).toBe(true);
  });

  it("the runner never abandons work that is still running (it waits for it to finish)", async () => {
    let finished = false;
    const outcome = await withSingleRunner(9009, "t", async () => {
      await sleep(150);
      finished = true;
    }, { deadlineMs: 20, leaseMs: 5_000 }); // far past its deadline
    expect(finished).toBe(true);
    expect(outcome).toBe("ran");
  });
});

describe("a failing run is visible, never reported as 'ran'", () => {
  it("logs a clear error, answers 'failed', and records it on the lease row; a good run clears it", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a.map(String).join(" ")));
    const outcome = await withSingleRunner(9010, "live-poll", async () => {
      throw new Error("db pool timeout");
    }, quick);
    expect(outcome).toBe("failed");
    expect(errors.join("\n")).toContain("[live-poll] run FAILED");
    const bad = await runnerHealth(9010);
    expect(bad?.lastError).toContain("db pool timeout");
    expect(bad?.lastRunAt).not.toBeNull();
    // The lease was given back even though the run failed, so the next tick can run.
    expect(await withSingleRunner(9010, "live-poll", async () => {}, quick)).toBe("ran");
    const good = await runnerHealth(9010);
    expect(good?.lastError).toBeNull();
    expect(good?.lastOkAt).not.toBeNull();
  });

  it("if the lease check itself fails (database hiccup), the work still runs and says so", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a.map(String).join(" ")));
    vi.spyOn(prisma.runnerLease, "updateMany").mockRejectedValue(new Error("db hiccup") as never);
    let ran = false;
    expect(await withSingleRunner(9011, "t", async () => void (ran = true), quick)).toBe("ran");
    expect(ran).toBe(true);
    expect(errors.join("\n")).toContain("lease check failed");
  });
});

describe("works with a database pool of exactly ONE connection (the documented production URL)", () => {
  it("the work runs while the lease is held, even though it needs its own queries", async () => {
    const realUrl = process.env.DATABASE_URL;
    const realClient = (globalThis as unknown as { prisma?: unknown }).prisma;
    process.env.DATABASE_URL = "file:./test-core-guarantee.db?connection_limit=1";
    delete (globalThis as unknown as { prisma?: unknown }).prisma;
    vi.resetModules();
    try {
      const db = (await import("@/lib/db")).prisma;
      const runner = await import("@/lib/single-runner");

      // Control: prove this client really has ONE connection. The OLD design (work inside
      // a pinned transaction, using the normal pool) cannot get a connection here.
      const starved = await db
        .$transaction(async () => db.runnerLease.count(), { maxWait: 400, timeout: 1_200 })
        .then(
          () => false,
          () => true
        );
      expect(starved).toBe(true);

      // The lease: the work runs, and does several queries of its own while it holds it.
      let counted = -1;
      let outcome = "";
      outcome = await runner.withSingleRunner(9012, "pool-of-one", async () => {
        await db.runnerLease.count();
        const rows = await Promise.all([db.user.count(), db.trade.count(), db.alert.count()]);
        counted = rows.length;
        await sleep(250); // long enough for a lease renewal to interleave with the work
      }, { deadlineMs: 5_000, leaseMs: 300, renewEveryMs: 60 });
      expect(outcome).toBe("ran");
      expect(counted).toBe(3);
      // A second runner racing in is still kept out the whole time.
      const racer = await runner.withSingleRunner(9012, "pool-of-one", async () => {}, quick);
      expect(racer).toBe("ran"); // the first finished, so the lease was free again
      await db.$disconnect();
    } finally {
      process.env.DATABASE_URL = realUrl;
      (globalThis as unknown as { prisma?: unknown }).prisma = realClient;
      vi.resetModules();
    }
  }, 20_000);
});

describe("no session-level or pinned-transaction lock is left anywhere", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("the guard, auto-sync and the poller use no advisory lock and pin no transaction", () => {
    for (const rel of ["../src/lib/auto-sync.ts", "../src/lib/live/poller.ts", "../src/lib/single-runner.ts"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/pg_advisory_unlock/);
      expect(src, rel).not.toMatch(/pg_try_advisory/);
      expect(src.replace(/\/\/.*$/gm, ""), rel).not.toMatch(/\.\$transaction\(\s*async/);
    }
    // the runner only uses short single statements on the lease table
    expect(read("../src/lib/single-runner.ts")).toContain("runnerLease");
  });

  it("the live poller and the 30-minute sweep take different lock keys", () => {
    expect(read("../src/lib/auto-sync.ts")).toContain("4927001");
    expect(read("../src/lib/live/poller.ts")).toContain("4927002");
  });
});
