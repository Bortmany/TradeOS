// TradeOS — near-live read settings. Pure, no imports, so tests and the poller
// share one definition.
//
//   LIVE_POLL_INTERVAL_SEC  seconds between live reads (default 60). The floor
//                           of 60 is enforced HERE, in code: anything smaller,
//                           zero, negative or junk is raised to 60.
//
// The server-wide call budget (about 100 broker calls a minute across all
// traders) lives in src/lib/live/budget.ts.

export const LIVE_MIN_INTERVAL_SEC = 60;

/** Seconds between live reads. Never below 60, whatever the setting says. */
export function livePollIntervalSec(raw: string | undefined = process.env.LIVE_POLL_INTERVAL_SEC): number {
  if (raw === undefined || raw.trim() === "") return LIVE_MIN_INTERVAL_SEC;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < LIVE_MIN_INTERVAL_SEC) return LIVE_MIN_INTERVAL_SEC;
  return Math.round(n);
}

/**
 * A connection read less than this long ago is skipped, so two runners (or two
 * quick ticks) can never read one account faster than once a minute. A few
 * seconds of slack keep a normal 60-second timer from skipping itself.
 */
export const LIVE_MIN_GAP_MS = (LIVE_MIN_INTERVAL_SEC - 5) * 1000;

/** The poller runs by default in production; in development only when the setting is present. */
export function liveEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.LIVE_POLL_INTERVAL_SEC !== undefined) return true;
  return env.NODE_ENV === "production";
}
