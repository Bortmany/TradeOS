// TradeOS — registry of broker / funded-trading firms the API connector can talk to.
//
// The server only ever calls addresses from this list. Users pick a firm by id;
// the gateway URL is derived here, never typed by the user. That closes the
// server-side request-forgery hole a free-text "base URL" field opened (a user
// could point the server at a private/loopback address). To support a new firm
// add one entry below — see docs/connectors.md.
//
// Kept free of Node/server-only imports so the client-side form can render the
// same list.

export type FirmKind = "funded-firm" | "personal-broker";

export interface Firm {
  /** Stable id stored in BrokerConnection.broker. Lowercase, no spaces. */
  id: string;
  /** Plain-English name shown in the UI. */
  name: string;
  /** The gateway origin the server calls (https, no trailing slash). */
  apiBase: string;
  kind: FirmKind;
}

export const FIRMS: readonly Firm[] = [
  {
    id: "topstepx",
    name: "TopstepX",
    apiBase: "https://api.topstepx.com",
    kind: "funded-firm",
  },
] as const;

export const FIRM_IDS = FIRMS.map((f) => f.id) as [string, ...string[]];

export function getFirm(id: string): Firm | undefined {
  return FIRMS.find((f) => f.id === id);
}

/**
 * Every hostname the server is allowed to contact. Only hosts listed here (via a
 * firm's apiBase) are ever fetched — there is no way to add one at runtime.
 */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  FIRMS.map((f) => new URL(f.apiBase).hostname.toLowerCase())
);

/**
 * True when a stored gateway URL is safe to call: https, a hostname on the
 * allow-list, and nothing that could smuggle credentials or a different target
 * (no username/password, no query/fragment). Loopback, link-local, private and
 * raw-IP addresses can never pass because they are never in the registry.
 */
export function isAllowedBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.search || url.hash) return false;
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}

/** Plain-English message for a stored connection whose address is not allowed. */
export const DISALLOWED_BASE_URL_MESSAGE =
  "This broker address is no longer allowed; reconnect this account to continue syncing.";
