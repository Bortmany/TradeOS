#!/usr/bin/env node
// ---------------------------------------------------------------------------
// switch-db.mjs — flip the Prisma datasource provider between SQLite and
// Postgres. Prisma does NOT allow the datasource `provider` to be an env var,
// so we rewrite schema.prisma in place. This is the ONLY script that mutates
// the schema.
//
//   node scripts/switch-db.mjs sqlite     # local dev (zero setup)
//   node scripts/switch-db.mjs postgres   # Supabase / production
//
// Idempotent: running it twice with the same target is a no-op. The regex is
// scoped to the `datasource db { ... }` block so nothing else is touched.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "..", "prisma", "schema.prisma");

// Map friendly aliases -> the exact Prisma provider string.
const PROVIDERS = {
  sqlite: "sqlite",
  postgres: "postgresql",
  postgresql: "postgresql",
};

function fail(msg) {
  console.error(`\n[switch-db] error: ${msg}\n`);
  console.error("usage: node scripts/switch-db.mjs <sqlite|postgres>\n");
  process.exit(1);
}

const arg = (process.argv[2] || "").toLowerCase();
if (!arg) fail("missing target argument");

const provider = PROVIDERS[arg];
if (!provider) fail(`invalid target "${arg}" (expected: sqlite | postgres)`);

let schema;
try {
  schema = readFileSync(SCHEMA_PATH, "utf8");
} catch {
  fail(`could not read schema at ${SCHEMA_PATH}`);
}

// Match the datasource block, then swap only its provider line. Using a
// function replacer keeps the edit scoped to `datasource db { ... }` and never
// touches the `generator` block or model fields.
const BLOCK_RE = /(datasource\s+db\s*\{)([\s\S]*?)(\})/;
const match = schema.match(BLOCK_RE);
if (!match) fail("no `datasource db { ... }` block found in schema.prisma");

const [, open, inner, close] = match;
const PROVIDER_LINE_RE = /provider\s*=\s*"[^"]*"/;
if (!PROVIDER_LINE_RE.test(inner)) {
  fail("no `provider = \"...\"` line inside the datasource block");
}

// Detect current provider for logging / idempotency.
const current = inner.match(/provider\s*=\s*"([^"]*)"/)[1];
const newInner = inner.replace(PROVIDER_LINE_RE, `provider = "${provider}"`);
const updated = schema.replace(BLOCK_RE, `${open}${newInner}${close}`);

if (current === provider) {
  console.log(`[switch-db] provider already "${provider}" — no change.`);
  process.exit(0);
}

writeFileSync(SCHEMA_PATH, updated);
console.log(`[switch-db] datasource provider: "${current}" -> "${provider}"`);
console.log(`[switch-db] wrote ${SCHEMA_PATH}`);
