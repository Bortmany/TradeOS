// TradeOS — broker session tokens, kept IN MEMORY only so a trader is logged in
// to the broker about once a day instead of once a read.
//
// Never written to the database, never logged, never returned by any route. A
// token is reused for 23 hours, or dropped as soon as the broker rejects it (the
// caller then logs in once more). The cache key is a SHA-256 of the gateway,
// username and API key, so the key itself is never held as a map key or label.

import { createHash } from "node:crypto";

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

interface Entry {
  token: string;
  at: number;
}

const cache = new Map<string, Entry>();

export function sessionKey(baseUrl: string, username: string, apiKey: string): string {
  return createHash("sha256").update(`${baseUrl}\n${username}\n${apiKey}`).digest("hex");
}

export function getSessionToken(key: string, now: number = Date.now()): string | null {
  const e = cache.get(key);
  if (!e) return null;
  if (now - e.at >= TOKEN_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.token;
}

export function setSessionToken(key: string, token: string, now: number = Date.now()): void {
  cache.set(key, { token, at: now });
}

export function dropSessionToken(key: string): void {
  cache.delete(key);
}

/** Test helper: forget every token. */
export function clearSessionTokens(): void {
  cache.clear();
}
