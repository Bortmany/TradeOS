// The payment provider's security rules, pinned.
//
// Two things here are the reason this file exists:
//  1. A webhook signature that doesn't verify must NEVER move an account onto a
//     paid plan. This is the only thing standing between a stranger and a free
//     Pro subscription, so the valid / tampered / wrong-secret / missing / stale
//     cases are all pinned.
//  2. Billing must stay DORMANT until the owner sets the environment variables —
//     with none set, nothing is configured and nothing can be charged.
//
// The rest pins the translation from a provider payload to this app's own plan
// and billingStatus words, so a future edit can't quietly hand out access.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import type { BillingEnv } from "@/lib/billing/paddle";
import { PLAN_DEFINITIONS, annualSavings } from "@/lib/billing/plans";
import {
  SIGNATURE_MAX_AGE_MS,
  annualPricingAvailable,
  billingUpdateFor,
  checkWebhookSignature,
  isBillingConfigured,
  isPaddleHostedUrl,
  isSafePaddleId,
  paddleConfig,
  paddleEnvironment,
  planForPriceId,
  priceIdForPlan,
  readWebhookEvent,
} from "@/lib/billing/paddle";

const SECRET = "pdl_ntfset_test_secret_value";

/** A configured deployment selling both monthly and yearly. */
const CONFIGURED: BillingEnv = {
  PADDLE_API_KEY: "pdl_test_apikey",
  PADDLE_WEBHOOK_SECRET: SECRET,
  PADDLE_PRICE_ID_PRO: "pri_pro_123",
  PADDLE_PRICE_ID_ELITE: "pri_elite_456",
  PADDLE_PRICE_ID_PRO_ANNUAL: "pri_pro_annual_789",
  PADDLE_PRICE_ID_ELITE_ANNUAL: "pri_elite_annual_012",
  NEXT_PUBLIC_APP_URL: "https://tradeos.example.com/",
};

/** The same deployment before anybody added the optional yearly prices. */
const MONTHLY_ONLY: BillingEnv = {
  PADDLE_API_KEY: "pdl_test_apikey",
  PADDLE_WEBHOOK_SECRET: SECRET,
  PADDLE_PRICE_ID_PRO: "pri_pro_123",
  PADDLE_PRICE_ID_ELITE: "pri_elite_456",
  NEXT_PUBLIC_APP_URL: "https://tradeos.example.com/",
};

/** Signs a body exactly the way the provider does: HMAC-SHA256 over `ts:body`. */
function sign(body: string, atMs: number, secret = SECRET): string {
  const ts = Math.floor(atMs / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

function subscriptionPayload(
  overrides: {
    eventType?: string;
    status?: string;
    priceId?: string;
    userId?: string;
    occurredAt?: string;
  } = {}
): string {
  return JSON.stringify({
    event_id: "evt_01",
    event_type: overrides.eventType ?? "subscription.activated",
    occurred_at: overrides.occurredAt ?? "2026-09-01T10:00:00Z",
    data: {
      id: "sub_01",
      status: overrides.status ?? "active",
      customer_id: "ctm_01",
      custom_data: { user_id: overrides.userId ?? "clxuser000000000000000001", plan: "pro" },
      items: [{ price: { id: overrides.priceId ?? "pri_pro_123" } }],
    },
  });
}

describe("dormant until configured", () => {
  it("is NOT configured when nothing is set", () => {
    expect(paddleConfig({})).toBeNull();
    expect(isBillingConfigured({})).toBe(false);
  });

  it("is NOT configured when only some of the variables are set", () => {
    expect(isBillingConfigured({ PADDLE_API_KEY: "k" })).toBe(false);
    expect(isBillingConfigured({ PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "s" })).toBe(false);
    expect(isBillingConfigured({ PADDLE_WEBHOOK_SECRET: "s", PADDLE_PRICE_ID_PRO: "p" })).toBe(
      false
    );
  });

  it("is configured once the key, the webhook secret and the Pro price are all set", () => {
    expect(isBillingConfigured(CONFIGURED)).toBe(true);
  });

  it("stays configured with no yearly prices, and yearly ids alone never wake it", () => {
    // The dormancy rule is unchanged by the yearly option: the monthly Pro price
    // is still the whole test, and yearly ids on their own configure nothing.
    expect(isBillingConfigured(MONTHLY_ONLY)).toBe(true);
    expect(
      isBillingConfigured({
        PADDLE_PRICE_ID_PRO_ANNUAL: "pri_pro_annual_789",
        PADDLE_PRICE_ID_ELITE_ANNUAL: "pri_elite_annual_012",
      })
    ).toBe(false);
  });

  it("defaults to the sandbox, and only plainly-production values switch to live", () => {
    expect(paddleEnvironment({})).toBe("sandbox");
    expect(paddleEnvironment({ PADDLE_ENV: "sandbox" })).toBe("sandbox");
    expect(paddleEnvironment({ PADDLE_ENV: "prod" })).toBe("sandbox"); // a typo is never live
    expect(paddleEnvironment({ PADDLE_ENV: "production" })).toBe("production");
    expect(paddleEnvironment({ PADDLE_ENV: "LIVE" })).toBe("production");
  });

  it("only ever calls the provider's own two hosts", () => {
    expect(paddleConfig(CONFIGURED)?.baseUrl).toBe("https://sandbox-api.paddle.com");
    expect(paddleConfig({ ...CONFIGURED, PADDLE_ENV: "production" })?.baseUrl).toBe(
      "https://api.paddle.com"
    );
  });

  it("trims the trailing slash off the app's own address", () => {
    expect(paddleConfig(CONFIGURED)?.appUrl).toBe("https://tradeos.example.com");
  });
});

describe("prices map to plans", () => {
  it("resolves the configured price for each paid plan, and none for free", () => {
    expect(priceIdForPlan("pro", CONFIGURED)).toBe("pri_pro_123");
    expect(priceIdForPlan("elite", CONFIGURED)).toBe("pri_elite_456");
    expect(priceIdForPlan("free", CONFIGURED)).toBeNull();
    expect(priceIdForPlan("pro", {})).toBeNull();
  });

  it("maps a price id back to a plan, and refuses one it doesn't know", () => {
    expect(planForPriceId("pri_pro_123", CONFIGURED)).toBe("pro");
    expect(planForPriceId("pri_elite_456", CONFIGURED)).toBe("elite");
    expect(planForPriceId("pri_someone_elses", CONFIGURED)).toBeNull();
    expect(planForPriceId(null, CONFIGURED)).toBeNull();
  });

  it("asking for nothing in particular still means monthly", () => {
    expect(priceIdForPlan("pro", CONFIGURED)).toBe(priceIdForPlan("pro", CONFIGURED, "monthly"));
  });

  it("resolves the yearly price for each paid plan when it is set", () => {
    expect(priceIdForPlan("pro", CONFIGURED, "annual")).toBe("pri_pro_annual_789");
    expect(priceIdForPlan("elite", CONFIGURED, "annual")).toBe("pri_elite_annual_012");
    expect(priceIdForPlan("free", CONFIGURED, "annual")).toBeNull();
  });

  it("with no yearly ids set, yearly is simply unavailable and monthly is untouched", () => {
    expect(priceIdForPlan("pro", MONTHLY_ONLY, "annual")).toBeNull();
    expect(priceIdForPlan("elite", MONTHLY_ONLY, "annual")).toBeNull();
    expect(priceIdForPlan("pro", MONTHLY_ONLY)).toBe("pri_pro_123");
    expect(priceIdForPlan("elite", MONTHLY_ONLY)).toBe("pri_elite_456");
    expect(annualPricingAvailable(MONTHLY_ONLY)).toBe(false);
    expect(annualPricingAvailable(CONFIGURED)).toBe(true);
    // A yearly price with billing switched off is still not on sale.
    expect(annualPricingAvailable({ PADDLE_PRICE_ID_PRO_ANNUAL: "pri_x" })).toBe(false);
  });

  it("a YEARLY price id maps back to the SAME plan its monthly twin does", () => {
    expect(planForPriceId("pri_pro_annual_789", CONFIGURED)).toBe("pro");
    expect(planForPriceId("pri_elite_annual_012", CONFIGURED)).toBe("elite");
    // and never leaks across tiers
    expect(planForPriceId("pri_pro_annual_789", CONFIGURED)).not.toBe("elite");
  });

  it("treats a blank or whitespace-only variable as not set", () => {
    const blank: BillingEnv = { ...MONTHLY_ONLY, PADDLE_PRICE_ID_PRO_ANNUAL: "   " };
    expect(priceIdForPlan("pro", blank, "annual")).toBeNull();
    // ...and a blank variable must never be "matched" by a blank price id.
    expect(planForPriceId("   ", blank)).toBeNull();
  });

  it("REFUSES to guess when one price id is pasted into two plans", () => {
    const duplicated: BillingEnv = { ...CONFIGURED, PADDLE_PRICE_ID_ELITE_ANNUAL: "pri_pro_123" };
    expect(planForPriceId("pri_pro_123", duplicated)).toBeNull();
  });
});

describe("what a year costs", () => {
  it("is ten months of the monthly price on every paid plan", () => {
    expect(PLAN_DEFINITIONS.free.priceAnnual).toBe(0);
    expect(PLAN_DEFINITIONS.pro.priceAnnual).toBe(290);
    expect(PLAN_DEFINITIONS.elite.priceAnnual).toBe(790);
    expect(annualSavings("pro").months).toBe(2);
    expect(annualSavings("elite").months).toBe(2);
    expect(annualSavings("free")).toEqual({ amount: 0, months: 0 });
  });

  it("a year is never more expensive than twelve months", () => {
    for (const plan of ["pro", "elite"] as const) {
      const def = PLAN_DEFINITIONS[plan];
      expect(def.priceAnnual).toBeLessThan(def.priceMonthly * 12);
    }
  });
});

describe("webhook signatures (the gate on paid access)", () => {
  const now = Date.parse("2026-09-01T10:00:00Z");
  const body = subscriptionPayload();

  it("accepts a correctly signed, recent request", () => {
    expect(checkWebhookSignature(body, sign(body, now), SECRET, now)).toBe("ok");
  });

  it("REFUSES a body that was changed after signing", () => {
    const header = sign(body, now);
    const tampered = body.replace("pri_pro_123", "pri_elite_456");
    expect(checkWebhookSignature(tampered, header, SECRET, now)).toBe("invalid");
  });

  it("REFUSES a signature made with a different secret", () => {
    expect(checkWebhookSignature(body, sign(body, now, "not-our-secret"), SECRET, now)).toBe(
      "invalid"
    );
  });

  it("REFUSES a missing or malformed header", () => {
    expect(checkWebhookSignature(body, null, SECRET, now)).toBe("missing");
    expect(checkWebhookSignature(body, "", SECRET, now)).toBe("missing");
    expect(checkWebhookSignature(body, "h1=abc", SECRET, now)).toBe("missing");
    expect(checkWebhookSignature(body, `ts=notanumber;h1=abc`, SECRET, now)).toBe("invalid");
  });

  it("REFUSES a correctly signed request that is too old to be genuine (replay)", () => {
    const old = now - SIGNATURE_MAX_AGE_MS - 1_000;
    expect(checkWebhookSignature(body, sign(body, old), SECRET, now)).toBe("stale");
  });

  it("still accepts one inside the replay window, in either direction of clock skew", () => {
    const nearlyOld = now - SIGNATURE_MAX_AGE_MS + 1_000;
    const nearlyEarly = now + SIGNATURE_MAX_AGE_MS - 1_000;
    expect(checkWebhookSignature(body, sign(body, nearlyOld), SECRET, now)).toBe("ok");
    expect(checkWebhookSignature(body, sign(body, nearlyEarly), SECRET, now)).toBe("ok");
  });

  it("doesn't care about the order of the parts in the header", () => {
    const header = sign(body, now);
    const [ts, h1] = header.split(";");
    expect(checkWebhookSignature(body, `${h1};${ts}`, SECRET, now)).toBe("ok");
  });
});

describe("reading a webhook payload", () => {
  it("reads the facts the app acts on", () => {
    const event = readWebhookEvent(subscriptionPayload());
    expect(event).not.toBeNull();
    expect(event?.eventType).toBe("subscription.activated");
    expect(event?.userId).toBe("clxuser000000000000000001");
    expect(event?.customerId).toBe("ctm_01");
    expect(event?.subscriptionId).toBe("sub_01");
    expect(event?.status).toBe("active");
    expect(event?.priceIds).toEqual(["pri_pro_123"]);
    expect(event?.occurredAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
  });

  it("returns nothing for a payload it can't read, instead of throwing", () => {
    expect(readWebhookEvent("not json")).toBeNull();
    expect(readWebhookEvent("[]")).toBeNull();
    expect(readWebhookEvent(JSON.stringify({ data: {} }))).toBeNull();
  });

  it("ignores an account id that isn't shaped like one of ours", () => {
    const payload = JSON.stringify({
      event_id: "evt_02",
      event_type: "subscription.activated",
      data: { id: "sub_02", custom_data: { user_id: "../../etc/passwd" } },
    });
    expect(readWebhookEvent(payload)?.userId).toBeNull();
  });

  it("has no date when the payload carries none (never 1970)", () => {
    const payload = JSON.stringify({
      event_id: "evt_03",
      event_type: "subscription.activated",
      data: { id: "sub_03" },
    });
    expect(readWebhookEvent(payload)?.occurredAt).toBeNull();
  });
});

describe("what an event means for an account", () => {
  const update = (body: string) => billingUpdateFor(readWebhookEvent(body)!, CONFIGURED);

  it("activation puts the account on the plan its price names", () => {
    expect(update(subscriptionPayload())).toEqual({ plan: "pro", billingStatus: "active" });
    expect(update(subscriptionPayload({ priceId: "pri_elite_456" }))).toEqual({
      plan: "elite",
      billingStatus: "active",
    });
  });

  it("a trial reads as trialing, not as a paid subscription", () => {
    expect(update(subscriptionPayload({ status: "trialing" }))).toEqual({
      plan: "pro",
      billingStatus: "trialing",
    });
  });

  it("cancellation drops the account back to free", () => {
    expect(update(subscriptionPayload({ eventType: "subscription.canceled" }))).toEqual({
      plan: "free",
      billingStatus: "canceled",
    });
    expect(
      update(subscriptionPayload({ eventType: "subscription.updated", status: "canceled" }))
    ).toEqual({ plan: "free", billingStatus: "canceled" });
  });

  it("a failed payment keeps the plan and flags it, because the provider is still trying", () => {
    const failed = JSON.stringify({
      event_id: "evt_04",
      event_type: "transaction.payment_failed",
      data: { id: "txn_01", subscription_id: "sub_01", customer_id: "ctm_01" },
    });
    expect(update(failed)).toEqual({ plan: null, billingStatus: "past_due" });
  });

  it("a completed payment only counts when it names a subscription", () => {
    const withSub = JSON.stringify({
      event_id: "evt_05",
      event_type: "transaction.completed",
      data: {
        id: "txn_02",
        subscription_id: "sub_01",
        customer_id: "ctm_01",
        items: [{ price: { id: "pri_pro_123" } }],
      },
    });
    const oneOff = JSON.stringify({
      event_id: "evt_06",
      event_type: "transaction.completed",
      data: { id: "txn_03", customer_id: "ctm_01" },
    });
    expect(update(withSub)).toEqual({ plan: "pro", billingStatus: "active" });
    expect(update(oneOff)).toBeNull();
  });

  it("an event we don't act on changes nothing", () => {
    const other = JSON.stringify({
      event_id: "evt_07",
      event_type: "customer.updated",
      data: { id: "ctm_01" },
    });
    expect(update(other)).toBeNull();
  });

  it("a YEARLY subscription activates exactly the plan that price belongs to", () => {
    expect(update(subscriptionPayload({ priceId: "pri_pro_annual_789" }))).toEqual({
      plan: "pro",
      billingStatus: "active",
    });
    // custom_data on this fixture says "pro" — the ELITE yearly price must still
    // win, because the price is the truth and the note at checkout is only a
    // fallback. Getting this backwards would sell Elite and grant Pro.
    expect(update(subscriptionPayload({ priceId: "pri_elite_annual_012" }))).toEqual({
      plan: "elite",
      billingStatus: "active",
    });
  });

  it("a yearly price on a deployment that never set one falls back to the checkout note", () => {
    const event = readWebhookEvent(subscriptionPayload({ priceId: "pri_pro_annual_789" }))!;
    expect(billingUpdateFor(event, MONTHLY_ONLY)).toEqual({ plan: "pro", billingStatus: "active" });
  });

  it("a price we don't recognise never grants a plan on its own", () => {
    const strayPrice = subscriptionPayload({ priceId: "pri_not_ours" });
    // Falls back to the plan named at checkout in custom_data — "pro" here —
    // and never invents a higher tier.
    expect(update(strayPrice)).toEqual({ plan: "pro", billingStatus: "active" });
  });
});

describe("addresses and ids are checked before they are used", () => {
  it("only redirects people to the provider's own pages", () => {
    expect(isPaddleHostedUrl("https://checkout.paddle.com/abc")).toBe(true);
    expect(isPaddleHostedUrl("https://paddle.com/pay/1")).toBe(true);
    expect(isPaddleHostedUrl("https://paddle.com.evil.example/pay")).toBe(false);
    expect(isPaddleHostedUrl("http://checkout.paddle.com/abc")).toBe(false); // not https
    expect(isPaddleHostedUrl("https://user:pw@checkout.paddle.com/abc")).toBe(false);
    expect(isPaddleHostedUrl("https://checkout.paddle.com:8443/abc")).toBe(false);
    expect(isPaddleHostedUrl("not a url")).toBe(false);
  });

  it("refuses an id that could escape a URL path", () => {
    expect(isSafePaddleId("ctm_01hxyz")).toBe(true);
    expect(isSafePaddleId("../customers")).toBe(false);
    expect(isSafePaddleId("ctm 01")).toBe(false);
    expect(isSafePaddleId("")).toBe(false);
  });
});
