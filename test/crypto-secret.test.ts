// Secret encryption at rest — the public dev-key fallback is gone. With neither
// ENCRYPTION_SECRET nor AUTH_SECRET set, encrypting or decrypting a broker key
// must throw a clear error instead of silently using a guessable constant.

import { describe, it, expect, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const savedAuth = process.env.AUTH_SECRET;
const savedEnc = process.env.ENCRYPTION_SECRET;

afterEach(() => {
  process.env.AUTH_SECRET = savedAuth;
  if (savedEnc === undefined) delete process.env.ENCRYPTION_SECRET;
  else process.env.ENCRYPTION_SECRET = savedEnc;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value with AUTH_SECRET alone", () => {
    delete process.env.ENCRYPTION_SECRET;
    const stored = encryptSecret("my-broker-api-key");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored)).toBe("my-broker-api-key");
  });

  it("prefers a dedicated ENCRYPTION_SECRET when set", () => {
    process.env.ENCRYPTION_SECRET = "a-dedicated-encryption-secret-32chars-long!!";
    const stored = encryptSecret("key-under-dedicated-secret");
    expect(decryptSecret(stored)).toBe("key-under-dedicated-secret");
    delete process.env.ENCRYPTION_SECRET;
    // Under the other key the ciphertext no longer authenticates.
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("throws a clear error when neither secret is configured (no built-in fallback)", () => {
    delete process.env.ENCRYPTION_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("anything")).toThrow(/ENCRYPTION_SECRET/);
  });
});
