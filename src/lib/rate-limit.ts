import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, randomUUID } from "node:crypto";
import { authSecret } from "@/lib/auth";

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

// Loud one-time startup warning: if we're running in production WITHOUT a
// trusted proxy configured, anonymous rate limiting leans entirely on the
// signed per-browser cookie (a determined bot that drops cookies lands in the
// shared "unknown" bucket). On a real deployment behind Railway you almost
// always want TRUST_PROXY="true" so limits key off the real visitor IP.
if (process.env.NODE_ENV === "production" && !isProxyTrusted()) {
  console.warn(
    "[rate-limit] TRUST_PROXY is OFF in production. Anonymous limits fall back to " +
      "a signed per-browser cookie. Set TRUST_PROXY=\"true\" (and PROXY_HOPS) so " +
      "per-IP limits use the real visitor address. See .env.example."
  );
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
  // get the raw socket address, so this pure helper can't tell callers apart —
  // use `anonymousRateKey()` below, which gives each browser its own bucket via
  // a signed cookie. Kept for the trusted-proxy path and its unit tests.
  return "direct";
}

// ── Per-browser key for ANONYMOUS traffic (login/register) ───────────────────
//
// The problem: with TRUST_PROXY off (the default), `clientIp()` can't tell one
// anonymous visitor from another, so every logged-out request would share a
// SINGLE bucket. That turns the login/register limiter into a self-inflicted
// denial of service — one bot could exhaust the shared bucket and lock every
// real visitor out.
//
// The fix: when the proxy is NOT trusted, give each browser a stable id in a
// signed, httpOnly cookie (HMAC'd with AUTH_SECRET so a client can't forge or
// borrow another browser's id) and key the anonymous limiter on that. The cookie
// is minted on first contact; only that very first, pre-cookie request falls
// back to the shared "unknown" bucket — every request after it carries the id.
// When TRUST_PROXY/PROXY_HOPS is set we key on the real IP instead (via
// `clientIp`). The separate per-EMAIL login limiter still protects individual
// accounts no matter what an attacker does with cookies.
const RL_COOKIE = "tradeos_rl";

function signBrowserId(id: string): string {
  const mac = createHmac("sha256", authSecret()).update(id).digest("base64url");
  return `${id}.${mac}`;
}

// Returns the embedded id only if the signature matches — otherwise null.
function verifyBrowserId(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = createHmac("sha256", authSecret()).update(id).digest("base64url");
  // Constant-time compare so a bad signature can't be probed byte by byte.
  if (mac.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}

export async function anonymousRateKey(req: Request): Promise<string> {
  // Behind a trusted proxy we know the real visitor IP — use it directly.
  if (isProxyTrusted()) return clientIp(req);

  // Untrusted: identify the browser by its signed cookie.
  try {
    const jar = await cookies();
    const existing = jar.get(RL_COOKIE)?.value;
    if (existing) {
      const id = verifyBrowserId(existing);
      if (id) return `anon:${id}`;
    }
    // First contact (or a tampered/absent cookie): mint a fresh id, set it for
    // next time, and count THIS request against the shared pre-cookie bucket.
    const id = randomUUID();
    jar.set(RL_COOKIE, signBrowserId(id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // one year
    });
    return "anon:unknown";
  } catch {
    // No request/cookie context (or cookie writes unavailable) — fall back to
    // the shared bucket rather than crash the request.
    return "anon:unknown";
  }
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
