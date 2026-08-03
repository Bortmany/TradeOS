// Global setup for the core-guarantee suite.
//
// Creates a FRESH, throwaway SQLite database, pushes the Prisma schema into it,
// and deletes it again when the run finishes. The dev database (prisma/dev.db,
// with its seeded demo@tradeos.app data) is never touched — that is a hard rail:
// if the configured URL ever pointed at dev.db, this setup refuses to run.

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TEST_DB_FILE = "test-core-guarantee.db";
const DB_URL = `file:./${TEST_DB_FILE}`;

// Prisma resolves a relative SQLite path against the schema.prisma directory.
const dbPath = fileURLToPath(new URL(`../prisma/${TEST_DB_FILE}`, import.meta.url));

function removeDb() {
  for (const f of [dbPath, `${dbPath}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
}

export default function setup() {
  // --- rail: never run against the seeded dev database ---------------------
  const configured = process.env.DATABASE_URL ?? DB_URL;
  if (configured.includes("dev.db")) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL points at the dev database (${configured}). ` +
        `The suite must use the throwaway ${TEST_DB_FILE}.`
    );
  }

  // Start from a clean slate, then create the schema in the throwaway file.
  removeDb();
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });

  // Teardown — delete the throwaway database so the repo stays clean.
  return () => removeDb();
}
