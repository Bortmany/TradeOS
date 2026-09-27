// Rate-limit hardening, item 2 — cookie-less anonymous keying.
//
// History: the shared "unknown" bucket let one cookie-dropping bot DoS every
// cookie-less visitor; the follow-up fix over-corrected and minted a FRESH id on
// every pre-cookie request, which gave a cookie-less client a brand-new bucket
// each request — so register/login were effectively unlimited again.
//
// End state (pinned here): a cookie-less caller is keyed on its STABLE socket
// address (`anon:sock:<ip>`), never a fresh id and never the shared "unknown"
// literal. A returning browser that keeps the signed cookie keys on its own id.
// This file mocks `next/headers` so `cookies()` succeeds outside a real Next.js
// request scope, letting the actual key path run.

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

describe("anonymousRateKey — cookie-less caller keys on the stable socket address", () => {
  beforeEach(() => {
    store.clear();
    delete process.env.TRUST_PROXY;
    delete process.env.PROXY_HOPS;
  });

  it("keys a cookie-less caller on its socket address, not a fresh id or 'unknown'", async () => {
    const key = await anonymousRateKey(reqWith(), "203.0.113.7");
    expect(key).toBe("anon:sock:203.0.113.7");
    expect(key).not.toBe("anon:unknown");
    expect(key).not.toMatch(/^anon:[0-9a-f-]{36}$/); // never a raw minted UUID
  });

  it("a cookie-dropping flood from one socket lands in ONE bucket (bounded)", async () => {
    // Simulate a client that never keeps the cookie: clear the jar every request.
    const keys = new Set<string>();
    for (let i = 0; i < 5; i++) {
      store.clear();
      keys.add(await anonymousRateKey(reqWith(), "198.51.100.9"));
    }
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("anon:sock:198.51.100.9");
  });

  it("two different sockets get two different buckets (no shared-bucket DoS)", async () => {
    store.clear();
    const a = await anonymousRateKey(reqWith(), "198.51.100.1");
    store.clear();
    const b = await anonymousRateKey(reqWith(), "198.51.100.2");
    expect(a).not.toBe(b);
  });

  it("a returning visitor that keeps the signed cookie keys on its own id", async () => {
    // First (cookie-less) request sets the cookie; the jar persists it here.
    const first = await anonymousRateKey(reqWith(), "198.51.100.5");
    expect(first).toBe("anon:sock:198.51.100.5"); // first request keyed on socket
    const second = await anonymousRateKey(reqWith(), "198.51.100.5");
    expect(second).toMatch(/^anon:[0-9a-f-]{36}$/); // now on its own browser id
    const third = await anonymousRateKey(reqWith(), "198.51.100.5");
    expect(third).toBe(second); // stable across later requests
  });

  it("no socket address available falls back to one shared bucket (last resort)", async () => {
    store.clear();
    const key = await anonymousRateKey(reqWith());
    expect(key).toBe("anon:unknown");
  });
});
