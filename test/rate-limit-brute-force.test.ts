// Pentest fixes, items 2 & 3 — end-to-end through the real auth routes.
//
//  2) A cookie-less client used to get a brand-new limit bucket every request
//     (a freshly minted id), so /api/auth/register was effectively unlimited.
//     It is now keyed on the caller's stable socket address, so a cookie-less
//     flood from one source is bounded again — while different sources still get
//     their own budgets (no shared-bucket DoS).
//
//  3) The per-account login lock used to be checked BEFORE the password, so
//     anyone who knew a victim's email could spam wrong guesses to lock the
//     counter and then the REAL owner (correct password) was answered with 429.
//     The password is now verified first: a correct login is let through even
//     when the failure counter is maxed; only wrong guesses trip/extend the lock.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";

// In-memory cookie jar so cookies()/setSessionCookie work outside a Next request.
const { jar } = vi.hoisted(() => ({ jar: new Map<string, { value: string }>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => jar.set(name, { value }),
    delete: (name: string) => jar.delete(name),
  }),
}));

import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const LOGIN_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

// Build a POST request; optionally attach a fake socket the route can read as the
// caller's real (unforgeable) peer address.
function post(url: string, body: unknown, socketIp?: string): Request {
  const req = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (socketIp) Object.assign(req, { socket: { remoteAddress: socketIp } });
  return req;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "flood-" } } });
  await prisma.user.deleteMany({ where: { email: "lockout-victim@example.com" } });
  await prisma.$disconnect();
});

describe("register — cookie-less flood is bounded per source (item 2)", () => {
  beforeEach(() => jar.clear());

  it("throttles a cookie-dropping flood from one socket after its per-hour limit", async () => {
    const socket = "203.0.113.50";
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      jar.clear(); // client never keeps a cookie → must key on the socket
      const res = await registerPOST(
        post(
          "http://localhost/api/auth/register",
          { email: `flood-${Date.now()}-${i}@example.com`, password: "flood-pass-123" },
          socket
        )
      );
      statuses.push(res.status);
    }
    // First 5 accepted, the rest throttled — NOT unlimited.
    expect(statuses.filter((s) => s === 200).length).toBe(5);
    expect(statuses.some((s) => s === 429)).toBe(true);
  });

  it("a different socket still has its own budget (no shared-bucket collapse)", async () => {
    jar.clear();
    const res = await registerPOST(
      post(
        "http://localhost/api/auth/register",
        { email: `flood-other-${Date.now()}@example.com`, password: "flood-pass-123" },
        "203.0.113.99"
      )
    );
    expect(res.status).toBe(200); // not blocked by the other socket's flood
  });
});

describe("login — a locked-out account still accepts the correct password (item 3)", () => {
  const email = "lockout-victim@example.com";
  const password = "correct-horse-battery";

  beforeEach(async () => {
    jar.clear();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        plan: "free",
        billingStatus: "trialing",
      },
    });
    // Simulate an attacker who knows the email maxing out the failure counter.
    const key = `login:email:${email}`;
    for (let i = 0; i < LOGIN_WINDOW.limit; i++) rateLimit(key, LOGIN_WINDOW);
    // Confirm the account is now locked for further WRONG guesses.
    expect(rateLimit(key, LOGIN_WINDOW).ok).toBe(false);
  });

  it("lets the real owner in with the correct password despite the maxed lock", async () => {
    const res = await loginPOST(
      post("http://localhost/api/auth/login", { email, password })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("still throttles a WRONG guess against the locked account with a 429", async () => {
    const res = await loginPOST(
      post("http://localhost/api/auth/login", { email, password: "wrong-guess" })
    );
    expect(res.status).toBe(429);
  });
});
