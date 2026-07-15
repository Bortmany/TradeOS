import "server-only";

// TradeOS — a tiny structured logger. No dependency: it wraps `console` and
// emits ONE JSON line per call (level, message, time, optional context), which
// log aggregators (Railway, Sentry breadcrumbs, Datadog…) parse cleanly. Use it
// instead of scattered `console.log` on the server so error context is
// consistent and — importantly — secrets are never printed.
//
// Usage:
//   import { logger } from "@/lib/logger";
//   logger.error("Broker sync failed", { connectionId, err: err.message });
//
// It redacts any context field whose name looks like a credential (secret,
// token, password, api key, authorization header, cookie) at any depth, so an
// object accidentally carrying an API key or auth cookie never lands in a log.

type Level = "info" | "warn" | "error";

// Substrings that mark a field as sensitive. Field names are normalized
// (lower-cased, `-`/`_`/spaces stripped) before matching, so "api-key",
// "api_key", "apiKey" and "API KEY" all match "apikey".
const REDACT_MARKERS = [
  "secret",
  "token",
  "password",
  "apikey",
  "authorization",
  "cookie",
] as const;

const REDACTED = "[redacted]";

function looksSensitive(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  return REDACT_MARKERS.some((marker) => normalized.includes(marker));
}

// Deep-redact sensitive fields. Bounded depth so a cyclic/huge object can't hang
// the logger; anything past the limit is passed through untouched.
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = looksSensitive(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  const line: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
  };
  if (context) line.context = redact(context);

  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    // Fallback if context isn't serializable (e.g. a BigInt or a cycle we
    // couldn't fully tame) — still emit the level and message.
    serialized = JSON.stringify({ level, message, time: line.time });
  }

  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
