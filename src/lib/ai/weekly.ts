// TradeOS — the Monday weekly coaching review job.
//
// Writes one "weekly" coaching note for the ET week that just finished, for every
// trader who has the coach and the weekly review switched on and who traded that
// week. Idempotent: a trader who already has the note is skipped, so running it
// twice (or from two places) is harmless. Runs are not charged to the trader's
// daily cap (generateCoachingNote with scheduled:true). Only one server copy runs
// it at a time (single-runner lease). Never throws out of one trader.

import { prisma } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/demo-desk";
import { etDateStartUtc, etDateEndUtc } from "@/lib/backtest/time";
import { shiftWeekKey, weekEndKey, weekKeyOf } from "@/lib/reviews";
import { withSingleRunner } from "@/lib/single-runner";
import { isEmailEnabled } from "@/lib/email";
import { sendCoachingWeeklyEmail } from "@/lib/email/coaching-email";
import { isPushConfigured } from "@/lib/push/config";
import { sendToUser } from "@/lib/push/send";
import { isCoachingEnabled } from "./index";
import { generateCoachingNote } from "./service";

export const WEEKLY_COACHING_LOCK_KEY = 4927003;

/** Start a new trader only with more than this left (a typical call is well under this; a slow one just ends the pass, and the next pass resumes). */
export const MIN_MS_TO_START_USER = 25_000;
const MAX_FAILED_ATTEMPTS_PER_WEEK = 3;
// Failed tries per `weekStart|userId`. Per-process only: a restart forgets it and
// allows up to 3 more tries. Stops the 30-minute scheduler hammering a broken call all Monday.
const failedAttempts = new Map<string, number>();

export interface WeeklyRunResult {
  outcome: "ran" | "skipped" | "failed";
  weekStart: string;
  eligible: number;
  generated: number;
  cached: number;
  emailed: number;
  pushed: number;
  failed: number;
  stoppedEarly: boolean;
}

export async function runWeeklyCoaching(
  opts: { now?: Date; deadlineMs?: number } = {}
): Promise<WeeklyRunResult> {
  const now = opts.now ?? new Date();
  const weekStart = shiftWeekKey(weekKeyOf(now), -1);
  const result: WeeklyRunResult = {
    outcome: "skipped",
    weekStart,
    eligible: 0,
    generated: 0,
    cached: 0,
    emailed: 0,
    pushed: 0,
    failed: 0,
    stoppedEarly: false,
  };
  if (!isCoachingEnabled()) return result;

  for (const k of failedAttempts.keys()) if (!k.startsWith(`${weekStart}|`)) failedAttempts.delete(k);
  const from = etDateStartUtc(weekStart);
  const to = etDateEndUtc(weekEndKey(weekStart));

  const outcome = await withSingleRunner(
    WEEKLY_COACHING_LOCK_KEY,
    "weekly-coaching",
    async (ctx) => {
      const users = await prisma.user.findMany({
        where: {
          coachingEnabled: true,
          coachingWeekly: true,
          email: { not: DEMO_EMAIL },
          coachingNotes: { none: { kind: "weekly", subjectKey: weekStart } },
          trades: { some: { entryTime: { gte: from, lte: to } } },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, plan: true, billingStatus: true, coachingWeeklyEmail: true },
      });
      result.eligible = users.length;

      for (const u of users) {
        if (ctx.expired() || ctx.remainingMs() <= MIN_MS_TO_START_USER) {
          result.stoppedEarly = true;
          break;
        }
        const attemptKey = `${weekStart}|${u.id}`;
        if ((failedAttempts.get(attemptKey) ?? 0) >= MAX_FAILED_ATTEMPTS_PER_WEEK) continue;
        try {
          const r = await generateCoachingNote(
            { id: u.id, email: u.email, plan: u.plan, billingStatus: u.billingStatus },
            { kind: "weekly" },
            { scheduled: true, now }
          );
          if (!r.ok) {
            if (r.code === "global_limit") {
              result.stoppedEarly = true;
              break;
            }
            result.failed++;
            failedAttempts.set(attemptKey, (failedAttempts.get(attemptKey) ?? 0) + 1);
            continue;
          }
          if (r.cached) result.cached++;
          else result.generated++;

          if (isEmailEnabled() && u.coachingWeeklyEmail) {
            if (await sendCoachingWeeklyEmail(u.id, r.note)) result.emailed++;
          }
          if (isPushConfigured()) {
            const summary = String((r.note.content as { summary?: unknown }).summary ?? "");
            const sent = await sendToUser(u.id, {
              title: "Your weekly coaching review is ready",
              body: summary.slice(0, 100),
              url: "/coach",
              tag: "coaching-weekly",
            });
            if (sent > 0) result.pushed++;
          }
        } catch {
          result.failed++; // one trader never stops the rest
          failedAttempts.set(attemptKey, (failedAttempts.get(attemptKey) ?? 0) + 1);
        }
      }
    },
    // 5-minute pass; the 2-minute lease renews every 40 s while it runs.
    { deadlineMs: opts.deadlineMs ?? 5 * 60_000, leaseMs: 120_000 }
  );
  result.outcome = outcome;
  return result;
}
