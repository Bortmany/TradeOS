// TradeOS — backtest engine fixture tests (candles, simulation, replay,
// result assembly). Run with: `tsx scripts/test-backtest.ts` (wired into
// `npm test`). Plain checks, exit 1 on any failure — same harness style as
// test-pairing.ts.

import { parseCandleCsv } from "../src/lib/backtest/candles";
import { runSimulation } from "../src/lib/backtest/simulate";
import { runReplay } from "../src/lib/backtest/replay";
import { assembleResults, downsampleEquity } from "../src/lib/backtest/results";
import { SimConfigSchema, type Candle, type ReplayConfig, type SimConfig, type TradeRecord } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const bar = (iso: string, o: number, h: number, l: number, c: number): Candle => ({
  t: Math.floor(Date.parse(iso) / 1000),
  o,
  h,
  l,
  c,
});

const simDefaults: Omit<SimConfig, "strategy"> = {
  kind: "simulation",
  datasetId: "test",
  direction: "both",
  contracts: 1,
  rangeMinutes: 15,
  fastPeriod: 9,
  slowPeriod: 21,
  maType: "sma",
  levelSide: "both",
  flattenAt: "15:55",
  feesPerSide: 0,
  slippageTicks: 0,
  tickSize: 0.25,
};

// ---------------------------------------------------------------------------
console.log("candle CSV parsing");
// ---------------------------------------------------------------------------
{
  // TradingView-style: unix seconds.
  const tv = parseCandleCsv(
    "time,open,high,low,close,volume\n1751808600,100,101,99,100.5,1200\n1751808900,100.5,102,100,101,900\n"
  );
  check("TradingView unix-time rows parse", tv.candles.length === 2 && tv.candles[0].o === 100);

  // ISO datetime rows.
  const iso = parseCandleCsv(
    "Date,Open,High,Low,Close\n2026-07-06T13:30:00Z,100,101,99,100.5\n2026-07-06T13:35:00Z,100.5,102,100,101\n"
  );
  check("ISO datetime rows parse", iso.candles.length === 2);

  // Bad rows are skipped and reported; duplicates deduped; out-of-order sorted.
  const messy = parseCandleCsv(
    "time,open,high,low,close\n1751808900,101,102,100,101.5\n1751808600,100,101,99,100.5\nnot-a-time,1,2,0,1\n1751808600,100,101,99,100.75\n"
  );
  check(
    "bad row skipped, duplicate deduped, sorted ascending",
    messy.candles.length === 2 &&
      messy.skipped === 1 &&
      messy.candles[0].t === 1751808600 &&
      messy.candles[0].c === 100.75, // last duplicate wins
    JSON.stringify(messy)
  );

  const semi = parseCandleCsv("time;open;high;low;close\n1;2;3;4;5\n");
  check("semicolon dialect gets a clear error", semi.candles.length === 0 && semi.errors.length > 0);

  const missing = parseCandleCsv("time,open,close\n1751808600,1,2\n");
  check("missing columns get a clear error", missing.candles.length === 0 && missing.errors.length > 0);
}

// ---------------------------------------------------------------------------
console.log("simulation: opening range breakout (ES, July = EDT)");
// ---------------------------------------------------------------------------
// 2026-07-06 is a Monday; 09:30 ET = 13:30 UTC in July.
{
  const day = [
    bar("2026-07-06T13:30:00Z", 100, 102, 99, 101), //   09:30 — range
    bar("2026-07-06T13:35:00Z", 101, 103, 100, 102), //  09:35 — range
    bar("2026-07-06T13:40:00Z", 102, 104, 101, 103), //  09:40 — range (high 104, low 99)
    bar("2026-07-06T13:45:00Z", 103, 105, 102, 104), //  09:45 — breaks 104 → long
    bar("2026-07-06T13:50:00Z", 104, 107.5, 103, 107), // 09:50 — target 107 hit
  ];

  const config: SimConfig = { ...simDefaults, strategy: "opening_range_breakout", stopPoints: 4, targetPoints: 3 };
  const trades = runSimulation(day, config, "ES");
  const t = trades[0];
  check("one breakout trade per day", trades.length === 1);
  check("long entry at the range high", t?.side === "long" && t?.entryPrice === 104, JSON.stringify(t));
  check("target exit at entry+3", t?.exitPrice === 107);
  check("pnl = 3pt × $50 (ES) − $0 fees = $150", t?.pnl === 150, String(t?.pnl));
  check(
    "entry stamped on the breakout bar",
    t?.entryTime.toISOString() === "2026-07-06T13:45:00.000Z"
  );

  // Both stop and target inside one bar → the stop fills first.
  const bothDay = [
    day[0],
    day[1],
    day[2],
    day[3], // long at 104, stop 100, target 107
    bar("2026-07-06T13:50:00Z", 104, 108, 99, 100), // both sides breached
  ];
  const both = runSimulation(bothDay, config, "ES");
  check("stop-before-target inside one bar", both[0]?.exitPrice === 100 && both[0]?.pnl === -200, JSON.stringify(both[0]));

  // A bar that gaps through the level fills at its open.
  const gapDay = [
    day[0],
    day[1],
    day[2],
    bar("2026-07-06T13:45:00Z", 106, 108, 105, 107), // opens above 104 → entry at 106
  ];
  const gap = runSimulation(gapDay, config, "ES");
  check("gap-open entry fills at the bar open", gap[0]?.entryPrice === 106, String(gap[0]?.entryPrice));

  // Adverse slippage on stop-style entries: 2 ticks × 0.25 = 0.5.
  const slipConfig: SimConfig = { ...config, slippageTicks: 2 };
  const slip = runSimulation(day, slipConfig, "ES");
  check("entry slippage is adverse (104 → 104.5)", slip[0]?.entryPrice === 104.5, String(slip[0]?.entryPrice));

  // Fees: $2.25/side × 2 sides × 1 contract = $4.50.
  const feeConfig: SimConfig = { ...config, feesPerSide: 2.25 };
  const fee = runSimulation(day, feeConfig, "ES");
  check("round-trip fees deducted", fee[0]?.pnl === 145.5 && fee[0]?.fees === 4.5, String(fee[0]?.pnl));

  // No bracket → flatten at the configured ET time.
  const flatDay = [
    ...day.slice(0, 4), // long at 104
    bar("2026-07-06T18:00:00Z", 105, 106, 104, 105.5), // 14:00 ET — holds
    bar("2026-07-06T19:55:00Z", 110, 111, 109, 110.5), // 15:55 ET — flatten at open
  ];
  const flatConfig: SimConfig = { ...simDefaults, strategy: "opening_range_breakout" };
  const flat = runSimulation(flatDay, flatConfig, "ES");
  check(
    "flatten time exits at that bar's open",
    flat[0]?.exitPrice === 110 &&
      flat[0]?.exitTime?.toISOString() === "2026-07-06T19:55:00.000Z",
    JSON.stringify(flat[0])
  );

  // Short-only direction takes the downside break.
  const downDay = [
    day[0],
    day[1],
    day[2], // range high 104, low 99
    bar("2026-07-06T13:45:00Z", 100, 101, 98, 98.5), // breaks 99 → short
  ];
  const shortOnly: SimConfig = { ...simDefaults, strategy: "opening_range_breakout", direction: "short" };
  const shorts = runSimulation(downDay, shortOnly, "ES");
  check("short-only takes the downside break", shorts[0]?.side === "short" && shorts[0]?.entryPrice === 99);

  // Winter (EST): same wall-clock shapes shifted to 14:30 UTC still work.
  const winterDay = [
    bar("2026-01-05T14:30:00Z", 100, 102, 99, 101),
    bar("2026-01-05T14:35:00Z", 101, 103, 100, 102),
    bar("2026-01-05T14:40:00Z", 102, 104, 101, 103),
    bar("2026-01-05T14:45:00Z", 103, 105, 102, 104),
    bar("2026-01-05T14:50:00Z", 104, 107.5, 103, 107),
  ];
  const winter = runSimulation(winterDay, config, "ES");
  check("DST: January (EST) day trades identically", winter.length === 1 && winter[0]?.entryPrice === 104);
}

// ---------------------------------------------------------------------------
console.log("simulation: MA cross and prev-day level");
// ---------------------------------------------------------------------------
{
  // SMA 2/3 over a series that dips then rips: cross up fires once.
  const base = "2026-07-06T";
  const closes = [10, 10, 10, 10, 20, 30, 30.5];
  const maDay = closes.map((c, i) =>
    bar(`${base}${String(14 + Math.floor(i / 12))}:${String((i % 12) * 5).padStart(2, "0")}:00Z`, c, c + 0.5, c - 0.5, c)
  );
  const maConfig: SimConfig = { ...simDefaults, strategy: "ma_cross", fastPeriod: 2, slowPeriod: 3, direction: "long" };
  const maTrades = runSimulation(maDay, maConfig, "FOO");
  check("ma_cross: one long from the upward cross", maTrades.length === 1 && maTrades[0]?.side === "long", JSON.stringify(maTrades));
  check(
    "ma_cross: entry at next bar open after the signal",
    maTrades[0]?.entryPrice === 30, // signal on the 20→30 bar close? cross confirms at index 4; entry at bar 5 open (30)
    String(maTrades[0]?.entryPrice)
  );
  check("ma_cross: dataset end closes at last close", maTrades[0]?.exitPrice === 30.5);

  // fast >= slow must throw (surfaced as a 400 by the API).
  let threw = false;
  try {
    runSimulation(maDay, { ...maConfig, fastPeriod: 3, slowPeriod: 3 }, "FOO");
  } catch {
    threw = true;
  }
  check("ma_cross: fast >= slow throws", threw);

  // prev_day_level: Tuesday breaks Monday's high.
  const pd = [
    bar("2026-07-06T13:30:00Z", 100, 110, 95, 105), // Monday range 90–110? high 110 low 95
    bar("2026-07-06T13:35:00Z", 105, 108, 90, 100), // Monday low 90
    bar("2026-07-07T13:30:00Z", 105, 111, 104, 110.5), // Tuesday breaks 110 → long at 110
  ];
  const pdConfig: SimConfig = { ...simDefaults, strategy: "prev_day_level", levelSide: "high" };
  const pdTrades = runSimulation(pd, pdConfig, "ES");
  check(
    "prev_day_level: long at yesterday's high",
    pdTrades.length === 1 && pdTrades[0]?.side === "long" && pdTrades[0]?.entryPrice === 110,
    JSON.stringify(pdTrades)
  );
  check("prev_day_level: no trade on the first day", pdTrades.every((t) => t.entryTime.getTime() >= Date.parse("2026-07-07T00:00:00Z")));
}

// ---------------------------------------------------------------------------
console.log("replay: filters and rulebook exclusion");
// ---------------------------------------------------------------------------
{
  let seq = 0;
  const trade = (over: Partial<TradeRecord>): TradeRecord => ({
    id: `t${++seq}`,
    userId: "u",
    accountId: "a1",
    symbol: "ES",
    side: "long",
    entryPrice: 100,
    exitPrice: 101,
    quantity: 1,
    entryTime: new Date("2026-07-06T13:30:00Z"), // 09:30 ET Monday (rth_am)
    exitTime: new Date("2026-07-06T14:30:00Z"),
    fees: 4,
    pnl: 46,
    strategyTag: "ORB",
    notes: null,
    emotions: null,
    tags: null,
    source: "manual",
    isWin: true,
    ...over,
  });

  const morningWinter = trade({ entryTime: new Date("2026-01-05T14:30:00Z"), exitTime: new Date("2026-01-05T15:00:00Z") }); // 09:30 ET in EST
  const lunch = trade({ entryTime: new Date("2026-07-06T16:15:00Z") }); // 12:15 ET
  const overnight = trade({ entryTime: new Date("2026-07-07T01:00:00Z") }); // 21:00 ET Monday
  const open = trade({ exitTime: null, exitPrice: null, pnl: 0 });
  const vwap = trade({ strategyTag: "VWAP Reclaim" });
  const oversized = trade({ quantity: 5, pnl: -120, isWin: false });
  const all = [trade({}), morningWinter, lunch, overnight, open, vwap, oversized];

  const sessionCfg: ReplayConfig = { kind: "replay", sessions: ["rth_am"] };
  const sessionOut = runReplay(all, sessionCfg, null);
  check(
    "session filter keeps 09:30 ET entries across DST (winter + summer)",
    sessionOut.variantTrades.length === 4 &&
      sessionOut.variantTrades.some((t) => t.id === morningWinter.id),
    `kept ${sessionOut.variantTrades.length}`
  );
  check("open trades never count", sessionOut.baselineTrades.every((t) => t.exitTime !== null));

  const weekdayCfg: ReplayConfig = { kind: "replay", weekdays: [2] }; // Tuesdays only
  const weekdayOut = runReplay(all, weekdayCfg, null);
  check("weekday filter uses the ET calendar", weekdayOut.variantTrades.length === 0, `kept ${weekdayOut.variantTrades.length}`);

  const tagCfg: ReplayConfig = { kind: "replay", strategyTags: ["VWAP Reclaim"] };
  const tagOut = runReplay(all, tagCfg, null);
  check("strategy-tag filter", tagOut.variantTrades.length === 1 && tagOut.variantTrades[0].id === vwap.id);

  const rules = [
    { id: "r1", name: "Max 2 contracts", type: "max_contracts" as const, severity: "high" as const, weight: 1, config: { maxContracts: 2 } },
  ];
  const ruleCfg: ReplayConfig = { kind: "replay", ruleBookId: "b1" };
  const ruleOut = runReplay(all, ruleCfg, rules, { scope: "all", scopeValue: null });
  check(
    "rulebook exclusion drops the oversized trade with its reason",
    ruleOut.variantTrades.every((t) => t.id !== oversized.id) &&
      ruleOut.exclusions.length === 1 &&
      ruleOut.exclusions[0].failedRules[0] === "Max 2 contracts",
    JSON.stringify(ruleOut.exclusions)
  );

  const scoped = runReplay(all, ruleCfg, rules, { scope: "strategy", scopeValue: "VWAP Reclaim" });
  check("out-of-scope trades pass through a scoped rulebook", scoped.exclusions.length === 0);

  const windowCfg: ReplayConfig = { kind: "replay", from: "2026-07-01", to: "2026-07-31" };
  const windowOut = runReplay(all, windowCfg, null);
  check(
    "date window bounds the baseline too",
    // July 1 ET midnight = 04:00Z (EDT); the January trade must fall out.
    windowOut.baselineTrades.every((t) => t.entryTime >= new Date("2026-07-01T04:00:00Z")) &&
      !windowOut.baselineTrades.some((t) => t.id === morningWinter.id)
  );

  // ET (not UTC) day boundaries: for a one-day window on 2026-07-06,
  // 20:30 ET the evening BEFORE (00:30Z on the 6th) is out, and 20:30 ET on
  // the To-date itself (00:30Z on the 7th) is in.
  const eve = trade({ entryTime: new Date("2026-07-06T00:30:00Z") });
  const lateNight = trade({ entryTime: new Date("2026-07-07T00:30:00Z") });
  const morning = trade({});
  const etWin: ReplayConfig = { kind: "replay", from: "2026-07-06", to: "2026-07-06" };
  const etOut = runReplay([eve, lateNight, morning], etWin, null);
  check(
    "ET date window: evening-before excluded, 20:30 ET on the To-date included",
    etOut.baselineTrades.length === 2 && !etOut.baselineTrades.some((t) => t.id === eve.id),
    JSON.stringify(etOut.baselineTrades.map((t) => t.id))
  );
}

// ---------------------------------------------------------------------------
console.log("result assembly: sanitization and caps");
// ---------------------------------------------------------------------------
{
  const winner: TradeRecord = {
    id: "w1",
    userId: "u",
    accountId: "a1",
    symbol: "ES",
    side: "long",
    entryPrice: 100,
    exitPrice: 102,
    quantity: 1,
    entryTime: new Date("2026-07-06T13:30:00Z"),
    exitTime: new Date("2026-07-06T14:00:00Z"),
    fees: 0,
    pnl: 100,
    strategyTag: null,
    notes: null,
    emotions: null,
    tags: null,
    source: "manual",
    isWin: true,
  };

  const res = assembleResults({ variant: [winner], baseline: null, exclusions: [] });
  check("profitFactor Infinity sanitized to null", res.variant.profitFactor === null);
  check("winRate survives sanitization", res.variant.winRate === 1);
  check("round-trips through JSON", JSON.parse(JSON.stringify(res)).variant.profitFactor === null);

  const empty = assembleResults({ variant: [], baseline: null, exclusions: [] });
  check("empty input yields zeroed metrics", empty.variant.netPnl === 0 && empty.tradeCountTotal === 0);

  const points = Array.from({ length: 5000 }, (_, i) => ({ time: i, value: i }));
  const down = downsampleEquity(points);
  check(
    "equity downsampled to ≤ 2000 points, final point kept",
    down.length <= 2000 && down[down.length - 1].value === 4999,
    `${down.length} points`
  );
  // 4000 points previously produced 2001 via the append-last bug.
  const pts4000 = Array.from({ length: 4000 }, (_, i) => ({ time: i, value: i }));
  const down4000 = downsampleEquity(pts4000);
  check(
    "downsample cap holds at the former off-by-one length",
    down4000.length <= 2000 && down4000[down4000.length - 1].value === 3999,
    `${down4000.length} points`
  );
}

// ---------------------------------------------------------------------------
console.log("regressions: review-confirmed engine fixes");
// ---------------------------------------------------------------------------
{
  // R1 — a same-bar exit after an intrabar entry must never use the bar's
  // pre-entry open. Range 90-100; the breakout bar OPENS at 93 (below the
  // stop 95) then rallies through 100: correct exit is the stop at 95.
  const r1day = [
    bar("2026-07-06T13:30:00Z", 95, 100, 90, 96),
    bar("2026-07-06T13:35:00Z", 96, 99, 92, 93),
    bar("2026-07-06T13:40:00Z", 93, 99.5, 91, 94),
    bar("2026-07-06T13:45:00Z", 93, 100.5, 92.8, 99), // entry long 100, stop 95
  ];
  const r1cfg: SimConfig = { ...simDefaults, strategy: "opening_range_breakout", stopPoints: 5 };
  const r1 = runSimulation(r1day, r1cfg, "ES");
  check(
    "same-bar entry exits at the stop (95), never the pre-entry open (93)",
    r1.length === 1 && r1[0]?.entryPrice === 100 && r1[0]?.exitPrice === 95 && r1[0]?.pnl === -250,
    JSON.stringify(r1[0])
  );

  // R2 — a prior-bar MA-cross exit acts at the bar's OPEN, before the
  // intrabar bracket: the acting bar both carries the signal and touches the
  // stop, and must exit at the open (100), then flip short there.
  const t0 = (i: number) => `2026-07-06T14:${String(i * 5).padStart(2, "0")}:00Z`;
  const r2day = [
    bar(t0(0), 100, 100.5, 99.5, 100),
    bar(t0(1), 100, 100.5, 99.5, 100),
    bar(t0(2), 100, 100.5, 99.5, 100),
    bar(t0(3), 100, 105.5, 99.5, 105), // cross up on this close
    bar(t0(4), 105, 105.5, 104.5, 105), // entry long at open 105 (stop 85)
    bar(t0(5), 105, 105.5, 94.5, 95), // cross down on this close (stop untouched)
    bar(t0(6), 100, 100.5, 84, 90), // acting bar: exit at open 100, flip short
  ];
  const r2cfg: SimConfig = {
    ...simDefaults,
    strategy: "ma_cross",
    fastPeriod: 2,
    slowPeriod: 3,
    stopPoints: 20,
  };
  const r2 = runSimulation(r2day, r2cfg, "ES");
  check(
    "signal exit fills at the open (−$250), not the intrabar stop (−$1000)",
    r2[0]?.entryPrice === 105 && r2[0]?.exitPrice === 100 && r2[0]?.pnl === -250,
    JSON.stringify(r2[0])
  );
  check(
    "flip short opens at the same bar's open and closes at day end",
    r2.length === 2 && r2[1]?.side === "short" && r2[1]?.entryPrice === 100 && r2[1]?.pnl === 500,
    JSON.stringify(r2[1])
  );

  // R3 — a bar that OPENS through the target while touching the stop intrabar
  // exits at the open (gap-through-target), not the stop.
  const r3day = [
    bar("2026-07-06T13:30:00Z", 99, 100, 98, 99.5),
    bar("2026-07-06T13:35:00Z", 99.5, 100, 98.5, 99),
    bar("2026-07-06T13:40:00Z", 99, 100, 98, 99.5), // range 98-100
    bar("2026-07-06T13:45:00Z", 99, 100.2, 98.8, 100), // entry long 100; holds
    bar("2026-07-06T13:50:00Z", 104, 104.5, 94, 95), // opens through target 103, touches stop 95
  ];
  const r3cfg: SimConfig = { ...simDefaults, strategy: "opening_range_breakout", stopPoints: 5, targetPoints: 3 };
  const r3 = runSimulation(r3day, r3cfg, "ES");
  check(
    "gap-through-target beats the intrabar stop-touch (exit 104)",
    r3[0]?.exitPrice === 104 && r3[0]?.pnl === 200,
    JSON.stringify(r3[0])
  );

  // R4 — zone-less timestamps are ET wall-clock, deterministically.
  const etCsv = parseCandleCsv(
    "time,open,high,low,close\n2026-01-05 09:30,100,101,99,100.5\n2026-07-06 09:30,100,101,99,100.5\n7/6/2026 10:00,100,101,99,100.5\n"
  );
  check(
    "zone-less winter timestamp = 09:30 ET = 14:30Z (EST)",
    etCsv.candles.some((c) => c.t === Date.parse("2026-01-05T14:30:00Z") / 1000)
  );
  check(
    "zone-less summer timestamp = 09:30 ET = 13:30Z (EDT)",
    etCsv.candles.some((c) => c.t === Date.parse("2026-07-06T13:30:00Z") / 1000)
  );
  check(
    "US-style zone-less timestamp is ET too",
    etCsv.candles.some((c) => c.t === Date.parse("2026-07-06T14:00:00Z") / 1000)
  );

  // R5 — hostile/broken rows can never reach storage: a 16-digit timestamp
  // (would become an Invalid Date) and a close above the high are skipped.
  const badRows = parseCandleCsv(
    "time,open,high,low,close\n9999999999999999,1,2,0.5,1\n1751808600,100,101,99,102\n1751808900,100,101,99,100.5\n"
  );
  check(
    "out-of-range timestamp and impossible OHLC rows are skipped",
    badRows.candles.length === 1 && badRows.skipped === 2,
    JSON.stringify(badRows)
  );

  // R6 — flattenAt accepts single-digit hours.
  check(
    'flattenAt accepts "9:30"',
    SimConfigSchema.safeParse({
      kind: "simulation",
      datasetId: "x",
      strategy: "opening_range_breakout",
      flattenAt: "9:30",
    }).success
  );
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} backtest check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll backtest checks passed.");
