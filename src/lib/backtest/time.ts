// TradeOS — Backtesting: ET time helpers.
// Pure and deterministic. The engine's exported etClock/etDayKey (from
// @/lib/rules/engine) carry no weekday, and the richer clock inside
// analytics/buckets.ts is private — so the weekday extraction lives here,
// built on the same cached-Intl pattern.

export { etClock, etDayKey } from "@/lib/rules/engine";

const ET_TIME_ZONE = "America/New_York";

// Cached formatter — reused across calls (constructing Intl formatters is costly).
const etWeekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** ET weekday for an instant: 0 = Sunday .. 6 = Saturday (buckets.ts numbering). */
export function etWeekday(d: Date): number {
  return WEEKDAY_INDEX[etWeekdayFmt.format(d)] ?? 0;
}

/** "HH:MM" → minutes past midnight. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

// Cached formatter for the ET wall-clock → UTC conversion below.
const etOffsetFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Turn an ET wall-clock (y, m, d, hh, mm, ss) into the correct UTC instant —
 * DST-aware via Intl, independent of the host timezone (same technique as the
 * seed script's etWallToUtc).
 */
export function etWallToUtc(
  year: number,
  month: number,
  day: number,
  hh: number,
  mm: number,
  ss = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hh, mm, ss);
  const map: Record<string, string> = {};
  for (const p of etOffsetFmt.formatToParts(new Date(naive))) map[p.type] = p.value;
  const asUtc = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour === 24 ? 0 : +map.hour,
    +map.minute,
    +map.second
  );
  return new Date(naive - (asUtc - naive));
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ET midnight of a "YYYY-MM-DD" date, as a UTC instant. */
export function etDateStartUtc(dateStr: string): Date {
  const m = dateStr.match(DATE_ONLY);
  if (!m) return new Date(NaN);
  return etWallToUtc(+m[1], +m[2], +m[3], 0, 0, 0);
}

/** ET end-of-day (23:59:59.999) of a "YYYY-MM-DD" date, as a UTC instant. */
export function etDateEndUtc(dateStr: string): Date {
  const m = dateStr.match(DATE_ONLY);
  if (!m) return new Date(NaN);
  return new Date(etWallToUtc(+m[1], +m[2], +m[3], 23, 59, 59).getTime() + 999);
}
