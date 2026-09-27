// TradeOS — built-in auth (local-first, zero external deps).
// Email + password with bcrypt hashing and a signed JWT stored in an httpOnly
// cookie. This is intentionally a thin, swappable layer: to move to Supabase
// Auth later, replace the token issue/verify functions and keep the same
// `getCurrentUser()` contract that the rest of the app depends on.

import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/billing/plans";

const COOKIE_NAME = "tradeos_session";

// There is NO built-in fallback secret any more. A hardcoded default is a public
// constant, so anyone could forge a valid session token signed with it. The app
// therefore refuses to sign or verify a session unless a real, strong AUTH_SECRET
// is configured — in EVERY environment (local dev included), not just production.
// The single place to set one is `.env` (see `.env.example`).
function assertSecureSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too weak. Set a strong value (at least 32 characters, " +
        "e.g. `openssl rand -base64 32`) in your environment before running TradeOS."
    );
  }
  return value;
}

// The confirmed AUTH_SECRET as a plain string. Other server-only modules (the
// rate limiter's per-browser cookie signing) reuse this so there is one required
// secret and one guard, not several. Throws if AUTH_SECRET is missing/too weak.
export function authSecret(): string {
  return assertSecureSecret();
}

// The signing key is derived lazily and only after the guard above has passed,
// so an unset/weak AUTH_SECRET fails loudly at first use instead of quietly
// encoding `undefined`. The result is cached once a valid secret is confirmed.
let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  cachedSecret = new TextEncoder().encode(assertSecureSecret());
  return cachedSecret;
}

// A fixed, valid bcrypt hash used ONLY to spend the same CPU time on the
// "no such account" / "email already taken" branches as on the real branch.
// Without this, an attacker could tell registered emails apart from unknown ones
// purely by how fast the server responds (a timing side-channel), even though the
// text of the reply is deliberately identical. Comparing any password against
// this hash always fails — it never authenticates anything.
const DUMMY_PASSWORD_HASH = "$2a$10$BoyXDHQWaLItPkOXYvDy5.urfCV.972z2z3z45k.SjpBS0rWgqD8i";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  plan: string;
  billingStatus: string;
  timezone: string;
  trialEndsAt: Date | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function issueToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function setSessionCookie(userId: string) {
  const token = await issueToken(userId);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

// Registers a new user WITHOUT revealing whether the email was already taken.
// If the address is free we create the account and sign them in. If it is
// already registered we quietly do nothing and report `created: false` — the
// API route returns the same success shape either way so an outsider can't use
// sign-up to discover which emails have accounts (account enumeration). When an
// email/notification channel is wired up, the "someone tried to sign up with
// your existing address" notice should be sent out-of-band from the `false` branch.
export async function registerUser(
  email: string,
  password: string,
  displayName?: string
): Promise<{ created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Spend the same time hashing/verifying as the "new account" branch below,
    // so response timing can't reveal that this email is already registered.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return { created: false };
  }

  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: displayName ?? null,
      plan: "free",
      billingStatus: "trialing",
      trialEndsAt,
    },
  });
  await setSessionCookie(user.id);
  return { created: true };
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Run a throwaway bcrypt comparison so the "no such account" path takes the
    // same time as a real password check — otherwise fast failures here would
    // reveal which emails have accounts (login enumeration).
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new Error("Invalid email or password.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password.");
  await setSessionCookie(user.id);
  return user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Enforce the strong-secret guard on the VERIFY path too, not just when a
  // session is issued. Kept outside the try below so a weak-secret misconfig
  // fails loudly (in every environment) instead of being swallowed into
  // "logged out". getSecret() throws if AUTH_SECRET is missing or too weak.
  const key = getSecret();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const userId = payload.sub as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        billingStatus: true,
        timezone: true,
        trialEndsAt: true,
      },
    });
    return user;
  } catch {
    return null;
  }
}

// Throws if unauthenticated — used by API routes & protected server actions.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

// Wraps an API route handler so it only runs for a signed-in user. Replaces the
// repeated try/requireUser/catch block at the top of route handlers:
//
//   export const POST = withUser(async (user, req: Request) => { ... });
//
// The signed-in user is passed as the first argument; the route's normal
// arguments (request, and `{ params }` for dynamic routes) follow. When there
// is no valid session it returns the repo's standard 401 response.
export function withUser<Args extends unknown[]>(
  handler: (user: SessionUser, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    let user: SessionUser;
    try {
      user = await requireUser();
    } catch {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return handler(user, ...args);
  };
}
