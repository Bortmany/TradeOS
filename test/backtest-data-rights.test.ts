// Testing Portal data and the trader's data rights, through the REAL routes.
//
//  1. "Export my data" includes the trader's saved backtest runs and their
//     market datasets (details only — never the raw candle blob), and nobody
//     else's.
//  2. "Delete my account" removes the trader's backtest runs and datasets too,
//     and leaves every other trader's untouched.
//
// Same approach as rule-quota.test.ts: call the route handlers against the
// throwaway SQLite database with a settable "who is signed in".

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
  verifyPassword: async (password: string) => password === "right-password",
  clearSessionCookie: async () => {},
}));

import { GET as exportData } from "@/app/api/profile/export/route";
import { POST as deleteAccount } from "@/app/api/profile/delete/route";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();

type Trader = { id: string; email: string; runId: string; datasetId: string };

async function makeTrader(label: string): Promise<Trader> {
  const email = `bt-rights-${label}-${stamp}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: label, plan: "pro" },
  });
  const dataset = await prisma.marketDataset.create({
    data: {
      userId: user.id,
      name: `${label} ES 5m`,
      symbol: "ES",
      candleCount: 1,
      candles: JSON.stringify([{ t: 1751808600, o: 1, h: 2, l: 0.5, c: 1.5 }]),
    },
  });
  const run = await prisma.backtestRun.create({
    data: {
      userId: user.id,
      name: `${label} ORB test`,
      kind: "simulation",
      config: "{}",
      results: "{}",
      notes: `${label}'s private note`,
      datasetId: dataset.id,
    },
  });
  return { id: user.id, email, runId: run.id, datasetId: dataset.id };
}

function signIn(t: Trader) {
  session.current = {
    id: t.id,
    email: t.email,
    displayName: null,
    plan: "pro",
    billingStatus: "active",
    timezone: "UTC",
    trialEndsAt: null,
  };
}

let alice: Trader;
let bob: Trader;

beforeAll(async () => {
  alice = await makeTrader("alice");
  bob = await makeTrader("bob");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `bt-rights-` } } });
  await prisma.$disconnect();
});

describe("Testing Portal data in export and account deletion", () => {
  it("export includes the trader's own backtest runs and datasets only", async () => {
    signIn(alice);
    const res = await exportData();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.backtestRuns.map((r: { id: string }) => r.id)).toEqual([alice.runId]);
    expect(body.backtestRuns[0].notes).toBe("alice's private note");
    expect(body.marketDatasets.map((d: { id: string }) => d.id)).toEqual([alice.datasetId]);
    // Dataset details only — the raw candle blob is left out on purpose.
    expect(body.marketDatasets[0]).not.toHaveProperty("candles");
    // Main's weekly reviews are still part of the export.
    expect(body).toHaveProperty("weeklyReviews");

    const text = JSON.stringify(body);
    expect(text).not.toContain(bob.runId);
    expect(text).not.toContain(bob.datasetId);
  });

  it("deleting the account removes its backtest runs and datasets, and nobody else's", async () => {
    signIn(alice);
    const req = new Request("http://localhost/api/profile/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "right-password" }),
    });
    const res = await deleteAccount(req);
    expect(res.status).toBe(200);

    expect(await prisma.backtestRun.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.marketDataset.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();

    // Positive control: Bob's portal data is untouched.
    expect(await prisma.backtestRun.findUnique({ where: { id: bob.runId } })).not.toBeNull();
    expect(await prisma.marketDataset.findUnique({ where: { id: bob.datasetId } })).not.toBeNull();
  });
});
