import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  BILLING_NOT_CONFIGURED,
  billingUpdateFor,
  checkWebhookSignature,
  paddleConfig,
  readWebhookEvent,
  type PaddleWebhookEvent,
} from "@/lib/billing/paddle";

// The payment provider's webhook. It keeps each user's plan and billingStatus in
// step with their subscription, and it is the ONLY way an account is ever moved
// onto a paid plan.
//
// THE ORDER OF OPERATIONS HERE IS THE SECURITY. It never changes:
//  1. Configured? With no secret there is nothing to verify against, so the
//     request is refused as "not set up" before anything else happens.
//  2. Signature, over the RAW body, before anything is parsed and before any
//     database read. A request that fails this changes nothing anywhere — it is
//     the only thing standing between a stranger and a free Pro plan.
//  3. The account comes from the payload's custom data (or, failing that, from
//     the provider ids we already have on file). An account we don't recognise
//     is answered 200, never 404 — a 404 would turn this endpoint into a way of
//     asking whether an account id is real.
//  4. Deliveries can arrive OUT OF ORDER, so an event the provider stamped
//     earlier than the last one we acted on is acknowledged and ignored. Without
//     this, a delayed "active" landing after a cancellation would quietly put a
//     cancelled account back on Pro.
//
// The route reads req.text() and nothing parses the body until the signature has
// passed: re-serialising the JSON would change the signature.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const config = paddleConfig();
  if (!config) {
    // Dormant. The provider will retry and eventually mark the delivery failed,
    // which is correct: nothing is set up here, and pretending to have accepted
    // the event would be worse.
    return NextResponse.json({ ok: false, message: BILLING_NOT_CONFIGURED }, { status: 503 });
  }

  const rawBody = await req.text();
  const verdict = checkWebhookSignature(
    rawBody,
    req.headers.get("paddle-signature"),
    config.webhookSecret
  );
  if (verdict !== "ok") {
    // The verdict word only. Never the body, never the header, never the secret.
    console.warn(`[paddle] webhook refused (${verdict})`);
    return NextResponse.json(
      { ok: false, message: "That request could not be verified." },
      { status: 400 }
    );
  }

  const event = readWebhookEvent(rawBody);
  if (!event) {
    // Signed by us, so retrying will not make it readable. Accept it and move on.
    console.warn("[paddle] webhook verified but could not be read");
    return NextResponse.json({ received: true });
  }

  try {
    await applyEvent(event);
    return NextResponse.json({ received: true });
  } catch {
    // Something unexpected — answer 500 so the provider retries later. The error
    // itself is never echoed back: it could carry payload details.
    console.warn(`[paddle] webhook could not be applied (${event.eventType})`);
    return NextResponse.json(
      { ok: false, message: "We couldn't record that event." },
      { status: 500 }
    );
  }
}

/** Finds the account an event is about: its own id first, then ids we hold. */
async function findUser(event: PaddleWebhookEvent) {
  if (event.userId) {
    const byId = await prisma.user.findUnique({
      where: { id: event.userId },
      select: { id: true, plan: true, billingEventAt: true },
    });
    if (byId) return byId;
  }
  if (event.subscriptionId) {
    const bySubscription = await prisma.user.findFirst({
      where: { paddleSubscriptionId: event.subscriptionId },
      select: { id: true, plan: true, billingEventAt: true },
    });
    if (bySubscription) return bySubscription;
  }
  if (event.customerId) {
    return prisma.user.findFirst({
      where: { paddleCustomerId: event.customerId },
      select: { id: true, plan: true, billingEventAt: true },
    });
  }
  return null;
}

async function applyEvent(event: PaddleWebhookEvent): Promise<void> {
  const user = await findUser(event);
  if (!user) {
    console.warn(`[paddle] webhook named an account we don't have (${event.eventType})`);
    return;
  }

  // Out-of-order guard: compare the provider's clock against the provider's
  // clock. Events we can't date are never reordered.
  if (event.occurredAt && user.billingEventAt && event.occurredAt < user.billingEventAt) {
    console.warn(`[paddle] webhook arrived out of order and was ignored (${event.eventType})`);
    return;
  }

  const update = billingUpdateFor(event);

  // The provider's ids are kept whatever happens, cancellation included: they
  // are how "Manage subscription" still works afterwards, and how somebody
  // resubscribing is recognised as the same customer. They are identifiers at
  // the provider — never a key, a token, or anything about a card.
  const ids = {
    ...(event.customerId ? { paddleCustomerId: event.customerId } : {}),
    ...(event.subscriptionId ? { paddleSubscriptionId: event.subscriptionId } : {}),
  };

  if (!update && Object.keys(ids).length === 0) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...ids,
      ...(update
        ? {
            billingStatus: update.billingStatus,
            ...(update.plan ? { plan: update.plan } : {}),
          }
        : {}),
      ...(event.occurredAt ? { billingEventAt: event.occurredAt } : {}),
    },
  });
}
