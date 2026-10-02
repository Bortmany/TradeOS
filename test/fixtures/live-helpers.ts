// Helpers that build throwaway traders, accounts, connections and trades in the
// test database for the live-links tests. Every row belongs to a fresh user, so
// tests never see each other's data.

import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { FAKE_KEY } from "./projectx";

const stamp = Date.now();
let seq = 0;
export const userIds: string[] = [];

export async function makeTrader(opts: {
  prefix?: string;
  maxDailyLoss?: number | null;
  maxDrawdown?: number | null;
  profitTarget?: number | null;
  startingBalance?: number;
} = {}) {
  seq += 1;
  const user = await prisma.user.create({
    data: { email: `${opts.prefix ?? "live"}-${seq}-${stamp}@example.com`, passwordHash: "x" },
  });
  userIds.push(user.id);
  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      name: `Topstep 50K ${seq}`,
      kind: "evaluation",
      broker: "topstepx",
      startingBalance: opts.startingBalance ?? 50000,
    },
  });
  const prop = await prisma.propAccount.create({
    data: {
      userId: user.id,
      accountId: account.id,
      firm: "topstep",
      presetName: "Test 50K",
      accountSize: 50000,
      maxDailyLoss: opts.maxDailyLoss === undefined ? 1000 : opts.maxDailyLoss,
      maxDrawdown: opts.maxDrawdown === undefined ? 2000 : opts.maxDrawdown,
      profitTarget: opts.profitTarget === undefined ? 3000 : opts.profitTarget,
    },
  });
  return { userId: user.id, accountId: account.id, propId: prop.id, email: user.email };
}

export async function addClosedTrade(
  t: { userId: string; accountId: string },
  pnl: number,
  when: Date
) {
  return prisma.trade.create({
    data: {
      userId: t.userId,
      accountId: t.accountId,
      symbol: "ES",
      side: "long",
      entryPrice: 5000,
      exitPrice: 5000 + pnl / 50,
      quantity: 1,
      entryTime: when,
      exitTime: when,
      fees: 0,
      pnl,
      source: "manual",
    },
  });
}

export async function connect(
  t: { userId: string; accountId: string },
  opts: {
    username?: string;
    externalAccountId?: string;
    apiKey?: string;
    nearLive?: boolean;
    baseUrl?: string;
  } = {}
) {
  return prisma.brokerConnection.create({
    data: {
      userId: t.userId,
      accountId: t.accountId,
      broker: "topstepx",
      baseUrl: opts.baseUrl ?? "https://api.topstepx.com",
      username: opts.username ?? `trader-${seq}-${stamp}`,
      apiKeyEnc: encryptSecret(opts.apiKey ?? FAKE_KEY),
      externalAccountId: opts.externalAccountId ?? "123",
      externalAccountName: "Practice 123",
      nearLive: opts.nearLive ?? true,
    },
  });
}

export async function cleanup() {
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
}

export async function openAlerts(userId: string) {
  return prisma.alert.findMany({ where: { userId, status: "open" }, orderBy: { createdAt: "asc" } });
}

export function metaOf(a: { meta: string | null }) {
  return JSON.parse(a.meta ?? "{}") as Record<string, unknown>;
}
