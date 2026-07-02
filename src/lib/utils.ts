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

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
