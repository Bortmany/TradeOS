// Contact address shown on the legal pages (/terms, /privacy, /refunds).
//
//   PRIVACY_CONTACT_EMAIL — optional. The address people write to about
//                           privacy, refunds or the terms. When unset, blank,
//                           or not a plausible email address, the owner's
//                           default below is used.
//
// Read server-side only (the legal layout is a server component), so the
// variable never needs to reach the browser as a NEXT_PUBLIC_ value.

export const DEFAULT_LEGAL_CONTACT_EMAIL = "naeljam@hotmail.com";

type Env = Record<string, string | undefined>;

// Deliberately loose: one "@", something either side, no whitespace. This is a
// sanity check on an operator-set value, not a full RFC 5322 validator.
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The contact address for the legal pages, from the environment or the default. */
export function legalContactEmail(env: Env = process.env): string {
  const raw = (env.PRIVACY_CONTACT_EMAIL ?? "").trim();
  return PLAUSIBLE_EMAIL.test(raw) ? raw : DEFAULT_LEGAL_CONTACT_EMAIL;
}
