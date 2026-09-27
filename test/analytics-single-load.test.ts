// The Analytics (and Dashboard) page must load the signed-in trader's trades
// exactly ONCE per visit. It used to call getDashboardData (which loads the trades) and then
// getTrades again for the P&L calendar. This test runs the real page loader
// against the throwaway test database, counts the trade queries, and checks
// every one of them was scoped to the signed-in user.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

// Sign in as whichever trader the test picks.
let signedInId = "";
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => (signedInId ? { id: signedInId } : null),
}));

// Record every trade-list query Prisma runs. (A vi.spyOn on the Prisma model
// can't be cleanly restored, so this uses Prisma's own query hook instead.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tradeQueries: any[] = [];
prisma.$use(async (params, next) => {
  if (params.model === "Trade" && params.action === "findMany") {
    tradeQueries.push(params.args?.where ?? {});
  }
  return next(params);
});

const stamp = Date.now();
let userId = "";
let accountId = "";

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `single-load-${stamp}@example.com`, passwordHash: "x", displayName: "dana" },
  });
  userId = user.id;
  const account = await prisma.tradingAccount.create({
    data: { userId, name: "dana account", startingBalance: 50000 },
  });
  accountId = account.id;
  for (const [i, pnl] of [40, -20].entries()) {
    await prisma.trade.create({
      data: {
        userId,
        accountId,
        symbol: "ES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5001,
        quantity: 1,
        entryTime: new Date(`2026-08-0${i + 1}T14:00:00Z`),
        exitTime: new Date(`2026-08-0${i + 1}T15:00:00Z`),
        fees: 0,
        pnl,
        source: "manual",
      },
    });
  }
  signedInId = userId;
});

afterAll(async () => {
  if (userId) await prisma.trade.deleteMany({ where: { userId } });
});

// The dashboard had the same double load (fixed earlier); guard it here too.
const pages = {
  Analytics: () => import("@/app/(app)/analytics/page"),
  Dashboard: () => import("@/app/(app)/dashboard/page"),
};

describe.each(Object.entries(pages))("%s page", (_name, load) => {
  for (const withAccount of [false, true]) {
    it(`loads trades once, scoped to the signed-in trader (${withAccount ? "one account" : "all accounts"})`, async () => {
      const { default: Page } = await load();
      tradeQueries.length = 0;
      await Page({
        searchParams: Promise.resolve(withAccount ? { account: accountId } : {}),
      });
      expect(tradeQueries).toHaveLength(1);
      expect(tradeQueries[0].userId).toBe(userId);
      if (withAccount) expect(tradeQueries[0].accountId).toBe(accountId);
    });
  }
});
