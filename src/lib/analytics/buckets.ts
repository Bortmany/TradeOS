// TradeOS — Analytics: performance bucketing.
// Pure, deterministic grouping of closed trades into performance buckets
// (by ET hour, weekday, trading session, strategy, symbol).
//
// All time-of-day / weekday logic interprets `entryTime` in America/New_York
// via Intl.DateTimeFormat so results are independent of the server's timezone.

import type { BucketPerformance, TradeRecord } from "@/lib/types";

// --------------------------------------------------------------------------
// ET time extraction (deterministic, timezone-independent)
// --------------------------------------------------------------------------

const ET_TIME_ZONE = "America/New_York";

// Cached formatter — reused across calls (constructing Intl formatters is costly).
const etParts = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  hour12: false,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_LABEL: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

interface EtClock {
  hour: number; // 0..23 in ET
  minute: number; // 0..59 in ET
  weekday: number; // 0=Sun .. 6=Sat in ET
  minutesOfDay: number; // hour*60 + minute
}

function etClock(date: Date): EtClock {
  const parts = etParts.formatToParts(date);
  let hour = 0;
  let minute = 0;
  let weekday = 0;
  for (const p of parts) {
    if (p.type === "hour") {
      // Intl may emit "24" for midnight under hour12:false — normalize to 0.
      hour = parseInt(p.value, 10) % 24;
    } else if (p.type === "minute") {
      minute = parseInt(p.value, 10);
    } else if (p.type === "weekday") {
      weekday = WEEKDAY_INDEX[p.value] ?? 0;
    }
  }
  return { hour, minute, weekday, minutesOfDay: hour * 60 + minute };
}

// --------------------------------------------------------------------------
// Session classification (US futures, times in America/New_York)
// --------------------------------------------------------------------------

const SESSION_LABEL: Record<string, string> = {
  pre: "Pre",
  rth_am: "RTH AM",
  lunch: "Lunch",
  rth_pm: "RTH PM",
  post: "Post",
  overnight: "Overnight",
};

// Session boundaries in ET minutes-of-day.
const T_04_00 = 4 * 60; // 240
const T_09_30 = 9 * 60 + 30; // 570
const T_12_00 = 12 * 60; // 720
const T_13_00 = 13 * 60; // 780
const T_16_00 = 16 * 60; // 960
const T_20_00 = 20 * 60; // 1200

/**
 * Classify the trading session for an entry time (interpreted in ET).
 * Returns the canonical session key: pre | rth_am | lunch | rth_pm | post | overnight.
 */
export function classifySession(entryTime: Date): string {
  const { minutesOfDay: m } = etClock(entryTime);
  if (m >= T_04_00 && m < T_09_30) return "pre";
  if (m >= T_09_30 && m < T_12_00) return "rth_am";
  if (m >= T_12_00 && m < T_13_00) return "lunch";
  if (m >= T_13_00 && m < T_16_00) return "rth_pm";
  if (m >= T_16_00 && m < T_20_00) return "post";
  return "overnight";
}

// --------------------------------------------------------------------------
// Generic bucketing helper
// --------------------------------------------------------------------------

function isClosed(t: TradeRecord): boolean {
  return t.exitTime !== null;
}

interface Accumulator {
  key: string;
  order: number; // deterministic sort key
  netPnl: number;
  tradeCount: number;
  winCount: number;
}

/**
 * Groups closed trades by a derived key and folds them into BucketPerformance.
 * `keyFor` returns { key, order } — buckets are emitted sorted by `order`.
 * Wins are counted by pnl > 0 (matching realized-metric semantics).
 */
function bucketBy(
  trades: TradeRecord[],
  keyFor: (t: TradeRecord) => { key: string; order: number } | null
): BucketPerformance[] {
  const map = new Map<string, Accumulator>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const derived = keyFor(t);
    if (derived === null) continue;
    let acc = map.get(derived.key);
    if (acc === undefined) {
      acc = {
        key: derived.key,
        order: derived.order,
        netPnl: 0,
        tradeCount: 0,
        winCount: 0,
      };
      map.set(derived.key, acc);
    }
    acc.netPnl += t.pnl;
    acc.tradeCount += 1;
    if (t.pnl > 0) acc.winCount += 1;
  }

  return Array.from(map.values())
    .sort((a, b) => (a.order === b.order ? a.key.localeCompare(b.key) : a.order - b.order))
    .map((acc) => ({
      key: acc.key,
      netPnl: acc.netPnl,
      tradeCount: acc.tradeCount,
      winRate: acc.tradeCount > 0 ? acc.winCount / acc.tradeCount : 0,
    }));
}

// --------------------------------------------------------------------------
// Public bucketers
// --------------------------------------------------------------------------

/** Group by ET hour-of-day. Keys formatted "HH:00" (e.g. "09:00"). */
export function byHourOfDay(trades: TradeRecord[]): BucketPerformance[] {
  return bucketBy(trades, (t) => {
    const { hour } = etClock(t.entryTime);
    const key = `${String(hour).padStart(2, "0")}:00`;
    return { key, order: hour };
  });
}

/** Group by ET weekday. Keys are full weekday names, ordered Monday..Sunday. */
export function byWeekday(trades: TradeRecord[]): BucketPerformance[] {
  return bucketBy(trades, (t) => {
    const { weekday } = etClock(t.entryTime);
    // Order Monday(1)..Saturday(6) first, Sunday(0) last.
    const order = weekday === 0 ? 7 : weekday;
    return { key: WEEKDAY_LABEL[weekday], order };
  });
}

/** Group by trading session, ordered pre → overnight, with display labels. */
export function bySession(trades: TradeRecord[]): BucketPerformance[] {
  const SESSION_ORDER: Record<string, number> = {
    pre: 0,
    rth_am: 1,
    lunch: 2,
    rth_pm: 3,
    post: 4,
    overnight: 5,
  };
  return bucketBy(trades, (t) => {
    const session = classifySession(t.entryTime);
    return { key: SESSION_LABEL[session], order: SESSION_ORDER[session] ?? 99 };
  });
}

/** Group by strategy tag. Trades without a strategy tag bucket into "Untagged". */
export function byStrategy(trades: TradeRecord[]): BucketPerformance[] {
  return bucketBy(trades, (t) => {
    const key = t.strategyTag && t.strategyTag.trim() !== "" ? t.strategyTag.trim() : "Untagged";
    // Alphabetical ordering (order held constant, tie-break on key).
    return { key, order: 0 };
  });
}

/** Group by symbol. */
export function bySymbol(trades: TradeRecord[]): BucketPerformance[] {
  return bucketBy(trades, (t) => ({ key: t.symbol, order: 0 }));
}
