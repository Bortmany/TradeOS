// Forex / CFD symbol table (data only, no maths).
//
// One row per symbol. Plain JavaScript numbers, same as the rest of src/lib/
// (docs/CONVENTIONS.md: no new float handling). All rows last checked 2026-09-30.
//
// Conventions:
// - FX pairs: pip 0.0001, or 0.01 when the quote currency is JPY. One standard
//   lot is 100000 units of the base currency.
// - Metals, energy and index CFDs have no official standard. They follow the
//   common MT5-style retail convention and are marked brokersDiffer: true. A
//   different pip size changes only the pip count shown, never profit and loss
//   (P&L comes from price change x contract size x lots).
// - Golden rule: no symbol or alias here may equal a futures root from
//   src/lib/instruments/futures.ts (ES, MES, NQ, MNQ, RTY, M2K, YM, MYM, CL, GC,
//   MGC). A test enforces this.

export type InstrumentKind = "forex" | "metal" | "energy" | "index";
export type InstrumentAssetClass = "forex" | "cfd";

export interface InstrumentRow {
  symbol: string;
  kind: InstrumentKind;
  assetClass: InstrumentAssetClass;
  // Price step of one pip (0.0001, 0.01, 0.10, 1.0 ...).
  pipSize: number;
  // Units of the base asset in 1.00 lot (100000 EUR, 100 oz, 1 index point ...).
  contractSize: number;
  // Forex: first currency. Metals and energy: the commodity code. Index: the index name.
  baseCurrency: string;
  // Currency the price (and so the P&L) is quoted in.
  quoteCurrency: string;
  // Lot sizes: standard 1.00, mini 0.10, micro 0.01; minimum is the usual broker floor.
  lots: { standard: number; mini: number; micro: number; minimum: number };
  // true when brokers commonly use a different pip size or contract size.
  brokersDiffer: boolean;
  // Where the convention comes from, plus the check date.
  source: string;
}

const LOTS = { standard: 1, mini: 0.1, micro: 0.01, minimum: 0.01 } as const;

const FX_SOURCE =
  "ISO 4217 pairs; market-standard pip (0.0001, 0.01 for JPY quote) and 100000-unit lot, as in retail MT5 contract specs; checked 2026-09-30";

function fx(base: string, quote: string): InstrumentRow {
  return {
    symbol: `${base}${quote}`,
    kind: "forex",
    assetClass: "forex",
    pipSize: quote === "JPY" ? 0.01 : 0.0001,
    contractSize: 100000,
    baseCurrency: base,
    quoteCurrency: quote,
    lots: { ...LOTS },
    brokersDiffer: false,
    source: FX_SOURCE,
  };
}

export const INSTRUMENT_TABLE: InstrumentRow[] = [
  // Majors (7)
  fx("EUR", "USD"),
  fx("GBP", "USD"),
  fx("USD", "JPY"),
  fx("USD", "CHF"),
  fx("AUD", "USD"),
  fx("USD", "CAD"),
  fx("NZD", "USD"),

  // Crosses (21)
  fx("EUR", "GBP"),
  fx("EUR", "JPY"),
  fx("GBP", "JPY"),
  fx("EUR", "CHF"),
  fx("AUD", "JPY"),
  fx("CAD", "JPY"),
  fx("CHF", "JPY"),
  fx("NZD", "JPY"),
  fx("EUR", "AUD"),
  fx("EUR", "CAD"),
  fx("EUR", "NZD"),
  fx("GBP", "AUD"),
  fx("GBP", "CAD"),
  fx("GBP", "CHF"),
  fx("GBP", "NZD"),
  fx("AUD", "CAD"),
  fx("AUD", "CHF"),
  fx("AUD", "NZD"),
  fx("CAD", "CHF"),
  fx("NZD", "CAD"),
  fx("NZD", "CHF"),

  // Metals
  {
    symbol: "XAUUSD",
    kind: "metal",
    assetClass: "cfd",
    pipSize: 0.1, // 1 lot x 100 oz x 0.10 = $10 a pip
    contractSize: 100,
    baseCurrency: "XAU",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Spot gold, 100 oz per lot and 0.10 pip as in common retail MT5 specs (some brokers call 0.01 the pip); checked 2026-09-30",
  },
  {
    symbol: "XAGUSD",
    kind: "metal",
    assetClass: "cfd",
    pipSize: 0.01, // 1 lot x 5000 oz x 0.01 = $50 a pip
    contractSize: 5000,
    baseCurrency: "XAG",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Spot silver, 5000 oz per lot and 0.01 pip as in common retail MT5 specs (a few brokers use 1000 oz); checked 2026-09-30",
  },

  // Energy CFDs
  {
    symbol: "USOIL",
    kind: "energy",
    assetClass: "cfd",
    pipSize: 0.01, // 1 lot x 1000 bbl x 0.01 = $10 a pip
    contractSize: 1000,
    baseCurrency: "WTI",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "WTI crude CFD, 1000 barrels per lot, as in common retail MT5 specs; name and contract vary (USOIL, WTI, XTIUSD); checked 2026-09-30",
  },
  {
    symbol: "UKOIL",
    kind: "energy",
    assetClass: "cfd",
    pipSize: 0.01,
    contractSize: 1000,
    baseCurrency: "BRENT",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Brent crude CFD, 1000 barrels per lot, as in common retail MT5 specs; name and contract vary (UKOIL, BRENT, XBRUSD); checked 2026-09-30",
  },

  // Index CFDs: contract size 1, one pip = one index point, P&L in the index currency
  {
    symbol: "US30",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "US30",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Dow Jones Industrial Average CFD, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs (some brokers use 10 units); checked 2026-09-30",
  },
  {
    symbol: "NAS100",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "NAS100",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Nasdaq-100 CFD, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs (also named USTEC); checked 2026-09-30",
  },
  {
    symbol: "US500",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "US500",
    quoteCurrency: "USD",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "S&P 500 CFD, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs (also named SPX500); checked 2026-09-30",
  },
  {
    symbol: "GER40",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "GER40",
    quoteCurrency: "EUR",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "DAX 40 CFD quoted in EUR, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs (also named DE40); needs EURUSD to convert; checked 2026-09-30",
  },
  {
    symbol: "UK100",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "UK100",
    quoteCurrency: "GBP",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "FTSE 100 CFD quoted in GBP, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs; needs GBPUSD to convert; checked 2026-09-30",
  },
  {
    symbol: "JP225",
    kind: "index",
    assetClass: "cfd",
    pipSize: 1,
    contractSize: 1,
    baseCurrency: "JP225",
    quoteCurrency: "JPY",
    lots: { ...LOTS },
    brokersDiffer: true,
    source:
      "Nikkei 225 CFD quoted in JPY, 1 unit per lot, 1.0 point pip, as in common retail MT5 specs (also named JPN225); converts through USDJPY; checked 2026-09-30",
  },
];

// Alternative broker names -> canonical symbol in INSTRUMENT_TABLE.
// Source: names seen on common retail MT5 servers (checked 2026-09-30).
// Keys are upper case; compare after upper-casing the input. Endings brokers
// add (".r", "m", ".pro", "#", trailing ".") are stripped by getInstrument()
// before lookup; the EURUSD entries below are explicit examples of that. Nothing here may
// equal a futures root (ES, MES, NQ, MNQ, RTY, M2K, YM, MYM, CL, GC, MGC).
export const INSTRUMENT_ALIASES: Record<string, string> = {
  // Broker endings (examples)
  "EURUSD.A": "EURUSD",
  "EURUSD.R": "EURUSD",
  "EURUSDM": "EURUSD",
  "EURUSD.PRO": "EURUSD",
  "EURUSD#": "EURUSD",
  // Gold and silver
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  // Oil
  WTI: "USOIL",
  XTIUSD: "USOIL",
  CRUDEOIL: "USOIL",
  BRENT: "UKOIL",
  XBRUSD: "UKOIL",
  // Indices
  DJ30: "US30",
  DJI30: "US30",
  WS30: "US30",
  USTEC: "NAS100",
  US100: "NAS100",
  SPX500: "US500",
  SP500: "US500",
  DE40: "GER40",
  DAX40: "GER40",
  DE30: "GER40",
  FTSE100: "UK100",
  JPN225: "JP225",
  NIKKEI225: "JP225",
  NI225: "JP225",
};
