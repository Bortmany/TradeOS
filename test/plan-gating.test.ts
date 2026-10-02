// Server-side feature gates (the prop tracker is Pro and above, trials included). The prop, rulebook and rule create routes now call
// hasFeature() before writing, so the "hidden button" on lower plans is backed
// by a real server check. These tests pin the exact gate outcomes those routes
// depend on, so a future plan-table tweak that would silently open a paid
// feature to free users fails here.

import { describe, it, expect } from "vitest";
import { hasFeature, effectivePlan, getFeatures, withinLimit } from "@/lib/billing/plans";

describe("rule engine caps (rulebooks + rules create)", () => {
  it("is OPEN on every tier — the rule engine is no longer a paid gate", () => {
    // Deliberate: a free trader grades their trades against real rules of their
    // own, so their discipline score means something. What Pro sells is the cap
    // coming off, pinned below.
    expect(hasFeature("free", "active", "ruleEngine")).toBe(true);
    expect(hasFeature("free", "canceled", "ruleEngine")).toBe(true);
    expect(hasFeature("pro", "active", "ruleEngine")).toBe(true);
    expect(hasFeature("elite", "active", "ruleEngine")).toBe(true);
  });

  it("free gets exactly 1 rulebook and 3 rules; paid plans are unlimited", () => {
    expect(getFeatures("free").maxRuleBooks).toBe(1);
    expect(getFeatures("free").maxRules).toBe(3);
    expect(getFeatures("pro").maxRuleBooks).toBe(Infinity);
    expect(getFeatures("pro").maxRules).toBe(Infinity);
    expect(getFeatures("elite").maxRules).toBe(Infinity);
  });

  it("a free trader may create up to the cap and not one past it", () => {
    for (const used of [0, 1, 2]) {
      expect(withinLimit("free", "active", "maxRules", used)).toBe(true);
    }
    expect(withinLimit("free", "active", "maxRules", 3)).toBe(false);
    expect(withinLimit("free", "active", "maxRules", 4)).toBe(false);

    expect(withinLimit("free", "active", "maxRuleBooks", 0)).toBe(true);
    expect(withinLimit("free", "active", "maxRuleBooks", 1)).toBe(false);
  });

  it("a trial gets Pro's uncapped allowance", () => {
    expect(effectivePlan("free", "trialing")).toBe("pro");
    expect(withinLimit("free", "trialing", "maxRules", 50)).toBe(true);
    expect(withinLimit("free", "trialing", "maxRuleBooks", 9)).toBe(true);
  });

  it("a lapsed Pro subscription falls back to the free caps", () => {
    expect(effectivePlan("pro", "canceled")).toBe("free");
    expect(withinLimit("pro", "canceled", "maxRules", 3)).toBe(false);
    expect(withinLimit("pro", "active", "maxRules", 3)).toBe(true);
  });
});

describe("prop-firm module gate (prop create)", () => {
  const prop = (plan: "free" | "pro" | "elite", status: string) =>
    hasFeature(plan, status, "propFirmModule");

  it("is CLOSED for Starter, whatever the status except a trial", () => {
    expect(prop("free", "active")).toBe(false);
    expect(prop("free", "canceled")).toBe(false);
    expect(prop("free", "past_due")).toBe(false);
  });

  it("is OPEN for a trial, because a trial gives Pro-level access", () => {
    expect(prop("free", "trialing")).toBe(true);
  });

  it("is OPEN for Pro while active or trialing, CLOSED once lapsed", () => {
    expect(prop("pro", "active")).toBe(true);
    expect(prop("pro", "trialing")).toBe(true);
    expect(prop("pro", "canceled")).toBe(false);
    expect(prop("pro", "past_due")).toBe(false);
  });

  it("is OPEN for Elite while active, CLOSED once canceled", () => {
    expect(prop("elite", "active")).toBe(true);
    expect(prop("elite", "canceled")).toBe(false);
  });

  it("fails closed on a status it does not recognise", () => {
    expect(prop("pro", "")).toBe(false);
    expect(prop("elite", "something_new")).toBe(false);
  });
});

describe("nobody loses a feature in the pricing change", () => {
  // The plan table as it stood before the October 2026 pricing change.
  const before = {
    free: { maxAccounts: 1, maxTradesPerImport: 200, historyDays: 30, maxRuleBooks: 1, maxRules: 3, ruleEngine: true, propFirmModule: false, reports: false, advancedAnalytics: false, backtesting: false, aiCoaching: false },
    pro: { maxAccounts: Infinity, maxTradesPerImport: 10_000, historyDays: Infinity, maxRuleBooks: Infinity, maxRules: Infinity, ruleEngine: true, propFirmModule: false, reports: true, advancedAnalytics: true, backtesting: true, aiCoaching: false },
    elite: { maxAccounts: Infinity, maxTradesPerImport: 100_000, historyDays: Infinity, maxRuleBooks: Infinity, maxRules: Infinity, ruleEngine: true, propFirmModule: true, reports: true, advancedAnalytics: true, backtesting: true, aiCoaching: false },
  } as const;

  const rank = (v: boolean | number) => (typeof v === "boolean" ? Number(v) : v);

  it("every plan has every feature it had before, at least as much", () => {
    for (const plan of ["free", "pro", "elite"] as const) {
      const now = getFeatures(plan);
      for (const [key, old] of Object.entries(before[plan])) {
        expect(rank(now[key as keyof typeof now]), `${plan}.${key}`).toBeGreaterThanOrEqual(rank(old));
      }
    }
  });

  it("Pro is at least Starter, and Elite is at least Pro, on every feature", () => {
    const keys = Object.keys(getFeatures("free")) as (keyof ReturnType<typeof getFeatures>)[];
    for (const key of keys) {
      expect(rank(getFeatures("pro")[key]), key).toBeGreaterThanOrEqual(rank(getFeatures("free")[key]));
      expect(rank(getFeatures("elite")[key]), key).toBeGreaterThanOrEqual(rank(getFeatures("pro")[key]));
    }
  });
});
