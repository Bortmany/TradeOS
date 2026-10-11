// Phone warnings (Web Push): the push address is checked against a fixed list of
// push-service hosts; subscribe / unsubscribe / test are user-scoped and limited;
// a push goes out once when an alert is created and once per step up (not on repeat
// polls or clears); a 410 removes the subscription; with no VAPID keys nothing is
// sent and nothing throws. web-push is mocked: no real network.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateAlerts } from "@/lib/alerts/generate";
import { isAllowedPushEndpoint } from "@/lib/push/hosts";
import { addClosedTrade, cleanup, makeTrader } from "./fixtures/live-helpers";

const { session, wp } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
  wp: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (..._a: unknown[]) => ({ statusCode: 201 })),
  },
}));
vi.mock("web-push", () => ({ default: wp }));
vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (u: unknown, ...a: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) =>
      handler(session.current, ...args),
  requireUser: async () => session.current,
  getCurrentUser: async () => session.current,
}));

const KEYS = {
  VAPID_PUBLIC_KEY: "BPublicKeyForTestsOnly",
  VAPID_PRIVATE_KEY: "private-key-for-tests-only",
  VAPID_SUBJECT: "mailto:owner@example.com",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPublicKeyForTestsOnly",
} as const;
const setKeys = () => Object.assign(process.env, KEYS);
const clearKeys = () => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
};

const NOW = new Date();
let seq = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/test-${Date.now()}-${++seq}`;
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u", auth: "tBHItJI5svbpez7KI4CCXg" };

function signIn(t: { userId: string; email: string }) {
  session.current = { id: t.userId, email: t.email, plan: "elite", billingStatus: "active" };
}

async function call(route: "subscribe" | "unsubscribe" | "test", body: unknown) {
  const loaders = {
    subscribe: () => import("@/app/api/push/subscribe/route"),
    unsubscribe: () => import("@/app/api/push/unsubscribe/route"),
    test: () => import("@/app/api/push/test/route"),
  };
  const mod = await loaders[route]();
  return (mod.POST as (req: Request) => Promise<Response>)(
    new Request(`http://localhost/api/push/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
const subscribe = (ep: string) => call("subscribe", { endpoint: ep, keys });

const dev = (userId: string, ep = endpoint()) =>
  prisma.pushSubscription.create({ data: { userId, endpoint: ep, ...keys } });

/** A trader with only the daily-loss limit ($1,000), so steps are easy to hit. */
const trader = () => makeTrader({ maxDrawdown: null, profitTarget: null });

beforeEach(() => {
  session.current = null;
  setKeys();
  wp.setVapidDetails.mockClear();
  wp.sendNotification.mockReset();
  wp.sendNotification.mockResolvedValue({ statusCode: 201 });
});
afterAll(async () => {
  clearKeys();
  await cleanup();
});

describe("the push-service allow-list", () => {
  it("accepts the real push services", () => {
    for (const u of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com/wp/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QabC123",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ])
      expect(isAllowedPushEndpoint(u), u).toBe(true);
  });

  it("refuses everything else", () => {
    for (const u of [
      "https://evil.example.com/push",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilnotify.windows.com/x",
      "https://notify.windows.com/x",
      "https://fcm.googleapis.com@evil.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "ftp://fcm.googleapis.com/x",
      "not a url",
      "",
    ])
      expect(isAllowedPushEndpoint(u), u).toBe(false);
  });
});

describe("subscribe / unsubscribe", () => {
  it("saves the device for the signed-in person only", async () => {
    const a = await trader();
    signIn(a);
    const ep = endpoint();
    const res = await subscribe(ep);
    expect(res.status).toBe(200);
    const row = await prisma.pushSubscription.findUnique({ where: { endpoint: ep } });
    expect(row?.userId).toBe(a.userId);
  });

  it("refuses an address that is not on a push service and saves nothing", async () => {
    const a = await trader();
    signIn(a);
    for (const bad of ["https://evil.example.com/push", "http://fcm.googleapis.com/x", "https://169.254.169.254/latest"]) {
      const res = await subscribe(bad);
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain("evil");
    }
    expect(await prisma.pushSubscription.count({ where: { userId: a.userId } })).toBe(0);
  });

  it("refuses malformed keys", async () => {
    const a = await trader();
    signIn(a);
    const res = await call("subscribe", { endpoint: endpoint(), keys: { p256dh: "<script>", auth: "x" } });
    expect(res.status).toBe(400);
  });

  it("allows at most 5 devices, but re-saving one of them is fine", async () => {
    const a = await trader();
    signIn(a);
    const eps = Array.from({ length: 5 }, endpoint);
    for (const ep of eps) expect((await subscribe(ep)).status).toBe(200);
    const sixth = await subscribe(endpoint());
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).error).toContain("5 devices");
    expect((await subscribe(eps[0])).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: a.userId } })).toBe(5);
  });

  it("another person cannot turn off my device", async () => {
    const a = await trader();
    const b = await trader();
    const ep = endpoint();
    await dev(a.userId, ep);
    signIn(b);
    expect((await call("unsubscribe", { endpoint: ep })).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(1);
    signIn(a);
    expect((await call("unsubscribe", { endpoint: ep })).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(0);
  });

  it("is rate limited", async () => {
    const a = await trader();
    signIn(a);
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await call("unsubscribe", { endpoint: endpoint() })).status;
    expect(last).toBe(429);
  });

  it("answers 'not switched on' when the keys are missing", async () => {
    clearKeys();
    const a = await trader();
    signIn(a);
    const res = await subscribe(endpoint());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not_configured");
    expect(await prisma.pushSubscription.count({ where: { userId: a.userId } })).toBe(0);
  });

  it("with only some of the four keys, push stays off", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const a = await trader();
    signIn(a);
    expect((await subscribe(endpoint())).status).toBe(503);
  });
});

describe("send me a test", () => {
  it("sends to my device only, and is limited to 5 an hour", async () => {
    const a = await trader();
    const b = await trader();
    const ep = endpoint();
    await dev(a.userId, ep);
    signIn(b);
    expect((await call("test", { endpoint: ep })).status).toBe(404);
    expect(wp.sendNotification).not.toHaveBeenCalled();

    signIn(a);
    for (let i = 0; i < 5; i++) expect((await call("test", { endpoint: ep })).status).toBe(200);
    expect(wp.sendNotification).toHaveBeenCalledTimes(5);
    const sixth = await call("test", { endpoint: ep });
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).code).toBe("test_limit");
    expect(wp.sendNotification).toHaveBeenCalledTimes(5);
  });

  it("a 'gone' reply removes the device", async () => {
    const a = await trader();
    const ep = endpoint();
    await dev(a.userId, ep);
    signIn(a);
    wp.sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const res = await call("test", { endpoint: ep });
    expect(res.status).toBe(410);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(0);
  });

  it("never sends when the keys are missing", async () => {
    clearKeys();
    const a = await trader();
    const ep = endpoint();
    await dev(a.userId, ep);
    signIn(a);
    expect((await call("test", { endpoint: ep })).status).toBe(503);
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });
});

describe("pushes for alerts", () => {
  const sentBodies = () =>
    wp.sendNotification.mock.calls.map((c) => JSON.parse(String(c[1])) as { body: string; url: string });

  it("one push for a new alert, one more per step up, none for repeats or clears", async () => {
    const t = await trader();
    const ep = endpoint();
    await dev(t.userId, ep);

    // 50%: new alert -> one push, to the saved device only, with the app's own payload.
    const half = await addClosedTrade(t, -500, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    expect((wp.sendNotification.mock.calls[0][0] as { endpoint: string }).endpoint).toBe(ep);
    expect(sentBodies()[0].url).toBe("/dashboard");
    expect(sentBodies()[0].body).toContain("halfway to today's loss limit");

    // Repeat polls at the same step: nothing more.
    await generateAlerts(t.userId, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);

    // Step up to 80%: one more, with the amount left.
    await addClosedTrade(t, -350, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(2);
    expect(sentBodies()[1].body).toContain("80% of today's loss limit used");
    expect(sentBodies()[1].body).toContain("$150 left.");
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(2);

    // Up to 100%.
    await addClosedTrade(t, -300, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(3);

    // Recovering clears the alert on its own: no push for the clear.
    await prisma.trade.deleteMany({ where: { userId: t.userId } });
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(3);
    expect(half.id).toBeTruthy();
  });

  it("a person with no device gets nothing, and one device off does not affect another person", async () => {
    const quiet = await trader();
    const other = await trader();
    await dev(other.userId);
    await addClosedTrade(quiet, -600, NOW);
    await generateAlerts(quiet.userId, NOW);
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });

  it("turning alerts on later does not replay a warning that already existed", async () => {
    const t = await trader();
    await addClosedTrade(t, -850, NOW);
    await generateAlerts(t.userId, NOW);
    await dev(t.userId);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).not.toHaveBeenCalled();
    await addClosedTrade(t, -200, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a dismissed alert is not pushed again at the same step", async () => {
    const t = await trader();
    await dev(t.userId);
    await addClosedTrade(t, -850, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    await prisma.alert.updateMany({
      where: { userId: t.userId },
      data: { dismissedAt: new Date() },
    });
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a 410 removes the device and alert generation still completes", async () => {
    const t = await trader();
    const ep = endpoint();
    await dev(t.userId, ep);
    wp.sendNotification.mockRejectedValue({ statusCode: 410 });
    await addClosedTrade(t, -600, NOW);
    await expect(generateAlerts(t.userId, NOW)).resolves.toBeGreaterThan(0);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(0);
    expect(await prisma.alert.count({ where: { userId: t.userId, status: "open" } })).toBe(1);
  });

  it("another failure keeps the device, notes the failure, and never stops alerts", async () => {
    const t = await trader();
    const ep = endpoint();
    await dev(t.userId, ep);
    wp.sendNotification.mockRejectedValue({ statusCode: 500 });
    await addClosedTrade(t, -600, NOW);
    await expect(generateAlerts(t.userId, NOW)).resolves.toBeGreaterThan(0);
    const row = await prisma.pushSubscription.findUnique({ where: { endpoint: ep } });
    expect(row?.lastFailureAt).not.toBeNull();
  });

  it("sends nothing and throws nothing when the VAPID keys are missing", async () => {
    clearKeys();
    const t = await trader();
    await dev(t.userId);
    await addClosedTrade(t, -600, NOW);
    await expect(generateAlerts(t.userId, NOW)).resolves.toBeGreaterThan(0);
    expect(wp.sendNotification).not.toHaveBeenCalled();
    expect(wp.setVapidDetails).not.toHaveBeenCalled();
  });

  it("never calls a stored address that is off the allow-list", async () => {
    const t = await trader();
    const bad = await dev(t.userId, "https://evil.example.com/push");
    await addClosedTrade(t, -600, NOW);
    await generateAlerts(t.userId, NOW);
    expect(wp.sendNotification).not.toHaveBeenCalled();
    expect(bad.id).toBeTruthy();
  });

  it("never puts the device keys in a response", async () => {
    const a = await trader();
    signIn(a);
    const ep = endpoint();
    const text = await (await subscribe(ep)).text();
    expect(text).not.toContain(keys.auth);
    expect(text).not.toContain(keys.p256dh);
  });
});
