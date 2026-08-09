// Rule-config hardening, item 4 — a time_window rule whose start is after its
// end can never match any trade (the engine fails every trade as both "before
// open" and "after close"), so the rule silently never passes. TimeWindowConfig
// now rejects that impossible config instead of accepting a dead rule.

import { describe, it, expect } from "vitest";
import { TimeWindowConfig } from "@/lib/types";

describe("TimeWindowConfig — rejects a start-after-end (never-matching) window", () => {
  it("accepts a normal window (start before end)", () => {
    expect(TimeWindowConfig.safeParse({ start: "09:30", end: "16:00" }).success).toBe(true);
  });

  it("accepts a zero-width window (start equals end)", () => {
    expect(TimeWindowConfig.safeParse({ start: "09:30", end: "09:30" }).success).toBe(true);
  });

  it("rejects a window whose start is after its end", () => {
    const result = TimeWindowConfig.safeParse({ start: "16:00", end: "09:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("end"))).toBe(true);
    }
  });

  it("still rejects an invalid time format", () => {
    expect(TimeWindowConfig.safeParse({ start: "99:99", end: "10:00" }).success).toBe(false);
  });
});
