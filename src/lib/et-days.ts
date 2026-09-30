// TradeOS — New York calendar-day keys ("YYYY-MM-DD") for the journal date
// filter and the report windows.
//
// Pure and client-safe (no server imports). A key names a New York (ET)
// calendar day — the same day the rule engine's `etDayKey` gives a trade — and
// all arithmetic here is plain calendar arithmetic on the key, never on the
// machine's own clock, so the answer is identical on every computer.
//
// Turning a key into an instant (ET midnight / ET end of day) lives in
// `src/lib/backtest/time.ts` (`etDateStartUtc` / `etDateEndUtc`), which the
// server-side data layer uses.

import { formatDayKey } from "@/lib/utils";

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NBSP = " ";

/** Midday UTC on a calendar date — safe for day arithmetic in any zone. */
function noonUtc(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

/** True when `key` is shaped YYYY-MM-DD and exists on the calendar (no 2026-02-30). */
export function isDayKey(key: unknown): key is string {
  if (typeof key !== "string" || !DAY_KEY_PATTERN.test(key)) return false;
  const d = noonUtc(key);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** Move a day key by whole days (negative = earlier). */
export function shiftDayKey(key: string, days: number): string {
  const d = noonUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Report windows ──────────────────────────────────────────────────────────

export type ReportWindowPeriod = "day" | "week" | "month";

/** Days in each report window: Daily = 1, Weekly = 7, Monthly = 30. */
export const REPORT_WINDOW_DAYS: Record<ReportWindowPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/** The first and last ET day of the window that ENDS on `anchorKey`. */
export function reportWindowKeys(
  period: ReportWindowPeriod,
  anchorKey: string
): { startKey: string; endKey: string } {
  return { startKey: shiftDayKey(anchorKey, -(REPORT_WINDOW_DAYS[period] - 1)), endKey: anchorKey };
}

/** The anchor one window earlier. */
export function previousAnchor(period: ReportWindowPeriod, anchorKey: string): string {
  return shiftDayKey(anchorKey, -REPORT_WINDOW_DAYS[period]);
}

/** The anchor one window later, never past `todayKey`. */
export function nextAnchor(period: ReportWindowPeriod, anchorKey: string, todayKey: string): string {
  const next = shiftDayKey(anchorKey, REPORT_WINDOW_DAYS[period]);
  return next > todayKey ? todayKey : next;
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** "Sep 9 – Sep 15 ET" (or "Sep 15 ET" for one day). Keys are printed unshifted. */
export function formatDayKeyRange(startKey: string, endKey: string): string {
  if (startKey === endKey) return `${formatDayKey(endKey, "short")}${NBSP}ET`;
  return `${formatDayKey(startKey, "short")} – ${formatDayKey(endKey, "short")}${NBSP}ET`;
}

/** Phone form: "Sep 9 – 15 ET" inside one month, else the full "Aug 28 – Sep 3 ET". */
export function formatDayKeyRangeShort(startKey: string, endKey: string): string {
  if (startKey === endKey) return `${formatDayKey(endKey, "short")}${NBSP}ET`;
  if (startKey.slice(0, 7) === endKey.slice(0, 7)) {
    return `${formatDayKey(startKey, "short")} – ${Number(endKey.slice(8, 10))}${NBSP}ET`;
  }
  return formatDayKeyRange(startKey, endKey);
}

/** Journal date-filter chip: "Sep 1 – Sep 15 ET", "From Sep 1 ET", "Until Sep 15 ET". */
export function formatDayFilterLabel(fromKey?: string | null, toKey?: string | null): string | null {
  if (fromKey && toKey) return formatDayKeyRange(fromKey, toKey);
  if (fromKey) return `From ${formatDayKey(fromKey, "short")}${NBSP}ET`;
  if (toKey) return `Until ${formatDayKey(toKey, "short")}${NBSP}ET`;
  return null;
}
