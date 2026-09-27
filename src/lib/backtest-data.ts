// TradeOS — server-side data access for the Testing Portal. Thin, user-scoped
// query helpers the /backtest pages call; heavy JSON columns (run results,
// dataset candles) are only selected where actually needed.

import "server-only";
import { prisma } from "@/lib/db";
import type { BacktestConfig, BacktestResults } from "@/lib/types";
import { getAccounts } from "@/lib/data";

export interface BacktestRunListItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  datasetName: string | null;
  // Headline numbers lifted out of the results JSON for the list view.
  netPnl: number | null;
  winRate: number | null;
  tradeCount: number | null;
}

export async function getBacktestRuns(userId: string): Promise<BacktestRunListItem[]> {
  const rows = await prisma.backtestRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      notes: true,
      results: true,
      createdAt: true,
      dataset: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    let netPnl: number | null = null;
    let winRate: number | null = null;
    let tradeCount: number | null = null;
    try {
      const results = JSON.parse(row.results) as Partial<BacktestResults>;
      netPnl = results.variant?.netPnl ?? null;
      winRate = results.variant?.winRate ?? null;
      tradeCount = results.tradeCountTotal ?? null;
    } catch {
      // A failed run stores {error} — headline numbers stay null.
    }
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      datasetName: row.dataset?.name ?? null,
      netPnl,
      winRate,
      tradeCount,
    };
  });
}

export interface BacktestRunDetail {
  id: string;
  name: string;
  kind: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  datasetId: string | null;
  datasetName: string | null;
  config: (Partial<BacktestConfig> & Record<string, unknown>) | null;
  results: (Partial<BacktestResults> & { error?: string }) | null;
}

export async function getBacktestRun(
  userId: string,
  id: string
): Promise<BacktestRunDetail | null> {
  const row = await prisma.backtestRun.findFirst({
    where: { id, userId },
    include: { dataset: { select: { name: true } } },
  });
  if (!row) return null;

  const parse = <T>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    datasetId: row.datasetId,
    datasetName: row.dataset?.name ?? null,
    config: parse(row.config),
    results: parse(row.results),
  };
}

export async function getMarketDatasets(userId: string) {
  // `candles` is deliberately not selected — it can be megabytes.
  return prisma.marketDataset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      symbol: true,
      timeframe: true,
      candleCount: true,
      firstTime: true,
      lastTime: true,
      source: true,
      createdAt: true,
    },
  });
}

export interface ReplayFormOptions {
  accounts: { id: string; name: string }[];
  ruleBooks: { id: string; name: string }[];
  strategyTags: string[];
}

export async function getReplayFormOptions(userId: string): Promise<ReplayFormOptions> {
  const [accounts, ruleBooks, tagRows] = await Promise.all([
    getAccounts(userId),
    prisma.ruleBook.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.trade.findMany({
      where: { userId, strategyTag: { not: null } },
      distinct: ["strategyTag"],
      select: { strategyTag: true },
      orderBy: { strategyTag: "asc" },
    }),
  ]);

  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    ruleBooks,
    strategyTags: tagRows
      .map((r) => r.strategyTag)
      .filter((t): t is string => t !== null && t.trim() !== ""),
  };
}
