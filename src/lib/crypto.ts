// TradeOS — secret encryption at rest (broker API keys). AES-256-GCM.
// The key is derived from a dedicated ENCRYPTION_SECRET when one is set, so the
// login-signing secret and the at-rest encryption key can be managed (and
// rotated) independently. When ENCRYPTION_SECRET is unset the key falls back to
// the original AUTH_SECRET derivation, so existing stored keys keep working.
// Rotating whichever secret is in use invalidates stored credentials (users
// just reconnect their broker) — set ENCRYPTION_SECRET on FIRST deploy, not
// after keys have been stored.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  // Same rule as AUTH_SECRET in auth.ts: a weak dedicated secret in production
  // would silently produce a guessable encryption key, so refuse it outright.
  const dedicated = process.env.ENCRYPTION_SECRET;
  if (dedicated !== undefined && dedicated.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_SECRET must be at least 32 characters in production. Generate one with: openssl rand -base64 32"
    );
  }
  const secret =
    dedicated ??
    process.env.AUTH_SECRET ??
    "dev-secret-change-me-in-production-please-0000000000";
  return createHash("sha256").update(`${secret}:connector-secrets`).digest();
}

/** Encrypts a secret → "v1:<iv>:<tag>:<ciphertext>" (all base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, ivB64, tagB64, dataB64] = stored.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
