// Global setup for the core-guarantee suite.
//
// Pushes the Prisma schema into a dedicated, throwaway Postgres TEST database
// before the suite runs, force-resetting it to a clean slate every time. The
// dev database (whatever DATABASE_URL points at in your .env, normally seeded
// with demo@tradeos.app data) is never touched — that is a hard rail: if the
// configured URL doesn't look like a test database, this setup refuses to run.
//
// Note: globalSetup runs before Vitest applies `test.env` to worker processes,
// so it computes the same TEST_DATABASE_URL fallback as vitest.config.ts
// itself rather than reading DATABASE_URL back out of process.env.

import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://tradeos:tradeos@localhost:5432/tradeos_test";

export default function setup() {
  // --- rail: never run against the dev/production database -----------------
  const configured = TEST_DATABASE_URL;
  if (!/test/i.test(configured)) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL ("${configured}") does not look like ` +
        `a dedicated test database (expected the database name to contain ` +
        `"test", e.g. tradeos_test). Point DATABASE_URL (or TEST_DATABASE_URL, ` +
        `see vitest.config.ts) at a throwaway Postgres test database — never ` +
        `the dev or production one.`
    );
  }

  // Force-reset the schema into the test database so every run starts clean.
  // Nothing to tear down afterwards — it's a dedicated test database, not a
  // file, so the next run's force-reset is the cleanup.
  execSync("npx prisma db push --force-reset --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
