import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --------------------------------------------------------------------------
// Formatting — used everywhere numbers are shown. Consistent, locale-aware,
// and biased toward the dense "trading terminal" presentation.
// --------------------------------------------------------------------------

export function formatCurrency(
  value: number,
  opts: { compact?: boolean; sign?: boolean } = {}
): string {
  const { compact = false, sign = false } = opts;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  });
  const formatted = formatter.format(value);
  if (sign && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const pct = (value * 100).toFixed(digits);
  return value > 0 ? `+${pct}%` : `${pct}%`;
}

// Semantic color class for a P&L value. Returns tailwind text color tokens.
export function pnlColor(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-profit";
  if (score >= 60) return "text-warning";
  return "text-loss";
}

export function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// --------------------------------------------------------------------------
// Time zones — DISPLAY ONLY.
//
// Grading (rule engine, discipline score, report day boundaries) always runs on
// the New York clock and never reads anything here. These helpers only decide
// how an instant is PRINTED: in the zone the trader saved in Settings, with a
// short label after every time ("9:45 AM ET", "5:45 PM GST").
//
// The output is assembled from Intl parts by hand (never `toLocaleString`) so it
// is identical on the server and in any browser, whatever the machine's own
// zone, locale or ICU version — that keeps server and browser renders equal.
// --------------------------------------------------------------------------

export const DEFAULT_TIME_ZONE = "America/New_York";

/** Non-breaking space: "9:45 AM ET" never splits across two lines. */
const NBSP = " ";

interface ZoneLabel {
  /** City name shown in the Settings picker. */
  city: string;
  /** Label in standard time (or all year for zones with one label). */
  std: string;
  /** Label while daylight saving is in force, when it differs. */
  dst?: string;
}

/**
 * The fixed label table. Same on every machine, so labels never depend on the
 * browser's own abbreviations (which print "GMT+4" for Muscat and "EDT" for
 * New York). US zones always print one label (ET, not EST/EDT) to match the
 * "ET" the rule verdicts use.
 */
export const TIME_ZONE_LABELS: Readonly<Record<string, ZoneLabel>> = {
  "America/New_York": { city: "New York", std: "ET" },
  "America/Chicago": { city: "Chicago", std: "CT" },
  "America/Denver": { city: "Denver", std: "MT" },
  "America/Los_Angeles": { city: "Los Angeles", std: "PT" },
  UTC: { city: "UTC", std: "UTC" },
  "Europe/London": { city: "London", std: "GMT", dst: "BST" },
  "Europe/Berlin": { city: "Berlin", std: "CET", dst: "CEST" },
  "Asia/Muscat": { city: "Muscat", std: "GST" },
  "Asia/Tokyo": { city: "Tokyo", std: "JST" },
  "Asia/Singapore": { city: "Singapore", std: "SGT" },
  "Australia/Sydney": { city: "Sydney", std: "AEST", dst: "AEDT" },
};

/** Zones offered in the Settings picker, in display order. */
export const TIME_ZONE_OPTIONS: readonly string[] = Object.keys(TIME_ZONE_LABELS);

/** "New York (ET)", "London (GMT/BST)", "Muscat (GST)". Unknown zones read as themselves. */
export function timeZoneOptionLabel(zone: string): string {
  const entry = TIME_ZONE_LABELS[zone];
  if (!entry) return zone.replace(/_/g, " ");
  return `${entry.city} (${entry.dst ? `${entry.std}/${entry.dst}` : entry.std})`;
}

let supportedZones: Set<string> | null = null;
function intlSupportedZones(): Set<string> {
  if (supportedZones) return supportedZones;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    supportedZones = new Set(intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : []);
  } catch {
    supportedZones = new Set();
  }
  return supportedZones;
}

/** Shown when a save carries a zone that isn't on the allowed list. */
export const TIME_ZONE_ERROR = "That time zone isn't recognised. Pick one from the list.";

/**
 * The zones a trader may SAVE: every zone in the label table plus every IANA
 * zone name this runtime's Intl lists (exact spelling). Used by the profile route.
 */
export function isAllowedTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  return Object.prototype.hasOwnProperty.call(TIME_ZONE_LABELS, zone) || intlSupportedZones().has(zone);
}

/**
 * Turn a stored zone string into one that is safe to print with. Unknown,
 * empty or malformed values fall back to New York. Never throws.
 */
export function resolveTimeZone(zone: unknown): string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return DEFAULT_TIME_ZONE;
  if (Object.prototype.hasOwnProperty.call(TIME_ZONE_LABELS, zone)) return zone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function zoneParts(date: Date, zone: string): Record<string, string> {
  let f = partsFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    partsFormatters.set(zone, f);
  }
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Minutes the zone is ahead of UTC at this instant (e.g. +240 for Muscat). */
function zoneOffsetMinutes(date: Date, zone: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") v[p.type] = Number(p.value);
  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The short label printed after a time in `zone` at this instant: the fixed
 * table first (GMT vs BST picked by whether daylight saving is in force at that
 * instant), then the runtime's own short name for zones outside the table.
 */
export function timeZoneLabel(zone: string, at: Date): string {
  const tz = resolveTimeZone(zone);
  const entry = TIME_ZONE_LABELS[tz];
  if (entry) {
    if (!entry.dst) return entry.std;
    const year = Number(zoneParts(at, tz).year);
    const jan = zoneOffsetMinutes(new Date(Date.UTC(year, 0, 1)), tz);
    const jul = zoneOffsetMinutes(new Date(Date.UTC(year, 6, 1)), tz);
    return zoneOffsetMinutes(at, tz) > Math.min(jan, jul) ? entry.dst : entry.std;
  }
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

/** A "YYYY-MM-DD" day key (optionally with the old "T12:00:00" noon suffix). */
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})(?:T12:00:00)?$/;

export type DateStyle = "medium" | "short" | "weekday";

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

function dateFromParts(p: Record<string, string>, style: DateStyle): string {
  if (style === "short") return `${p.month} ${p.day}`;
  if (style === "weekday") return `${p.weekday}, ${p.month} ${p.day}`;
  return `${p.month} ${p.day}, ${p.year}`;
}

/**
 * "Sep 15, 9:45 AM ET" — an instant printed in the trader's zone with its
 * label. `timeZone` is required: nothing ever falls back to the machine zone.
 */
export function formatDateTime(d: Date | string, timeZone: string): string {
  const date = toDate(d);
  if (isNaN(date.getTime())) return "—";
  const tz = resolveTimeZone(timeZone);
  const p = zoneParts(date, tz);
  return `${p.month} ${p.day}, ${p.hour}:${p.minute}${NBSP}${p.dayPeriod}${NBSP}${timeZoneLabel(tz, date)}`;
}

/** "9:45 AM ET" — just the time of day, in the trader's zone, with its label. */
export function formatTime(d: Date | string, timeZone: string): string {
  const date = toDate(d);
  if (isNaN(date.getTime())) return "—";
  const tz = resolveTimeZone(timeZone);
  const p = zoneParts(date, tz);
  return `${p.hour}:${p.minute}${NBSP}${p.dayPeriod}${NBSP}${timeZoneLabel(tz, date)}`;
}

/**
 * A New York calendar-day key ("2026-06-15") printed as that calendar date —
 * never converted into any zone, so it can't slide to the day before or after.
 */
export function formatDayKey(key: string, style: DateStyle = "medium"): string {
  const m = DAY_KEY.exec(key);
  if (!m) return "—";
  const noonUtc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return dateFromParts(zoneParts(noonUtc, "UTC"), style);
}

/**
 * The calendar date of an instant in the trader's zone ("Sep 15, 2026"). Dates
 * carry no zone label. A day-key string ("2026-06-15") is printed as that exact
 * calendar day and never shifted (see formatDayKey).
 */
export function formatDate(d: Date | string, timeZone: string, style: DateStyle = "medium"): string {
  if (typeof d === "string" && DAY_KEY.test(d)) return formatDayKey(d, style);
  const date = toDate(d);
  if (isNaN(date.getTime())) return "—";
  return dateFromParts(zoneParts(date, resolveTimeZone(timeZone)), style);
}

/**
 * "Sep 9 – Sep 15 ET": a range of calendar days in `timeZone` with the label
 * once at the end.
 */
export function formatDateRange(from: Date, to: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return `${formatDate(from, tz, "short")} – ${formatDate(to, tz, "short")}${NBSP}${timeZoneLabel(tz, to)}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

// Split a comma-separated tag string into an array of clean tokens.
export function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
