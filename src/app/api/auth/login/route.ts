import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { EMAIL_ERROR, isPossibleEmail } from "@/lib/validation";

const schema = z.object({
  email: z.string().trim().refine(isPossibleEmail, EMAIL_ERROR),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  // Slow down password guessing: at most 10 login attempts per IP / 15 min.
  const limit = rateLimit(`login:${clientIp(req)}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { email, password } = schema.parse(body);
    await authenticate(email.toLowerCase().trim(), password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // An impossible email is safe to name (it says nothing about who has an
    // account) and lets the form put the red border on the right box.
    const message =
      err instanceof z.ZodError
        ? err.errors.some((e) => e.path[0] === "email")
          ? EMAIL_ERROR
          : "Please enter a valid email and password."
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
