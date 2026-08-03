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

// Best-effort visitor IP used to key anonymous rate limits.
//
// SECURITY: `x-forwarded-for` is set by the CLIENT unless a trusted proxy sits
// in front of the app and overwrites/appends it. Trusting the first hop blindly
// let an attacker rotate that header to get a fresh limit bucket every request
// and walk straight past the login/register limits. So we only read forwarded
// headers when the deployment explicitly says a trusted proxy is in front:
//
//   TRUST_PROXY=true        — turn on forwarded-header trust (set this on Railway)
//   PROXY_HOPS=1            — how many proxies you run; we take the address the
//                            outermost trusted proxy saw (the Nth entry from the
//                            right of x-forwarded-for). Defaults to 1.
//
// With trust OFF (the default, and how local dev runs) forwarded headers are
// ignored entirely — a spoofed X-Forwarded-For can no longer mint new buckets.
export function clientIp(req: Request): string {
  if (isProxyTrusted()) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      if (hops.length > 0) {
        const n = proxyHops();
        // Take the Nth hop from the right — the IP the outermost trusted proxy
        // actually observed. Anything further left is client-controlled.
        const idx = Math.max(0, hops.length - n);
        return hops[idx]!;
      }
    }
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  // Untrusted: never key off a header the caller can forge. Route handlers don't
  // get the raw socket address, so anonymous callers share one bucket here —
  // fine for single-process local dev, and prod is expected to set TRUST_PROXY.
  return "direct";
}

function isProxyTrusted(): boolean {
  return process.env.TRUST_PROXY === "true" || proxyHopsRaw() > 0;
}

function proxyHopsRaw(): number {
  const n = Number(process.env.PROXY_HOPS);
  return Number.isFinite(n) ? n : 0;
}

function proxyHops(): number {
  const n = proxyHopsRaw();
  return n > 0 ? Math.floor(n) : 1;
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
