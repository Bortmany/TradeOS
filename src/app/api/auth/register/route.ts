import { NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { rateLimit, anonymousRateKey, socketAddress } from "@/lib/rate-limit";
import { EMAIL_ERROR, isPossibleEmail } from "@/lib/validation";

const schema = z.object({
  // Same shape check the form runs — an address the browser let through still
  // has to look real here.
  email: z.string().trim().refine(isPossibleEmail, EMAIL_ERROR),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200, "Password is too long."),
  displayName: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  // Curb sign-up spam: at most 5 new accounts per visitor / hour. Each visitor
  // gets its own bucket — a signed cookie for real browsers, and the stable
  // socket address for a cookie-less client — when there's no trusted proxy in
  // front, so a cookie-dropping flood is bounded per source instead of unlimited.
  const limit = rateLimit(`register:${await anonymousRateKey(req, socketAddress(req))}`, {
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
    const { email, password, displayName } = schema.parse(body);
    // registerUser never reveals whether the email already existed; we return
    // the SAME success response whether or not a new account was created, so
    // sign-up can't be used to probe which emails have accounts.
    await registerUser(email.toLowerCase().trim(), password, displayName);
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
