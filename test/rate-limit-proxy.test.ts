// Rate-limit hardening (src/lib/rate-limit.ts).
//
// The old clientIp() trusted the FIRST x-forwarded-for hop, so an attacker could
// rotate that header to mint a fresh limit bucket every request and walk past
// the login/register limits. These tests pin the new behavior: forwarded headers
// are ignored unless a trusted proxy is configured, and when configured we read
// the correct hop.

import { describe, it, expect, afterEach } from "vitest";
import { clientIp, anonymousRateKey } from "@/lib/rate-limit";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/login", { headers });
}

const savedTrust = process.env.TRUST_PROXY;
const savedHops = process.env.PROXY_HOPS;

afterEach(() => {
  process.env.TRUST_PROXY = savedTrust;
  process.env.PROXY_HOPS = savedHops;
});

describe("clientIp — proxy NOT trusted (default / local dev)", () => {
  it("ignores x-forwarded-for so a spoofed header can't create new buckets", () => {
    delete process.env.TRUST_PROXY;
    delete process.env.PROXY_HOPS;
    const a = clientIp(reqWith({ "x-forwarded-for": "1.1.1.1" }));
    const b = clientIp(reqWith({ "x-forwarded-for": "9.9.9.9" }));
    // Two different forged headers must land in the SAME bucket when untrusted.
    expect(a).toBe(b);
    expect(a).toBe("direct");
  });
});

describe("clientIp — proxy trusted", () => {
  it("takes the last hop with a single proxy (PROXY_HOPS=1)", () => {
    process.env.TRUST_PROXY = "true";
    process.env.PROXY_HOPS = "1";
    const ip = clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }));
    expect(ip).toBe("3.3.3.3");
  });

  it("takes the Nth hop from the right with multiple proxies (PROXY_HOPS=2)", () => {
    process.env.TRUST_PROXY = "true";
    process.env.PROXY_HOPS = "2";
    const ip = clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }));
    expect(ip).toBe("2.2.2.2");
  });

  it("falls back to x-real-ip when there is no forwarded header", () => {
    process.env.TRUST_PROXY = "true";
    delete process.env.PROXY_HOPS;
    const ip = clientIp(reqWith({ "x-real-ip": "8.8.8.8" }));
    expect(ip).toBe("8.8.8.8");
  });

  it("setting PROXY_HOPS alone turns trust on", () => {
    delete process.env.TRUST_PROXY;
    process.env.PROXY_HOPS = "1";
    const ip = clientIp(reqWith({ "x-forwarded-for": "5.5.5.5" }));
    expect(ip).toBe("5.5.5.5");
  });
});

// anonymousRateKey is the key logged-out login/register limits actually use.
// Behind a trusted proxy it keys on the real IP; with no trusted proxy it keys
// on a signed per-browser cookie so visitors don't all share one bucket.
describe("anonymousRateKey", () => {
  it("keys on the real IP when a proxy is trusted", async () => {
    process.env.TRUST_PROXY = "true";
    process.env.PROXY_HOPS = "1";
    const key = await anonymousRateKey(reqWith({ "x-forwarded-for": "4.4.4.4" }));
    expect(key).toBe("4.4.4.4");
  });

  it("untrusted + no cookie context → shared pre-cookie bucket, never the spoofed header", async () => {
    delete process.env.TRUST_PROXY;
    delete process.env.PROXY_HOPS;
    // Outside a Next request scope there is no cookie jar to read/write, so we
    // land in the safe shared fallback — and crucially NOT in a bucket keyed off
    // the attacker-controlled x-forwarded-for value.
    const key = await anonymousRateKey(reqWith({ "x-forwarded-for": "1.2.3.4" }));
    expect(key).toBe("anon:unknown");
    expect(key).not.toContain("1.2.3.4");
  });
});
