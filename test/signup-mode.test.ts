// Invitation-only sign-up: the mode rules in src/lib/signup-mode.ts, the
// constant-time code check, and the register route's 403 / limiter behaviour.

import { describe, it, expect, afterAll, afterEach, vi } from "vitest";

// In-memory cookie jar so anonymousRateKey() can run outside a Next request.
const { jar } = vi.hoisted(() => ({ jar: new Map<string, { value: string }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => jar.set(name, { value }),
    delete: (name: string) => jar.delete(name),
  }),
}));

import { inviteCodes, isValidInviteCode, signupMode } from "@/lib/signup-mode";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/db";
import { resetRateLimit } from "@/lib/rate-limit";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const PROD = { NODE_ENV: "production" } as const;
const CODES = "alpha-code-1, beta-code-22 ,short,, gamma-code-333";

describe("signupMode — who may sign up", () => {
  it("is closed by default in production", () => {
    expect(signupMode({ ...PROD })).toBe("closed");
    expect(signupMode({ ...PROD, SIGNUP_INVITE_CODES: "" })).toBe("closed");
    // Codes shorter than 8 characters do not count.
    expect(signupMode({ ...PROD, SIGNUP_INVITE_CODES: "short,tiny" })).toBe("closed");
  });

  it("is invite-only in production when at least one code is set", () => {
    expect(signupMode({ ...PROD, SIGNUP_INVITE_CODES: CODES })).toBe("invite");
  });

  it("is open when SIGNUPS_OPEN is exactly 'true', even with codes set", () => {
    expect(signupMode({ ...PROD, SIGNUPS_OPEN: "true" })).toBe("open");
    expect(signupMode({ ...PROD, SIGNUPS_OPEN: "true", SIGNUP_INVITE_CODES: CODES })).toBe("open");
    expect(signupMode({ ...PROD, SIGNUPS_OPEN: "yes" })).toBe("closed");
  });

  it("defaults to open outside production, unless codes are set", () => {
    expect(signupMode({ NODE_ENV: "development" })).toBe("open");
    expect(signupMode({ NODE_ENV: "test" })).toBe("open");
    expect(signupMode({ NODE_ENV: "test", SIGNUP_INVITE_CODES: CODES })).toBe("invite");
  });

  it("parses codes trimmed, de-duplicated and 8+ characters only", () => {
    expect(inviteCodes({ SIGNUP_INVITE_CODES: `${CODES},alpha-code-1` })).toEqual([
      "alpha-code-1",
      "beta-code-22",
      "gamma-code-333",
    ]);
  });
});

describe("isValidInviteCode — code check", () => {
  const env = { SIGNUP_INVITE_CODES: CODES };

  it("accepts a configured code (any position, surrounding whitespace ignored)", () => {
    expect(isValidInviteCode("alpha-code-1", env)).toBe(true);
    expect(isValidInviteCode("  gamma-code-333 ", env)).toBe(true);
  });

  it("rejects a wrong, missing, case-changed, or non-string code", () => {
    expect(isValidInviteCode("alpha-code-2", env)).toBe(false);
    expect(isValidInviteCode("ALPHA-CODE-1", env)).toBe(false);
    expect(isValidInviteCode("", env)).toBe(false);
    expect(isValidInviteCode(undefined, env)).toBe(false);
    expect(isValidInviteCode(42, env)).toBe(false);
    // Nothing configured → nothing matches.
    expect(isValidInviteCode("alpha-code-1", {})).toBe(false);
  });

  it("compares in constant time — no early exit, timingSafeEqual on every code", async () => {
    // Spy on the underlying constant-time primitive: it must be called once per
    // configured code no matter where the match sits (or whether it exists),
    // proving the loop never returns early.
    vi.resetModules();
    const calls: number[] = [];
    vi.doMock("node:crypto", async () => {
      const real = await vi.importActual<typeof import("node:crypto")>("node:crypto");
      return {
        ...real,
        timingSafeEqual: (a: Uint8Array, b: Uint8Array) => {
          calls.push(a.length);
          return real.timingSafeEqual(a, b);
        },
      };
    });
    const mod = await import("@/lib/signup-mode");
    const three = { SIGNUP_INVITE_CODES: "code-one-1,code-two-22,code-three-333" };

    calls.length = 0;
    expect(mod.isValidInviteCode("code-one-1", three)).toBe(true); // first in list
    expect(calls.length).toBe(3);

    calls.length = 0;
    expect(mod.isValidInviteCode("code-three-333", three)).toBe(true); // last in list
    expect(calls.length).toBe(3);

    calls.length = 0;
    expect(mod.isValidInviteCode("code-one-X", three)).toBe(false); // same length, wrong
    expect(calls.length).toBe(3);

    vi.doUnmock("node:crypto");
    vi.resetModules();
  });
});

describe("POST /api/auth/register — invite-only and closed modes", () => {
  const ORIGINAL = { open: process.env.SIGNUPS_OPEN, codes: process.env.SIGNUP_INVITE_CODES };

  function post(body: unknown, socketIp = "198.51.100.7"): Request {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    Object.assign(req, { socket: { remoteAddress: socketIp } });
    return req;
  }

  afterEach(() => {
    jar.clear();
    vi.unstubAllEnvs();
    if (ORIGINAL.open === undefined) delete process.env.SIGNUPS_OPEN;
    if (ORIGINAL.codes === undefined) delete process.env.SIGNUP_INVITE_CODES;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: "invite-" } } });
    await prisma.$disconnect();
  });

  it("refuses with 403 when sign-up is closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SIGNUP_INVITE_CODES", "");
    vi.stubEnv("SIGNUPS_OPEN", "");
    const res = await registerPOST(
      post({ email: `invite-closed-${Date.now()}@example.com`, password: "invite-pass-123" })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Sign-up is closed for now." });
  });

  it("rejects a missing or wrong invite code with 403 and never lists the codes", async () => {
    vi.stubEnv("SIGNUP_INVITE_CODES", "secret-invite-1,secret-invite-2");
    const email = `invite-wrong-${Date.now()}@example.com`;

    const missing = await registerPOST(post({ email, password: "invite-pass-123" }));
    expect(missing.status).toBe(403);
    const body = await missing.json();
    expect(body.error).toBe("Sign-up is by invitation. Enter a valid invite code.");
    expect(JSON.stringify(body)).not.toContain("secret-invite");

    const wrong = await registerPOST(
      post({ email, password: "invite-pass-123", inviteCode: "secret-invite-9" }, "198.51.100.8")
    );
    expect(wrong.status).toBe(403);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("creates the account when the invite code is right", async () => {
    vi.stubEnv("SIGNUP_INVITE_CODES", "secret-invite-1,secret-invite-2");
    const email = `invite-ok-${Date.now()}@example.com`;
    const res = await registerPOST(
      post({ email, password: "invite-pass-123", inviteCode: " secret-invite-2 " }, "198.51.100.9")
    );
    expect(res.status).toBe(200);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("throttles repeated wrong guesses from one visitor (10 per 15 minutes)", async () => {
    vi.stubEnv("SIGNUP_INVITE_CODES", "secret-invite-1");
    const socket = "198.51.100.10";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      jar.clear(); // cookie-less client → keyed on the socket address
      // Clear the general 5-per-hour sign-up bucket each time so what we measure
      // here is ONLY the invite-guess limiter.
      resetRateLimit(`register:anon:sock:${socket}`);
      const res = await registerPOST(
        post(
          { email: `invite-guess-${i}@example.com`, password: "invite-pass-123", inviteCode: `guess-${i}` },
          socket
        )
      );
      statuses.push(res.status);
    }
    // First 10 wrong guesses → 403 (wrong code); from the 11th → 429 (throttled).
    expect(statuses.slice(0, 10).every((s) => s === 403)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(await prisma.user.count({ where: { email: { startsWith: "invite-guess-" } } })).toBe(0);
  });
});
