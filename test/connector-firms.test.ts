// Broker firm registry — the server only ever calls gateway addresses from
// src/lib/connectors/firms.ts. These tests pin the request-forgery fix: a
// user-typed base URL is no longer accepted, stored URLs are re-checked against
// the allow-list on every sync, and private/loopback addresses can never pass.

import { describe, it, expect } from "vitest";
import {
  FIRMS,
  FIRM_IDS,
  getFirm,
  isAllowedBaseUrl,
  ALLOWED_HOSTS,
} from "@/lib/connectors/firms";
import { DEFAULT_BASE_URL } from "@/lib/connectors/topstepx";

describe("firm registry", () => {
  it("contains TopstepX with the gateway the connector already used", () => {
    const firm = getFirm("topstepx");
    expect(firm).toBeDefined();
    expect(firm?.apiBase).toBe(DEFAULT_BASE_URL);
    expect(firm?.kind).toBe("funded-firm");
    expect(FIRM_IDS).toContain("topstepx");
  });

  it("every firm uses https and a hostname on the allow-list", () => {
    for (const f of FIRMS) {
      const url = new URL(f.apiBase);
      expect(url.protocol).toBe("https:");
      expect(ALLOWED_HOSTS.has(url.hostname)).toBe(true);
    }
  });

  it("returns undefined for an unknown firm id", () => {
    expect(getFirm("not-a-firm")).toBeUndefined();
  });
});

describe("isAllowedBaseUrl — stored connector URLs", () => {
  it("accepts the registry gateway (backward compatibility for old rows)", () => {
    expect(isAllowedBaseUrl("https://api.topstepx.com")).toBe(true);
    expect(isAllowedBaseUrl("https://api.topstepx.com/")).toBe(true);
    expect(isAllowedBaseUrl("https://API.TOPSTEPX.COM")).toBe(true);
  });

  it.each([
    "http://localhost:3000",
    "https://127.0.0.1",
    "https://[::1]",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5",
    "https://192.168.1.1",
    "https://172.16.0.1",
    "http://api.topstepx.com",
    "https://api.topstepx.com.evil.example",
    "https://evil.example/api.topstepx.com",
    "https://user:pass@api.topstepx.com",
    "https://api.topstepx.com/?next=https://evil.example",
    "ftp://api.topstepx.com",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(isAllowedBaseUrl(url)).toBe(false);
  });
});
