import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { rateLimit, anonymousRateKey } from "@/lib/rate-limit";
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
  // 15 min. `anonymousRateKey` gives each browser its own bucket (via a signed
  // cookie) when there's no trusted proxy, so logged-out traffic can't all share
  // one bucket and DoS everyone off the login form.
  const ipLimit = rateLimit(`login:ip:${await anonymousRateKey(req)}`, LOGIN_WINDOW);
  if (!ipLimit.ok) return tooManyAttempts(ipLimit.retryAfter);

  try {
    const body = await req.json();
    const { email, password } = schema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    // Also throttle by TARGET ACCOUNT. This is the fix that survives an attacker
    // rotating their source IP (or a spoofed X-Forwarded-For): one email can
    // only be guessed 10 times / 15 min no matter where the attempts come from.
    const emailLimit = rateLimit(`login:email:${normalizedEmail}`, LOGIN_WINDOW);
    if (!emailLimit.ok) return tooManyAttempts(emailLimit.retryAfter);

    await authenticate(normalizedEmail, password);
    return NextResponse.json({ ok: true });
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
