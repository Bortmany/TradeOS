// Server-side feature gates. The prop, rulebook and rule create routes now call
// hasFeature() before writing, so the "hidden button" on lower plans is backed
// by a real server check. These tests pin the exact gate outcomes those routes
// depend on, so a future plan-table tweak that would silently open a paid
// feature to free users fails here.

import { describe, it, expect } from "vitest";
import { hasFeature, effectivePlan } from "@/lib/billing/plans";

describe("rule engine gate (rulebooks + rules create)", () => {
  it("is CLOSED for a free plan with no active trial", () => {
    expect(hasFeature("free", "active", "ruleEngine")).toBe(false);
    expect(hasFeature("free", "canceled", "ruleEngine")).toBe(false);
    expect(hasFeature("free", "past_due", "ruleEngine")).toBe(false);
  });

  it("is OPEN during a trial (trial gets Pro-level access)", () => {
    expect(effectivePlan("free", "trialing")).toBe("pro");
    expect(hasFeature("free", "trialing", "ruleEngine")).toBe(true);
  });

  it("is OPEN for paid Pro and Elite", () => {
    expect(hasFeature("pro", "active", "ruleEngine")).toBe(true);
    expect(hasFeature("elite", "active", "ruleEngine")).toBe(true);
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
