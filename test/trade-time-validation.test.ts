// Two related pentest findings, both about accepting impossible input:
//   - a trade whose exit is before its entry (manual create AND CSV import)
//   - a time_window rule config with an impossible clock time ("99:99")
//
// `isValidTradeTimeOrder` (src/lib/validation.ts) is the single function both
// the manual trade-create route and every CSV adapter call through
// TradeCollector.add(), so testing it here covers both paths at once; the CSV
// integration test below proves the wiring, end to end, through ingestCsv().

import { describe, it, expect } from "vitest";
import { isValidTradeTimeOrder } from "@/lib/validation";
import { TimeWindowConfig } from "@/lib/types";
import { ingestCsv } from "@/lib/ingestion";

describe("isValidTradeTimeOrder", () => {
  const entry = new Date("2026-07-01T14:00:00Z");

  it("accepts an open trade (no exit yet)", () => {
    expect(isValidTradeTimeOrder(entry, null)).toBe(true);
    expect(isValidTradeTimeOrder(entry, undefined)).toBe(true);
  });

  it("accepts an exit after entry", () => {
    expect(isValidTradeTimeOrder(entry, new Date("2026-07-01T14:10:00Z"))).toBe(true);
  });

  it("accepts an exit equal to entry (a zero-duration scalp)", () => {
    expect(isValidTradeTimeOrder(entry, entry)).toBe(true);
  });

  it("rejects an exit before entry", () => {
    expect(isValidTradeTimeOrder(entry, new Date("2026-07-01T13:59:00Z"))).toBe(false);
  });

  it("rejects an exit years before entry (the pentest's example)", () => {
    expect(isValidTradeTimeOrder(entry, new Date("2020-07-01T14:00:00Z"))).toBe(false);
  });
});

describe("CSV import rejects an exit before entry", () => {
  it("skips the bad row and keeps the good one, with an explanatory error", () => {
    const csv =
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees,PnL\n" +
      "ES,buy,1,5000,5010,2026-07-01T14:00:00Z,2020-01-01T00:00:00Z,0,500\n" +
      "ES,buy,1,5000,5010,2026-07-01T14:00:00Z,2026-07-01T14:10:00Z,0,500\n";

    const result = ingestCsv(csv, "generic");

    expect(result.trades).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.errors.some((e) => e.includes("exit time is before entry time"))).toBe(true);
  });
});

describe("time_window rule config — impossible clock times", () => {
  it("accepts valid HH:MM times", () => {
    const parsed = TimeWindowConfig.safeParse({ start: "09:30", end: "16:00" });
    expect(parsed.success).toBe(true);
  });

  it("accepts the boundary values 00:00 and 23:59", () => {
    expect(TimeWindowConfig.safeParse({ start: "00:00", end: "23:59" }).success).toBe(true);
  });

  it("rejects impossible hours/minutes like 99:99", () => {
    expect(TimeWindowConfig.safeParse({ start: "99:99", end: "16:00" }).success).toBe(false);
  });

  it("rejects an out-of-range hour (24:00) and minute (12:60)", () => {
    expect(TimeWindowConfig.safeParse({ start: "24:00", end: "16:00" }).success).toBe(false);
    expect(TimeWindowConfig.safeParse({ start: "09:30", end: "12:60" }).success).toBe(false);
  });
});
