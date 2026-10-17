// Pins the review fixes: placeholder secrets, duplicate-vs-real save errors,
// orphan closing fills, session revocation and the proxy boot guard.
import { describe, it, expect, afterEach, vi } from "vitest";
import { authSecret, isPlaceholderSecret, isTokenRevoked } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/connectors/sync";
import { pairFills, type ProjectXFill } from "@/lib/connectors/topstepx";
import { assertProxyConfigured } from "@/lib/rate-limit";

const fill = (id: number, side: number, price: number, t: string, pnl: number | null): ProjectXFill => ({
  id, accountId: 1, contractId: "CON.F.US.EP.U25", creationTimestamp: t, price, profitAndLoss: pnl, fees: 0, side, size: 1,
});

afterEach(() => vi.unstubAllEnvs());

describe("placeholder AUTH_SECRET", () => {
  it("recognises the example-file placeholders", () => {
    expect(isPlaceholderSecret("change-me-generate-with-openssl-rand-base64-32")).toBe(true);
    expect(isPlaceholderSecret("REPLACE_WITH_openssl_rand_base64_32")).toBe(true);
    expect(isPlaceholderSecret("k3J9xQ2mZpL0vB7nR4tY8wC1dF6hA5sEgU+Ti")).toBe(false);
  });
  it("is refused in production only", () => {
    vi.stubEnv("AUTH_SECRET", "change-me-generate-with-openssl-rand-base64-32");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => authSecret()).toThrow(/placeholder/);
    vi.stubEnv("NODE_ENV", "test");
    expect(() => authSecret()).not.toThrow();
  });
});

describe("saveTrades duplicate detection", () => {
  it("treats only P2002 as a duplicate", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P1001" })).toBe(false);
    expect(isUniqueViolation(new Error("db down"))).toBe(false);
  });
});

describe("orphan closing fills", () => {
  it("drops a closing fill with no open position instead of inventing a trade", () => {
    const orphans: ProjectXFill[] = [];
    const t = pairFills([fill(1, 1, 5000, "2026-01-01T15:00:00Z", 120)], orphans);
    expect(t).toHaveLength(0);
    expect(orphans).toHaveLength(1);
  });
  it("still pairs a normal open then close", () => {
    const t = pairFills([
      fill(1, 0, 5000, "2026-01-01T15:00:00Z", null),
      fill(2, 1, 5001, "2026-01-01T15:05:00Z", 50),
    ]);
    expect(t).toHaveLength(1);
  });
});

describe("session revocation", () => {
  it("rejects tokens issued before the cut-off", () => {
    const cut = new Date("2026-10-18T12:00:00Z");
    const sec = cut.getTime() / 1000;
    expect(isTokenRevoked(sec - 10, cut)).toBe(true);
    expect(isTokenRevoked(sec + 10, cut)).toBe(false);
    expect(isTokenRevoked(sec - 10, null)).toBe(false);
  });
});

describe("proxy boot guard", () => {
  it("fails in production when TRUST_PROXY is unset, passes otherwise", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUST_PROXY", "");
    vi.stubEnv("PROXY_HOPS", "");
    expect(() => assertProxyConfigured()).toThrow(/TRUST_PROXY/);
    vi.stubEnv("TRUST_PROXY", "true");
    expect(() => assertProxyConfigured()).not.toThrow();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TRUST_PROXY", "");
    expect(() => assertProxyConfigured()).not.toThrow();
  });
});
