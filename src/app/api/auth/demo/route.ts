import { NextResponse } from "next/server";
import { signInDemo } from "@/lib/auth";
import { rateLimit, anonymousRateKey, socketAddress } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";

// One-tap "Explore the demo desk". A public sign-in, so it is limited per
// visitor the same way login is (10 per 15 minutes). It signs in as the seeded
// demo user only and takes no input; every write route refuses that user.
const DEMO_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

export async function POST(req: Request) {
  const limit = rateLimit(`demo-login:ip:${await anonymousRateKey(req, socketAddress(req))}`, DEMO_WINDOW);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: "busy", error: "Lots of people are looking around right now. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }
  try {
    const ok = await signInDemo();
    if (!ok) {
      return NextResponse.json(
        { ok: false, code: "unavailable", error: "Couldn't open the demo desk. Try again in a moment." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
