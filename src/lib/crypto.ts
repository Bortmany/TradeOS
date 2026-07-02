// TradeOS — secret encryption at rest (broker API keys). AES-256-GCM with a key
// derived from AUTH_SECRET, so no extra key management is needed for the MVP.
// Rotating AUTH_SECRET invalidates stored credentials (users just reconnect).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET ?? "dev-secret-change-me-in-production-please-0000000000";
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
