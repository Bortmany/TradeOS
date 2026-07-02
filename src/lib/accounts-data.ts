// TradeOS — accounts data layer. Loads each trading account together with the
// realized performance summary computed from its closed trades. Reuses the
// analytics engine so the numbers match the dashboard exactly.

import "server-only";
import { prisma } from "@/lib/db";
import { getTrades } from "@/lib/data";
import { computeMetrics } from "@/lib/analytics";

export interface AccountStats {
  netPnl: number;
  tradeCount: number;
  winRate: number; // 0-1
  profitFactor: number;
}

export interface AccountWithStats {
  id: string;
  name: string;
  broker: string;
  kind: string;
  currency: string;
  startingBalance: number;
  isActive: boolean;
  color: string;
  createdAt: Date;
  stats: AccountStats;
}

/**
 * Returns every trading account for `userId`, each annotated with realized
 * metrics over its closed trades. Accounts with no closed trades report zeroed
 * stats (computeMetrics never throws / divides by zero).
 */
export async function getAccountsWithStats(userId: string): Promise<AccountWithStats[]> {
  const [accounts, trades] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    getTrades(userId),
  ]);

  return accounts.map((a) => {
    const closed = trades.filter((t) => t.accountId === a.id && t.exitTime !== null);
    const m = computeMetrics(closed);
    return {
      id: a.id,
      name: a.name,
      broker: a.broker,
      kind: a.kind,
      currency: a.currency,
      startingBalance: a.startingBalance,
      isActive: a.isActive,
      color: a.color,
      createdAt: a.createdAt,
      stats: {
        netPnl: m.netPnl,
        tradeCount: m.tradeCount,
        winRate: m.winRate,
        profitFactor: m.profitFactor,
      },
    };
  });
}
