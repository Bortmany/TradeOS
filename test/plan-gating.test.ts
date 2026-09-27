// Server-side feature gates. The prop, rulebook and rule create routes now call
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
  it("is CLOSED for free, trial and Pro (Elite-only feature)", () => {
    expect(hasFeature("free", "active", "propFirmModule")).toBe(false);
    expect(hasFeature("free", "trialing", "propFirmModule")).toBe(false);
    expect(hasFeature("pro", "active", "propFirmModule")).toBe(false);
  });

  it("is OPEN only for Elite", () => {
    expect(hasFeature("elite", "active", "propFirmModule")).toBe(true);
  });
});
