// MT5 saved History reports (title rows above the Positions table, Orders and
// Deals sections below, blank spacer columns) and the generic-file forex/CFD
// guards: bare aliases (GOLD, WTI) are shares there, and forex sizes in units
// are skipped. Fixture: test/fixtures/mt5-history-report.csv. Pure parsing, no database.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ingestCsv } from "@/lib/ingestion";
import { MT5_MESSAGES } from "@/lib/ingestion/adapters/mt5";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SAMPLE = read("../public/samples/mt5-sample.csv");
const REPORT = read("./fixtures/mt5-history-report.csv");
const total = (r: { trades: { pnl?: number | null }[] }) =>
  Math.round(r.trades.reduce((s, t) => s + (t.pnl ?? 0), 0) * 100) / 100;

describe("a saved MT5 History report imports like the plain sample", () => {
  const plain = ingestCsv(SAMPLE);

  for (const [label, broker] of [["auto-detect", undefined], ["MetaTrader 5 chosen", "mt5" as const]] as const) {
    it(`${label}: same 5 trades and $857.31, open and BTCUSD rows skipped`, () => {
      const r = ingestCsv(REPORT, broker);
      expect(r.refusal).toBeUndefined();
      expect(r.broker).toBe("mt5");
      expect(r.trades).toHaveLength(5);
      expect(total(r)).toBe(857.31);
      expect(r.openSkipped).toBe(1);
      expect(r.skipped).toBe(2);
      expect(r.trades).toEqual(plain.trades);
    });
  }

  it("ignores the Orders, Deals and summary sections below the table", () => {
    const r = ingestCsv(REPORT);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/BTCUSD is not supported yet/);
  });

  it("names the real file row in an error (BTCUSD is row 15)", () => {
    expect(ingestCsv(REPORT).errors[0]).toBe("Row 15: symbol BTCUSD is not supported yet");
  });

  it("the plain sample is unchanged", () => {
    expect(plain.broker).toBe("mt5");
    expect(plain.trades).toHaveLength(5);
    expect(total(plain)).toBe(857.31);
    expect(plain.errors).toEqual(["Row 8: symbol BTCUSD is not supported yet"]);
  });
});

describe("refusals still work when the header is not on row 1", () => {
  it("a Deals table under title rows is refused as Deals", () => {
    const text = [
      "Trade History Report",
      "Name:,Test Trader",
      "",
      "Deals",
      "Time,Deal,Symbol,Type,Direction,Volume,Price",
      "2026.09.14 09:15:00,9001,EURUSD,buy,in,1.00,1.10000",
    ].join("\n");
    for (const broker of [undefined, "mt5" as const]) {
      const r = ingestCsv(text, broker);
      expect(r.refusal).toBe(MT5_MESSAGES.deals);
      expect(r.trades).toHaveLength(0);
    }
  });

  it("a semicolon file under a title row is refused as semicolons", () => {
    const text = [
      "Trade History Report",
      "Time;Position;Symbol;Type;Volume;Price;S / L;T / P;Time;Price;Commission;Swap;Profit",
      "2026.09.14 09:15:00;1001;EURUSD;buy;1.00;1.10000;;;2026.09.14 11:40:00;1.10500;-7;0;500",
    ].join("\n");
    for (const broker of [undefined, "mt5" as const]) {
      expect(ingestCsv(text, broker).refusal).toBe(MT5_MESSAGES.semicolons);
    }
  });

  it("choosing MT5 for a file with no Positions table is still refused", () => {
    const r = ingestCsv("Title\nSymbol,Side,Quantity\nES,buy,1\n", "mt5");
    expect(r.refusal).toBe(MT5_MESSAGES.notPositions);
  });

  it("other adapters read a file with a title row exactly as before (no MT5 rescue)", () => {
    const r = ingestCsv(REPORT, "generic");
    expect(r.broker).toBe("generic");
    expect(r.trades).toHaveLength(0);
  });
});

describe("generic files with no P&L column: forex/CFD pricing is for real table symbols only", () => {
  const HEAD = "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees";
  const line = (sym: string, qty: string, entry: string, exit: string) =>
    `${sym},buy,${qty},${entry},${exit},2026-09-14T09:00:00Z,2026-09-14T10:00:00Z,0`;
  const run = (...lines: string[]) => ingestCsv([HEAD, ...lines].join("\n"), "generic");

  it("XAUUSD is still priced as gold: 1 lot, +10.50 = $1,050.00", () => {
    const r = run(line("XAUUSD", "1", "2000", "2010.5"));
    expect(r.trades[0].pnl).toBe(1050);
  });

  it("broker endings still work: XAUUSD.r and EURUSDm", () => {
    const r = run(line("XAUUSD.r", "1", "2000", "2010.5"), line("EURUSDm", "1", "1.1", "1.105"));
    expect(r.trades.map((t) => t.pnl)).toEqual([1050, 500]);
  });

  it("the stock ticker GOLD is a share (multiplier 1), not XAUUSD x100", () => {
    const r = run(line("GOLD", "10", "20", "21"));
    expect(r.trades[0].pnl).toBe(10);
  });

  it("the stock ticker WTI is a share, not oil x1000", () => {
    const r = run(line("WTI", "100", "3", "3.5"));
    expect(r.trades[0].pnl).toBe(50);
  });

  it("the MT5 adapter still resolves GOLD to gold", () => {
    const mt5 = ingestCsv(
      [
        "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit",
        "2026.09.14 09:15:00,1,GOLD,buy,0.10,2000.00,,,2026.09.14 11:40:00,2010.50,0,0,105.00",
      ].join("\n")
    );
    expect(mt5.trades[0]).toMatchObject({ symbol: "XAUUSD", assetClass: "cfd" });
  });

  it("a forex size in units (20000) is skipped with a plain message; lots still import", () => {
    const r = run(line("EURUSD", "20000", "1.1", "1.105"), line("EURUSD", "0.5", "1.1", "1.105"));
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].pnl).toBe(250);
    expect(r.skipped).toBe(1);
    expect(r.errors).toEqual([
      "Row 2: EURUSD quantity 20000 looks like units, not lots (1 lot = 100000 units). Enter the size in lots and import again",
    ]);
  });

  it("nothing is skipped for units when the file gives its own P&L column", () => {
    const withPnl = ingestCsv(
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,PnL\nEURUSD,buy,20000,1.1,1.105,2026-09-14T09:00:00Z,2026-09-14T10:00:00Z,100\n",
      "generic"
    );
    expect(withPnl.trades).toHaveLength(1);
    expect(withPnl.trades[0].pnl).toBe(100);
  });
});
