// Forex / CFD maths — the golden cases from the Step 4 spec. The expected
// numbers are fixed by the spec: a mismatch is a bug, not a rounding choice.

import { describe, it, expect } from "vitest";
import {
  getInstrument,
  pipSize,
  pipValue,
  pnlFromPrices,
  pipsFromPrices,
  neededConversionPair,
  InstrumentError,
  INSTRUMENT_TABLE,
} from "@/lib/instruments";

describe("pip size and pip value", () => {
  it("1. EURUSD pip is 0.0001", () => {
    expect(pipSize("EURUSD")).toBe(0.0001);
  });

  it("2. EURUSD: 1 lot = $10 a pip, 0.10 lot = $1, 0.01 lot = $0.10", () => {
    expect(pipValue("EURUSD", 1, "USD")).toBe(10);
    expect(pipValue("EURUSD", 0.1, "USD")).toBe(1);
    expect(pipValue("EURUSD", 0.01, "USD")).toBe(0.1);
  });

  it("4. USDJPY pip is 0.01", () => {
    expect(pipSize("USDJPY")).toBe(0.01);
  });

  it("5. USDJPY at 150: 1,000 yen a pip / 150 = 6.6667", () => {
    expect(pipValue("USDJPY", 1, "USD", 150)).toBe(6.6667);
  });

  it("8. USDCHF at 0.9000 = 11.1111", () => {
    expect(pipValue("USDCHF", 1, "USD", 0.9)).toBe(11.1111);
  });

  it("9. gold: pip value $10 a lot; 10. silver $50 a lot", () => {
    expect(pipValue("XAUUSD", 1, "USD")).toBe(10);
    expect(pipValue("XAGUSD", 1, "USD")).toBe(50);
  });

  it("12. EURGBP with GBPUSD 1.30 = $13.00 a pip", () => {
    expect(pipValue("EURGBP", 1, "USD", 1.3)).toBe(13);
  });
});

describe("profit and loss from prices", () => {
  it("3. EURUSD 1 lot, 1.10000 -> 1.10500 is +50.0 pips and +$500.00 (short: -$500.00)", () => {
    expect(pipsFromPrices("EURUSD", "long", 1.1, 1.105)).toBe(50);
    expect(
      pnlFromPrices({ symbol: "EURUSD", side: "long", lots: 1, entryPrice: 1.1, exitPrice: 1.105, accountCurrency: "USD" })
    ).toBe(500);
    expect(
      pnlFromPrices({ symbol: "EURUSD", side: "short", lots: 1, entryPrice: 1.1, exitPrice: 1.105, accountCurrency: "USD" })
    ).toBe(-500);
  });

  it("6. USDJPY 149.50 -> 150.50 with no rate uses its own exit price: +100.0 pips, +$664.45", () => {
    expect(pipsFromPrices("USDJPY", "long", 149.5, 150.5)).toBe(100);
    expect(
      pnlFromPrices({ symbol: "USDJPY", side: "long", lots: 1, entryPrice: 149.5, exitPrice: 150.5, accountCurrency: "USD" })
    ).toBe(664.45);
  });

  it("7. the same trade with a stated rate of 150.00: the stated rate wins, +$666.67", () => {
    expect(
      pnlFromPrices({ symbol: "USDJPY", side: "long", lots: 1, entryPrice: 149.5, exitPrice: 150.5, accountCurrency: "USD", rate: 150 })
    ).toBe(666.67);
  });

  it("9. XAUUSD 1 lot 2000.00 -> 2010.50 = +105.0 pips, +$1,050.00; 0.10 lot = +$105.00", () => {
    expect(pipsFromPrices("XAUUSD", "long", 2000, 2010.5)).toBe(105);
    const base = { symbol: "XAUUSD", side: "long" as const, entryPrice: 2000, exitPrice: 2010.5, accountCurrency: "USD" };
    expect(pnlFromPrices({ ...base, lots: 1 })).toBe(1050);
    expect(pnlFromPrices({ ...base, lots: 0.1 })).toBe(105);
  });

  it("12. EURGBP long 1 lot 0.86000 -> 0.86500 with GBPUSD 1.30 = +$650.00", () => {
    expect(
      pnlFromPrices({ symbol: "EURGBP", side: "long", lots: 1, entryPrice: 0.86, exitPrice: 0.865, accountCurrency: "USD", rate: 1.3 })
    ).toBe(650);
  });

  it("13. US30 long 1 lot 40000 -> 40100 = +$100.00", () => {
    expect(
      pnlFromPrices({ symbol: "US30", side: "long", lots: 1, entryPrice: 40000, exitPrice: 40100, accountCurrency: "USD" })
    ).toBe(100);
  });

  it("14. GER40 long 1 lot 18000 -> 18050 with EURUSD 1.10 = +$55.00", () => {
    expect(
      pnlFromPrices({ symbol: "GER40", side: "long", lots: 1, entryPrice: 18000, exitPrice: 18050, accountCurrency: "USD", rate: 1.1 })
    ).toBe(55);
  });

  it("a loss comes out negative and a flat trade is a clean zero", () => {
    const base = { symbol: "EURUSD", lots: 1, accountCurrency: "USD" };
    expect(pnlFromPrices({ ...base, side: "long", entryPrice: 1.1, exitPrice: 1.099 })).toBe(-100);
    expect(pnlFromPrices({ ...base, side: "long", entryPrice: 1.1, exitPrice: 1.1 })).toBe(0);
    expect(Object.is(pipsFromPrices("EURUSD", "long", 1.1, 1.1), 0)).toBe(true);
  });
});

describe("which rate is needed", () => {
  it("11. EURGBP with no rate is refused and names GBPUSD", () => {
    expect(() => pipValue("EURGBP", 1, "USD")).toThrow(/GBPUSD/);
    try {
      pipValue("EURGBP", 1, "USD");
    } catch (e) {
      expect(e).toBeInstanceOf(InstrumentError);
      expect((e as InstrumentError).code).toBe("needs_rate");
      expect((e as InstrumentError).pair).toBe("GBPUSD");
    }
    expect(() =>
      pnlFromPrices({ symbol: "EURGBP", side: "long", lots: 1, entryPrice: 0.86, exitPrice: 0.865, accountCurrency: "USD" })
    ).toThrow(/GBPUSD/);
  });

  it("neededConversionPair: EURGBP -> GBPUSD, GBPJPY -> USDJPY, GER40 -> EURUSD, JP225 -> USDJPY", () => {
    expect(neededConversionPair("EURGBP", "USD")).toBe("GBPUSD");
    expect(neededConversionPair("GBPJPY", "USD")).toBe("USDJPY");
    expect(neededConversionPair("GER40", "USD")).toBe("EURUSD");
    expect(neededConversionPair("UK100", "USD")).toBe("GBPUSD");
    expect(neededConversionPair("JP225", "USD")).toBe("USDJPY");
  });

  it("neededConversionPair: none needed for USD-quoted symbols or when the trade's own price is the rate", () => {
    expect(neededConversionPair("EURUSD", "USD")).toBeNull();
    expect(neededConversionPair("XAUUSD", "USD")).toBeNull();
    expect(neededConversionPair("US30", "USD")).toBeNull();
    expect(neededConversionPair("USDJPY", "USD")).toBeNull();
    expect(neededConversionPair("USDCHF", "USD")).toBeNull();
  });

  it("USDJPY pip value with no price and no rate is refused, naming USDJPY", () => {
    expect(() => pipValue("USDJPY", 1, "USD")).toThrow(/USDJPY/);
  });

  it("a stated rate beats the trade's own price", () => {
    const base = { symbol: "USDCHF", side: "long" as const, lots: 1, entryPrice: 0.9, exitPrice: 0.91, accountCurrency: "USD" };
    // 100 pips = 1,000 CHF; at its own price 0.91 -> 1098.90, at a stated 0.90 -> 1111.11
    expect(pnlFromPrices(base)).toBe(1098.9);
    expect(pnlFromPrices({ ...base, rate: 0.9 })).toBe(1111.11);
  });
});

describe("bad input is refused, never Infinity or NaN", () => {
  const good = { symbol: "EURUSD", side: "long" as const, lots: 1, entryPrice: 1.1, exitPrice: 1.105, accountCurrency: "USD" };

  it("19. zero, negative, NaN, Infinity and oversized lots", () => {
    for (const lots of [0, -1, NaN, Infinity, 1e200, 20_000_000]) {
      expect(() => pipValue("EURUSD", lots, "USD")).toThrow(InstrumentError);
      expect(() => pnlFromPrices({ ...good, lots })).toThrow(InstrumentError);
    }
  });

  it("19. negative, zero, NaN, Infinity and oversized prices", () => {
    for (const price of [0, -1.1, NaN, Infinity, 1e200]) {
      expect(() => pnlFromPrices({ ...good, entryPrice: price })).toThrow(InstrumentError);
      expect(() => pnlFromPrices({ ...good, exitPrice: price })).toThrow(InstrumentError);
      expect(() => pipsFromPrices("EURUSD", "long", price, 1.1)).toThrow(InstrumentError);
    }
  });

  it("19. a bad stated rate is refused", () => {
    for (const rate of [0, -1, NaN, Infinity, 1e200]) {
      expect(() => pipValue("EURGBP", 1, "USD", rate)).toThrow(InstrumentError);
    }
  });

  it("an unknown symbol, a bad side and a bad currency are refused", () => {
    expect(() => pipSize("BTCUSD")).toThrow(/not a forex or CFD symbol/);
    expect(() => pnlFromPrices({ ...good, side: "sideways" as never })).toThrow(InstrumentError);
    expect(() => pipValue("EURUSD", 1, "dollars")).toThrow(InstrumentError);
  });

  it("an answer too big to be real is refused rather than returned", () => {
    expect(() =>
      pnlFromPrices({ ...good, lots: 10_000_000, entryPrice: 1, exitPrice: 900_000_000 })
    ).toThrow(InstrumentError);
  });
});

describe("20. broker endings and alternative names", () => {
  const cases: [string, string][] = [
    ["EURUSD.r", "EURUSD"],
    ["EURUSDm", "EURUSD"],
    ["GBPUSD.pro", "GBPUSD"],
    ["EURUSD#", "EURUSD"],
    ["XAUUSD.", "XAUUSD"],
    ["GOLD", "XAUUSD"],
    ["USOIL", "USOIL"],
    ["WTI", "USOIL"],
    ["NAS100", "NAS100"],
    ["USTEC", "NAS100"],
    ["US30", "US30"],
    ["DJ30", "US30"],
    ["GER40", "GER40"],
    ["DE40", "GER40"],
    ["SPX500", "US500"],
    ["US500", "US500"],
    ["JPN225", "JP225"],
    ["JP225", "JP225"],
    ["  eurusd  ", "EURUSD"],
    ["GOLD.r", "XAUUSD"],
    ["USDJPYm", "USDJPY"],
  ];
  it.each(cases)("%s resolves to %s", (input, expected) => {
    expect(getInstrument(input)?.symbol).toBe(expected);
  });

  it("unknown symbols and non-strings give nothing", () => {
    for (const s of ["BTCUSD", "AAPL", "", "   ", "EUR.USD", "ESZ5"]) {
      expect(getInstrument(s)).toBeNull();
    }
    expect(getInstrument(undefined as never)).toBeNull();
  });

  it("the spec's index names are the primary rows; the old names are aliases", () => {
    const symbols = INSTRUMENT_TABLE.map((r) => r.symbol);
    expect(symbols).toContain("US500");
    expect(symbols).toContain("JP225");
    expect(symbols).not.toContain("SPX500");
    expect(symbols).not.toContain("JPN225");
  });
});

describe("asset class labels", () => {
  it("forex pairs are forex; metals, energy and indices are cfd", () => {
    expect(getInstrument("EURUSD")?.assetClass).toBe("forex");
    expect(getInstrument("XAUUSD")?.assetClass).toBe("cfd");
    expect(getInstrument("USOIL")?.assetClass).toBe("cfd");
    expect(getInstrument("US30")?.assetClass).toBe("cfd");
  });
});
