import { NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { rateLimit, anonymousRateKey, socketAddress } from "@/lib/rate-limit";
import { EMAIL_ERROR, EMAIL_TAKEN_ERROR, isPossibleEmail } from "@/lib/validation";
import {
  isValidInviteCode,
  signupMode,
  SIGNUP_CLOSED_ERROR,
  SIGNUP_INVITE_ERROR,
} from "@/lib/signup-mode";

const schema = z.object({
  // Same shape check the form runs — an address the browser let through still
  // has to look real here.
  email: z.string().trim().refine(isPossibleEmail, EMAIL_ERROR),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200, "Password is too long."),
  displayName: z.string().max(80).optional(),
  // Only looked at when sign-up is invitation-only (see src/lib/signup-mode.ts).
  inviteCode: z.string().max(200).optional(),
});

// Wrong invite codes: at most 10 guesses per visitor / 15 minutes. Like the
// login lock, only WRONG guesses count — a correct code always gets through.
const INVITE_GUESS_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

export async function POST(req: Request) {
  // Sign-up may be closed entirely (production with nothing configured).
  const mode = signupMode();
  if (mode === "closed") {
    return NextResponse.json({ ok: false, error: SIGNUP_CLOSED_ERROR }, { status: 403 });
  }

  // Curb sign-up spam: at most 5 new accounts per visitor / hour. Each visitor
  // gets its own bucket — a signed cookie for real browsers, and the stable
  // socket address for a cookie-less client — when there's no trusted proxy in
  // front, so a cookie-dropping flood is bounded per source instead of unlimited.
  const visitorKey = await anonymousRateKey(req, socketAddress(req));
  const limit = rateLimit(`register:${visitorKey}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts. Please wait a while and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { email, password, displayName, inviteCode } = schema.parse(body);

    if (mode === "invite" && !isValidInviteCode(inviteCode)) {
      // Count the failed guess; refuse outright once the guess budget is spent.
      // The response never says whether the code was missing, wrong, or close.
      const guesses = rateLimit(`register-invite:${visitorKey}`, INVITE_GUESS_LIMIT);
      if (!guesses.ok) {
        return NextResponse.json(
          { ok: false, error: "Too many invite code attempts. Please wait a while and try again." },
          { status: 429, headers: { "Retry-After": String(guesses.retryAfter) } }
        );
      }
      return NextResponse.json({ ok: false, error: SIGNUP_INVITE_ERROR }, { status: 403 });
    }

    // A new account is created AND signed in (session cookie set) in one step.
    // An email that already has an account gets a plain explanation: the owner
    // chose clarity here, and the 5-per-hour-per-visitor limit above is what
    // keeps this from being a free "which emails exist" probe.
    const { created } = await registerUser(email.toLowerCase().trim(), password, displayName);
    if (!created) {
      return NextResponse.json(
        { ok: false, code: "email_taken", error: EMAIL_TAKEN_ERROR },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Validation problems (e.g. weak/short password) are safe to spell out.
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    // Anything else stays generic — never echo a raw server error to the client.
    console.error("Register error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 400 }
    );
  }
}
