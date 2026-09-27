// What the home page's sign-up buttons say and where they go, per sign-up mode
// (see src/lib/signup-mode.ts). The page reads the mode on each request and
// hands the result down, so the buttons never promise a sign-up that the
// register page would then refuse.
//
//   open    — the normal "start free / start trial" wording, to /register.
//   invite  — the same register page (it asks for the invite code), but the
//             wording says an invitation is needed.
//   closed  — no sign-up link at all; buttons point to sign-in instead.

import type { SignupMode } from "@/lib/signup-mode";

export interface SignupCtas {
  mode: SignupMode;
  /** Where every sign-up button goes. */
  href: string;
  /** Small header button. */
  header: string;
  /** Big hero and final call-to-action buttons. */
  primary: string;
  /** Pricing card button for the free plan. */
  freePlan: string;
  /** Pricing card button for paid plans. */
  paidPlan: string;
  /** One plain sentence under the pricing heading, or null. */
  notice: string | null;
  /** Show the free-trial / refund line under the pricing heading. Off when
   *  sign-ups are closed, since nobody can start a trial then. */
  showTrialTerms: boolean;
}

export function signupCtas(mode: SignupMode): SignupCtas {
  if (mode === "open") {
    return {
      mode,
      href: "/register",
      header: "Start free",
      primary: "Start 14-day free trial",
      freePlan: "Start free",
      paidPlan: "Start trial",
      notice: null,
      showTrialTerms: true,
    };
  }
  if (mode === "invite") {
    return {
      mode,
      href: "/register",
      header: "Join with invite",
      primary: "Join with an invite code",
      freePlan: "Join with invite",
      paidPlan: "Join with invite",
      notice: "TradeOS is invitation-only for now. Have a code? Use any button to join.",
      showTrialTerms: true,
    };
  }
  return {
    mode,
    href: "/login",
    header: "Sign in",
    primary: "Sign in",
    freePlan: "Sign-ups closed",
    paidPlan: "Sign-ups closed",
    notice: "We are not taking new accounts at the moment. Please check back later.",
    showTrialTerms: false,
  };
}
