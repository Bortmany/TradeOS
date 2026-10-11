// TradeOS — dashboard "Recent Violations" rows.
//
// Identical repeats (the same rule broken on the same trade — e.g. one rule
// name living in two active rulebooks) collapse into one row with a count, so
// the feed never lists the same thing twice. Different trades never merge.
// Pure; display only (the rule engine's results are untouched).

export interface ViolationLike {
  tradeId: string;
  ruleName: string;
}

export type ViolationRow<T extends ViolationLike> = T & { count: number };

export function collapseViolations<T extends ViolationLike>(violations: T[]): ViolationRow<T>[] {
  const rows: ViolationRow<T>[] = [];
  const byKey = new Map<string, ViolationRow<T>>();
  for (const v of violations) {
    const key = `${v.tradeId}\u0000${v.ruleName}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const row = { ...v, count: 1 };
    byKey.set(key, row);
    rows.push(row);
  }
  return rows;
}
