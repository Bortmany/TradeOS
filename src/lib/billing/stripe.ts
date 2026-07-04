// TradeOS — Stripe integration, env-gated. When STRIPE_SECRET_KEY is unset the
// app runs in local "dev billing" mode: feature gating is still enforced, but
// checkout/portal calls return a graceful not-configured response instead of
// throwing. Add the keys (see .env.example) to light this up with zero code
// changes.

import Stripe from "stripe";
import type { Plan } from "@/lib/types";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
  return client;
}

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Resolve the configured Stripe Price id for a plan, if any. */
export function priceIdForPlan(plan: Plan): string | null {
  const def = PLAN_DEFINITIONS[plan];
  if (!def.stripePriceEnv) return null;
  return process.env[def.stripePriceEnv] ?? null;
}

/** Map a Stripe price id back to our internal plan (for webhook handling). */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const def of Object.values(PLAN_DEFINITIONS)) {
    if (def.stripePriceEnv && process.env[def.stripePriceEnv] === priceId) {
      return def.id;
    }
  }
  return null;
}
