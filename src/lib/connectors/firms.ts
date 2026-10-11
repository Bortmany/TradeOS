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
  /** A bridge that talks to more than one host lists every hostname here (apiBase's included). */
  hosts?: readonly string[];
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

// --------------------------------------------------------------------------
// MT5 through MetaApi (a cloud bridge). SWITCHED OFF by default: its hosts are
// part of the registry ONLY while the owner's switch is on (METAAPI_ENABLED=true
// AND a METAAPI_TOKEN). It is not in FIRMS (so it never reaches the TopstepX
// dropdown or the TopstepX route's firm list); it has its own route.
// Hosts are from MetaApi's docs: the provisioning API (create / delete account)
// and the New York region's client API (reads). Nothing else is ever called.
// --------------------------------------------------------------------------

export const MT5_FIRM_ID = "mt5";
export const METAAPI_PROVISIONING_HOST = "mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
export const METAAPI_CLIENT_HOST = "mt-client-api-v1.new-york.agiliumtrade.ai";
export const METAAPI_HOSTS: readonly string[] = [METAAPI_PROVISIONING_HOST, METAAPI_CLIENT_HOST];

export const MT5_FIRM: Firm = {
  id: MT5_FIRM_ID,
  name: "MetaTrader 5 (through MetaApi)",
  apiBase: `https://${METAAPI_PROVISIONING_HOST}`,
  kind: "personal-broker",
  hosts: METAAPI_HOSTS,
};

type Env = Record<string, string | undefined>;

/** The owner's switch: METAAPI_ENABLED=true and a token. Anything else = off. */
export function metaApiSwitchedOn(env: Env = process.env): boolean {
  return env.METAAPI_ENABLED === "true" && (env.METAAPI_TOKEN ?? "").trim().length > 0;
}

/** Firms the server may talk to right now: the registry, plus MT5 only while the switch is on. */
export function activeFirms(env: Env = process.env): readonly Firm[] {
  return metaApiSwitchedOn(env) ? [...FIRMS, MT5_FIRM] : FIRMS;
}

export function getFirm(id: string): Firm | undefined {
  return activeFirms().find((f) => f.id === id);
}

/**
 * Every hostname the server is allowed to contact. Only hosts listed here (via a
 * firm's apiBase) are ever fetched — there is no way to add one at runtime.
 * This set never holds the MetaApi hosts; see `allowedHosts()` for the live list.
 */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  FIRMS.map((f) => new URL(f.apiBase).hostname.toLowerCase())
);

/** ALLOWED_HOSTS plus the MetaApi hosts, the latter ONLY while the owner's switch is on. */
export function allowedHosts(env: Env = process.env): ReadonlySet<string> {
  if (!metaApiSwitchedOn(env)) return ALLOWED_HOSTS;
  return new Set([...ALLOWED_HOSTS, ...METAAPI_HOSTS]);
}

/**
 * May the server contact this MetaApi host now? Yes while the switch is on. The one
 * exception is removing an account (so a trader's password never lingers at MetaApi
 * if the switch is turned off): allowed whenever the token is still there.
 */
export function metaApiHostAllowed(
  hostname: string,
  opts: { cleanup?: boolean } = {},
  env: Env = process.env
): boolean {
  if (!METAAPI_HOSTS.includes(hostname.toLowerCase())) return false;
  if (metaApiSwitchedOn(env)) return true;
  return opts.cleanup === true && (env.METAAPI_TOKEN ?? "").trim().length > 0;
}

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
  return allowedHosts().has(url.hostname.toLowerCase());
}

/** Plain-English message for a stored connection whose address is not allowed. */
export const DISALLOWED_BASE_URL_MESSAGE =
  "This broker address is no longer allowed; reconnect this account to continue syncing.";
