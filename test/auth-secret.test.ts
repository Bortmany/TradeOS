// The dev-secret fallback is gone: TradeOS refuses to sign or verify a session
// unless a real, strong AUTH_SECRET is configured — in EVERY environment, not
// just production. These tests pin that guard (the fix for the forge-a-session
// hole where a token signed with the old public constant was accepted).

import { describe, it, expect, afterEach } from "vitest";
import { authSecret } from "@/lib/auth";

const saved = process.env.AUTH_SECRET;

afterEach(() => {
  process.env.AUTH_SECRET = saved;
});

describe("authSecret — strong secret is mandatory everywhere", () => {
  it("returns the configured secret when it is present and long enough", () => {
    process.env.AUTH_SECRET = "a-perfectly-strong-secret-of-32+-characters";
    expect(authSecret()).toBe("a-perfectly-strong-secret-of-32+-characters");
  });

  it("throws when AUTH_SECRET is unset (no built-in fallback to forge with)", () => {
    delete process.env.AUTH_SECRET;
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });

  it("throws when AUTH_SECRET is too short to be safe (< 32 chars)", () => {
    process.env.AUTH_SECRET = "too-short";
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });
});
