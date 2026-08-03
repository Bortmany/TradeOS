// Login/register must not leak which emails have accounts via RESPONSE TIMING.
// The message is already generic; the remaining tell was that only the
// "account exists" branch ran bcrypt, so a missing email answered noticeably
// faster. Both branches now spend the same bcrypt time. These tests prove a
// bcrypt comparison happens even on the "no such account" / "already taken"
// branches (the timing equalizer), using the throwaway test database.

import { describe, it, expect, vi, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authenticate, registerUser } from "@/lib/auth";

// Hard rail (mirrors the other DB tests): never run against the seeded dev DB.
const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const existingEmail = `timing-${Date.now()}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: existingEmail } });
  await prisma.$disconnect();
});

describe("auth timing — same work on both branches", () => {
  it("login runs a bcrypt comparison even when the email has no account", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    await expect(
      authenticate(`nobody-${Date.now()}@example.com`, "whatever-password")
    ).rejects.toThrow(/Invalid email or password/);
    // The dummy comparison on the "no account" branch is what equalizes timing.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("register runs a bcrypt comparison on the already-registered branch", async () => {
    await prisma.user.create({
      data: { email: existingEmail, passwordHash: "x", plan: "free", billingStatus: "trialing" },
    });
    const spy = vi.spyOn(bcrypt, "compare");
    const result = await registerUser(existingEmail, "another-password-123");
    expect(result).toEqual({ created: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
