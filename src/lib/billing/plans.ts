// TradeOS — plans & feature gating. This is the monetization core.
// Everything that differs between tiers is declared here so gating is a single
// lookup, and pricing/limits can be tuned without hunting through the codebase.

import type { Plan, PlanFeatures } from "@/lib/types";

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceMonthly: number; // USD
  tagline: string;
  highlighted?: boolean;
  features: PlanFeatures;
  // Marketing bullet list shown on the pricing page.
  bullets: string[];
  stripePriceEnv?: string; // env var holding the Stripe price id
}

export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Starter",
    priceMonthly: 0,
    tagline: "Build the journaling habit.",
    features: {
      maxAccounts: 1,
      maxTradesPerImport: 200,
      historyDays: 30,
      ruleEngine: false,
      propFirmModule: false,
      reports: false,
      advancedAnalytics: false,
      aiCoaching: false,
    },
    bullets: [
      "1 trading account",
      "Manual + CSV import (up to 200 trades)",
      "Core dashboard & equity curve",
      "30 days of history",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    tagline: "The full discipline engine.",
    highlighted: true,
    features: {
      maxAccounts: Infinity,
      maxTradesPerImport: 10_000,
      historyDays: Infinity,
      ruleEngine: true,
      propFirmModule: false,
      reports: true,
      advancedAnalytics: true,
      aiCoaching: false,
    },
    bullets: [
      "Unlimited accounts",
      "No-code rule engine + discipline score",
      "Full analytics (by time, session, strategy, weekday)",
      "Unlimited history",
      "Daily / weekly / monthly reports",
    ],
    stripePriceEnv: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceMonthly: 79,
    tagline: "For funded & prop-firm traders.",
    features: {
      maxAccounts: Infinity,
      maxTradesPerImport: 100_000,
      historyDays: Infinity,
      ruleEngine: true,
      propFirmModule: true,
      reports: true,
      advancedAnalytics: true,
      aiCoaching: false, // flips on when the AI layer ships
    },
    bullets: [
      "Everything in Pro",
      "Prop-firm tracker (Topstep, Apex, TPT presets)",
      "Live drawdown / daily-loss-limit guardrails",
      "Consistency & profit-target monitoring",
      "Priority support + early access to AI coaching",
    ],
    stripePriceEnv: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  },
};

export const TRIAL_DAYS = 14;

export function getFeatures(plan: Plan): PlanFeatures {
  return PLAN_DEFINITIONS[plan].features;
}

// A user in an active trial gets Pro-level access so they experience the value.
export function effectivePlan(plan: Plan, billingStatus: string): Plan {
  if (billingStatus === "trialing") return plan === "free" ? "pro" : plan;
  if (billingStatus === "active") return plan;
  // past_due / canceled fall back to free
  return "free";
}

export type FeatureKey = keyof PlanFeatures;

export function hasFeature(
  plan: Plan,
  billingStatus: string,
  feature: FeatureKey
): boolean {
  const value = getFeatures(effectivePlan(plan, billingStatus))[feature];
  return typeof value === "boolean" ? value : value > 0;
}

export function withinLimit(
  plan: Plan,
  billingStatus: string,
  feature: FeatureKey,
  current: number
): boolean {
  const limit = getFeatures(effectivePlan(plan, billingStatus))[feature];
  if (typeof limit === "boolean") return limit;
  return current < limit;
}
