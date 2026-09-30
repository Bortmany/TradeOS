// MetaTrader 5 "Positions" history file adapter (a file import, not a live link).
//
// In MT5: Toolbox > History > view "Positions" > right-click > Report > save, open
// in Excel, Save as CSV (comma delimited). One row per closed position. The
// columns, in this order (Time and Price each appear TWICE: open, then close):
//
//   Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price, Commission, Swap, Profit
//
// What we do with a row:
//   - quantity = Volume (lots); side from Type (buy = long, sell = short)
//   - entry = first Time/Price, exit = second Time/Price (read by column ORDER,
//     because the shared headerIndex keeps only the first of a repeated name)
//   - pnlGross = Profit; fees = -(Commission + Swap); pnl = Profit + Commission + Swap
//     (MT5 has already converted Profit to the account currency; the import route
//     only accepts USD accounts for now)
//   - externalId = "mt5:<Position>" so importing the same file twice never doubles up
//   - assetClass comes from the instrument table (forex, or cfd for metals, energy, indices)
//   - the Comment column and any account name/number in the file are never read or stored
//
// A row with no closing time is an open position: skipped and counted. A symbol
// not in the table (BTCUSD ...) skips that row with a named message; the rest import.
// Times have no zone in the file: they are the broker's server clock, turned into
// UTC using the "Broker server time" choice, never through the machine's own zone.

import type { ServerTime } from "@/lib/types";
import { etWallToUtc } from "@/lib/backtest/time";
import { getInstrument } from "@/lib/instruments";
import {
  type BrokerAdapter,
  TradeCollector,
  makeGetter,
  normalizeSide,
  num,
  headerIndex,
} from "@/lib/ingestion/adapters/generic";

// --- plain-English messages (kept together so they can be translated later) ---

export const MT5_MESSAGES = {
  semicolons:
    "This file uses semicolons between columns. In Excel, save it as 'CSV (comma delimited)' and try again.",
  deals: "This looks like the MT5 Deals table. Export the Positions table instead.",
  notPositions:
    "This doesn't look like the MT5 Positions table. In MT5, open Toolbox, then History, choose Positions, and export that report.",
  missingColumns:
    "This file needs both the open and the close Time and Price columns. Export the Positions table from MT5 and try again.",
  noRows:
    "This file has no positions in it. Export the Positions table after at least one position has closed.",
} as const;

/** The refusal for a non-USD target account (MT5 profit is assumed to be in USD). */
export function mt5AccountCurrencyProblem(currency: string | null | undefined): string | null {
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "USD") return null;
  return `MT5 import supports USD accounts for now. This account is set to ${c || "no currency"}.`;
}

export const DEFAULT_SERVER_TIME: ServerTime = { mode: "ny_close" };

/** How the result panel describes the chosen clock ("Times were read as ..."). */
export function describeServerTime(st: ServerTime): string {
  if (st.mode === "ny_close") return "GMT+2 winter / GMT+3 summer (New York close)";
  if (st.mode === "utc" || st.hours === 0) return "UTC";
  return `UTC${st.hours > 0 ? "+" : "-"}${Math.abs(st.hours)}`;
}

const HOUR_MS = 3_600_000;
const MT5_TIME = /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Turn "2026.09.14 09:15:00" (broker server clock) into the real UTC instant.
 * Pure arithmetic on the written numbers: the host machine's zone is never used.
 * "New York close" servers always run New York time + 7 hours (winter and summer),
 * so we take 7 hours off and read the result as a New York wall clock.
 */
export function parseMt5Time(raw: string, serverTime: ServerTime = DEFAULT_SERVER_TIME): Date | null {
  const m = MT5_TIME.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  const s = m[6] ? +m[6] : 0;
  const serverMs = Date.UTC(y, mo - 1, d, h, mi, s);
  // Reject impossible dates (month 13, 31 June, hour 25 ...) instead of rolling over.
  const back = new Date(serverMs);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    return null;
  }

  if (serverTime.mode === "utc") return new Date(serverMs);
  if (serverTime.mode === "offset") return new Date(serverMs - serverTime.hours * HOUR_MS);

  const ny = new Date(serverMs - 7 * HOUR_MS);
  return etWallToUtc(
    ny.getUTCFullYear(),
    ny.getUTCMonth() + 1,
    ny.getUTCDate(),
    ny.getUTCHours(),
    ny.getUTCMinutes(),
    ny.getUTCSeconds()
  );
}

// --- header recognition -------------------------------------------------------

const normHeaders = (headers: string[]) =>
  headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));

function isPositionsTable(n: string[]): boolean {
  return (
    n.includes("position") &&
    n.includes("symbol") &&
    n.includes("volume") &&
    n.includes("s/l") &&
    n.includes("t/p")
  );
}

function isDealsTable(n: string[]): boolean {
  return n.includes("deal") && n.includes("direction") && n.includes("symbol");
}

// A semicolon-separated export comes through the comma parser as ONE long header.
function isSemicolonFile(headers: string[]): boolean {
  if (headers.length > 2) return false;
  const joined = headers.join(" ").toLowerCase();
  return joined.includes(";") && joined.includes("symbol") && /position|deal/.test(joined);
}

function indicesOf(n: string[], name: string): number[] {
  const out: number[] = [];
  n.forEach((h, i) => {
    if (h === name) out.push(i);
  });
  return out;
}

const cleanSymbol = (s: string) => s.replace(/[^\x20-\x7e]/g, "").slice(0, 24);
const cents = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

// --- finding the table inside a saved History report ---------------------------
//
// "File > Save as report" puts title rows (report name, Name, Account, Company,
// Date, a "Positions" label) above the table, and Orders / Deals / summary
// sections below it. Blank spacer columns may sit between the headers.

const SCAN_ROWS = 30;

export type Mt5TableSearch =
  | { kind: "table"; headers: string[]; rows: string[][]; firstDataRow: number }
  | { kind: "refusal"; refusal: string };

/**
 * Look through the first rows of a file for the Positions header. Returns the
 * header and the rows under it (up to the next blank row or section title), a
 * plain-English refusal if the first table found is the Deals table or the file
 * is semicolon-separated, or null when nothing MT5-like is there.
 */
export function findMt5Table(records: string[][]): Mt5TableSearch | null {
  const limit = Math.min(records.length, SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const headers = records[r].map((h) => h.trim());
    const n = normHeaders(headers);
    if (isPositionsTable(n)) {
      const rows: string[][] = [];
      for (let k = r + 1; k < records.length; k++) {
        const filled = records[k].filter((c) => c.trim() !== "").length;
        if (filled <= 1) break; // blank row, or a section title such as "Orders"
        rows.push(records[k]);
      }
      return { kind: "table", headers, rows, firstDataRow: r + 2 };
    }
    if (isDealsTable(n)) return { kind: "refusal", refusal: MT5_MESSAGES.deals };
    if (isSemicolonFile(headers)) return { kind: "refusal", refusal: MT5_MESSAGES.semicolons };
  }
  return null;
}

export const mt5Adapter: BrokerAdapter = {
  key: "mt5",
  label: "MetaTrader 5",
  detect(headers) {
    const n = normHeaders(headers);
    return isPositionsTable(n) || isDealsTable(n) || isSemicolonFile(headers);
  },
  parse(headers, rows, options) {
    const refuse = (refusal: string) => ({
      trades: [],
      skipped: 0,
      errors: [],
      refusal,
    });

    const n = normHeaders(headers);
    if (isSemicolonFile(headers)) return refuse(MT5_MESSAGES.semicolons);
    if (!isPositionsTable(n)) {
      return refuse(isDealsTable(n) ? MT5_MESSAGES.deals : MT5_MESSAGES.notPositions);
    }

    const times = indicesOf(n, "time");
    const prices = indicesOf(n, "price");
    if (times.length < 2 || prices.length < 2) return refuse(MT5_MESSAGES.missingColumns);
    if (rows.length === 0) return refuse(MT5_MESSAGES.noRows);
    const [openTimeCol, closeTimeCol] = times;
    const [openPriceCol, closePriceCol] = prices;

    const serverTime = options?.serverTime ?? DEFAULT_SERVER_TIME;
    const idx = headerIndex(headers); // first "type", "volume", "commission", ... (unique names)
    const c = new TradeCollector();
    const seen = new Set<string>();
    let openSkipped = 0;

    rows.forEach((row, i) => {
      const rowNumber = (options?.firstDataRow ?? 2) + i;
      const cell = (col: number) => (row[col] ?? "").trim();
      const g = makeGetter(idx, row);

      const position = g("position");
      const rawSymbol = g("symbol");
      // Blank separator or totals rows carry no position and no symbol: ignore.
      if (!position && !rawSymbol) return;

      if (!/^\d{1,20}$/.test(position)) {
        return c.fail(rowNumber, "missing or invalid position number");
      }
      const instrument = getInstrument(rawSymbol);
      if (!instrument) {
        return c.fail(rowNumber, `symbol ${cleanSymbol(rawSymbol) || "(blank)"} is not supported yet`);
      }
      if (seen.has(position)) {
        return c.fail(rowNumber, `position ${position} appears more than once in this file (first one kept)`);
      }

      const closeTimeRaw = cell(closeTimeCol);
      if (!closeTimeRaw) {
        // Still open: importing it now would block the closed version later.
        openSkipped++;
        c.skipped++;
        return;
      }

      const entryTime = parseMt5Time(cell(openTimeCol), serverTime);
      const exitTime = parseMt5Time(closeTimeRaw, serverTime);
      if (!entryTime) return c.fail(rowNumber, "missing/invalid open time");
      if (!exitTime) return c.fail(rowNumber, "missing/invalid close time");

      const profit = num(g("profit"));
      if (profit === null) return c.fail(rowNumber, "missing/invalid profit");
      const commission = num(g("commission")) ?? 0;
      const swap = num(g("swap")) ?? 0;

      const exitPrice = num(cell(closePriceCol));
      if (exitPrice === null) return c.fail(rowNumber, "missing/invalid close price");

      const before = c.trades.length;
      c.add(rowNumber, {
        symbol: instrument.symbol,
        side: normalizeSide(g("type")),
        entryPrice: num(cell(openPriceCol)),
        exitPrice,
        quantity: num(g("volume")),
        entryTime,
        exitTime,
        fees: cents(-(commission + swap)),
        pnl: cents(profit + commission + swap),
        pnlGross: profit,
        externalId: `mt5:${position}`,
        assetClass: instrument.assetClass,
      });
      if (c.trades.length > before) seen.add(position);
    });

    return {
      ...c.result(),
      openSkipped,
      timesReadAs: describeServerTime(serverTime),
    };
  },
};

export default mt5Adapter;
