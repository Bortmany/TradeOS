import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { rateLimit, anonymousRateKey, socketAddress, resetRateLimit } from "@/lib/rate-limit";
import { EMAIL_ERROR, isPossibleEmail } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const schema = z.object({
  email: z.string().trim().refine(isPossibleEmail, EMAIL_ERROR),
  password: z.string().min(1).max(200, "Password is too long."),
});

const LOGIN_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

function tooManyAttempts(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function POST(req: Request) {
  // Slow down password guessing from a single source: 10 attempts per visitor /
  // 15 min. `anonymousRateKey` gives each browser its own bucket (signed cookie
  // or the caller's socket address) when there's no trusted proxy, so logged-out
  // traffic can't all share one bucket and DoS everyone off the login form.
  const ipLimit = rateLimit(
    `login:ip:${await anonymousRateKey(req, socketAddress(req))}`,
    LOGIN_WINDOW
  );
  if (!ipLimit.ok) return tooManyAttempts(ipLimit.retryAfter);

  try {
    const body = await req.json();
    const { email, password } = schema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();
    const emailKey = `login:email:${normalizedEmail}`;

    // Verify the password FIRST. The per-account lock below must only ever be
    // tripped by FAILED attempts — otherwise anyone who knows a victim's email
    // could spam wrong guesses to lock the counter and then the REAL owner, with
    // the correct password, would be answered with a 429. So a correct login is
    // allowed through no matter how high the failure counter is, and clears it.
    try {
      await authenticate(normalizedEmail, password);
      resetRateLimit(emailKey);
      return NextResponse.json({ ok: true });
    } catch (authErr) {
      if (authErr instanceof Error && authErr.message === "Invalid email or password.") {
        // A wrong guess — count it toward the per-account lock. This survives an
        // attacker rotating their source IP: one email can only be guessed a
        // bounded number of times / 15 min no matter where the guesses come from.
        // Once the account is locked, further WRONG guesses get a 429; a correct
        // password never reaches here, so the owner is never locked out.
        const emailLimit = rateLimit(emailKey, LOGIN_WINDOW);
        if (!emailLimit.ok) return tooManyAttempts(emailLimit.retryAfter);
      }
      throw authErr;
    }
  } catch (err) {
    // An impossible email is safe to name (it says nothing about who has an
    // account) and lets the form put the red border on the right box.
    if (err instanceof z.ZodError) {
      const message = err.errors.some((e) => e.path[0] === "email")
        ? EMAIL_ERROR
        : "Please enter a valid email and password.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    // The one deliberate, safe-to-show message authenticate() throws.
    if (err instanceof Error && err.message === "Invalid email or password.") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    // Everything else — including a malformed JSON body, whose raw SyntaxError
    // message must never reach the client — goes through the shared responder.
    return apiErrorResponse(err);
  }
}
