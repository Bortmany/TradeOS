// The futures point values are PINNED. A future edit that changes one (or lets a
// forex/CFD symbol steal a futures root) fails here. Also proves the old import
// path (src/lib/ingestion/symbols.ts) is still the same code, and the futures
// profit-and-loss path through the CSV importer is unchanged.

import { describe, it, expect } from "vitest";
import { pointMultiplier, rootSymbol, FUTURES_ROOTS } from "@/lib/instruments";
import * as legacy from "@/lib/ingestion/symbols";
import { INSTRUMENT_TABLE, INSTRUMENT_ALIASES, getInstrument } from "@/lib/instruments";
import { ingestCsv } from "@/lib/ingestion";

describe("15. MES multiplier, whatever the spelling", () => {
  it("MES, MESZ5 and /MES are all 5", () => {
    expect(pointMultiplier("MES")).toBe(5);
    expect(pointMultiplier("MESZ5")).toBe(5);
    expect(pointMultiplier("/MES")).toBe(5);
  });
});

describe("17. every value in the futures table is pinned", () => {
  const pinned: Record<string, number> = {
    ES: 50,
    MES: 5,
    NQ: 20,
    MNQ: 2,
    RTY: 50,
    M2K: 5,
    YM: 5,
    MYM: 0.5,
    CL: 1000,
    GC: 100,
    MGC: 10,
  };
  it.each(Object.entries(pinned))("%s = %d", (sym, value) => {
    expect(pointMultiplier(sym)).toBe(value);
  });
  it("the table has exactly these eleven roots and no more", () => {
    expect([...FUTURES_ROOTS].sort()).toEqual(Object.keys(pinned).sort());
  });
  it("an unknown symbol is 1", () => {
    expect(pointMultiplier("ZZZ")).toBe(1);
    expect(pointMultiplier("AAPL")).toBe(1);
  });
  it("month codes and prefixes still resolve to the root", () => {
    expect(rootSymbol("ESU5")).toBe("ES");
    expect(rootSymbol("ES=F")).toBe("ES");
    expect(rootSymbol("MNQH2025")).toBe("MNQ");
    expect(pointMultiplier("NQZ5")).toBe(20);
  });
});

describe("the old import path is a plain re-export", () => {
  it("symbols.ts hands back the very same functions", () => {
    expect(legacy.pointMultiplier).toBe(pointMultiplier);
    expect(legacy.rootSymbol).toBe(rootSymbol);
  });
});

describe("18. no forex/CFD symbol or alias equals a futures root", () => {
  it("no table symbol is a futures root", () => {
    for (const row of INSTRUMENT_TABLE) expect(FUTURES_ROOTS).not.toContain(row.symbol);
  });
  it("no alias (key or target) is a futures root", () => {
    for (const [alias, target] of Object.entries(INSTRUMENT_ALIASES)) {
      expect(FUTURES_ROOTS).not.toContain(alias);
      expect(FUTURES_ROOTS).not.toContain(target);
    }
  });
  it("every alias points at a real table row, and alias keys are upper case", () => {
    const symbols = new Set(INSTRUMENT_TABLE.map((r) => r.symbol));
    for (const [alias, target] of Object.entries(INSTRUMENT_ALIASES)) {
      expect(symbols.has(target)).toBe(true);
      expect(alias).toBe(alias.toUpperCase());
    }
  });
  it("the table has no duplicate symbols", () => {
    const symbols = INSTRUMENT_TABLE.map((r) => r.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
  it("a futures symbol, in any spelling, never resolves to a forex/CFD row", () => {
    const spellings = [
      ...FUTURES_ROOTS,
      ...FUTURES_ROOTS.map((r) => `${r}Z5`),
      ...FUTURES_ROOTS.map((r) => `${r}U2025`),
      ...FUTURES_ROOTS.map((r) => `/${r}`),
      ...FUTURES_ROOTS.map((r) => `${r}=F`),
      ...FUTURES_ROOTS.map((r) => `${r}.r`),
      ...FUTURES_ROOTS.map((r) => `${r}m`),
    ];
    for (const s of spellings) expect(getInstrument(s)).toBeNull();
  });
});

describe("16. MES long, 2 contracts, 5000 -> 5004 through the CSV path is still +$40", () => {
  it("computes 4 points x 2 x $5 = $40 with no fees", () => {
    const csv = [
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time",
      "MES,long,2,5000,5004,2026-07-01T14:00:00Z,2026-07-01T14:10:00Z",
    ].join("\n");
    const r = ingestCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].pnl).toBe(40);
    expect(r.trades[0].assetClass).toBeNull();
  });

  it("a futures fee still comes straight off: ES 1 contract, 2 points, $4 fees = $96", () => {
    const csv = [
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees",
      "ES,long,1,5000,5002,2026-07-01T14:00:00Z,2026-07-01T14:10:00Z,4",
    ].join("\n");
    expect(ingestCsv(csv).trades[0].pnl).toBe(96);
  });
});
