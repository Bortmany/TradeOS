// CSV import hardening, items 3 & 4.
//
// 3) NormalizedTradeSchema used to lack `.finite()`, so an overflow row could
//    carry pnl=Infinity, pass validation, throw on insert, and get swallowed by
//    a catch that assumed every failure was a dedupe → the import reported
//    ok/skipped with an EMPTY errors list (silent data loss). The schema now
//    rejects non-finite and out-of-bounds numbers so the bad row surfaces as an
//    error at parse time, before it can ever reach the database.
//
// 4) Sane upper bounds on price/quantity/fees.

import { describe, it, expect } from "vitest";
import { NormalizedTradeSchema, MAX_TRADE_PRICE } from "@/lib/types";
import { ingestCsv } from "@/lib/ingestion";

const base = {
  symbol: "ES",
  side: "long" as const,
  entryPrice: 5000,
  exitPrice: 5010,
  quantity: 2,
  entryTime: "2024-01-02T09:30:00Z",
  exitTime: "2024-01-02T10:00:00Z",
  fees: 4,
};

describe("NormalizedTradeSchema — rejects non-finite and out-of-bounds numbers", () => {
  it("accepts a normal, finite trade", () => {
    expect(NormalizedTradeSchema.safeParse({ ...base, pnl: 996 }).success).toBe(true);
  });

  it("rejects a pnl of Infinity (the exact silent-data-loss root cause)", () => {
    expect(NormalizedTradeSchema.safeParse({ ...base, pnl: Infinity }).success).toBe(false);
  });

  it("rejects NaN", () => {
    expect(NormalizedTradeSchema.safeParse({ ...base, entryPrice: NaN }).success).toBe(false);
  });

  it("rejects an absurd entry price above the upper bound", () => {
    expect(
      NormalizedTradeSchema.safeParse({ ...base, entryPrice: MAX_TRADE_PRICE * 10 }).success,
    ).toBe(false);
  });

  it("rejects an absurd quantity above the upper bound", () => {
    expect(NormalizedTradeSchema.safeParse({ ...base, quantity: 100_000_000 }).success).toBe(false);
  });
});

describe("ingestCsv — an overflow row is REPORTED, not silently dropped", () => {
  it("keeps the good row and surfaces the overflow row as an error", () => {
    // "1" followed by 200 zeros = 1e200: a plain-digit value the CSV number
    // parser reads as finite, but multiplying it into pnl would overflow to
    // Infinity — exactly the row that used to slip through and vanish on insert.
    const overflowPrice = "1".padEnd(201, "0");
    const csv = [
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees",
      "ES,long,2,5000,5010,2024-01-02T09:30:00Z,2024-01-02T10:00:00Z,4",
      `ES,long,2,${overflowPrice},5010,2024-01-02T09:30:00Z,2024-01-02T10:00:00Z,4`,
    ].join("\n");

    const result = ingestCsv(csv);

    expect(result.trades).toHaveLength(1); // only the good row survives
    expect(result.skipped).toBe(1); // the overflow row was NOT imported
    expect(result.errors.length).toBeGreaterThan(0); // …and it's reported, not silent
    expect(result.errors.join(" ")).toMatch(/entryprice/i);
  });
});
