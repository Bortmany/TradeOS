// TradeOS — deterministic seed script (Package D).
// Run with: `tsx prisma/seed.ts`.
//
// Standalone: talks to Prisma directly (no `@/lib/*` imports) except an optional
// dynamic import of the compliance recompute module at the very end.
// Idempotent: the demo user is deleted (cascading away its data) and recreated
// from scratch on every run. All generated values derive from a fixed-seed
// mulberry32 PRNG so output is fully reproducible; `new Date()` is used only to
// anchor "today" so the trailing-70-day window stays fresh.

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Candle, ReplayConfig, Side, SimConfig, TradeRecord, TradeSource } from "../src/lib/types";

const prisma = new PrismaClient();

// --------------------------------------------------------------------------
// Deterministic PRNG
// --------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x7ade05; // constant → reproducible
const rand = mulberry32(SEED);

const randInt = (min: number, max: number): number =>
  Math.floor(rand() * (max - min + 1)) + min;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const roundTick = (n: number, tick: number): number =>
  Math.round(n / tick) * tick;

// --------------------------------------------------------------------------
// Timezone helpers — construct instants that land on ET wall-clock times so
// the rule engine / session classifier (which read entryTime in ET) behave.
// --------------------------------------------------------------------------

const TZ = "America/New_York";
const DAY_MS = 86_400_000;

function etDateParts(date: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return { year: +map.year, month: +map.month, day: +map.day };
}

// Offset (ms) between the given instant and the same wall-clock read in `tz`.
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour === 24 ? 0 : +map.hour,
    +map.minute,
    +map.second
  );
  return asUTC - date.getTime();
}

// Turn an ET wall-clock (y, m, d, hh, mm) into the correct UTC instant.
function etWallToUtc(
  year: number,
  month: number,
  day: number,
  hh: number,
  mm: number
): Date {
  const naive = Date.UTC(year, month - 1, day, hh, mm, 0);
  const off = tzOffsetMs(new Date(naive));
  return new Date(naive - off);
}

// --------------------------------------------------------------------------
// Static reference data
// --------------------------------------------------------------------------

interface SymbolSpec {
  symbol: string;
  mult: number; // $ per full point
  tick: number;
  base: number; // approx price level
  vol: number; // entry-price jitter range
}

const SYMBOLS: readonly SymbolSpec[] = [
  { symbol: "ES", mult: 50, tick: 0.25, base: 5400, vol: 40 },
  { symbol: "MES", mult: 5, tick: 0.25, base: 5400, vol: 40 },
  { symbol: "NQ", mult: 20, tick: 0.25, base: 19000, vol: 150 },
  { symbol: "MNQ", mult: 2, tick: 0.25, base: 19000, vol: 150 },
];

const STRATEGIES = ["VWAP Reclaim", "ORB", "Trend Pullback", "Reversal"] as const;
const CALM_EMOTIONS = ["calm", "focused", "confident"] as const;
const TILT_EMOTIONS = ["fomo", "revenge", "greedy", "impatient", "fearful"] as const;

const NOTE_SAMPLES = [
  "Clean setup, followed the plan and let it run to target.",
  "Entered a touch early, managed it fine.",
  "Chased the move after missing the first entry — should have waited.",
  "Cut it at first sign of weakness, good risk control.",
  "News spike, scalped it quickly.",
  "Held through some heat, thesis stayed intact.",
  "Sized up on high-conviction A+ setup.",
  "Revenge entry after the prior stop-out — sloppy.",
  "Textbook VWAP reclaim, trailed the runner.",
  "Failed breakout, took the small loss and moved on.",
];

// --------------------------------------------------------------------------
// Trade generation
// --------------------------------------------------------------------------

function buildEntryTime(year: number, month: number, day: number): Date {
  // Minutes-from-midnight ET, clustered in the morning RTH session.
  const r = rand();
  let t: number;
  if (r < 0.7) {
    t = 570 + Math.floor(rand() * 120); // 09:30–11:30
  } else if (r < 0.9) {
    t = 690 + Math.floor(rand() * 150); // 11:30–14:00
  } else {
    t = 840 + Math.floor(rand() * 115); // 14:00–15:55
  }
  return etWallToUtc(year, month, day, Math.floor(t / 60), t % 60);
}

function buildEmotions(isWin: boolean): string {
  const tags: string[] = [pick(CALM_EMOTIONS)];
  // Losers more likely to carry an emotional tilt tag.
  const tiltChance = isWin ? 0.08 : 0.4;
  if (rand() < tiltChance) tags.push(pick(TILT_EMOTIONS));
  else if (rand() < 0.15) tags.push(pick(CALM_EMOTIONS));
  return Array.from(new Set(tags)).join(",");
}

function generateTrades(
  userId: string,
  accountIds: string[]
): Prisma.TradeCreateManyInput[] {
  const trades: Prisma.TradeCreateManyInput[] = [];
  const TARGET = 250;

  const todayEt = etDateParts(new Date());
  // Anchor at noon UTC so day arithmetic never slips a calendar date.
  const baseUtc = Date.UTC(todayEt.year, todayEt.month - 1, todayEt.day, 12, 0, 0);

  // Oldest day first (~70 calendar days back) → newest.
  for (let i = 70; i >= 0 && trades.length < TARGET; i--) {
    const dayDate = new Date(baseUtc - i * DAY_MS);
    const dow = dayDate.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    if (rand() < 0.12) continue; // some flat days

    const year = dayDate.getUTCFullYear();
    const month = dayDate.getUTCMonth() + 1;
    const day = dayDate.getUTCDate();

    // A trader typically works one account per day.
    const accountId = pick(accountIds);
    const dayCount = randInt(3, 8);

    for (let n = 0; n < dayCount && trades.length < TARGET; n++) {
      const spec = pick(SYMBOLS);
      const side = rand() < 0.5 ? "long" : "short";
      const quantity = randInt(1, 4);
      const perPoint = spec.mult * quantity;

      // ~53% gross winners; winners average bigger than losers.
      const win = rand() < 0.53;
      const dollarsGross = win ? 60 + rand() * 340 : -(50 + rand() * 230);

      // Convert target $ into a tick-aligned price move.
      const points = roundTick(dollarsGross / perPoint, spec.tick);
      const entryPrice = roundTick(
        spec.base + (rand() - 0.5) * 2 * spec.vol,
        spec.tick
      );
      const exitPrice =
        side === "long"
          ? roundTick(entryPrice + points, spec.tick)
          : roundTick(entryPrice - points, spec.tick);

      const fees = round2(quantity * (2 + rand() * 3)); // ~$2–5/contract RT
      const grossPnl = round2(points * perPoint);
      const pnl = round2(grossPnl - fees);
      const isWin = pnl > 0;

      const entryTime = buildEntryTime(year, month, day);
      const holdMin = 3 + Math.floor(rand() * 117);
      const exitTime = new Date(entryTime.getTime() + holdMin * 60_000);

      trades.push({
        userId,
        accountId,
        symbol: spec.symbol,
        side,
        entryPrice,
        exitPrice,
        quantity,
        entryTime,
        exitTime,
        fees,
        pnl,
        pnlGross: grossPnl,
        strategyTag: pick(STRATEGIES),
        notes: rand() < 0.3 ? pick(NOTE_SAMPLES) : null,
        emotions: buildEmotions(isWin),
        source: "manual",
        isWin,
        violationCount: 0,
      });
    }
  }

  return trades;
}

// --------------------------------------------------------------------------
// Market-data generation (for the demo backtesting dataset)
// --------------------------------------------------------------------------

// Synthetic ES 5-minute RTH candles over the trailing ~30 weekdays: a bounded,
// tick-aligned random walk. A SEPARATE PRNG instance keeps the shared `rand`
// sequence untouched so all previously seeded data stays byte-identical.
function generateCandles(next: () => number): Candle[] {
  const candles: Candle[] = [];
  const tick = 0.25;
  let price = 5400;

  const todayEt = etDateParts(new Date());
  const baseUtc = Date.UTC(todayEt.year, todayEt.month - 1, todayEt.day, 12, 0, 0);

  // Oldest day first (~44 calendar days back ≈ 30 weekdays) → newest.
  for (let i = 44; i >= 0; i--) {
    const dayDate = new Date(baseUtc - i * DAY_MS);
    const dow = dayDate.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const year = dayDate.getUTCFullYear();
    const month = dayDate.getUTCMonth() + 1;
    const day = dayDate.getUTCDate();

    // Small overnight gap, then 78 five-minute bars from 09:30 to 15:55 ET.
    price = roundTick(price + (next() - 0.5) * 12, tick);
    const dayDrift = (next() - 0.5) * 0.6; // mild directional bias per day
    for (let bar = 0; bar < 78; bar++) {
      const minutes = 570 + bar * 5;
      const t = Math.floor(
        etWallToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60).getTime() / 1000
      );
      const o = price;
      const c = roundTick(o + dayDrift + (next() - 0.5) * 4, tick);
      const wiggleHi = next() * 1.5;
      const wiggleLo = next() * 1.5;
      const h = roundTick(Math.max(o, c) + wiggleHi, tick);
      const l = roundTick(Math.min(o, c) - wiggleLo, tick);
      candles.push({ t, o, h, l, c, v: 500 + Math.floor(next() * 4500) });
      price = c;
    }
    // Keep the walk anchored near the base so prices stay realistic.
    price = roundTick(price + (5400 - price) * 0.05, tick);
  }

  return candles;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const email = "demo@tradeos.app";

  // Idempotent reset — cascades remove all owned rows.
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: "Demo Trader",
      timezone: TZ,
      plan: "pro",
      billingStatus: "active",
    },
  });

  // --- Trading accounts -------------------------------------------------
  const topstep = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      name: "Topstep 50K",
      broker: "topstepx",
      kind: "funded",
      startingBalance: 50000,
      color: "#5b8def",
    },
  });
  const apex = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      name: "Apex 100K",
      broker: "generic",
      kind: "evaluation",
      startingBalance: 100000,
      color: "#e0a458",
    },
  });
  const ibkr = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      name: "Live IBKR",
      broker: "ibkr",
      kind: "live",
      startingBalance: 25000,
      color: "#4fbf8b",
    },
  });
  const accountIds = [topstep.id, apex.id, ibkr.id];

  // --- Trades -----------------------------------------------------------
  const trades = generateTrades(user.id, accountIds);
  await prisma.trade.createMany({ data: trades });

  // --- Rulebooks & rules ------------------------------------------------
  const intraday = await prisma.ruleBook.create({
    data: {
      userId: user.id,
      name: "Intraday Discipline",
      description: "Core intraday risk & timing guardrails.",
      scope: "all",
      rules: {
        create: [
          {
            name: "Morning trading window",
            type: "time_window",
            severity: "medium",
            weight: 2,
            order: 1,
            config: JSON.stringify({
              start: "09:30",
              end: "11:30",
              timezone: TZ,
            }),
          },
          {
            name: "Max daily loss",
            type: "max_daily_loss",
            severity: "high",
            weight: 3,
            order: 2,
            config: JSON.stringify({ maxDailyLoss: 1000 }),
          },
          {
            name: "Max contracts per trade",
            type: "max_contracts",
            severity: "medium",
            weight: 2,
            order: 3,
            config: JSON.stringify({ maxContracts: 3 }),
          },
          {
            name: "Max trades per day",
            type: "max_trades",
            severity: "low",
            weight: 1,
            order: 4,
            config: JSON.stringify({ maxPerDay: 5 }),
          },
          {
            name: "No revenge trading",
            type: "behavioral",
            severity: "high",
            weight: 3,
            order: 5,
            config: JSON.stringify({
              kind: "revenge_trading",
              withinMinutes: 5,
              threshold: 3,
              windowMinutes: 15,
            }),
          },
        ],
      },
    },
  });

  const setupQuality = await prisma.ruleBook.create({
    data: {
      userId: user.id,
      name: "Setup Quality",
      description: "Every trade must be a documented, tagged setup.",
      scope: "all",
      rules: {
        create: [
          {
            name: "Documented setup",
            type: "setup_validation",
            severity: "medium",
            weight: 2,
            order: 1,
            config: JSON.stringify({
              requireStrategyTag: true,
              requireNotes: true,
              requireScreenshot: false,
            }),
          },
        ],
      },
    },
  });

  // --- Prop account (linked to Topstep) ---------------------------------
  await prisma.propAccount.create({
    data: {
      userId: user.id,
      accountId: topstep.id,
      firm: "topstep",
      presetName: "Topstep 50K",
      accountSize: 50000,
      profitTarget: 3000,
      maxDailyLoss: 1000,
      maxDrawdown: 2000,
      drawdownType: "trailing",
      minTradingDays: 5,
      consistencyPct: 0.5,
      phase: "evaluation",
    },
  });

  // --- Alerts -----------------------------------------------------------
  await prisma.alert.createMany({
    data: [
      {
        userId: user.id,
        accountId: topstep.id,
        type: "daily_loss_limit",
        severity: "high",
        title: "Daily loss limit approaching",
        message: "You are within $150 of your $1,000 daily loss limit on Topstep 50K.",
        status: "open",
        meta: JSON.stringify({ limit: 1000, remaining: 150 }),
      },
      {
        userId: user.id,
        accountId: apex.id,
        type: "overtrading",
        severity: "medium",
        title: "Overtrading detected",
        message: "8 trades in the last 15 minutes on Apex 100K exceeds your threshold.",
        status: "open",
        meta: JSON.stringify({ windowMinutes: 15, count: 8, threshold: 3 }),
      },
      {
        userId: user.id,
        accountId: ibkr.id,
        type: "drawdown",
        severity: "high",
        title: "Trailing drawdown warning",
        message: "Live IBKR equity is nearing its trailing drawdown floor.",
        status: "open",
        meta: JSON.stringify({ drawdownType: "trailing", buffer: 420 }),
      },
      {
        userId: user.id,
        accountId: topstep.id,
        type: "profit_target",
        severity: "low",
        title: "Profit target in sight",
        message: "You are 68% of the way to the $3,000 Topstep profit target.",
        status: "open",
        meta: JSON.stringify({ target: 3000, progressPct: 0.68 }),
      },
    ],
  });

  // --- Backtesting: demo dataset + two recorded example runs ------------
  // Computed with the real engines so the seeded portal shows honest numbers.
  const candleRand = mulberry32(0x5eedca); // separate PRNG — see generateCandles
  const candles = generateCandles(candleRand);
  const dataset = await prisma.marketDataset.create({
    data: {
      userId: user.id,
      name: "ES 5-minute (synthetic demo)",
      symbol: "ES",
      timeframe: "5m",
      candleCount: candles.length,
      firstTime: new Date(candles[0].t * 1000),
      lastTime: new Date(candles[candles.length - 1].t * 1000),
      candles: JSON.stringify(candles),
      source: "seed",
    },
  });

  let backtestCount = 0;
  try {
    const { runSimulation } = await import("../src/lib/backtest/simulate");
    const { runReplay } = await import("../src/lib/backtest/replay");
    const { assembleResults } = await import("../src/lib/backtest/results");

    // Example 1: ORB 15m simulation on the demo dataset.
    const simConfig: SimConfig = {
      kind: "simulation",
      datasetId: dataset.id,
      strategy: "opening_range_breakout",
      direction: "both",
      contracts: 1,
      stopPoints: 8,
      targetPoints: 12,
      rangeMinutes: 15,
      fastPeriod: 9,
      slowPeriod: 21,
      maType: "sma",
      levelSide: "both",
      flattenAt: "15:55",
      feesPerSide: 2.25,
      slippageTicks: 1,
      tickSize: 0.25,
    };
    const simTrades = runSimulation(candles, simConfig, "ES");
    await prisma.backtestRun.create({
      data: {
        userId: user.id,
        name: "ORB 15-minute on ES",
        kind: "simulation",
        status: "completed",
        config: JSON.stringify(simConfig),
        results: JSON.stringify(
          assembleResults({ variant: simTrades, baseline: null, exclusions: [] })
        ),
        notes: "Demo run — opening range breakout with an 8pt stop / 12pt target bracket.",
        datasetId: dataset.id,
      },
    });
    backtestCount++;

    // Example 2: replay — VWAP Reclaim, mornings only, skipping trades that
    // broke the Intraday Discipline rulebook.
    const tradeRecords: TradeRecord[] = trades.map((t, i) => ({
      id: `seed-${i}`,
      userId: user.id,
      accountId: t.accountId,
      symbol: t.symbol,
      side: t.side as Side,
      entryPrice: t.entryPrice,
      exitPrice: (t.exitPrice as number | null) ?? null,
      quantity: t.quantity,
      entryTime: t.entryTime as Date,
      exitTime: (t.exitTime as Date | null) ?? null,
      fees: t.fees ?? 0,
      pnl: t.pnl ?? 0,
      pnlGross: (t.pnlGross as number | null) ?? null,
      strategyTag: t.strategyTag ?? null,
      notes: t.notes ?? null,
      emotions: t.emotions ?? null,
      tags: null,
      source: (t.source ?? "manual") as TradeSource,
      externalId: null,
      isWin: t.isWin ?? null,
    }));
    const ruleRows = await prisma.rule.findMany({
      where: { ruleBookId: intraday.id, isActive: true },
      orderBy: { order: "asc" },
    });
    const replayConfig: ReplayConfig = {
      kind: "replay",
      strategyTags: ["VWAP Reclaim"],
      sessions: ["rth_am"],
      ruleBookId: intraday.id,
    };
    const outcome = runReplay(
      tradeRecords,
      replayConfig,
      ruleRows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as never,
        severity: r.severity as never,
        weight: r.weight,
        config: JSON.parse(r.config),
      })),
      { scope: intraday.scope, scopeValue: intraday.scopeValue }
    );
    await prisma.backtestRun.create({
      data: {
        userId: user.id,
        name: "VWAP Reclaim, mornings only",
        kind: "replay",
        status: "completed",
        config: JSON.stringify(replayConfig),
        results: JSON.stringify(
          assembleResults({
            variant: outcome.variantTrades,
            baseline: outcome.baselineTrades,
            exclusions: outcome.exclusions,
          })
        ),
        notes:
          "Demo run — what the journal would look like trading only morning VWAP reclaims that pass the Intraday Discipline rules.",
      },
    });
    backtestCount++;
  } catch (e) {
    console.warn("backtest examples skipped:", (e as Error).message);
  }

  // --- Compliance recompute (module may not exist yet) ------------------
  try {
    const { recomputeUserCompliance } = await import("../src/lib/rules/recompute");
    await recomputeUserCompliance(user.id);
  } catch (e) {
    console.warn("recompute skipped:", (e as Error).message);
  }

  // --- Summary ----------------------------------------------------------
  const wins = trades.filter((t) => t.isWin).length;
  const winRate = ((wins / trades.length) * 100).toFixed(1);
  console.log("Seed complete:");
  console.log(`  user:      ${user.email} (${user.id})`);
  console.log(`  accounts:  3 (${[topstep.name, apex.name, ibkr.name].join(", ")})`);
  console.log(`  trades:    ${trades.length} (${winRate}% net win rate)`);
  console.log(`  rulebooks: 2 (${intraday.name}, ${setupQuality.name}) / 6 rules`);
  console.log(`  prop:      1 (Topstep 50K evaluation)`);
  console.log(`  alerts:    4 open`);
  console.log(`  backtests: ${backtestCount} recorded (+ 1 demo market dataset, ${candles.length} candles)`);
}

async function run(): Promise<void> {
  let exitCode = 0;
  try {
    await main();
  } catch (e) {
    console.error("Seed failed:", e);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
  process.exit(exitCode);
}

void run();
