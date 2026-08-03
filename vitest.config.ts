import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Creates and later deletes the throwaway SQLite database the suite uses.
    globalSetup: ["./test/global-setup.ts"],
    // The one and only DATABASE_URL the tests ever see. This overrides whatever
    // is in .env.local so `npm test` can never read or write the seeded dev DB.
    env: {
      DATABASE_URL: "file:./test-core-guarantee.db",
      // AUTH_SECRET is now REQUIRED in every environment (no built-in fallback).
      // Give the suite a throwaway strong secret so auth/rate-limit code runs.
      AUTH_SECRET: "test-only-auth-secret-at-least-32-characters-long",
    },
    // The cross-user isolation test shares one SQLite file — keep files serial.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": `${root}src`,
      // `data.ts` imports "server-only" (a Next.js RSC guard) — stub it so the
      // real data-layer functions can be exercised under Node/vitest.
      "server-only": r("./test/stubs/server-only.ts"),
    },
  },
});
