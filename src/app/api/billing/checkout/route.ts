import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  BILLING_NOT_CONFIGURED,
  PaddleError,
  createCheckoutUrl,
  paddleConfig,
  priceIdForPlan,
} from "@/lib/billing/paddle";
import { BILLING_INTERVALS, PLANS } from "@/lib/types";
import { enforceUserRateLimit, USER_EXTERNAL_LIMIT } from "@/lib/rate-limit";

// `interval` is optional and defaults to monthly, so an older client that sends
// only a plan keeps working unchanged.
const schema = z.object({
  plan: z.enum(PLANS),
  interval: z.enum(BILLING_INTERVALS).optional().default("monthly"),
});

// Starts a Paddle checkout when billing is configured; otherwise returns a
// graceful "not configured" response the client surfaces as a friendly notice.
// Nothing is stored here — the Paddle customer and subscription ids arrive
// later, on the webhook, once the payment has actually gone through.
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // Tight limit: each call creates a transaction at the payment provider.
  const limited = enforceUserRateLimit("billing:checkout", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;

  const config = paddleConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: BILLING_NOT_CONFIGURED });
  }

  try {
    const { plan, interval } = schema.parse(await req.json());
    if (plan === "free") {
      return NextResponse.json({
        ok: false,
        message: "The Starter plan is free — no checkout needed.",
      });
    }

    const priceId = priceIdForPlan(plan, process.env, interval);
    if (!priceId) {
      // Same graceful, plain-English refusal the dormant path already uses: an
      // interval nobody has set a price for is simply not on sale yet.
      return NextResponse.json({
        ok: false,
        message:
          interval === "annual"
            ? `Yearly billing isn't switched on for the ${plan} plan yet.`
            : `No price is configured for the ${plan} plan yet.`,
      });
    }

    const url = await createCheckoutUrl(config, {
      userId: user.id,
      plan,
      priceId,
      interval,
      successUrl: `${config.appUrl}/settings/billing?upgraded=1`,
    });

    // The address is handed straight to the person who pressed the button. It is
    // never stored and never logged.
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    // A provider problem is already plain English and safe to show; anything
    // else (a bad body, a zod failure) gets a generic message rather than an
    // internal one.
    const message =
      err instanceof PaddleError ? err.message : "Checkout couldn't be started. Please try again.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
