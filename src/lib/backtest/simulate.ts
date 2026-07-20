// TradeOS — Backtesting: candle-driven strategy simulation.
// Pure, deterministic, DB-free. Walks a candle series chronologically with at
// most one open position, fires entries per the configured strategy spec, and
// emits every round trip as a closed TradeRecord — so all existing analytics
// (metrics, equity curve, bucketing) apply to simulated results unchanged.
//
// Fill model (deliberately conservative, in this order within a bar):
//   1. gap: a bar that OPENS at/through a level fills at the open price —
//      checked for BOTH legs before any intrabar leg, because the open
//      precedes all intrabar movement. On the bar an intrabar entry fills,
//      the gap branches are skipped entirely (the open happened BEFORE the
//      entry) — only intrabar legs can exit that bar.
//   2. stop leg (worst case first when both stop and target sit inside a bar)
//   3. target leg
// Prior-bar MA-cross signals act at a bar's OPEN and are therefore processed
// before that bar's bracket exits. Slippage (`slippageTicks × tickSize`) is
// applied adversely on entries and protective stops; target fills are
// limit-style and take none. Bars are the resolution limit: all fills
// timestamp at the bar.

import type { Candle, SimConfig, TradeRecord, Side } from "@/lib/types";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import { etClock, etDayKey, hmToMinutes } from "./time";
import { SIM_STRATEGY_LABELS } from "./labels";

const RTH_OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface OpenPosition {
  side: Side;
  entryPrice: number;
  entryTime: Date;
  stopPrice: number | null;
  targetPrice: number | null;
}

interface DayBars {
  key: string; // ET day key
  bars: Candle[];
  high: number;
  low: number;
}

export function runSimulation(
  candles: Candle[],
  config: SimConfig,
  symbol: string
): TradeRecord[] {
  if (candles.length === 0) return [];
  if (config.strategy === "ma_cross" && config.fastPeriod >= config.slowPeriod) {
    throw new Error("The fast MA period must be smaller than the slow MA period.");
  }

  // Defensive: the walk assumes chronological bars.
  const series = [...candles].sort((a, b) => a.t - b.t);

  const mult = pointMultiplier(symbol);
  const slip = config.slippageTicks * config.tickSize;
  const flattenMinutes = hmToMinutes(config.flattenAt);
  const strategyTag = SIM_STRATEGY_LABELS[config.strategy];
  const fees = round2(config.feesPerSide * 2 * config.contracts);

  // Group bars into ET trading days, preserving order.
  const days: DayBars[] = [];
  for (const bar of series) {
    const key = etDayKey(new Date(bar.t * 1000));
    const day = days[days.length - 1];
    if (day && day.key === key) {
      day.bars.push(bar);
      day.high = Math.max(day.high, bar.h);
      day.low = Math.min(day.low, bar.l);
    } else {
      days.push({ key, bars: [bar], high: bar.h, low: bar.l });
    }
  }

  // ma_cross signals are computed once over the continuous close series.
  const maSignals =
    config.strategy === "ma_cross" ? computeCrossSignals(series, config) : null;
  let barIndex = 0; // global index into `series`, kept in sync with the walk

  const trades: TradeRecord[] = [];
  let position: OpenPosition | null = null;

  const allowLong = config.direction !== "short";
  const allowShort = config.direction !== "long";

  const closeTrade = (pos: OpenPosition, exitPrice: number, exitTime: Date): void => {
    const points =
      pos.side === "long" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const gross = round2(points * config.contracts * mult);
    const pnl = round2(gross - fees);
    trades.push({
      id: `sim-${String(trades.length + 1).padStart(4, "0")}`,
      userId: "sim",
      accountId: "sim",
      symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice,
      quantity: config.contracts,
      entryTime: pos.entryTime,
      exitTime,
      fees,
      pnl,
      pnlGross: gross,
      strategyTag,
      notes: null,
      emotions: null,
      tags: null,
      source: "manual",
      externalId: null,
      isWin: pnl > 0,
    });
  };

  const openPosition = (side: Side, entryPrice: number, entryTime: Date): OpenPosition => ({
    side,
    entryPrice,
    entryTime,
    stopPrice:
      config.stopPoints != null
        ? side === "long"
          ? entryPrice - config.stopPoints
          : entryPrice + config.stopPoints
        : null,
    targetPrice:
      config.targetPoints != null
        ? side === "long"
          ? entryPrice + config.targetPoints
          : entryPrice - config.targetPoints
        : null,
  });

  // Fill price for a resting stop-style entry order within a bar, or null.
  // Longs buy a break UP through the level, shorts sell a break DOWN — adverse
  // slippage moves the fill against the position.
  const entryFill = (side: Side, level: number, bar: Candle): number | null => {
    if (side === "long") {
      if (bar.o >= level) return bar.o + slip; // gapped through — fill at open
      if (bar.h >= level) return level + slip;
      return null;
    }
    if (bar.o <= level) return bar.o - slip;
    if (bar.l <= level) return level - slip;
    return null;
  };

  // Exit price for the position within a bar, or null. Gap-open branches for
  // BOTH legs come first (the open precedes intrabar movement), then the
  // intrabar stop, then the target. `sameBarAsEntry` skips the gap branches:
  // on the entry bar the open happened before the entry existed.
  const exitFill = (pos: OpenPosition, bar: Candle, sameBarAsEntry: boolean): number | null => {
    if (pos.side === "long") {
      if (!sameBarAsEntry) {
        if (pos.stopPrice != null && bar.o <= pos.stopPrice) return bar.o - slip;
        if (pos.targetPrice != null && bar.o >= pos.targetPrice) return bar.o;
      }
      if (pos.stopPrice != null && bar.l <= pos.stopPrice) return pos.stopPrice - slip;
      if (pos.targetPrice != null && bar.h >= pos.targetPrice) return pos.targetPrice;
      return null;
    }
    if (!sameBarAsEntry) {
      if (pos.stopPrice != null && bar.o >= pos.stopPrice) return bar.o + slip;
      if (pos.targetPrice != null && bar.o <= pos.targetPrice) return bar.o;
    }
    if (pos.stopPrice != null && bar.h >= pos.stopPrice) return pos.stopPrice + slip;
    if (pos.targetPrice != null && bar.l <= pos.targetPrice) return pos.targetPrice;
    return null;
  };

  // Pick the first-hit side when both break levels sit inside one bar: the
  // level closer to the bar's open is assumed hit first (ties go short).
  const pickBreakout = (
    bar: Candle,
    longLevel: number | null,
    shortLevel: number | null
  ): { side: Side; price: number } | null => {
    const longPrice = longLevel !== null ? entryFill("long", longLevel, bar) : null;
    const shortPrice = shortLevel !== null ? entryFill("short", shortLevel, bar) : null;
    if (longPrice !== null && shortPrice !== null && longLevel !== null && shortLevel !== null) {
      return bar.o - shortLevel <= longLevel - bar.o
        ? { side: "short", price: shortPrice }
        : { side: "long", price: longPrice };
    }
    if (longPrice !== null) return { side: "long", price: longPrice };
    if (shortPrice !== null) return { side: "short", price: shortPrice };
    return null;
  };

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const prevDay = d > 0 ? days[d - 1] : null;

    // Per-day strategy state.
    let rangeHigh: number | null = null;
    let rangeLow: number | null = null;
    let tradedToday = false;

    for (const bar of day.bars) {
      const barTime = new Date(bar.t * 1000);
      const { minutes } = etClock(barTime);
      let openedThisBar = false;

      // 1) Flatten time: exit at this bar's open; no further entries today.
      if (position !== null && minutes >= flattenMinutes) {
        closeTrade(position, bar.o, barTime);
        position = null;
      }

      // 2) ma_cross: a signal on the previous bar's close acts at THIS bar's
      //    open — before any intrabar movement, so before bracket exits. An
      //    opposite cross exits at the open, then (direction allowing) flips.
      if (maSignals !== null && minutes < flattenMinutes) {
        const signal = barIndex > 0 ? maSignals[barIndex - 1] : 0;
        if (signal !== 0) {
          if (
            position !== null &&
            ((position.side === "long" && signal < 0) ||
              (position.side === "short" && signal > 0))
          ) {
            closeTrade(position, bar.o, barTime);
            position = null;
          }
          if (position === null) {
            if (signal > 0 && allowLong) {
              position = openPosition("long", bar.o + slip, barTime);
              openedThisBar = true;
            } else if (signal < 0 && allowShort) {
              position = openPosition("short", bar.o - slip, barTime);
              openedThisBar = true;
            }
            // Same-bar protective exits (intrabar legs only, stop first).
            if (position !== null) {
              const exit = exitFill(position, bar, true);
              if (exit !== null) {
                closeTrade(position, exit, barTime);
                position = null;
              }
            }
          }
        }
      }

      // 3) Manage a carried position's bracket exits.
      if (position !== null && !openedThisBar) {
        const exit = exitFill(position, bar, false);
        if (exit !== null) {
          closeTrade(position, exit, barTime);
          position = null;
        }
      }

      // 4) opening_range_breakout: build the range, then trade the first break.
      if (config.strategy === "opening_range_breakout") {
        const inRange =
          minutes >= RTH_OPEN_MINUTES && minutes < RTH_OPEN_MINUTES + config.rangeMinutes;
        if (inRange) {
          rangeHigh = rangeHigh === null ? bar.h : Math.max(rangeHigh, bar.h);
          rangeLow = rangeLow === null ? bar.l : Math.min(rangeLow, bar.l);
        }
        const rangeDone =
          !inRange &&
          minutes >= RTH_OPEN_MINUTES + config.rangeMinutes &&
          rangeHigh !== null &&
          rangeLow !== null;

        if (rangeDone && !tradedToday && position === null && minutes < flattenMinutes) {
          const fill = pickBreakout(
            bar,
            allowLong ? rangeHigh : null,
            allowShort ? rangeLow : null
          );
          if (fill !== null) {
            tradedToday = true;
            position = openPosition(fill.side, fill.price, barTime);
            const exit = exitFill(position, bar, true);
            if (exit !== null) {
              closeTrade(position, exit, barTime);
              position = null;
            }
          }
        }
      }

      // 5) prev_day_level: trade the first break of yesterday's high/low.
      if (
        config.strategy === "prev_day_level" &&
        prevDay !== null &&
        !tradedToday &&
        position === null &&
        minutes < flattenMinutes
      ) {
        const fill = pickBreakout(
          bar,
          config.levelSide !== "low" && allowLong ? prevDay.high : null,
          config.levelSide !== "high" && allowShort ? prevDay.low : null
        );
        if (fill !== null) {
          tradedToday = true;
          position = openPosition(fill.side, fill.price, barTime);
          const exit = exitFill(position, bar, true);
          if (exit !== null) {
            closeTrade(position, exit, barTime);
            position = null;
          }
        }
      }

      barIndex++;
    }

    // End of day: a position that survived past the last bar (e.g. flattenAt
    // later than the data) is closed at the day's final close.
    if (position !== null) {
      const lastBar = day.bars[day.bars.length - 1];
      closeTrade(position, lastBar.c, new Date(lastBar.t * 1000));
      position = null;
    }
  }

  return trades;
}

// --------------------------------------------------------------------------
// Moving-average cross signals
// --------------------------------------------------------------------------

/**
 * Per-bar signal series over the continuous close prices:
 * +1 = fast crossed above slow at this bar's close, -1 = crossed below, 0 = none.
 * The walk acts on a signal at the NEXT bar's open.
 */
function computeCrossSignals(candles: Candle[], config: SimConfig): number[] {
  const closes = candles.map((c) => c.c);
  const fast = movingAverage(closes, config.fastPeriod, config.maType);
  const slow = movingAverage(closes, config.slowPeriod, config.maType);
  const signals = new Array<number>(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const f0 = fast[i - 1];
    const s0 = slow[i - 1];
    const f1 = fast[i];
    const s1 = slow[i];
    if (f0 === null || s0 === null || f1 === null || s1 === null) continue;
    if (f0 <= s0 && f1 > s1) signals[i] = 1;
    else if (f0 >= s0 && f1 < s1) signals[i] = -1;
  }
  return signals;
}

/** SMA/EMA series; null until `period` values exist. EMA is seeded with the SMA. */
function movingAverage(
  values: number[],
  period: number,
  type: "sma" | "ema"
): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i < period - 1) continue;

    if (type === "sma") {
      out[i] = sum / period;
    } else {
      const prev = out[i - 1];
      if (prev === null) {
        out[i] = sum / period; // seed with the first SMA
      } else {
        const k = 2 / (period + 1);
        out[i] = values[i] * k + prev * (1 - k);
      }
    }
  }
  return out;
}
