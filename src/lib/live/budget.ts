// TradeOS — the server-wide broker call budget for near-live reads.
//
// About 100 broker calls a minute in total, across every trader, counting
// logins, balance reads, open-position reads and price-bar reads. A caller
// asks take() before EVERY call; when the minute is used up (or the broker
// said 429 and we are backing off) take() answers false and the round simply
// stops. Unserved connections stay stale and are served first next tick
// (stalest first), so the budget is a hard ceiling and the round "stretches".
//
// Back-off on HTTP 429: honour Retry-After when the broker sent one, otherwise
// 30s, 60s, 120s ... capped at 5 minutes. Never a tight retry loop.
// Pure and clock-injectable so tests need no real waiting.

export const LIVE_CALLS_PER_MINUTE = 100;
const WINDOW_MS = 60_000;
const BACKOFF_START_MS = 30_000;
const BACKOFF_CAP_MS = 5 * 60_000;

export class CallBudget {
  private stamps: number[] = [];
  private backoffUntil = 0;
  private strikes = 0;

  constructor(
    private readonly maxPerMinute: number = LIVE_CALLS_PER_MINUTE,
    private readonly clock: () => number = Date.now
  ) {}

  private prune(now: number) {
    const cutoff = now - WINDOW_MS;
    while (this.stamps.length && this.stamps[0] <= cutoff) this.stamps.shift();
  }

  inBackoff(): boolean {
    return this.clock() < this.backoffUntil;
  }

  backoffRemainingMs(): number {
    return Math.max(0, this.backoffUntil - this.clock());
  }

  /** Spend one call. False = not allowed right now (budget used up, or backing off). */
  take(): boolean {
    const now = this.clock();
    if (now < this.backoffUntil) return false;
    this.prune(now);
    if (this.stamps.length >= this.maxPerMinute) return false;
    this.stamps.push(now);
    return true;
  }

  /** Calls spent in the last minute. */
  used(): number {
    this.prune(this.clock());
    return this.stamps.length;
  }

  /** The broker answered 429: wait (Retry-After if given, else 30s, 60s, 120s ... max 5 min). */
  onRateLimited(retryAfterSec?: number): void {
    this.strikes += 1;
    const escalating = Math.min(BACKOFF_START_MS * 2 ** (this.strikes - 1), BACKOFF_CAP_MS);
    const waitMs =
      retryAfterSec && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, BACKOFF_CAP_MS)
        : escalating;
    this.backoffUntil = Math.max(this.backoffUntil, this.clock() + waitMs);
  }

  /** A call went through: the next 429 starts the back-off ladder again from the bottom. */
  onSuccess(): void {
    this.strikes = 0;
  }
}

/** The one budget for this server process (only the lock-holding runner ever polls). */
export const liveBudget = new CallBudget();
