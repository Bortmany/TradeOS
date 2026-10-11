// Position-size calculator maths: golden cases checked by hand.
// Always rounds down, never up; an unknown symbol is refused, never priced at 1;
// forex/CFD sizing is USD accounts only.

import { describe, it, expect } from "vitest";
import {
  calculatePositionSize,
  sizeLabel,
  sizeMarket,
  sizeSummaryLine,
  sizeWorking,
  type SizeOk,
} from "@/lib/sizing";

function ok(input: Parameters<typeof calculatePositionSize>[0]): SizeOk {
  const r = calculatePositionSize(input);
  if (!r.ok) throw new Error(`expected a size, got: ${r.message}`);
  return r;
}

describe("futures golden cases", () => {
  it("MES $50,000 / 1% / 8 points = 12 contracts, real risk $480.00 (0.96%)", () => {
    const r = ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 8 });
    expect(r.riskBudget).toBe(500);
    expect(r.riskPerUnit).toBe(40);
    expect(r.rawSize).toBe(12.5);
    expect(r.size).toBe(12);
    expect(r.realRisk).toBe(480);
    expect(r.realRiskPercent).toBe(0.96);
    expect(sizeLabel(r)).toBe("12 contracts");
  });

  it("shows the working exactly as the screen spec words it", () => {
    const r = ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 8 });
    const w = sizeWorking(r);
    expect(w).toHaveLength(4);
    expect(w[0]).toMatchObject({ title: "Money at risk", sum: "$50,000.00 x 1% =", result: "$500.00" });
    expect(w[1]).toMatchObject({ title: "Risk per contract", sum: "8 points x $5.00 per point =", result: "$40.00" });
    expect(w[2]).toMatchObject({
      title: "Contracts",
      sum: "$500.00 / $40.00 = 12.5, rounded down",
      result: "12",
      roundedDown: true,
    });
    expect(w[3]).toMatchObject({
      title: "Real risk",
      sum: "12 contracts x $40.00 =",
      result: "$480.00 (0.96%)",
    });
    expect(sizeSummaryLine(r)).toBe("Risking $480.00 of $50,000.00 (0.96%)");
  });

  it("ES $100,000 / 0.5% / 4 points = 2", () => {
    expect(ok({ symbol: "ES", accountSize: 100000, riskPercent: 0.5, stopDistance: 4 }).size).toBe(2);
  });

  it("MNQ $25,000 / 1% / 20 points = 6", () => {
    expect(ok({ symbol: "MNQ", accountSize: 25000, riskPercent: 1, stopDistance: 20 }).size).toBe(6);
  });

  it("MGC $30,000 / 1% / 3 points = exactly 10", () => {
    expect(ok({ symbol: "MGC", accountSize: 30000, riskPercent: 1, stopDistance: 3 }).size).toBe(10);
  });

  it("recognises a dated contract code (MESZ6) as MES", () => {
    expect(sizeMarket("MESZ6")).toBe("futures");
    expect(ok({ symbol: "MESZ6", accountSize: 50000, riskPercent: 1, stopDistance: 8 }).size).toBe(12);
  });

  it("percentages that do not divide cleanly in floating point never lose a contract", () => {
    // 0.7% of $50,000 = $350; 7 points x $5 = $35 -> exactly 10.
    expect(ok({ symbol: "MES", accountSize: 50000, riskPercent: 0.7, stopDistance: 7 }).size).toBe(10);
    // 1.1% of $10,000 = $110; 2.2 points x $5 = $11 -> exactly 10.
    expect(ok({ symbol: "MES", accountSize: 10000, riskPercent: 1.1, stopDistance: 2.2 }).size).toBe(10);
    // 0.3% of $10,000 = $30; 1 point x $5... 6 contracts exactly.
    expect(ok({ symbol: "MES", accountSize: 10000, riskPercent: 0.3, stopDistance: 1 }).size).toBe(6);
  });

  it("always rounds down, never up", () => {
    // $500 / $40.40 = 12.37 -> 12; $500 / $38.50 = 12.98 -> 12.
    expect(ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 8.08 }).size).toBe(12);
    expect(ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 7.7 }).size).toBe(12);
  });

  it("Other futures: the typed dollars per point is used for a symbol we don't know", () => {
    const r = ok({ symbol: "ZZ", accountSize: 50000, riskPercent: 1, stopDistance: 8, dollarsPerPoint: 12.5 });
    expect(r.riskPerUnit).toBe(100);
    expect(r.size).toBe(5);
  });

  it("Other futures without dollars per point is refused", () => {
    const r = calculatePositionSize({
      symbol: "ZZ",
      accountSize: 50000,
      riskPercent: 1,
      stopDistance: 8,
      dollarsPerPoint: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("dollarsPerPoint");
  });
});

describe("zero case: one contract is already too big", () => {
  it("returns 0 with the reason and never rounds up to 1", () => {
    // MES, 200 points: one contract risks $1,000 against a $500 limit.
    const r = ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 200 });
    expect(r.size).toBe(0);
    expect(r.tooBigForOne).toBe(true);
    expect(r.realRisk).toBe(0);
    expect(r.smallestRisk).toBe(1000);
    expect(r.smallestRiskPercent).toBe(2);
    expect(sizeLabel(r)).toBe("0 contracts");
    expect(sizeSummaryLine(r)).toBe(
      "Even 1 contract risks $1,000.00 (2.00%), more than your limit of $500.00."
    );
    const w = sizeWorking(r);
    expect(w[2]).toMatchObject({ sum: "$500.00 / $1,000.00 = 0.5, rounded down", result: "0" });
    expect(w[3]).toMatchObject({
      title: "Smallest size",
      sum: "1 contract x $1,000.00 =",
      result: "$1,000.00 (2.00%)",
    });
  });

  it("an account too small for even 0.01 lots gives 0 lots", () => {
    const r = ok({ symbol: "EURUSD", accountSize: 100, riskPercent: 0.01, stopDistance: 500 });
    expect(r.size).toBe(0);
    expect(r.tooBigForOne).toBe(true);
  });
});

describe("forex / CFD", () => {
  it("EURUSD $10,000 / 1% / 20 pips = 0.50 lots", () => {
    const r = ok({ symbol: "EURUSD", accountSize: 10000, riskPercent: 1, stopDistance: 20 });
    expect(r.market).toBe("forex");
    expect(r.stopUnit).toBe("pips");
    expect(r.riskPerUnit).toBe(200);
    expect(r.size).toBe(0.5);
    expect(r.realRisk).toBe(100);
    expect(r.realRiskPercent).toBe(1);
    expect(sizeLabel(r)).toBe("0.50 lots");
    const w = sizeWorking(r);
    expect(w[0].sum).toBe("$10,000.00 x 1% =");
    expect(w[1].result).toBe("$200.00");
    expect(w[2]).toMatchObject({ result: "0.50", roundedDown: true });
    expect(w[2].sum).toBe("$100.00 / $200.00 = 0.50, rounded down to 0.01");
    expect(w[3].result).toBe("$100.00 (1.00%)");
  });

  it("rounds lots down to the 0.01 step", () => {
    // $100 / (17 pips x $10) = 0.588 -> 0.58
    const r = ok({ symbol: "EURUSD", accountSize: 10000, riskPercent: 1, stopDistance: 17 });
    expect(r.size).toBe(0.58);
    expect(r.realRisk).toBeLessThanOrEqual(r.riskBudget);
  });

  it("a non-USD account is refused with the plain message", () => {
    const r = calculatePositionSize({
      symbol: "EURUSD",
      accountSize: 10000,
      riskPercent: 1,
      stopDistance: 20,
      accountCurrency: "EUR",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("non_usd_forex");
      expect(r.message).toBe(
        "Forex sizing for non-USD accounts isn't available yet. Futures sizing works for every account."
      );
    }
  });

  it("futures sizing still works on a non-USD account", () => {
    expect(
      ok({ symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 8, accountCurrency: "EUR" }).size
    ).toBe(12);
  });

  it("a pair that needs a conversion price is refused, not guessed", () => {
    const r = calculatePositionSize({ symbol: "EURGBP", accountSize: 10000, riskPercent: 1, stopDistance: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("needs_rate");
  });
});

describe("refusals", () => {
  const base = { symbol: "MES", accountSize: 50000, riskPercent: 1, stopDistance: 8 };

  it("an unknown symbol is refused, never priced at 1", () => {
    for (const symbol of ["XYZ", "", "AAPL", "NOPE123"]) {
      const r = calculatePositionSize({ ...base, symbol });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("unknown_symbol");
    }
  });

  it("bad numbers are refused with plain messages, never NaN", () => {
    const bad: Array<[Partial<typeof base>, string]> = [
      [{ accountSize: NaN }, "accountSize"],
      [{ accountSize: -5 }, "accountSize"],
      [{ accountSize: 50 }, "accountSize"],
      [{ accountSize: 200_000_000 }, "accountSize"],
      [{ riskPercent: 0 }, "riskPercent"],
      [{ riskPercent: 0.001 }, "riskPercent"],
      [{ riskPercent: 101 }, "riskPercent"],
      [{ riskPercent: Infinity }, "riskPercent"],
      [{ stopDistance: 0 }, "stopDistance"],
      [{ stopDistance: -3 }, "stopDistance"],
      [{ stopDistance: NaN }, "stopDistance"],
    ];
    for (const [patch, field] of bad) {
      const r = calculatePositionSize({ ...base, ...patch });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.field).toBe(field);
        expect(r.message).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("risk above 5% still answers but warns", () => {
    const r = ok({ ...base, riskPercent: 6 });
    expect(r.warnings).toContain("high_risk");
    expect(ok(base).warnings).toEqual([]);
  });
});
