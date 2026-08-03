// Sign-up must not leak which emails already have an account (enumeration).
// registerUser() now reports `created: false` for an existing email instead of
// throwing "an account with that email already exists", and the route returns
// the same success shape either way. This test exercises the existing-email
// path against the throwaway test database.

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { registerUser } from "@/lib/auth";

// Hard rail (mirrors the other DB tests): never run against the seeded dev DB.
const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const email = `enum-${Date.now()}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("registerUser — no account enumeration", () => {
  it("returns created:false for an email that already exists, without throwing", async () => {
    await prisma.user.create({
      data: { email, passwordHash: "x", plan: "free", billingStatus: "trialing" },
    });

    // Must NOT throw a distinguishing "already exists" error — that is the leak.
    const result = await registerUser(email, "another-password-123");
    expect(result).toEqual({ created: false });

    // And it must not have created a second row or overwritten the first.
    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });
});
