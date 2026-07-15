import "server-only";
import { NextResponse } from "next/server";

// A tiny in-memory rate limiter — no Redis or outside service needed.
//
// It counts how many times a given key (usually "action:visitor-ip" for
// anonymous traffic, or "action:user:<id>" for a signed-in user) is used
// inside a time window, and says "slow down" once a limit is passed. This
// blunts password guessing on login/register, repeated heavy imports, and a
// runaway client hammering the authed mutation endpoints.
//
// Note: the count lives in this one server's memory. TradeOS runs as a single
// persistent Railway process today, so that's fine. If it is ever scaled to
// several instances, each would count separately.
//
// ── REDIS SEAM ──────────────────────────────────────────────────────────────
// When the app is scaled to several instances, the ONLY thing that needs to
// change is the store below: swap this in-memory `Map` for a small Redis-backed
// implementation of the same read/write shape (get bucket, set bucket, atomic
// INCR + TTL), switched on when `REDIS_URL` is set. Nothing else in this file —
// or in any route that calls `enforceUserRateLimit` — has to change. Until then
// limits are per-process. No redis dependency is added now.
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Per-user limiting for authed mutation endpoints ──────────────────────────
//
// Sensible presets. Most write endpoints are cheap, so they get a generous
// per-minute allowance; the ones that reach out to a broker's API (connect /
// sync) or to Stripe are tighter, because each call is slow and/or costs money.
export const USER_WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const; // 60/min
export const USER_EXTERNAL_LIMIT = { limit: 10, windowMs: 60_000 } as const; // 10/min

// Count one hit for a signed-in user against a named action. Keyed by user id
// (never by anything the client controls), so one user can't spend another's
// budget.
export function userRateLimit(
  action: string,
  userId: string,
  opts: { limit: number; windowMs: number } = USER_WRITE_LIMIT
): RateLimitResult {
  return rateLimit(`${action}:user:${userId}`, opts);
}

// Convenience for API routes: returns a ready-to-send 429 NextResponse when the
// user is over the limit, or `null` when the request may proceed. The body uses
// the repo's standard error shape and includes a plain-English message plus a
// `Retry-After` header. Call it right after `requireUser()` in a route handler:
//
//   const limited = enforceUserRateLimit("trades:create", user.id);
//   if (limited) return limited;
//
export function enforceUserRateLimit(
  action: string,
  userId: string,
  opts: { limit: number; windowMs: number } = USER_WRITE_LIMIT
): NextResponse | null {
  const result = userRateLimit(action, userId, opts);
  if (result.ok) return null;
  return NextResponse.json(
    { ok: false, error: "Too many requests. Please slow down and try again in a moment." },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } }
  );
}
