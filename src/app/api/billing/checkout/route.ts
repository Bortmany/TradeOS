import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripe, priceIdForPlan } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/types";
import { enforceUserRateLimit, USER_EXTERNAL_LIMIT } from "@/lib/rate-limit";

const schema = z.object({ plan: z.enum(PLANS) });

// Creates a Stripe Checkout Session when Stripe is configured; otherwise returns
// a graceful "not configured" response the client surfaces as a friendly notice.
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // Tight limit: creates Stripe customers / checkout sessions (external, paid).
  const limited = enforceUserRateLimit("billing:checkout", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({
      ok: false,
      message: "Stripe checkout is not configured yet. Add your STRIPE_* keys to enable upgrades.",
    });
  }

  try {
    const { plan } = schema.parse(await req.json());
    if (plan === "free") {
      return NextResponse.json({ ok: false, message: "The Starter plan is free — no checkout needed." });
    }
    const price = priceIdForPlan(plan);
    if (!price) {
      return NextResponse.json({
        ok: false,
        message: `No Stripe price configured for the ${plan} plan.`,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Reuse or create a Stripe customer for this user.
    let customerId = (await prisma.user.findUnique({ where: { id: user.id } }))?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?upgraded=1`,
      cancel_url: `${appUrl}/settings/billing`,
      allow_promotion_codes: true,
      metadata: { userId: user.id, plan },
      subscription_data: { metadata: { userId: user.id, plan } },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
