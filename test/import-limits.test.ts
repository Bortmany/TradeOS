// CSV import ceilings — the request body and the parsed row count are both
// capped before any database write.

import { describe, it, expect } from "vitest";
import { MAX_CSV_CHARS, MAX_IMPORT_ROWS_FALLBACK, importRowLimit } from "@/lib/import-limits";
import { getFeatures } from "@/lib/billing/plans";

describe("import limits", () => {
  it("caps the CSV body at 2,000,000 characters", () => {
    expect(MAX_CSV_CHARS).toBe(2_000_000);
  });

  it("uses the plan's per-import limit when it has one", () => {
    const pro = getFeatures("pro").maxTradesPerImport;
    expect(importRowLimit(pro)).toBe(pro);
  });

  it("falls back to 10,000 rows when a plan has no usable limit", () => {
    expect(MAX_IMPORT_ROWS_FALLBACK).toBe(10_000);
    expect(importRowLimit(undefined)).toBe(10_000);
    expect(importRowLimit(0)).toBe(10_000);
    expect(importRowLimit(Infinity)).toBe(10_000);
  });
});
