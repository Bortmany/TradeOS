import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Stub checkout endpoint. Stripe is intentionally NOT wired yet — this returns a
// graceful "not configured" response the client surfaces as a friendly notice.
// When Stripe lands, create a Checkout Session here using the plan's
// `stripePriceEnv` and return the redirect URL instead.
export async function POST() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: false,
    message: "Stripe checkout is not configured yet.",
  });
}
