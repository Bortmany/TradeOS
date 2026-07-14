import "server-only";

// A tiny in-memory rate limiter — no Redis or outside service needed.
//
// It counts how many times a given key (usually "action:visitor-ip") is used
// inside a time window, and says "slow down" once a limit is passed. This
// blunts password guessing on login/register and repeated heavy imports.
//
// Note: the count lives in this one server's memory. TradeOS runs as a single
// persistent Railway process today, so that's fine. If it is ever scaled to
// several instances, each would count separately — revisit with a shared
// store then.

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

// Survive dev hot-reloads the same way the database client does.
const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, Bucket>;
};
const store: Map<string, Bucket> =
  globalForRateLimit.rateLimitStore ?? new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.rateLimitStore = store;
}

export interface RateLimitResult {
  ok: boolean; // false means the caller has gone over the limit
  retryAfter: number; // seconds until they can try again
}

// Record one hit against `key` and say whether it is still within the limit.
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    // Opportunistically drop expired entries so the map can't grow forever.
    if (store.size > 5000) {
      for (const [k, b] of store) {
        if (b.resetAt <= now) store.delete(k);
      }
    }
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

// Best-effort visitor IP. Behind Railway's proxy the real IP is the first
// entry of the x-forwarded-for header; fall back sensibly otherwise.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
