// Invitation-only sign-up (the owner's decision until the paywall is live).
//
// Two environment variables control who can create an account:
//
//   SIGNUPS_OPEN="true"          — anyone can sign up.
//   SIGNUP_INVITE_CODES="a,b,c"  — comma-separated invite codes (8+ characters
//                                  each). When set (and SIGNUPS_OPEN is not
//                                  "true"), sign-up requires one of them.
//
// Resulting mode:
//   production:  "open" only if SIGNUPS_OPEN=true; else "invite" if at least one
//                code is configured; else "closed".
//   dev / test:  "open" unless codes are configured (then "invite"), so local
//                work and the test suite keep running with no extra setup.
//
// The code list is never returned to the client or logged — only the mode is.

import { timingSafeEqual } from "node:crypto";

export type SignupMode = "open" | "invite" | "closed";

const MIN_CODE_LENGTH = 8;

export const SIGNUP_INVITE_ERROR = "Sign-up is by invitation. Enter a valid invite code.";
export const SIGNUP_CLOSED_ERROR = "Sign-up is closed for now.";

type Env = Record<string, string | undefined>;

/** Parse the configured invite codes: trimmed, de-duplicated, 8+ chars. */
export function inviteCodes(env: Env = process.env): string[] {
  const raw = env.SIGNUP_INVITE_CODES ?? "";
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const code = part.trim();
    if (code.length >= MIN_CODE_LENGTH) seen.add(code);
  }
  return [...seen];
}

/** Work out the current sign-up mode from the environment. */
export function signupMode(env: Env = process.env): SignupMode {
  if (env.SIGNUPS_OPEN === "true") return "open";
  if (inviteCodes(env).length > 0) return "invite";
  return env.NODE_ENV === "production" ? "closed" : "open";
}

/**
 * Compare a submitted code against the configured list without leaking, through
 * timing, which characters (or which code) matched. Trimmed, case-sensitive.
 * Every configured code is checked — no early exit — so the time taken does
 * not depend on where in the list a match sits.
 */
export function isValidInviteCode(submitted: unknown, env: Env = process.env): boolean {
  if (typeof submitted !== "string") return false;
  const candidate = Buffer.from(submitted.trim(), "utf8");
  let matched = false;
  for (const code of inviteCodes(env)) {
    const expected = Buffer.from(code, "utf8");
    // timingSafeEqual needs equal lengths; a length mismatch is compared against
    // itself so the branch still costs a real comparison.
    if (expected.length === candidate.length) {
      if (timingSafeEqual(expected, candidate)) matched = true;
    } else {
      timingSafeEqual(expected, expected);
    }
  }
  return matched;
}
