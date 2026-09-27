// TradeOS — plans & feature gating. This is the monetization core.
// Everything that differs between tiers is declared here so gating is a single
// lookup, and pricing/limits can be tuned without hunting through the codebase.

import type { Plan, PlanFeatures } from "@/lib/types";

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceMonthly: number; // USD
  // USD for a whole year, paid up front. 0 means "this plan is not sold
  // annually" (the free tier). Deliberately priced at ten months of the monthly
  // price, so a year costs two months less.
  priceAnnual: number;
  tagline: string;
  highlighted?: boolean;
  features: PlanFeatures;
  // Marketing bullet list shown on the pricing page.
  bullets: string[];
}

// NOTE: nothing about the payment provider lives in this file — which price id
// belongs to which plan is decided in `src/lib/billing/paddle.ts`, the one
// module that knows the provider exists. This file is safe to import from
// client components; that one is not.

export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Starter",
    priceMonthly: 0,
    priceAnnual: 0, // nothing to bill — the free tier has no annual price
    tagline: "Build the journaling habit.",
    features: {
      maxAccounts: 1,
      maxTradesPerImport: 200,
      historyDays: 30,
      maxRuleBooks: 1,
      maxRules: 3,
      // The rule engine is NOT a paid gate any more: every tier has it, so a
      // free trader's discipline score is graded against real rules of their
      // own. What Pro buys is the cap coming off (maxRuleBooks / maxRules).
      ruleEngine: true,
      propFirmModule: false,
      reports: false,
      advancedAnalytics: false,
      aiCoaching: false,
    },
    bullets: [
      "1 trading account",
      "Manual + CSV import (up to 200 trades)",
      "Core dashboard & equity curve",
      "Rule engine: 1 rulebook, up to 3 rules",
      "Discipline score graded on every trade",
      "30 days of history",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    priceAnnual: 290, // ten months' worth — two months free
    tagline: "The full discipline engine.",
    highlighted: true,
    features: {
      maxAccounts: Infinity,
      maxTradesPerImport: 10_000,
      historyDays: Infinity,
      maxRuleBooks: Infinity,
      maxRules: Infinity,
      ruleEngine: true,
      propFirmModule: false,
      reports: true,
      advancedAnalytics: true,
      aiCoaching: false,
    },
    bullets: [
      "Unlimited accounts",
      "Unlimited rulebooks & rules (no-code engine)",
      "Full analytics (by time, session, strategy, weekday)",
      "Unlimited history",
      "Daily / weekly / monthly reports",
    ],
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceMonthly: 79,
    priceAnnual: 790, // ten months' worth — two months free
    tagline: "For funded & prop-firm traders.",
    features: {
      maxAccounts: Infinity,
      maxTradesPerImport: 100_000,
      historyDays: Infinity,
      maxRuleBooks: Infinity,
      maxRules: Infinity,
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
  },
};

export const TRIAL_DAYS = 14;

export function getFeatures(plan: Plan): PlanFeatures {
  return PLAN_DEFINITIONS[plan].features;
}

/**
 * What paying for a year saves, worked out from the table above rather than
 * written into the copy twice. `months` is that saving expressed in months of
 * the monthly price — the "two months free" line every screen shows.
 * Both numbers are 0 for a plan that isn't sold annually.
 */
export function annualSavings(plan: Plan): { amount: number; months: number } {
  const { priceMonthly, priceAnnual } = PLAN_DEFINITIONS[plan];
  if (priceAnnual <= 0 || priceMonthly <= 0) return { amount: 0, months: 0 };
  const amount = priceMonthly * 12 - priceAnnual;
  return { amount, months: Math.round(amount / priceMonthly) };
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
