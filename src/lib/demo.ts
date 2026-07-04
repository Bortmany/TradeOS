// TradeOS — one-click sample data for new users (activation lever). Generates a
// small, realistic set of trades so a trial user sees the full product working
// immediately instead of an empty dashboard. Deterministic per user.

import "server-only";
import { prisma } from "@/lib/db";
import { pointMultiplier } from "@/lib/ingestion/symbols";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SYMBOLS = ["ES", "MES", "NQ", "MNQ"] as const;
const STRATEGIES = ["VWAP Reclaim", "ORB", "Trend Pullback", "Reversal"];
const WIN_EMOTIONS = ["calm", "focused", "confident"];
const LOSS_EMOTIONS = ["fomo", "revenge", "greedy", "impatient"];
const TICK = 0.25;

/**
 * Creates a "Practice Account" (if the user has none) and ~45 sample trades over
 * the trailing 30 days, then recomputes compliance. Idempotent-ish: it skips if
 * the user already has trades, returning { created: 0, skipped: true }.
 */
export async function loadSampleData(
  userId: string
): Promise<{ created: number; skipped: boolean; accountId: string }> {
  const existingTrades = await prisma.trade.count({ where: { userId } });

  // Ensure an account exists.
  let account = await prisma.tradingAccount.findFirst({ where: { userId } });
  if (!account) {
    account = await prisma.tradingAccount.create({
      data: {
        userId,
        name: "Practice Account",
        broker: "manual",
        kind: "demo",
        startingBalance: 50000,
        color: "#5b8def",
      },
    });
  }

  if (existingTrades > 0) {
    return { created: 0, skipped: true, accountId: account.id };
  }

  const rand = mulberry32(hashString(userId));
  const now = new Date();
  const rows: {
    userId: string;
    accountId: string;
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    entryTime: Date;
    exitTime: Date;
    fees: number;
    pnl: number;
    strategyTag: string;
    emotions: string;
    notes: string | null;
    source: string;
    isWin: boolean;
  }[] = [];

  const target = 45;
  let day = 0;
  while (rows.length < target && day < 42) {
    day++;
    const d = new Date(now);
    d.setDate(now.getDate() - day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    const tradesToday = 1 + Math.floor(rand() * 3);

    for (let k = 0; k < tradesToday && rows.length < target; k++) {
      const symbol = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
      const mult = pointMultiplier(symbol);
      const side = rand() > 0.5 ? "long" : "short";
      const qty = 1 + Math.floor(rand() * 3);
      const isWin = rand() < 0.53;

      // Entry between 09:35 and 11:30 ET (approx, using local offset-agnostic hour)
      const hour = 9 + Math.floor(rand() * 2);
      const minute = 35 + Math.floor(rand() * 25);
      const entryTime = new Date(d);
      entryTime.setHours(hour, minute, 0, 0);
      const holdMin = 3 + Math.floor(rand() * 90);
      const exitTime = new Date(entryTime.getTime() + holdMin * 60000);

      const base = symbol.includes("N") ? 18000 : 5000;
      const entryPrice = Math.round((base + (rand() - 0.5) * 40) / TICK) * TICK;
      // Winners a touch bigger than losers on average.
      const ticks = isWin ? 4 + rand() * 20 : -(3 + rand() * 16);
      const move = ticks * TICK * (side === "long" ? 1 : -1);
      const exitPrice = Math.round((entryPrice + move) / TICK) * TICK;
      const fees = qty * (2 + rand() * 2);
      const gross =
        side === "long"
          ? (exitPrice - entryPrice) * qty * mult
          : (entryPrice - exitPrice) * qty * mult;
      const pnl = Math.round((gross - fees) * 100) / 100;

      const emo = isWin
        ? WIN_EMOTIONS[Math.floor(rand() * WIN_EMOTIONS.length)]
        : LOSS_EMOTIONS[Math.floor(rand() * LOSS_EMOTIONS.length)];

      rows.push({
        userId,
        accountId: account.id,
        symbol,
        side,
        entryPrice,
        exitPrice,
        quantity: qty,
        entryTime,
        exitTime,
        fees: Math.round(fees * 100) / 100,
        pnl,
        strategyTag: STRATEGIES[Math.floor(rand() * STRATEGIES.length)],
        emotions: emo,
        notes: rand() < 0.25 ? "Sample trade — replace with your own imports." : null,
        source: "manual",
        isWin: pnl > 0,
      });
    }
  }

  await prisma.trade.createMany({ data: rows });

  // Give the user a starter rulebook so the discipline engine has something to grade.
  const hasBook = await prisma.ruleBook.count({ where: { userId } });
  if (hasBook === 0) {
    await prisma.ruleBook.create({
      data: {
        userId,
        name: "Starter Rulebook",
        description: "A few sensible defaults. Tune these to how you actually trade.",
        rules: {
          create: [
            {
              name: "Trade the open (09:30–11:30)",
              type: "time_window",
              severity: "medium",
              weight: 2,
              order: 0,
              config: JSON.stringify({ start: "09:30", end: "11:30", timezone: "America/New_York" }),
            },
            {
              name: "Max 3 contracts",
              type: "max_contracts",
              severity: "high",
              weight: 3,
              order: 1,
              config: JSON.stringify({ maxContracts: 3 }),
            },
            {
              name: "No more than 5 trades/day",
              type: "max_trades",
              severity: "medium",
              weight: 2,
              order: 2,
              config: JSON.stringify({ maxPerDay: 5 }),
            },
            {
              name: "No revenge trading",
              type: "behavioral",
              severity: "high",
              weight: 3,
              order: 3,
              config: JSON.stringify({ kind: "revenge_trading", withinMinutes: 5, threshold: 3, windowMinutes: 15 }),
            },
          ],
        },
      },
    });
  }

  // Recompute compliance/discipline/alerts for the new data.
  const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
  await recomputeUserCompliance(userId);

  return { created: rows.length, skipped: false, accountId: account.id };
}
