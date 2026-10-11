// TradeOS — phone warnings (Web Push) are OFF unless the owner set all four keys.
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https:),
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY (the same public key, for the browser).
// Node-safe: no "server-only" import, because alert generation runs from the seed
// script too.

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  const browserKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey || !privateKey || !subject || !browserKey) return null;
  if (!/^(mailto:|https:\/\/)/i.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export const isPushConfigured = () => pushConfig() !== null;

/** The public key the browser needs, or null when phone warnings are not switched on. */
export function pushPublicKeyForBrowser(): string | null {
  return pushConfig() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim() : null;
}

export const MAX_PUSH_DEVICES = 5;
export const MAX_TESTS_PER_HOUR = 5;
