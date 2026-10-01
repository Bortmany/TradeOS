// TradeOS — how the app recognises the seeded demo desk.
//
// The seed (prisma/seed.ts) has no separate "is demo" marker on the user; the
// demo desk is the one login it creates, demo@tradeos.app. That email is the
// marker, kept here once so the dashboard notice and the tests agree.

export const DEMO_EMAIL = "demo@tradeos.app";

/** Shown when someone tries to sign up with the demo desk's email. Says nothing about why. */
export const RESERVED_EMAIL_ERROR = "That email address can't be used. Please try a different one.";

export function isDemoDesk(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}
