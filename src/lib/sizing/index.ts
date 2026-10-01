// Position-size maths: how many contracts (futures) or lots (forex/CFD) fit a
// risk limit. Pure and deterministic: no I/O, no database, no broker, no order
// code. It only does arithmetic.
//
// Numbers: money is worked in whole cents and lots in hundredths, contract
// counts are integers, and the final divide is an integer divide that is
// re-checked, so a value like $1,000 / $40 can never land on 24.9999 and lose a
// contract. Rounding is ALWAYS down, never up: if one unit already risks more
// than the limit the answer is 0, never 1.
//
// Futures use the dollars-per-point table and forex/CFDs the instruments
// package (src/lib/instruments). An unknown symbol is refused, never priced at 1.

import {
  FUTURES_ROOTS,
  InstrumentError,
  getInstrument,
  pipValue,
  pointMultiplier,
  rootSymbol,
} from "@/lib/instruments";
import { formatCurrency } from "@/lib/utils";

export const ACCOUNT_SIZE_MIN = 100;
export const ACCOUNT_SIZE_MAX = 100_000_000;
export const RISK_PERCENT_MIN = 0.01;
export const RISK_PERCENT_MAX = 100;
/** Above this risk % the answer is still shown, with a warning. */
export const RISK_PERCENT_WARN = 5;
const STOP_MAX = 1_000_000;
const DOLLARS_PER_POINT_MAX = 1_000_000;
/** Forex/CFD lots are sized in steps of 0.01. */
const LOT_STEP_HUNDREDTHS = 1;

export type SizeMarket = "futures" | "forex" | "unknown";

export interface SizeInput {
  /** Futures root (MES, ES ...) or a forex/CFD symbol (EURUSD ...). */
  symbol: string;
  accountSize: number;
  riskPercent: number;
  stopDistance: number;
  /** Defaults to USD. Forex/CFD sizing is USD accounts only. */
  accountCurrency?: string;
  /** "Other futures": dollars per point, used only when the symbol is not in the table. */
  dollarsPerPoint?: number;
}

export type SizeErrorField =
  | "symbol"
  | "accountSize"
  | "riskPercent"
  | "stopDistance"
  | "dollarsPerPoint"
  | "account";

export interface SizeError {
  ok: false;
  code:
    | "unknown_symbol"
    | "bad_number"
    | "account_range"
    | "risk_range"
    | "stop_zero"
    | "need_dollars_per_point"
    | "non_usd_forex"
    | "needs_rate";
  field: SizeErrorField;
  message: string;
}

export interface SizeOk {
  ok: true;
  market: "futures" | "forex";
  unit: "contract" | "lot";
  stopUnit: "points" | "pips";
  symbol: string;
  accountSize: number;
  riskPercent: number;
  stopDistance: number;
  /** Money at risk = account size x risk %, to the cent. */
  riskBudget: number;
  /** Dollars per stop unit, for one contract or one lot. */
  dollarsPerStopUnit: number;
  /** Risk of one contract / one lot. */
  riskPerUnit: number;
  /** budget / riskPerUnit, before rounding down. */
  rawSize: number;
  /** The answer: contracts (integer) or lots (hundredths). Can be 0. */
  size: number;
  /** Real risk at `size`. 0 when size is 0. */
  realRisk: number;
  realRiskPercent: number;
  /** Smallest tradable size (1 contract / 0.01 lot) and what it would risk. */
  smallestSize: number;
  smallestRisk: number;
  smallestRiskPercent: number;
  tooBigForOne: boolean;
  warnings: Array<"high_risk">;
}

export type SizeResult = SizeOk | SizeError;

const cents = (dollars: number) => Math.round(dollars * 100);
const fromCents = (c: number) => c / 100;
const pct2 = (num: number, den: number) => Math.round((num * 10000) / den) / 100;

/** floor(a / b) for positive integers, corrected so float error can never drop a unit. */
function floorDiv(a: number, b: number): number {
  let q = Math.floor(a / b);
  while (q > 0 && q * b > a) q -= 1;
  while ((q + 1) * b <= a) q += 1;
  return q;
}

/** Which kind of market a symbol is, for labels (points or pips). Never guesses. */
export function sizeMarket(symbol: string): SizeMarket {
  const s = (symbol ?? "").trim().toUpperCase();
  if (!s || s.length > 32) return "unknown";
  if (FUTURES_ROOTS.includes(rootSymbol(s))) return "futures";
  if (getInstrument(s)) return "forex";
  return "unknown";
}

function fail(code: SizeError["code"], field: SizeErrorField, message: string): SizeError {
  return { ok: false, code, field, message };
}

function isPositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Work out the size. Never throws: a problem comes back as { ok: false, field, message }. */
export function calculatePositionSize(input: SizeInput): SizeResult {
  const { accountSize, riskPercent, stopDistance } = input;
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const currency = (input.accountCurrency ?? "USD").trim().toUpperCase();

  if (!isPositive(accountSize)) {
    return fail("bad_number", "accountSize", "Enter a number above zero.");
  }
  if (accountSize < ACCOUNT_SIZE_MIN || accountSize > ACCOUNT_SIZE_MAX) {
    return fail("account_range", "accountSize", "Account size must be between $100 and $100,000,000.");
  }
  if (!isPositive(riskPercent)) {
    return fail("bad_number", "riskPercent", "Enter a number above zero.");
  }
  if (riskPercent < RISK_PERCENT_MIN || riskPercent > RISK_PERCENT_MAX) {
    return fail("risk_range", "riskPercent", "Risk must be between 0.01% and 100%.");
  }
  if (typeof stopDistance !== "number" || !Number.isFinite(stopDistance)) {
    return fail("bad_number", "stopDistance", "That doesn't look like a number.");
  }
  if (stopDistance === 0) {
    return fail("stop_zero", "stopDistance", "Stop distance can't be zero. Enter how far away your stop is.");
  }
  if (stopDistance < 0 || stopDistance > STOP_MAX) {
    return fail("bad_number", "stopDistance", "Enter a number above zero.");
  }

  const market = sizeMarket(symbol);
  let kind: "futures" | "forex";
  let label = symbol;
  let dollarsPerStopUnit: number;

  if (market === "futures") {
    kind = "futures";
    dollarsPerStopUnit = pointMultiplier(symbol);
  } else if (market === "forex") {
    kind = "forex";
    if (currency !== "USD") {
      return fail(
        "non_usd_forex",
        "account",
        "Forex sizing for non-USD accounts isn't available yet. Futures sizing works for every account."
      );
    }
    try {
      dollarsPerStopUnit = pipValue(symbol, 1, "USD");
    } catch (err) {
      if (err instanceof InstrumentError && err.code === "needs_rate") {
        return fail(
          "needs_rate",
          "symbol",
          `Sizing ${getInstrument(symbol)?.symbol ?? symbol} isn't available yet because it needs a ${err.pair ?? "conversion"} price.`
        );
      }
      return fail("unknown_symbol", "symbol", unknownSymbolMessage(symbol));
    }
  } else {
    // "Other futures": the trader typed the dollars per point themselves.
    if (input.dollarsPerPoint === undefined) {
      return fail("unknown_symbol", "symbol", unknownSymbolMessage(symbol));
    }
    if (!isPositive(input.dollarsPerPoint) || input.dollarsPerPoint > DOLLARS_PER_POINT_MAX) {
      return fail(
        "need_dollars_per_point",
        "dollarsPerPoint",
        "Enter the dollars per point for this contract, for example 5."
      );
    }
    kind = "futures";
    dollarsPerStopUnit = input.dollarsPerPoint;
    label = symbol || "Other futures";
  }

  const accountCents = cents(accountSize);
  const budgetCents = Math.round((accountCents * riskPercent) / 100);
  const perUnitCents = cents(stopDistance * dollarsPerStopUnit);
  if (perUnitCents < 1) {
    return fail("stop_zero", "stopDistance", "That stop is too small to size. Enter a bigger distance.");
  }

  let size: number;
  let realCents: number;
  let smallestSize: number;
  let smallestCents: number;
  let rawSize: number;
  if (kind === "futures") {
    size = floorDiv(budgetCents, perUnitCents);
    realCents = size * perUnitCents;
    smallestSize = 1;
    smallestCents = perUnitCents;
    rawSize = budgetCents / perUnitCents;
  } else {
    // Lots in hundredths: hundredths = floor(budget / perLot x 100).
    const hundredths = floorDiv(budgetCents * 100, perUnitCents);
    const stepped = hundredths - (hundredths % LOT_STEP_HUNDREDTHS);
    size = stepped / 100;
    realCents = Math.round((stepped * perUnitCents) / 100);
    smallestSize = LOT_STEP_HUNDREDTHS / 100;
    smallestCents = Math.round((LOT_STEP_HUNDREDTHS * perUnitCents) / 100);
    rawSize = budgetCents / perUnitCents;
  }

  return {
    ok: true,
    market: kind,
    unit: kind === "futures" ? "contract" : "lot",
    stopUnit: kind === "futures" ? "points" : "pips",
    symbol: label,
    accountSize,
    riskPercent,
    stopDistance,
    riskBudget: fromCents(budgetCents),
    dollarsPerStopUnit,
    riskPerUnit: fromCents(perUnitCents),
    rawSize,
    size,
    realRisk: fromCents(realCents),
    realRiskPercent: pct2(realCents, accountCents),
    smallestSize,
    smallestRisk: fromCents(smallestCents),
    smallestRiskPercent: pct2(smallestCents, accountCents),
    tooBigForOne: size === 0,
    warnings: riskPercent > RISK_PERCENT_WARN ? ["high_risk"] : [],
  };
}

function unknownSymbolMessage(symbol: string): string {
  const shown = symbol.replace(/[^\x20-\x7e]/g, "").slice(0, 24) || "that symbol";
  return `We don't know the symbol ${shown}. Pick one of the chips, or choose Other futures and type the dollars per point.`;
}

// --------------------------------------------------------------------------
// Words for the screen (shared by /size and the size check inside a trade)
// --------------------------------------------------------------------------

/** "12 contracts", "1 contract", "0.50 lots", "1.00 lot". */
export function sizeLabel(r: SizeOk): string {
  return `${formatSize(r, r.size)} ${unitWord(r, r.size)}`;
}

/** The number part: "12" or "0.50". */
export function formatSize(r: Pick<SizeOk, "market">, n: number): string {
  return r.market === "futures" ? String(n) : n.toFixed(2);
}

function unitWord(r: SizeOk, n: number): string {
  if (r.market === "futures") return n === 1 ? "contract" : "contracts";
  return n === 1 ? "lot" : "lots";
}

/** Trim to at most `max` decimals but keep at least `min` ("12.5", "0.50"). */
function trimmed(n: number, min: number, max = 4): string {
  const fixed = n.toFixed(max);
  let [whole, frac = ""] = fixed.split(".");
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1);
  return frac ? `${whole}.${frac}` : whole;
}

const money = (n: number) => formatCurrency(n);
const pctText = (n: number) => `${n.toFixed(2)}%`;

export interface WorkingStep {
  title: string;
  /** The sum, e.g. "8 points x $5.00 per point =". */
  sum: string;
  /** The result at the end of the row, e.g. "$40.00". */
  result: string;
  /** Step 3 only: show the "rounded down" chip. */
  roundedDown?: boolean;
}

/** The four working lines, exactly as the screen spec words them. */
export function sizeWorking(r: SizeOk): WorkingStep[] {
  const unitName = r.market === "futures" ? "contract" : "lot";
  const plural = r.market === "futures" ? "contracts" : "lots";
  const stopText = `${trimmed(r.stopDistance, 0)} ${r.stopUnit}`;
  const per = r.market === "futures" ? "per point" : "per pip";
  const perLot = r.market === "forex" ? " per 1.00 lot" : "";
  const minDec = r.market === "futures" ? 0 : 2;

  const steps: WorkingStep[] = [
    {
      title: "Money at risk",
      sum: `${money(r.accountSize)} x ${trimmed(r.riskPercent, 0)}% =`,
      result: money(r.riskBudget),
    },
    {
      title: `Risk per ${unitName}`,
      sum: `${stopText} x ${money(r.dollarsPerStopUnit)} ${per}${perLot} =`,
      result: money(r.riskPerUnit),
    },
  ];

  if (r.tooBigForOne) {
    steps.push({
      title: market3Title(r),
      sum: `${money(r.riskBudget)} / ${money(r.riskPerUnit)} = ${trimmed(r.rawSize, minDec)}, rounded down`,
      result: formatSize(r, 0),
      roundedDown: true,
    });
    steps.push({
      title: "Smallest size",
      sum: `${formatSize(r, r.smallestSize)} ${unitWord(r, r.smallestSize)} x ${money(r.riskPerUnit)} =`,
      result: `${money(r.smallestRisk)} (${pctText(r.smallestRiskPercent)})`,
    });
    return steps;
  }

  const lotStep = r.market === "forex" ? " to 0.01" : "";
  steps.push({
    title: market3Title(r),
    sum: `${money(r.riskBudget)} / ${money(r.riskPerUnit)} = ${trimmed(r.rawSize, minDec)}, rounded down${lotStep}`,
    result: formatSize(r, r.size),
    roundedDown: true,
  });
  steps.push({
    title: "Real risk",
    sum: `${formatSize(r, r.size)} ${r.market === "futures" && r.size === 1 ? unitName : plural} x ${money(r.riskPerUnit)}${r.market === "forex" ? " per lot" : ""} =`,
    result: `${money(r.realRisk)} (${pctText(r.realRiskPercent)})`,
  });
  return steps;
}

function market3Title(r: SizeOk): string {
  return r.market === "futures" ? "Contracts" : "Lots";
}

/** The plain line under the answer, or the zero explanation. */
export function sizeSummaryLine(r: SizeOk): string {
  if (r.tooBigForOne) {
    const one = `${formatSize(r, r.smallestSize)} ${unitWord(r, r.smallestSize)}`;
    return `Even ${one} risks ${money(r.smallestRisk)} (${pctText(r.smallestRiskPercent)}), more than your limit of ${money(r.riskBudget)}.`;
  }
  return `Risking ${money(r.realRisk)} of ${money(r.accountSize)} (${pctText(r.realRiskPercent)})`;
}
