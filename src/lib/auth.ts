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
const DEV_SECRET = "dev-secret-change-me-in-production-please-0000000000";
const rawSecret = process.env.AUTH_SECRET ?? DEV_SECRET;

// Fail loudly if a production deployment is still using the dev secret — a weak
// signing key would let anyone forge sessions. This runs only when a session is
// actually issued/verified, so it never blocks the build.
function assertSecureSecret() {
  if (
    process.env.NODE_ENV === "production" &&
    (rawSecret === DEV_SECRET || rawSecret.length < 32)
  ) {
    throw new Error(
      "AUTH_SECRET is missing or insecure in production. Set a strong value (openssl rand -base64 32)."
    );
  }
}

const secret = new TextEncoder().encode(rawSecret);

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
    .sign(secret);
}

export async function setSessionCookie(userId: string) {
  assertSecureSecret();
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

export async function registerUser(
  email: string,
  password: string,
  displayName?: string
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists.");

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
  return user;
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid email or password.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password.");
  await setSessionCookie(user.id);
  return user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Enforce the strong-secret guard on the VERIFY path too, not just when a
  // session is issued. Kept outside the try below so a weak-secret misconfig
  // fails loudly in production instead of being swallowed into "logged out".
  assertSecureSecret();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
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
