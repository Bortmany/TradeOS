// TradeOS — guided weekly review.
// Stores the trader's own written reflection on a week (three short prompts)
// alongside the numbers the Reports page already computes. Deterministic, no AI.
//
// Weeks are anchored to America/New_York (ET), like every other calendar-day
// decision in the app: a week runs Monday → Sunday, and its key is the Monday's
// ET calendar date ("YYYY-MM-DD"). The stored `weekStart` is UTC midnight of
// that date, so one week is exactly one row per user.

import "server-only";
import { prisma } from "@/lib/db";
import { etDayKey } from "@/lib/rules/engine";

export interface ReviewAnswers {
  worked: string;
  costliestRule: string;
  oneChange: string;
}

export interface WeeklyReviewRecord {
  weekKey: string; // "YYYY-MM-DD" (the Monday)
  answers: ReviewAnswers;
  updatedAt: Date;
}

export const WEEK_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_ANSWERS: ReviewAnswers = { worked: "", costliestRule: "", oneChange: "" };

/** Midday UTC on a calendar date — safe to read weekday/arithmetic from. */
function noonUtc(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

/** UTC midnight of a calendar date — the stored `weekStart` value. */
export function weekKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** The ET calendar date (YYYY-MM-DD) of the Monday of `date`'s week. */
export function weekKeyOf(date: Date): string {
  const dayKey = etDayKey(date);
  const d = noonUtc(dayKey);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Shift a week key by whole weeks (negative = earlier). */
export function shiftWeekKey(key: string, weeks: number): string {
  const d = noonUtc(key);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** The Sunday that closes the week starting at `key`. */
export function weekEndKey(key: string): string {
  const d = noonUtc(key);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * A week key from a URL param, falling back to the current week. Anything that
 * isn't a real date is treated as "no week given".
 */
export function normalizeWeekKey(raw: string | undefined, now: Date = new Date()): string {
  if (raw && WEEK_KEY_PATTERN.test(raw)) {
    const parsed = noonUtc(raw);
    if (!Number.isNaN(parsed.getTime())) return weekKeyOf(parsed);
  }
  return weekKeyOf(now);
}

/** Tolerant read of the stored JSON string — a broken row reads as empty. */
export function parseAnswers(raw: string): ReviewAnswers {
  try {
    const parsed = JSON.parse(raw) as Partial<ReviewAnswers>;
    return {
      worked: typeof parsed.worked === "string" ? parsed.worked : "",
      costliestRule: typeof parsed.costliestRule === "string" ? parsed.costliestRule : "",
      oneChange: typeof parsed.oneChange === "string" ? parsed.oneChange : "",
    };
  } catch {
    return { ...EMPTY_ANSWERS };
  }
}

/** This user's saved review for one week, or null. Always user-scoped. */
export async function getWeeklyReview(
  userId: string,
  weekKey: string
): Promise<WeeklyReviewRecord | null> {
  const row = await prisma.weeklyReview.findFirst({
    where: { userId, weekStart: weekKeyToDate(weekKey) },
  });
  if (!row) return null;
  return {
    weekKey: row.weekStart.toISOString().slice(0, 10),
    answers: parseAnswers(row.answers),
    updatedAt: row.updatedAt,
  };
}

/** This user's saved reviews, newest week first. Always user-scoped. */
export async function listWeeklyReviews(
  userId: string,
  take = 12
): Promise<WeeklyReviewRecord[]> {
  const rows = await prisma.weeklyReview.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take,
  });
  return rows.map((row) => ({
    weekKey: row.weekStart.toISOString().slice(0, 10),
    answers: parseAnswers(row.answers),
    updatedAt: row.updatedAt,
  }));
}
