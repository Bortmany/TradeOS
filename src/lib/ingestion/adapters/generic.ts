// Generic / fallback broker adapter.
//
// Example header row this adapter was designed against (any subset works — it
// matches by common aliases, case-insensitively):
//   Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees,PnL
//
// `detect()` always returns true: this is the last-resort adapter, tried only
// after every platform-specific adapter has declined.
//
// This file also hosts the small shared toolkit (header lookup, lenient number
// and date parsing, side normalization, and the final assemble/validate step)
// that every other adapter imports — keeping the ingestion package to the exact
// file set defined in the contract while avoiding copy-paste across adapters.

import {
  NormalizedTradeSchema,
  type NormalizedTrade,
  type Broker,
  type Side,
} from "@/lib/types";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import { isValidTradeTimeOrder } from "@/lib/validation";

// --------------------------------------------------------------------------
// Adapter contract (re-exported so every adapter file imports it from here).
// --------------------------------------------------------------------------

export interface ParseResult {
  trades: NormalizedTrade[];
  skipped: number;
  errors: string[];
}

export interface BrokerAdapter {
  key: Broker;
  label: string;
  detect(headers: string[]): boolean;
  parse(headers: string[], rows: string[][]): ParseResult;
}

// Cap the number of human-readable error strings we surface so a broken file
// with thousands of bad rows doesn't produce a giant payload.
export const MAX_ERRORS = 20;

// --------------------------------------------------------------------------
// Header lookup helpers
// --------------------------------------------------------------------------

// Build a lowercase-header -> column-index map for O(1) alias lookups.
export function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

export function hasHeader(headers: string[], ...names: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  return names.some((n) => set.has(n.toLowerCase()));
}

export function headersInclude(headers: string[], substring: string): boolean {
  const s = substring.toLowerCase();
  return headers.some((h) => h.trim().toLowerCase().includes(s));
}

// A column getter bound to a specific row + header map. Returns the trimmed
// cell value for the first alias that exists, or "" when none match.
export function makeGetter(idx: Map<string, number>, row: string[]) {
  return (...aliases: string[]): string => {
    for (const a of aliases) {
      const i = idx.get(a.toLowerCase());
      if (i !== undefined) {
        const v = row[i];
        if (v !== undefined) return v.trim();
      }
    }
    return "";
  };
}

// --------------------------------------------------------------------------
// Value parsing helpers
// --------------------------------------------------------------------------

// Parse a possibly currency-formatted number: "$1,234.50", "(120.00)" (accounting
// negative), "1.2k" is NOT supported. Returns null when not a finite number.
export function num(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "" || s === "-" || s === "--" || s.toLowerCase() === "n/a") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true; // accounting-style negatives, e.g. (120.00)
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s === "" || !/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// Normalize a broker "side"/"action" token to our internal Side, or null.
export function normalizeSide(raw: string | null | undefined): Side | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (["buy", "b", "long", "bot", "bought", "buy to open", "l"].includes(s)) {
    return "long";
  }
  if (["sell", "s", "short", "sld", "sold", "sell to open", "shrt"].includes(s)) {
    return "short";
  }
  // Some exports embed the word inside a longer phrase.
  if (s.includes("buy") || s.includes("long")) return "long";
  if (s.includes("sell") || s.includes("short")) return "short";
  return null;
}

// Lenient date parsing. Accepts ISO, "MM/DD/YYYY HH:mm:ss", and an optional
// separate date + time that we join. Returns null on failure.
export function parseDateLoose(
  dateStr: string | null | undefined,
  timeStr?: string | null
): Date | null {
  const d = (dateStr ?? "").trim();
  const t = (timeStr ?? "").trim();
  if (!d && !t) return null;

  // If the date field already contains a time component, prefer it as-is;
  // otherwise join the separate date and time fields with a space.
  const combined = t && !/[ t]\d{1,2}:\d{2}/i.test(d) ? `${d} ${t}` : d || t;

  const direct = new Date(combined);
  if (!Number.isNaN(direct.getTime())) return direct;

  // Fallback: normalize "MM/DD/YYYY" style to ISO-ish "YYYY/MM/DD".
  const m = combined.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(.*)$/
  );
  if (m) {
    let [, mm, dd, yy, rest] = m;
    if (yy.length === 2) yy = `20${yy}`;
    const iso = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}${rest}`;
    const alt = new Date(iso);
    if (!Number.isNaN(alt.getTime())) return alt;
  }
  return null;
}

// --------------------------------------------------------------------------
// The shared assemble + validate step
// --------------------------------------------------------------------------

// The fully-extracted, still-loosely-typed fields an adapter produces per row.
export interface RawTradeFields {
  symbol: string;
  side: Side | null;
  entryPrice: number | null;
  exitPrice: number | null;
  quantity: number | null;
  entryTime: Date | null;
  exitTime: Date | null;
  fees: number | null;
  pnl: number | null; // from the source file, if present
  pnlGross?: number | null;
  strategyTag?: string | null;
  notes?: string | null;
  emotions?: string | null;
  tags?: string | null;
  externalId?: string | null;
}

// Compute realized P&L from prices when the source lacks it. Open trades
// (missing exit) get pnl 0 and are left open by the caller.
export function computePnl(f: {
  side: Side;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  fees: number;
  symbol: string;
}): number {
  if (f.exitPrice == null) return 0;
  const mult = pointMultiplier(f.symbol);
  const gross =
    f.side === "long"
      ? (f.exitPrice - f.entryPrice) * f.quantity * mult
      : (f.entryPrice - f.exitPrice) * f.quantity * mult;
  return gross - f.fees;
}

// A small accumulator adapters push rows into. Handles pnl computation, zod
// validation, skip counting, and error capping uniformly.
export class TradeCollector {
  readonly trades: NormalizedTrade[] = [];
  skipped = 0;
  readonly errors: string[] = [];

  add(rowNumber: number, f: RawTradeFields): void {
    // Basic presence checks with targeted messages before zod.
    if (f.side == null) return this.fail(rowNumber, "unrecognized side");
    if (f.entryPrice == null) return this.fail(rowNumber, "missing/invalid entry price");
    if (f.quantity == null || f.quantity <= 0)
      return this.fail(rowNumber, "missing/invalid quantity");
    if (f.entryTime == null) return this.fail(rowNumber, "missing/invalid entry time");
    if (!f.symbol) return this.fail(rowNumber, "missing symbol");

    const fees = f.fees ?? 0;
    const exitPrice = f.exitPrice ?? null;
    const exitTime = exitPrice != null ? f.exitTime ?? null : null;

    // A trade can't exit before it entered — reject rather than persist a
    // negative-duration trade (e.g. a broker export glitch or a crafted CSV).
    if (!isValidTradeTimeOrder(f.entryTime, exitTime)) {
      return this.fail(rowNumber, "exit time is before entry time");
    }

    const pnl =
      f.pnl != null
        ? f.pnl
        : computePnl({
            side: f.side,
            entryPrice: f.entryPrice,
            exitPrice,
            quantity: f.quantity,
            fees,
            symbol: f.symbol,
          });

    const parsed = NormalizedTradeSchema.safeParse({
      symbol: f.symbol,
      side: f.side,
      entryPrice: f.entryPrice,
      exitPrice,
      quantity: f.quantity,
      entryTime: f.entryTime,
      exitTime,
      fees,
      pnl,
      pnlGross: f.pnlGross ?? null,
      strategyTag: f.strategyTag ?? null,
      notes: f.notes ?? null,
      emotions: f.emotions ?? null,
      tags: f.tags ?? null,
      source: "csv",
      externalId: f.externalId ?? null,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path?.join(".") || "row";
      this.fail(rowNumber, `${where}: ${first?.message ?? "invalid"}`);
      return;
    }
    this.trades.push(parsed.data);
  }

  fail(rowNumber: number, message: string): void {
    this.skipped++;
    if (this.errors.length < MAX_ERRORS) {
      this.errors.push(`Row ${rowNumber}: ${message}`);
    } else if (this.errors.length === MAX_ERRORS) {
      this.errors.push("… additional errors omitted");
    }
  }

  result(): ParseResult {
    return { trades: this.trades, skipped: this.skipped, errors: this.errors };
  }
}

// --------------------------------------------------------------------------
// The generic adapter itself
// --------------------------------------------------------------------------

const SYMBOL_ALIASES = ["symbol", "ticker", "contract", "instrument", "market"];
const SIDE_ALIASES = ["side", "direction", "action", "b/s", "buy/sell", "type"];
const QTY_ALIASES = ["qty", "quantity", "size", "contracts", "shares", "volume", "filledqty"];
const ENTRY_PRICE_ALIASES = ["entry price", "entryprice", "entry", "avg entry", "open price", "buy price", "price in"];
const EXIT_PRICE_ALIASES = ["exit price", "exitprice", "exit", "avg exit", "close price", "sell price", "price out"];
const ENTRY_TIME_ALIASES = ["entry time", "entrytime", "open time", "opened", "entry date", "date/time", "datetime", "time"];
const EXIT_TIME_ALIASES = ["exit time", "exittime", "close time", "closed", "exit date"];
const DATE_ALIASES = ["date", "trade date", "entry date"];
const TIME_ALIASES = ["time", "entry time"];
const FEE_ALIASES = ["fees", "fee", "commission", "commissions", "comm"];
const PNL_ALIASES = ["pnl", "p/l", "realized", "realized pnl", "profit", "net pnl", "netpnl", "gross p/l"];
const ID_ALIASES = ["id", "trade id", "tradeid", "order id", "orderid", "ref", "reference"];
const STRATEGY_ALIASES = ["strategy", "setup", "strategytag", "tag"];
const NOTES_ALIASES = ["notes", "note", "comment", "comments"];

export const genericAdapter: BrokerAdapter = {
  key: "generic",
  label: "Generic CSV",
  detect: () => true, // always the fallback
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const collector = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      const symbol = g(...SYMBOL_ALIASES);
      const side = normalizeSide(g(...SIDE_ALIASES));
      const entryPrice = num(g(...ENTRY_PRICE_ALIASES));
      const exitPrice = num(g(...EXIT_PRICE_ALIASES));
      const quantity = num(g(...QTY_ALIASES));

      // Times: prefer explicit entry/exit time columns, else a combined
      // date + time pair.
      const entryTimeRaw = g(...ENTRY_TIME_ALIASES);
      const entryTime = entryTimeRaw
        ? parseDateLoose(entryTimeRaw)
        : parseDateLoose(g(...DATE_ALIASES), g(...TIME_ALIASES));
      const exitTimeRaw = g(...EXIT_TIME_ALIASES);
      const exitTime = exitTimeRaw ? parseDateLoose(exitTimeRaw) : null;

      collector.add(i + 2, {
        symbol,
        side,
        entryPrice,
        exitPrice,
        quantity,
        entryTime,
        exitTime,
        fees: num(g(...FEE_ALIASES)),
        pnl: num(g(...PNL_ALIASES)),
        strategyTag: g(...STRATEGY_ALIASES) || null,
        notes: g(...NOTES_ALIASES) || null,
        externalId: g(...ID_ALIASES) || null,
      });
    });

    return collector.result();
  },
};

export default genericAdapter;
