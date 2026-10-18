import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, anonymousRateKey, socketAddress } from "@/lib/rate-limit";
import { EMAIL_ERROR, isPossibleEmail } from "@/lib/validation";
import { queueResetEmail } from "@/lib/password-reset";
import { logger } from "@/lib/logger";

const schema = z.object({
  email: z.string().trim().refine(isPossibleEmail, EMAIL_ERROR),
});

// The one reply every valid request gets, whether or not the account exists and
// whether or not email is switched on — it must never reveal either.
const NEUTRAL = {
  ok: true,
  message: "If an account exists for that email, we've sent a link to reset the password.",
};

const TOO_MANY = "Too many requests. Please wait a while and try again.";

export async function POST(req: Request) {
  const visitorKey = await anonymousRateKey(req, socketAddress(req));
  const byVisitor = rateLimit(`forgot:ip:${visitorKey}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!byVisitor.ok) {
    return NextResponse.json(
      { ok: false, error: TOO_MANY },
      { status: 429, headers: { "Retry-After": String(byVisitor.retryAfter) } }
    );
  }

  try {
    const { email: rawEmail } = schema.parse(await req.json());
    const email = rawEmail.toLowerCase();

    // Same limit for every address, real or not, so it leaks nothing.
    const byEmail = rateLimit(`forgot:email:${email}`, { limit: 3, windowMs: 60 * 60 * 1000 });
    if (!byEmail.ok) {
      return NextResponse.json(
        { ok: false, error: TOO_MANY },
        { status: 429, headers: { "Retry-After": String(byEmail.retryAfter) } }
      );
    }

    // Fire and forget: the reply must not wait on (or reveal) the account lookup.
    queueResetEmail(email);
    return NextResponse.json(NEUTRAL);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    // Bad body or a server hiccup: keep it generic. (Never log the email or token.)
    logger.error("Forgot-password error", { err: err instanceof Error ? err.message : "unknown" });
    if (err instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "Please enter your email address." }, { status: 400 });
    }
    // A failure after a valid request must not differ from the neutral reply.
    return NextResponse.json(NEUTRAL);
  }
}
