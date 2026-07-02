import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, planForPriceId } from "@/lib/billing/stripe";

// Stripe webhook. Keeps the user's plan/billingStatus in sync with Stripe.
// Configure the endpoint in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, message: "Billing not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", secret);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.userId;
        const plan = s.metadata?.plan;
        if (userId && plan) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan,
              billingStatus: "active",
              stripeCustomerId: (s.customer as string) ?? undefined,
            },
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = planForPriceId(priceId) ?? sub.metadata?.plan;
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? sub.status === "trialing"
              ? "trialing"
              : "active"
            : sub.status === "past_due"
              ? "past_due"
              : "canceled";
        await syncByCustomer(sub.customer as string, { plan, billingStatus: status });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncByCustomer(sub.customer as string, { plan: "free", billingStatus: "canceled" });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: (err as Error).message }, { status: 500 });
  }
}

async function syncByCustomer(
  customerId: string,
  data: { plan?: string; billingStatus: string }
) {
  const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      billingStatus: data.billingStatus,
      ...(data.plan ? { plan: data.plan } : {}),
    },
  });
}
