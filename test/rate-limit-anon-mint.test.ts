// Rate-limit hardening, item 2 — the shared "unknown" anonymous bucket.
//
// With TRUST_PROXY off, `anonymousRateKey()` used to key EVERY visitor's very
// first (pre-cookie) request on a single shared "register:anon:unknown" /
// "login:ip:anon:unknown" bucket. A cookie-dropping bot could exhaust that one
// bucket and lock out every other cookie-less visitor, including every new
// visitor's first request ever. The fix: mint the signed per-browser id and
// key THAT SAME request on it immediately, instead of falling back to
// "unknown". This file mocks `next/headers` so `cookies()` succeeds outside a
// real Next.js request scope, letting the actual mint-and-key path run.

import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { anonymousRateKey } from "@/lib/rate-limit";

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/login", { headers });
}

describe("anonymousRateKey — first-contact mint", () => {
  beforeEach(() => {
    store.clear();
    delete process.env.TRUST_PROXY;
    delete process.env.PROXY_HOPS;
  });

  it("keys the very first request on a freshly minted id, never the shared 'unknown' bucket", async () => {
    const key = await anonymousRateKey(reqWith());
    expect(key).not.toBe("anon:unknown");
    expect(key).toMatch(/^anon:[0-9a-f-]{36}$/);
  });

  it("two different first-time visitors (no shared cookie state) get two different buckets", async () => {
    const keyA = await anonymousRateKey(reqWith());
    store.clear(); // simulate a second browser that has never had the cookie
    const keyB = await anonymousRateKey(reqWith());
    expect(keyA).not.toBe(keyB);
  });

  it("a returning visitor with the signed cookie keys on the same id every request", async () => {
    const first = await anonymousRateKey(reqWith());
    const second = await anonymousRateKey(reqWith());
    expect(second).toBe(first);
  });
});
