// TradeOS — in-process timer for the Monday weekly coaching review (persistent
// servers: Railway, VPS, Docker). Checks every 30 minutes and fires only on
// Monday (US Eastern) from 06:00. The job is idempotent, so firing several times
// on one Monday is harmless. On Vercel it is skipped: use /api/cron/coaching-weekly.

import { etClock, etWeekday } from "@/lib/backtest/time";
import { runWeeklyCoaching } from "./weekly";

const globalScheduler = globalThis as unknown as {
  __tradeosWeeklyCoaching?: ReturnType<typeof setInterval>;
};

const CHECK_EVERY_MS = 30 * 60_000;
const MONDAY = 1;
const RUN_FROM_MINUTES = 6 * 60;

/** True on Monday at or after 06:00 Eastern (and still Monday). */
export function shouldRunWeeklyNow(now: Date): boolean {
  return etWeekday(now) === MONDAY && etClock(now).minutes >= RUN_FROM_MINUTES;
}

export function startWeeklyCoaching(): void {
  if (globalScheduler.__tradeosWeeklyCoaching) return;
  if (process.env.VERCEL) return;
  const timer = setInterval(() => {
    if (!shouldRunWeeklyNow(new Date())) return;
    void runWeeklyCoaching().catch(() => {});
  }, CHECK_EVERY_MS);
  timer.unref?.();
  globalScheduler.__tradeosWeeklyCoaching = timer;
}
