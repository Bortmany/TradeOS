// TradeOS — THE ONE PADDLE MODULE. Everything this app knows about the payment
// provider lives in this file: which environment variables switch it on, which
// host may be called, how a checkout link and a customer-portal link are minted,
// how a webhook's signature is checked, and how its payload is read. No other
// file names Paddle, a Paddle event type, or a Paddle payload field — swapping
// provider later is a rewrite of this file and nothing else.
//
// THREE RULES:
//  1. **Dormant until configured.** With PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET
//     or PADDLE_PRICE_ID_PRO unset there is no checkout: the API answers with a
//     plain "not configured" notice, the webhook answers 503, and /api/health
//     says billing is "dev-mode". Plan gating keeps working exactly as it does
//     today. Setting the variables is the whole activation — no code change.
//  2. **One host, ever.** api.paddle.com, or sandbox-api.paddle.com when
//     PADDLE_ENV is not production. Checked at the moment of use.
//  3. **The API key never leaves the server.** It is read here, sent in one
//     Authorization header, and never returned, logged, or put in an error
//     message. A checkout or portal address is treated the same way: handed to
//     the one signed-in user who pressed the button, never stored, never logged.
//
// SERVER ONLY. This module reads process.env secrets, so it must never be
// imported by a "use client" component — the billing screen gets its data from
// its server page and talks to the API routes.
//
// WHERE THE RESEARCH IS UNCERTAIN (see GO-LIVE.md): the exact response shape of
// the create-transaction and portal-session calls could not be confirmed
// first-hand against a live account. Every field is therefore read defensively,
// several plausible names are tried, and a shape we cannot read ends in a
// plain-English refusal rather than a guess or a crash.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "@/lib/types";

/**
 * Just the environment variables this module reads. Deliberately looser than
 * NodeJS.ProcessEnv so the tests can hand in a plain object describing one
 * deployment's settings without faking the whole environment.
 */
export type BillingEnv = Record<string, string | undefined>;

/** What checkout and the portal say while the owner has not set the variables. */
export const BILLING_NOT_CONFIGURED =
  "Checkout isn't switched on yet. Add the PADDLE_* keys to enable upgrades.";

/** Said when Paddle is reachable but did not answer with something usable. */
export const BILLING_UNAVAILABLE =
  "We couldn't reach the payment page. Please try again in a moment.";

/** How long one call to Paddle may take before it is abandoned. One attempt. */
const REQUEST_TIMEOUT_MS = 10_000;

export const LIVE_HOST = "api.paddle.com";
export const SANDBOX_HOST = "sandbox-api.paddle.com";

/**
 * How far out of step a webhook's own timestamp may be before it is refused as
 * a replay. Five MINUTES is deliberate: this app runs on a platform whose clock
 * we don't control, and a webhook refused for clock skew is retried for days
 * and then marked failed — a worse failure than a five-minute replay window,
 * which is harmless because every update this webhook makes is idempotent.
 */
export const SIGNATURE_MAX_AGE_MS = 5 * 60_000;

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

export interface PaddleConfig {
  apiKey: string;
  webhookSecret: string;
  /** "sandbox" until PADDLE_ENV says otherwise — the safe direction. */
  environment: "sandbox" | "production";
  /** https://api.paddle.com or https://sandbox-api.paddle.com */
  baseUrl: string;
  /** This site's own address, for the return link after paying. */
  appUrl: string;
}

/**
 * Which Paddle environment this deployment talks to. Anything that isn't
 * plainly production — unset, a typo — reads as SANDBOX, which is the safe
 * direction: a sandbox key cannot charge anybody, and a live key pointed at the
 * sandbox host simply fails loudly instead of quietly taking money.
 *
 * "live" is accepted beside "production" because Paddle's own docs use both.
 */
export function paddleEnvironment(
  env: BillingEnv = process.env
): "sandbox" | "production" {
  const value = env.PADDLE_ENV?.trim().toLowerCase() ?? "";
  return value === "production" || value === "live" ? "production" : "sandbox";
}

/** The app's own origin, no trailing slash. Same default as the rest of the repo. */
function appUrl(env: BillingEnv): string {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return "http://localhost:3000";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * The provider's settings, or null when payments have not been switched on.
 * A key with no price to sell, or a price with no key, is not half-configured —
 * it is dormant, which is a state that behaves rather than a state that breaks.
 * (The Elite price is optional: a deployment may sell Pro only.)
 */
export function paddleConfig(env: BillingEnv = process.env): PaddleConfig | null {
  const apiKey = env.PADDLE_API_KEY?.trim() ?? "";
  const webhookSecret = env.PADDLE_WEBHOOK_SECRET?.trim() ?? "";
  const proPrice = env.PADDLE_PRICE_ID_PRO?.trim() ?? "";
  if (!apiKey || !webhookSecret || !proPrice) return null;

  const environment = paddleEnvironment(env);
  return {
    apiKey,
    webhookSecret,
    environment,
    baseUrl: `https://${environment === "production" ? LIVE_HOST : SANDBOX_HOST}`,
    appUrl: appUrl(env),
  };
}

/** True when billing is switched on. The only thing /api/health is told. */
export function isBillingConfigured(env: BillingEnv = process.env): boolean {
  return paddleConfig(env) !== null;
}

/** The configured Paddle price id for a plan, if any. Free needs no price. */
export function priceIdForPlan(plan: Plan, env: BillingEnv = process.env): string | null {
  const raw =
    plan === "pro" ? env.PADDLE_PRICE_ID_PRO : plan === "elite" ? env.PADDLE_PRICE_ID_ELITE : "";
  const value = raw?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/** Map a Paddle price id back to our own plan name (used by the webhook). */
export function planForPriceId(
  priceId: string | null | undefined,
  env: BillingEnv = process.env
): Plan | null {
  if (!priceId) return null;
  if (priceId === env.PADDLE_PRICE_ID_PRO?.trim()) return "pro";
  if (priceId === env.PADDLE_PRICE_ID_ELITE?.trim()) return "elite";
  return null;
}

/* ------------------------------------------------------------------------ */
/* The one door out                                                          */
/* ------------------------------------------------------------------------ */

/** The only two addresses this app ever calls about money. Checked every time. */
function isAllowedApiUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  const host = url.hostname.toLowerCase();
  return host === LIVE_HOST || host === SANDBOX_HOST;
}

/**
 * Where a user may be redirected to. Paddle owns these addresses; anything else
 * means the checkout we asked for is not hosted by Paddle, and sending somebody
 * there would land them on a page needing Paddle's own JavaScript, which this
 * app deliberately never loads. So it is refused in plain English instead.
 */
export function isPaddleHostedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  const host = url.hostname.toLowerCase();
  return host === "paddle.com" || host.endsWith(".paddle.com");
}

/** An id from Paddle we are about to put in a URL path. Never trusted by shape alone. */
export function isSafePaddleId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

/** Raised when Paddle can't be reached or answered with something unusable. */
export class PaddleError extends Error {}

/**
 * One call to Paddle. One attempt, a hard timeout, redirects never followed,
 * and nothing about the key or the answer's body in any log line.
 */
async function paddleFetch(
  config: PaddleConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<Record<string, unknown>> {
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  if (!isAllowedApiUrl(url)) throw new PaddleError(BILLING_UNAVAILABLE);

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch {
    throw new PaddleError(BILLING_UNAVAILABLE);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // The status and the path are safe to record; the body is Paddle's and may
    // echo back what we sent, so it is never logged and never shown to anybody.
    console.warn(`[paddle] request refused (status ${response.status}, path ${path})`);
    throw new PaddleError(BILLING_UNAVAILABLE);
  }

  return payload !== null && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

/* ------------------------------------------------------------------------ */
/* Reading an answer defensively                                             */
/* ------------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Follows a dotted path through nested objects, returning the string at the end. */
function stringAt(root: unknown, path: string): string | null {
  let current: unknown = root;
  for (const key of path.split(".")) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return typeof current === "string" && current.length > 0 ? current : null;
}

/**
 * The first https:// string anywhere in a small answer, as a last resort when
 * none of the named paths matched. Bounded in depth so an unexpected answer can
 * never cost a stack.
 */
function firstHttpsString(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") return value.startsWith("https://") ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpsString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const item of Object.values(record)) {
    const found = firstHttpsString(item, depth + 1);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Checkout                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Mints a checkout the user is REDIRECTED to.
 *
 * The redirect is the point: no Paddle JavaScript is loaded on any page of this
 * app, so nothing has to be added to the site's security headers — a plain
 * top-level navigation to another site isn't governed by them.
 *
 * The user's own id and the plan they picked travel in `custom_data`, which
 * Paddle copies onto the transaction and then onto the subscription, so every
 * later webhook says which TradeOS account it is about.
 *
 * `checkout.url: null` is Paddle's documented way of saying "use this account's
 * default payment link"; the answer then carries the address to send the buyer
 * to. That address is CHECKED to be a Paddle-hosted one before anybody is sent.
 */
export async function createCheckoutUrl(
  config: PaddleConfig,
  input: { userId: string; plan: Plan; priceId: string; successUrl: string }
): Promise<string> {
  const answer = await paddleFetch(config, "/transactions", {
    method: "POST",
    body: {
      items: [{ price_id: input.priceId, quantity: 1 }],
      custom_data: { user_id: input.userId, plan: input.plan },
      checkout: { url: null },
    },
  });

  const found =
    stringAt(answer, "data.checkout.url") ??
    stringAt(answer, "data.checkout_url") ??
    stringAt(answer, "data.url") ??
    firstHttpsString(answer.data);

  if (!found || !isPaddleHostedUrl(found)) {
    // Either the answer was shaped differently from the documentation, or this
    // Paddle account has no Paddle-hosted checkout yet (live accounts need
    // approval — see GO-LIVE.md). Either way, nobody is redirected on a guess.
    console.warn(
      `[paddle] no usable hosted checkout address returned (environment ${config.environment})`
    );
    throw new PaddleError(
      "Checkout isn't ready yet — the payment account still needs finishing. Please try again later."
    );
  }

  // Where the buyer comes back to. An extra query parameter is a safe thing to
  // be wrong about: if Paddle ignores it they simply stay on Paddle's own
  // confirmation page, and the plan still changes when the webhook lands.
  const url = new URL(found);
  url.searchParams.set("success_url", input.successUrl);
  return url.toString();
}

/* ------------------------------------------------------------------------ */
/* The customer portal                                                       */
/* ------------------------------------------------------------------------ */

/**
 * A fresh "manage subscription" address, minted the moment the button is
 * pressed. Portal links are single-use and short-lived at Paddle, so this is
 * never cached, never stored and never logged.
 */
export async function createPortalUrl(
  config: PaddleConfig,
  customerId: string,
  subscriptionId: string | null
): Promise<string> {
  if (!isSafePaddleId(customerId)) throw new PaddleError(BILLING_UNAVAILABLE);

  const body =
    subscriptionId && isSafePaddleId(subscriptionId)
      ? { subscription_ids: [subscriptionId] }
      : {};

  const answer = await paddleFetch(config, `/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body,
  });

  const found =
    stringAt(answer, "data.urls.general.overview") ??
    stringAt(answer, "data.urls.general") ??
    stringAt(answer, "data.url") ??
    firstHttpsString(answer.data);

  if (!found || !isPaddleHostedUrl(found)) {
    console.warn(
      `[paddle] no usable portal address returned (environment ${config.environment})`
    );
    throw new PaddleError("We couldn't open your billing page. Please try again in a moment.");
  }
  return found;
}

/* ------------------------------------------------------------------------ */
/* Webhook signatures                                                        */
/* ------------------------------------------------------------------------ */

export type SignatureVerdict = "ok" | "missing" | "invalid" | "stale";

/** Reads `ts=1724…;h1=abcd…` without caring about order or unknown parts. */
function readSignatureHeader(header: string): { ts: string | null; h1: string | null } {
  let ts: string | null = null;
  let h1: string | null = null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (key === "ts") ts = value;
    if (key === "h1") h1 = value;
  }
  return { ts, h1 };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Is this webhook really from Paddle, and is it recent?
 *
 * HMAC-SHA256 over the literal string `{ts}:{raw body}`, keyed with the
 * notification destination's own secret, compared in constant time against
 * `h1`. THE BODY MUST BE THE RAW BYTES AS THEY ARRIVED — re-serialising the
 * JSON changes the signature, which is why the route reads `req.text()` and
 * nothing is parsed until this has passed.
 */
export function checkWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: number = Date.now()
): SignatureVerdict {
  if (!header) return "missing";

  const { ts, h1 } = readSignatureHeader(header);
  if (!ts || !h1) return "missing";

  const seconds = Number(ts);
  if (!Number.isFinite(seconds)) return "invalid";

  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  if (!safeEqual(h1.toLowerCase(), expected)) return "invalid";

  // Only once the signature holds is the age worth judging: a "stale" verdict on
  // an unsigned request would tell an attacker their timestamp was the only
  // thing wrong with their forgery.
  if (Math.abs(now - seconds * 1_000) > SIGNATURE_MAX_AGE_MS) return "stale";

  return "ok";
}

/* ------------------------------------------------------------------------ */
/* Reading a webhook                                                         */
/* ------------------------------------------------------------------------ */

export interface PaddleWebhookEvent {
  /** Identical on every retry of the same event. */
  eventId: string;
  eventType: string;
  /** The TradeOS account it is about, from `custom_data`, or null. */
  userId: string | null;
  /** The plan named at checkout, when the payload carries one. */
  customPlan: Plan | null;
  customerId: string | null;
  subscriptionId: string | null;
  /** The subscription's own status ("active", "past_due", …), when present. */
  status: string | null;
  /** Every price id named in the payload's line items. */
  priceIds: string[];
  /**
   * WHEN PADDLE SAYS IT HAPPENED (`occurred_at`), not when it reached us. It is
   * the only clock both sides share, and it is what lets a delivery that
   * overtook another one be put back in order. Null when the payload has none.
   */
  occurredAt: Date | null;
}

/** A real moment, or null. A payload we can't read a date from must never become 1970. */
function dateAt(root: unknown, path: string): Date | null {
  const raw = stringAt(root, path);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A user id we are willing to look up. Every id in this app is a cuid. */
function plausibleUserId(value: string | null): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9]{1,64}$/.test(value) ? value : null;
}

/** The price ids on a payload's line items, however the payload spells them. */
function readPriceIds(root: Record<string, unknown>): string[] {
  const items = asRecord(root.data)?.items;
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const item of items.slice(0, 20)) {
    const id = stringAt(item, "price.id") ?? stringAt(item, "price_id") ?? stringAt(item, "priceId");
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Turns a verified payload into the few facts this app acts on. Every field is
 * read defensively — both the documented snake_case name and the camelCase one
 * — so a missing field reads as "we don't know" rather than throwing.
 */
export function readWebhookEvent(rawBody: string): PaddleWebhookEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const root = asRecord(payload);
  if (!root) return null;

  const eventId = stringAt(root, "event_id") ?? stringAt(root, "eventId");
  const eventType = stringAt(root, "event_type") ?? stringAt(root, "eventType");
  if (!eventId || !eventType) return null;

  const userId = plausibleUserId(
    stringAt(root, "data.custom_data.user_id") ??
      stringAt(root, "data.custom_data.userId") ??
      stringAt(root, "data.customData.user_id") ??
      stringAt(root, "data.customData.userId")
  );

  const rawPlan =
    stringAt(root, "data.custom_data.plan") ?? stringAt(root, "data.customData.plan") ?? "";
  const customPlan: Plan | null =
    rawPlan === "pro" || rawPlan === "elite" || rawPlan === "free" ? rawPlan : null;

  const customerId = stringAt(root, "data.customer_id") ?? stringAt(root, "data.customerId");

  // A subscription event is about itself; a transaction event names the
  // subscription it belongs to.
  const subscriptionId =
    stringAt(root, "data.subscription_id") ??
    stringAt(root, "data.subscriptionId") ??
    (eventType.startsWith("subscription.") ? stringAt(root, "data.id") : null);

  return {
    eventId: eventId.slice(0, 200),
    eventType: eventType.slice(0, 100),
    userId,
    customPlan,
    customerId: customerId && isSafePaddleId(customerId) ? customerId : null,
    subscriptionId: subscriptionId && isSafePaddleId(subscriptionId) ? subscriptionId : null,
    status: stringAt(root, "data.status"),
    priceIds: readPriceIds(root),
    occurredAt: dateAt(root, "occurred_at") ?? dateAt(root, "occurredAt"),
  };
}

/* ------------------------------------------------------------------------ */
/* What an event means for a TradeOS account                                 */
/* ------------------------------------------------------------------------ */

/** The subscription is live. */
const ACTIVATING_EVENTS = new Set(["subscription.activated", "subscription.created"]);

/** The subscription has stopped: the account drops to the free plan's limits. */
const DEACTIVATING_EVENTS = new Set([
  "subscription.canceled",
  "subscription.cancelled",
  "subscription.expired",
  "subscription.paused",
]);

/** A payment failed. Paddle keeps retrying, so the account goes past_due, not free. */
export const PAYMENT_FAILED_EVENT = "transaction.payment_failed";

/** Paddle's subscription statuses translated into this app's billingStatus words. */
function statusWord(status: string | null): "active" | "trialing" | "past_due" | "canceled" | null {
  switch (status?.toLowerCase()) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "cancelled":
    case "paused":
      return "canceled";
    default:
      return null;
  }
}

/** What the webhook route should write, or null when the event changes nothing. */
export interface BillingUpdate {
  /** The plan to move to, or null to leave the plan where it is. */
  plan: Plan | null;
  billingStatus: "active" | "trialing" | "past_due" | "canceled";
}

/**
 * The whole provider vocabulary, in one place. The webhook route never reads a
 * Paddle event name — it reads the answer to "what does this mean for this
 * account?".
 */
export function billingUpdateFor(
  event: PaddleWebhookEvent,
  env: BillingEnv = process.env
): BillingUpdate | null {
  // Which plan the payload is about: the price is the truth, the plan named in
  // custom_data at checkout is the fallback.
  const pricedPlan =
    event.priceIds.map((id) => planForPriceId(id, env)).find((plan) => plan !== null) ?? null;
  const plan = pricedPlan ?? event.customPlan ?? null;

  if (DEACTIVATING_EVENTS.has(event.eventType)) {
    return { plan: "free", billingStatus: "canceled" };
  }

  if (ACTIVATING_EVENTS.has(event.eventType)) {
    return { plan, billingStatus: statusWord(event.status) ?? "active" };
  }

  // "You don't need separate events for renewals, upgrades or downgrades —
  // subscription.updated covers them all", so its own status decides. `past_due`
  // keeps the plan on file: Paddle is still trying, and the billing page says so.
  if (event.eventType === "subscription.updated") {
    const word = statusWord(event.status);
    if (!word) return null;
    return { plan: word === "canceled" ? "free" : plan, billingStatus: word };
  }

  // A payment went through (first charge or renewal) — only meaningful once we
  // know which subscription it belongs to.
  if (event.eventType === "transaction.completed" && event.subscriptionId) {
    return { plan, billingStatus: "active" };
  }

  if (event.eventType === PAYMENT_FAILED_EVENT) {
    return { plan: null, billingStatus: "past_due" };
  }

  return null;
}
