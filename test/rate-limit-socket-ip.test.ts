// Rate-limit hardening, item 1 (HIGH) — cookie-less anonymous keying in the REAL
// runtime.
//
// The previous fix read the caller's IP off `req.socket.remoteAddress`, but
// Next.js's web `Request` never exposes the socket in `next start`, so in
// production `socketAddress()` returned nothing and every cookie-less caller
// collapsed into ONE shared "anon:unknown" bucket — a small cookie-less burst
// locked login/register for every visitor site-wide.
//
// The fix follows the standard pattern for this problem: src/instrumentation-node.ts
// subscribes to Node's diagnostics_channel and stamps the true socket address onto
// an internal, non-spoofable header (SOCKET_IP_HEADER) before any handler runs;
// socketAddress() reads THAT header. These tests exercise that header path (which
// works in the real runtime) rather than an attached `.socket` object (which does not).

import { describe, it, expect, beforeEach, vi } from "vitest";

// Cookie-less caller: an empty jar that never persists what we set, so every
// request behaves like a client that drops our cookie.
const { store } = vi.hoisted(() => ({
  store: new Map<string, { value: string }>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.get(name),
    set: (name: string, value: string) => {
      store.set(name, { value });
    },
  }),
}));

import {
  anonymousRateKey,
  socketAddress,
  rateLimit,
  SOCKET_IP_HEADER,
} from "@/lib/rate-limit";
import { stampSocketIpHeader } from "@/instrumentation-node";

// A request whose internal header has already been stamped by the diagnostics
// subscriber — i.e. what a route handler actually sees in the real runtime.
function stampedReq(socketIp: string): Request {
  return new Request("http://localhost/api/auth/login", {
    headers: { [SOCKET_IP_HEADER]: socketIp },
  });
}

const LOGIN_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

describe("stampSocketIpHeader — stamps the real socket IP, unspoofably", () => {
  it("overwrites any client-supplied value with the true remoteAddress", () => {
    const headers: Record<string, string> = { [SOCKET_IP_HEADER]: "1.2.3.4-forged" };
    stampSocketIpHeader({ request: { headers }, socket: { remoteAddress: "203.0.113.9" } });
    expect(headers[SOCKET_IP_HEADER]).toBe("203.0.113.9");
  });

  it("stamps empty string when there is no remoteAddress (so it reads as absent)", () => {
    const headers: Record<string, string> = { [SOCKET_IP_HEADER]: "9.9.9.9-forged" };
    stampSocketIpHeader({ request: { headers }, socket: {} });
    expect(headers[SOCKET_IP_HEADER]).toBe("");
  });
});

describe("socketAddress — reads the server-stamped internal header", () => {
  it("returns the stamped IP (the path that works in next start)", () => {
    expect(socketAddress(stampedReq("198.51.100.4"))).toBe("198.51.100.4");
  });

  it("returns undefined for an empty stamp rather than a bogus bucket", () => {
    expect(socketAddress(stampedReq(""))).toBeUndefined();
  });
});

describe("anonymousRateKey — cookie-less callers key on the real socket IP", () => {
  beforeEach(() => {
    store.clear();
    delete process.env.TRUST_PROXY;
    delete process.env.PROXY_HOPS;
  });

  it("keys on the stamped socket IP, never the shared 'anon:unknown' bucket", async () => {
    const req = stampedReq("203.0.113.7");
    const key = await anonymousRateKey(req, socketAddress(req));
    expect(key).toBe("anon:sock:203.0.113.7");
    expect(key).not.toBe("anon:unknown");
  });

  it("two different sources get two different buckets", async () => {
    const a = stampedReq("198.51.100.1");
    store.clear();
    const keyA = await anonymousRateKey(a, socketAddress(a));
    const b = stampedReq("198.51.100.2");
    store.clear();
    const keyB = await anonymousRateKey(b, socketAddress(b));
    expect(keyA).not.toBe(keyB);
  });

  it("a cookie-less flood from ONE source doesn't lock out ANOTHER source", async () => {
    // Attacker floods well past the login limit, dropping the cookie each time.
    let attacker = { ok: true, retryAfter: 0 };
    for (let i = 0; i < 25; i++) {
      store.clear(); // never keeps our cookie → must key on the socket
      const req = stampedReq("198.51.100.50");
      const key = await anonymousRateKey(req, socketAddress(req));
      attacker = rateLimit(`login:ip:${key}`, LOGIN_WINDOW);
    }
    expect(attacker.ok).toBe(false); // the flooding source is throttled

    // A different visitor's very first attempt is unaffected — no site-wide lock.
    store.clear();
    const victimReq = stampedReq("203.0.113.200");
    const victimKey = await anonymousRateKey(victimReq, socketAddress(victimReq));
    expect(rateLimit(`login:ip:${victimKey}`, LOGIN_WINDOW).ok).toBe(true);
  });
});
