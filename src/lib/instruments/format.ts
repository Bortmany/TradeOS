// TradeOS — how to print a price and a lot size for one instrument.
//
// Display only: stored prices and sizes never change. Pure and client-safe.
//
//   Forex pairs   pip 0.0001 -> 5 decimals (1.10500); JPY pairs, pip 0.01 -> 3 (150.123)
//   Metals, oil, indices (CFDs)  -> 2 decimals (2345.60)
//   Futures and anything unknown -> 2 decimals, as before this fix
//   Lots (forex / CFD)           -> 2 decimals (0.10, 0.50, 1.00); futures contracts stay whole

import { getInstrument } from "@/lib/instruments/maths";
import { formatNumber } from "@/lib/utils";

/** True for the trade kinds counted in lots (forex and CFDs). */
export function isLotAssetClass(assetClass?: string | null): boolean {
  return assetClass === "forex" || assetClass === "cfd";
}

/** Decimal places to show for a price of this symbol. */
export function priceDecimals(symbol: string, assetClass?: string | null): number {
  if (assetClass === "futures") return 2;
  const row = getInstrument(symbol);
  if (row) {
    if (row.kind !== "forex") return 2;
    return row.pipSize < 0.001 ? 5 : 3;
  }
  // A forex pair we have no table row for: judge by the quote currency.
  if (assetClass === "forex") {
    return /JPY/i.test(symbol.trim().slice(-3)) ? 3 : 5;
  }
  return 2;
}

/** A price printed with the instrument's own precision ("1.10500", "2345.60", "5301.25"). */
export function formatPrice(value: number, symbol: string, assetClass?: string | null): string {
  return formatNumber(value, priceDecimals(symbol, assetClass));
}

/** A size: lots with two decimals for forex / CFDs ("0.10"), whole contracts for futures. */
export function formatLots(quantity: number, symbol: string, assetClass?: string | null): string {
  const lots = isLotAssetClass(assetClass) || (assetClass == null && getInstrument(symbol) !== null);
  return lots ? formatNumber(quantity, 2) : formatNumber(quantity);
}
