// Per-symbol point (dollar) multiplier for futures contracts.
//
// When a broker export gives entry/exit prices but no dollar P&L, we compute it
// as (priceDelta) * quantity * pointMultiplier - fees. The multiplier is the
// dollar value of a one-point move for one contract.
//
// Equities and forex fall through to the default of 1 (price delta ~= dollar
// delta per share/unit), which is the correct behavior for those instruments.

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
