import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, anonymousRateKey, socketAddress } from "@/lib/rate-limit";
import { RESET_LINK_ERROR, consumeResetToken } from "@/lib/password-reset";
import {
  PASSWORD_LONG_ERROR,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_SHORT_ERROR,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

const schema = z.object({
  token: z.string().min(1, RESET_LINK_ERROR).max(200, RESET_LINK_ERROR),
  password: z.string().min(PASSWORD_MIN, PASSWORD_SHORT_ERROR).max(PASSWORD_MAX, PASSWORD_LONG_ERROR),
});

export async function POST(req: Request) {
  // Guessing tokens is hopeless (256 random bits), but cap tries anyway.
  const visitorKey = await anonymousRateKey(req, socketAddress(req));
  const limit = rateLimit(`reset:${visitorKey}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a while and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { token, password } = schema.parse(await req.json());
    const done = await consumeResetToken(token, password);
    if (!done) {
      return NextResponse.json({ ok: false, error: RESET_LINK_ERROR }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: err.errors[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    logger.error("Reset-password error", { err: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 400 }
    );
  }
}
