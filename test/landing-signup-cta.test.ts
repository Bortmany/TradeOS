// The public home page's sign-up buttons must follow the real sign-up mode:
// never promise a free sign-up when the register page would refuse it.
import { describe, expect, it } from "vitest";
import { signupCtas } from "@/components/marketing/signup-cta";
import { signupMode } from "@/lib/signup-mode";

describe("home page sign-up buttons", () => {
  it("open sign-up keeps the normal free/trial wording", () => {
    const c = signupCtas("open");
    expect(c.href).toBe("/register");
    expect(c.freePlan).toBe("Start free");
    expect(c.paidPlan).toBe("Start trial");
    expect(c.notice).toBeNull();
  });

  it("invitation-only says an invite is needed and never says 'Start free'", () => {
    const c = signupCtas("invite");
    expect(c.href).toBe("/register");
    for (const label of [c.header, c.primary, c.freePlan, c.paidPlan]) {
      expect(label).toMatch(/invite/i);
      expect(label).not.toMatch(/start free|free trial/i);
    }
    expect(c.notice).toMatch(/invitation-only/i);
  });

  it("closed sign-up never links to the register page", () => {
    const c = signupCtas("closed");
    expect(c.href).not.toBe("/register");
    expect(c.notice).toBeTruthy();
  });

  it("production with invite codes set shows invite wording", () => {
    const mode = signupMode({ NODE_ENV: "production", SIGNUP_INVITE_CODES: "abcdefgh1" });
    expect(signupCtas(mode).mode).toBe("invite");
  });
});
