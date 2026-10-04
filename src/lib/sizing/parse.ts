// Turning what a trader typed into a number for the size calculator. Pure.

export type ParsedNumber = { kind: "empty" } | { kind: "nan" } | { kind: "ok"; value: number };

/** "50,000" -> 50000, "" -> empty, "abc" / "1e5" / "--3" -> nan. Never returns NaN as a value. */
export function parseNumberText(text: string): ParsedNumber {
  // "1,5" or "0,25" is a decimal comma, not 15 / 25: refuse rather than guess.
  if (looksLikeDecimalComma(text)) return { kind: "nan" };
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return { kind: "empty" };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { kind: "nan" };
  const value = Number(t);
  return Number.isFinite(value) ? { kind: "ok", value } : { kind: "nan" };
}

/** Adds thousands commas while typing ("50000" -> "50,000"). Anything that isn't a plain number is left as typed. */
export function withCommas(text: string): string {
  if (looksLikeDecimalComma(text)) return text; // leave "1,5" as typed so it can be refused
  const t = text.replace(/,/g, "");
  const m = /^(\d*)(\.\d*)?$/.exec(t);
  if (!m || t === "") return text;
  const whole = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}${m[2] ?? ""}`;
}

/** True for "1,5" / "0,25": one comma followed by one or two digits (thousands commas have three). */
export function looksLikeDecimalComma(text: string): boolean {
  return /^\s*-?\d+,\d{1,2}\s*$/.test(text);
}

/** The message to show for a field that did not parse (and for an empty one). */
export function numberProblemMessage(text: string, empty: boolean): string {
  if (empty) return "Enter a number.";
  return looksLikeDecimalComma(text) ? "Use a dot for decimals." : "That doesn't look like a number.";
}
