// Instruments package: the forex/CFD symbol table and maths, plus the futures
// point multipliers. The position-size calculator consumes these names.

export {
  getInstrument,
  pipSize,
  pipValue,
  pnlFromPrices,
  pipsFromPrices,
  neededConversionPair,
  InstrumentError,
  type PnlInput,
} from "@/lib/instruments/maths";
export {
  INSTRUMENT_TABLE,
  INSTRUMENT_ALIASES,
  type InstrumentRow,
  type InstrumentKind,
  type InstrumentAssetClass,
} from "@/lib/instruments/table";
export { pointMultiplier, rootSymbol, FUTURES_ROOTS } from "@/lib/instruments/futures";
