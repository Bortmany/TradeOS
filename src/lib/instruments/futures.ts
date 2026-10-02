// Per-symbol point (dollar) multiplier for futures contracts.
//
// When a broker export gives entry/exit prices but no dollar P&L, we compute it
// as (priceDelta) * quantity * pointMultiplier - fees. The multiplier is the
// dollar value of a one-point move for one contract.
//
// This table is for FUTURES only. Anything not listed falls through to the
// default of 1 (price delta = dollar delta per unit), which is right for shares
// but WRONG for forex and CFDs: those have their own table and maths in
// src/lib/instruments/ (see index.ts), and callers must use it for forex/CFD
// symbols instead of this default.
//
// Moved here unchanged from src/lib/ingestion/symbols.ts (which re-exports it).

const POINT_MULTIPLIERS: Record<string, number> = {
  // E-mini / Micro equity index
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  RTY: 50,
  M2K: 5,
  YM: 5,
  MYM: 0.5,
  // Energy / metals
  CL: 1000,
  GC: 100,
  MGC: 10,
};

// The futures root symbols above. The forex/CFD table must never use one of
// these as a symbol or alias (a test enforces it).
export const FUTURES_ROOTS: readonly string[] = Object.keys(POINT_MULTIPLIERS);

// Strip the month/year code from a futures symbol so "ESU5", "ES.U25",
// "ESM2024", "/ES", "ES=F" all resolve to the "ES" root.
export function rootSymbol(symbol: string): string {
  let s = symbol.trim().toUpperCase();
  // Remove common prefixes/suffixes and separators.
  s = s.replace(/^\//, ""); // "/ES" -> "ES"
  s = s.replace(/[=.\s-].*$/, ""); // "ES=F", "ES.U25", "ES-2024" -> "ES"
  // Remove a trailing futures month+year code, e.g. "ESU5", "ESZ2024", "MESH25".
  s = s.replace(/[FGHJKMNQUVXZ]\d{1,4}$/, "");
  return s;
}

export function pointMultiplier(symbol: string): number {
  const root = rootSymbol(symbol);
  return POINT_MULTIPLIERS[root] ?? 1;
}

/**
 * The dollar value of a one-point move, or `null` when this contract is NOT in
 * the table. Live open P&L uses this (never `pointMultiplier`) so a contract we
 * have no value for (for example MCL, NG, SI) is shown as "not priced" instead
 * of being guessed with the default of 1.
 */
export function knownPointValue(symbol: string): number | null {
  const root = rootSymbol(symbol);
  return Object.prototype.hasOwnProperty.call(POINT_MULTIPLIERS, root)
    ? POINT_MULTIPLIERS[root]
    : null;
}
