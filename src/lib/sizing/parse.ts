// Turning what a trader typed into a number for the size calculator. Pure.

export type ParsedNumber = { kind: "empty" } | { kind: "nan" } | { kind: "ok"; value: number };

/** "50,000" -> 50000, "" -> empty, "abc" / "1e5" / "--3" -> nan. Never returns NaN as a value. */
export function parseNumberText(text: string): ParsedNumber {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return { kind: "empty" };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { kind: "nan" };
  const value = Number(t);
  return Number.isFinite(value) ? { kind: "ok", value } : { kind: "nan" };
}

/** Adds thousands commas while typing ("50000" -> "50,000"). Anything that isn't a plain number is left as typed. */
export function withCommas(text: string): string {
  const t = text.replace(/,/g, "");
  const m = /^(\d*)(\.\d*)?$/.exec(t);
  if (!m || t === "") return text;
  const whole = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}${m[2] ?? ""}`;
}
