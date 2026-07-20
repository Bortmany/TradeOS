// TradeOS — Backtesting: OHLC candle CSV parsing.
// Pure and deterministic. Accepts the common chart-platform exports
// (TradingView, NinjaTrader and similar): a header row naming a time column
// plus open/high/low/close (volume optional), comma-delimited per the shared
// RFC-4180 parser. Timestamps may be unix seconds, unix milliseconds, or any
// ISO-ish string `new Date()` can parse.

import { parseCsv } from "@/lib/ingestion/csv";
import { CandleSchema, type Candle } from "@/lib/types";
import { etWallToUtc } from "./time";

export interface ParsedCandles {
  candles: Candle[];
  skipped: number;
  errors: string[];
}

const TIME_HEADERS = ["time", "date", "datetime", "timestamp"];
const COLUMN_ALIASES: Record<string, string[]> = {
  o: ["open", "o"],
  h: ["high", "h"],
  l: ["low", "l"],
  c: ["close", "c", "last"],
  v: ["volume", "vol", "v"],
};

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h.toLowerCase().trim()));
}

// Zone-less date-time formats we accept, interpreted as ET wall-clock so
// parsing is DETERMINISTIC — `new Date("2026-01-05 09:30")` would read the
// host timezone and silently shift every bar between dev and prod.
const ISOISH_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const US_LOCAL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Parse one timestamp cell into unix seconds, or null if unreadable. */
function parseTime(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  // Pure numeric: unix seconds (10 digits) or milliseconds (13 digits).
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (s.length >= 13) return Math.floor(n / 1000);
    return n;
  }
  // Explicit zone (Z or ±hh:mm): an unambiguous instant — parse as written.
  if (HAS_ZONE.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor(d.getTime() / 1000);
  }
  // Zone-less chart exports (TradingView/NinjaTrader style): ET wall-clock.
  let m = s.match(ISOISH_LOCAL);
  if (m) {
    return Math.floor(etWallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime() / 1000);
  }
  m = s.match(US_LOCAL);
  if (m) {
    return Math.floor(etWallToUtc(+m[3], +m[1], +m[2], +m[4], +m[5], +(m[6] ?? 0)).getTime() / 1000);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return Math.floor(etWallToUtc(+m[1], +m[2], +m[3], 0, 0).getTime() / 1000);
  }
  // Anything else is ambiguous — reject rather than parse host-dependently.
  return null;
}

export function parseCandleCsv(text: string): ParsedCandles {
  // Semicolon-delimited exports (some NinjaTrader locales) parse into a single
  // garbage column — catch that early with a clear message.
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  if (firstLine.includes(";") && !firstLine.includes(",")) {
    return {
      candles: [],
      skipped: 0,
      errors: ["This file looks semicolon-delimited. Export it as comma-separated CSV."],
    };
  }

  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) {
    return { candles: [], skipped: 0, errors: ["The file has no data rows."] };
  }

  const timeCol = findColumn(headers, TIME_HEADERS);
  const oCol = findColumn(headers, COLUMN_ALIASES.o);
  const hCol = findColumn(headers, COLUMN_ALIASES.h);
  const lCol = findColumn(headers, COLUMN_ALIASES.l);
  const cCol = findColumn(headers, COLUMN_ALIASES.c);
  const vCol = findColumn(headers, COLUMN_ALIASES.v);

  if (timeCol === -1 || oCol === -1 || hCol === -1 || lCol === -1 || cCol === -1) {
    return {
      candles: [],
      skipped: 0,
      errors: [
        "Could not find the required columns. The header row needs time (or date), open, high, low and close.",
      ],
    };
  }

  const errors: string[] = [];
  let skipped = 0;
  const byTime = new Map<number, Candle>();

  rows.forEach((row, i) => {
    const t = parseTime(row[timeCol] ?? "");
    const candidate = {
      t: t ?? NaN,
      o: parseFloat(row[oCol] ?? ""),
      h: parseFloat(row[hCol] ?? ""),
      l: parseFloat(row[lCol] ?? ""),
      c: parseFloat(row[cCol] ?? ""),
      ...(vCol !== -1 && row[vCol]?.trim() !== "" ? { v: parseFloat(row[vCol] ?? "") } : {}),
    };
    const parsed = CandleSchema.safeParse(candidate);
    if (!parsed.success) {
      skipped++;
      if (errors.length < 10) {
        errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid values"}`);
      }
      return;
    }
    // Duplicate timestamps: last row wins (chart exports occasionally repeat bars).
    byTime.set(parsed.data.t, parsed.data);
  });

  const candles = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  return { candles, skipped, errors };
}
