// TradeOS — hard ceilings for CSV imports, independent of plan.
// The CSV body is parsed in memory, so an unbounded string is a memory/CPU
// denial-of-service vector. Kept in its own module so tests can import them
// (Next.js route files may only export route handlers).

/** Maximum characters accepted in the `csvText` body (~2 MB). */
export const MAX_CSV_CHARS = 2_000_000;

/** Row ceiling used when a plan has no usable per-import limit of its own. */
export const MAX_IMPORT_ROWS_FALLBACK = 10_000;

/** The number of parsed rows an import may insert: the plan's limit, else the fallback. */
export function importRowLimit(planLimit: number | undefined): number {
  return planLimit !== undefined && Number.isFinite(planLimit) && planLimit > 0
    ? planLimit
    : MAX_IMPORT_ROWS_FALLBACK;
}
