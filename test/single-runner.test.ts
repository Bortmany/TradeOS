// The "only one server copy runs this" guard. A session-level Postgres advisory
// lock can be unlocked on a DIFFERENT pooled database session and then stay held
// forever, so at a 60-second rhythm polling would quietly stop. The guard now
// uses a transaction-scoped lock (released by Postgres itself when the pinned
// transaction ends). This test models that with a fake pooled database and proves
// consecutive runs all run, a concurrent copy is skipped, and a crash releases it.

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { withSingleRunner } from "@/lib/single-runner";

const realUrl = process.env.DATABASE_URL;
afterEach(() => {
  process.env.DATABASE_URL = realUrl;
  vi.restoreAllMocks();
});

/** A fake Postgres: one advisory lock that lives exactly as long as a transaction callback. */
function fakePostgres() {
  const held = new Set<number>();
  const seen = { timeouts: [] as number[] };
  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, key: number) => {
      if (held.has(key)) return [{ locked: false }];
      held.add(key);
      return [{ locked: true }];
    },
  };
  const spy = vi
    .spyOn(prisma, "$transaction")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation((async (fn: (t: unknown) => Promise<unknown>, opts?: { timeout?: number }) => {
      seen.timeouts.push(opts?.timeout ?? 0);
      const mine = new Set<number>();
      const wrapped = {
        $queryRaw: async (s: TemplateStringsArray, key: number) => {
          const r = await tx.$queryRaw(s, key);
          if (r[0].locked) mine.add(key);
          return r;
        },
      };
      try {
        return await fn(wrapped);
      } finally {
        for (const k of mine) held.delete(k); // transaction end releases the lock itself
      }
    }) as never);
  return { held, seen, spy };
}

describe("withSingleRunner on Postgres", () => {
  it("two consecutive runs both run (the lock is released at the end of each)", async () => {
    process.env.DATABASE_URL = "postgresql://fake/test";
    const pg = fakePostgres();
    let runs = 0;
    const a = await withSingleRunner(111, "t", async () => void runs++, 5000);
    const b = await withSingleRunner(111, "t", async () => void runs++, 5000);
    const c = await withSingleRunner(111, "t", async () => void runs++, 5000);
    expect([a, b, c]).toEqual(["ran", "ran", "ran"]);
    expect(runs).toBe(3);
    expect(pg.held.size).toBe(0);
    expect(pg.seen.timeouts).toEqual([5000, 5000, 5000]);
  });

  it("a second copy that arrives while the first is running skips quietly", async () => {
    process.env.DATABASE_URL = "postgresql://fake/test";
    fakePostgres();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let ranSecond = false;
    const first = withSingleRunner(222, "t", () => gate, 5000);
    await new Promise((r) => setTimeout(r, 5));
    const second = await withSingleRunner(222, "t", async () => void (ranSecond = true), 5000);
    expect(second).toBe("skipped");
    expect(ranSecond).toBe(false);
    release();
    expect(await first).toBe("ran");
  });

  it("two different jobs use different keys, so a slow sweep never blocks the live tick", async () => {
    process.env.DATABASE_URL = "postgresql://fake/test";
    fakePostgres();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sweep = withSingleRunner(4927001, "sweep", () => gate, 5000);
    await new Promise((r) => setTimeout(r, 5));
    let live = false;
    const outcome = await withSingleRunner(4927002, "live", async () => void (live = true), 5000);
    expect(outcome).toBe("ran");
    expect(live).toBe(true);
    release();
    await sweep;
  });

  it("if the lock check itself fails, the work still runs (never silently stops)", async () => {
    process.env.DATABASE_URL = "postgresql://fake/test";
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("db hiccup") as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    let ran = false;
    expect(await withSingleRunner(333, "t", async () => void (ran = true), 5000)).toBe("ran");
    expect(ran).toBe(true);
  });

  it("on SQLite (single instance) the work just runs", async () => {
    let ran = false;
    expect(await withSingleRunner(444, "t", async () => void (ran = true), 5000)).toBe("ran");
    expect(ran).toBe(true);
  });
});

describe("no session-level advisory lock is left anywhere", () => {
  it("auto-sync and the live poller never call the session lock/unlock pair", () => {
    for (const rel of ["../src/lib/auto-sync.ts", "../src/lib/live/poller.ts", "../src/lib/single-runner.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      expect(src).not.toMatch(/pg_advisory_unlock/);
      expect(src).not.toMatch(/pg_try_advisory_lock\(/);
    }
    const guard = readFileSync(fileURLToPath(new URL("../src/lib/single-runner.ts", import.meta.url)), "utf8");
    expect(guard).toContain("pg_try_advisory_xact_lock");
  });

  it("the live poller and the 30-minute sweep take different lock keys", () => {
    const sweep = readFileSync(fileURLToPath(new URL("../src/lib/auto-sync.ts", import.meta.url)), "utf8");
    const live = readFileSync(fileURLToPath(new URL("../src/lib/live/poller.ts", import.meta.url)), "utf8");
    expect(sweep).toContain("4927001");
    expect(live).toContain("4927002");
  });
});
