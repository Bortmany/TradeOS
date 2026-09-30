// Forex / CFD maths: pips, lots, pip values and profit and loss from prices.
//
// Pure and deterministic, no I/O, no live rate feed. Plain JavaScript numbers
// like the rest of src/lib/ (docs/CONVENTIONS.md: no new float handling); money
// is rounded to cents with the same Math.round(n * 100) / 100 as
// src/lib/backtest/simulate.ts. Pips round to one decimal, pip values to four.
//
// Conversion rate rule (the owner's "no live price feed" rule):
//   - quote currency == account currency (EURUSD in USD): nothing to convert.
//   - account currency is the pair's BASE currency (USDJPY in USD): the trade's
//     own price is the rate (its exit price for profit and loss).
//   - anything else (EURGBP, GBPJPY, GER40 in USD): the caller must pass the
//     market price of the conversion pair (e.g. GBPUSD 1.30). We refuse with a
//     named message ("needs a GBPUSD rate") rather than guess.
//   - a rate the caller passes always beats the trade's own price.
// `rate` is the pair's price as quoted (GBPUSD 1.30, USDJPY 150.00); the code
// decides whether to multiply or divide, so callers never invert a rate.

import type { Side } from "@/lib/types";
import { MAX_TRADE_PRICE, MAX_TRADE_QUANTITY, MAX_TRADE_PNL } from "@/lib/types";
import {
  INSTRUMENT_TABLE,
  INSTRUMENT_ALIASES,
  type InstrumentRow,
} from "@/lib/instruments/table";

export class InstrumentError extends Error {
  readonly code: "unknown_symbol" | "bad_input" | "needs_rate";
  // For needs_rate: the pair the caller must supply, e.g. "GBPUSD".
  readonly pair?: string;
  constructor(code: InstrumentError["code"], message: string, pair?: string) {
    super(message);
    this.name = "InstrumentError";
    this.code = code;
    this.pair = pair;
  }
}

const round2 = (n: number) => norm(Math.round(n * 100) / 100);
const round1 = (n: number) => norm(Math.round(n * 10) / 10);
const round4 = (n: number) => norm(Math.round(n * 10000) / 10000);
// Turn -0 into 0 so results compare and print cleanly.
function norm(n: number): number {
  return n === 0 ? 0 : n;
}

// --------------------------------------------------------------------------
// Lookup
// --------------------------------------------------------------------------

const BY_SYMBOL = new Map<string, InstrumentRow>(INSTRUMENT_TABLE.map((r) => [r.symbol, r]));

function lookup(key: string): InstrumentRow | null {
  const direct = BY_SYMBOL.get(key);
  if (direct) return direct;
  const alias = INSTRUMENT_ALIASES[key];
  return alias ? BY_SYMBOL.get(alias) ?? null : null;
}

// Endings some brokers glue on without a separator (EURUSDm, EURUSDpro).
const PLAIN_SUFFIXES = ["PRO", "RAW", "ECN", "CASH", "STD", "MICRO", "M", "C"];

/**
 * Find the table row for a broker symbol, or null. Copes with the endings
 * brokers add (EURUSD.r, EURUSDm, GBPUSD.pro, EURUSD#, XAUUSD.) and the common
 * alternative names (GOLD, USOIL, NAS100/USTEC, GER40/DE40 ...).
 */
export function getInstrument(symbol: string): InstrumentRow | null {
  if (typeof symbol !== "string") return null;
  const s = symbol.trim().toUpperCase();
  if (!s || s.length > 32) return null;

  const direct = lookup(s);
  if (direct) return direct;

  // "EURUSD.R", "EURUSD#", "XAUUSD.", "EURUSD_i" -> "EURUSD"
  const cut = s.replace(/[.#_\-!+@].*$/, "");
  if (!cut) return null;
  const afterCut = lookup(cut);
  if (afterCut) return afterCut;

  for (const suffix of PLAIN_SUFFIXES) {
    if (cut.length > suffix.length && cut.endsWith(suffix)) {
      const row = lookup(cut.slice(0, -suffix.length));
      if (row) return row;
    }
  }
  return null;
}

function requireInstrument(symbol: string): InstrumentRow {
  const row = getInstrument(symbol);
  if (!row) {
    throw new InstrumentError("unknown_symbol", `${cleanForMessage(symbol)} is not a forex or CFD symbol we know yet.`);
  }
  return row;
}

function cleanForMessage(v: unknown): string {
  return String(v).replace(/[^\x20-\x7e]/g, "").slice(0, 24);
}

// --------------------------------------------------------------------------
// Input checks (same ceilings as MAX_TRADE_PRICE / MAX_TRADE_QUANTITY)
// --------------------------------------------------------------------------

function checkAmount(label: string, v: unknown, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new InstrumentError("bad_input", `${label} must be a number above zero.`);
  }
  if (v > max) {
    throw new InstrumentError("bad_input", `${label} is too large.`);
  }
  return v;
}

const checkLots = (v: unknown) => checkAmount("Lots", v, MAX_TRADE_QUANTITY);
const checkPrice = (label: string, v: unknown) => checkAmount(label, v, MAX_TRADE_PRICE);

function checkSide(side: unknown): Side {
  if (side !== "long" && side !== "short") {
    throw new InstrumentError("bad_input", "Side must be long or short.");
  }
  return side;
}

function checkCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(c)) {
    throw new InstrumentError("bad_input", "Account currency must be a 3-letter code such as USD.");
  }
  return c;
}

function checkResult(n: number): number {
  if (!Number.isFinite(n) || Math.abs(n) > MAX_TRADE_PNL) {
    throw new InstrumentError("bad_input", "That size and price give a number that is too large.");
  }
  return n;
}

// --------------------------------------------------------------------------
// Conversion into the account currency
// --------------------------------------------------------------------------

interface Conversion {
  pair: string;
  // "mul": account value = quote value x rate (GBPUSD). "div": / rate (USDJPY).
  op: "mul" | "div";
  // true when the pair is the instrument itself, so its own price can be the rate.
  own: boolean;
}

function conversionFor(row: InstrumentRow, account: string): Conversion | null {
  if (row.quoteCurrency === account) return null;
  if (row.kind === "forex" && row.baseCurrency === account) {
    return { pair: row.symbol, op: "div", own: true };
  }
  const direct = `${row.quoteCurrency}${account}`; // GBPUSD: multiply
  if (BY_SYMBOL.get(direct)?.kind === "forex") return { pair: direct, op: "mul", own: false };
  const inverse = `${account}${row.quoteCurrency}`; // USDJPY: divide
  if (BY_SYMBOL.get(inverse)?.kind === "forex") return { pair: inverse, op: "div", own: false };
  throw new InstrumentError(
    "bad_input",
    `${account} accounts are not supported for ${row.symbol} yet.`
  );
}

function convert(
  row: InstrumentRow,
  account: string,
  quoteValue: number,
  rate: number | undefined,
  ownPrice: number | undefined
): number {
  const conv = conversionFor(row, account);
  if (!conv) return quoteValue;
  const r = rate ?? (conv.own ? ownPrice : undefined);
  if (r === undefined) {
    throw new InstrumentError(
      "needs_rate",
      `${row.symbol} needs a ${conv.pair} rate to work out its value in ${account}. Enter the ${conv.pair} price.`,
      conv.pair
    );
  }
  checkPrice(`The ${conv.pair} rate`, r);
  return conv.op === "mul" ? quoteValue * r : quoteValue / r;
}

// --------------------------------------------------------------------------
// Public functions (names are a contract: the position-size calculator uses them)
// --------------------------------------------------------------------------

/** The pip in price terms: 0.0001, 0.01, ... Throws for an unknown symbol. */
export function pipSize(symbol: string): number {
  return requireInstrument(symbol).pipSize;
}

/**
 * The pair the caller must supply a rate for, or null when none is needed from
 * the caller (the quote currency is the account currency, or the trade's own
 * price is the rate). Example: EURGBP in a USD account -> "GBPUSD".
 */
export function neededConversionPair(symbol: string, accountCurrency: string): string | null {
  const row = requireInstrument(symbol);
  const conv = conversionFor(row, checkCurrency(accountCurrency));
  return conv && !conv.own ? conv.pair : null;
}

/**
 * Value of a one-pip move for `lots`, in the account currency (4 decimals).
 * `rate` is the conversion pair's price as quoted. With no rate, a symbol that
 * needs one (USDJPY, EURGBP, GER40 in USD) is refused with the pair named.
 */
export function pipValue(
  symbol: string,
  lots: number,
  accountCurrency: string,
  rate?: number
): number {
  const row = requireInstrument(symbol);
  const account = checkCurrency(accountCurrency);
  checkLots(lots);
  const quoteValue = row.pipSize * row.contractSize * lots;
  return round4(checkResult(convert(row, account, quoteValue, rate, undefined)));
}

export interface PnlInput {
  symbol: string;
  side: Side;
  lots: number;
  entryPrice: number;
  exitPrice: number;
  accountCurrency: string;
  rate?: number;
}

/** Profit or loss before fees, in the account currency, rounded to cents. */
export function pnlFromPrices(input: PnlInput): number {
  const row = requireInstrument(input.symbol);
  const account = checkCurrency(input.accountCurrency);
  const side = checkSide(input.side);
  const lots = checkLots(input.lots);
  const entry = checkPrice("Entry price", input.entryPrice);
  const exit = checkPrice("Exit price", input.exitPrice);
  const move = side === "long" ? exit - entry : entry - exit;
  const quoteValue = move * row.contractSize * lots;
  return round2(checkResult(convert(row, account, quoteValue, input.rate, exit)));
}

/** Pips made (negative for a loss), one decimal. */
export function pipsFromPrices(
  symbol: string,
  side: Side,
  entryPrice: number,
  exitPrice: number
): number {
  const row = requireInstrument(symbol);
  const s = checkSide(side);
  const entry = checkPrice("Entry price", entryPrice);
  const exit = checkPrice("Exit price", exitPrice);
  const move = s === "long" ? exit - entry : entry - exit;
  return round1(checkResult(move / row.pipSize));
}
