// Honest alerts: the dashboard alert and the Prop page show the SAME daily-buffer
// figure (one shared calculation); an alert whose condition ended is closed; a
// dismissal sticks across regenerations and comes back only at a higher step or
// after the condition cleared and happened again; one alert per account per
// measure, updated in place; and every read and write is scoped to the signed-in
// trader. Throwaway database, no network.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateAlerts } from "@/lib/alerts/generate";
import { getPropStatus } from "@/lib/prop";
import { getOpenAlerts } from "@/lib/data";
import { getLiveSnapshot } from "@/lib/live/snapshot";
import { addClosedTrade, cleanup, connect, makeTrader, metaOf, openAlerts } from "./fixtures/live-helpers";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));
vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (u: unknown, ...a: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) =>
      handler(session.current, ...args),
  requireUser: async () => session.current,
  getCurrentUser: async () => session.current,
}));

const NOW = new Date();
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

function signIn(t: { userId: string; email: string }) {
  session.current = { id: t.userId, email: t.email, plan: "elite", billingStatus: "active" };
}

async function dismiss(id: string) {
  const route = await import("@/app/api/alerts/[id]/dismiss/route");
  return route.POST(new Request(`http://localhost/api/alerts/${id}/dismiss`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

/** Give the account a fresh live read holding one open position worth `openPnl`. */
async function liveRead(
  t: { userId: string; accountId: string },
  connId: string,
  openPnl: number,
  readAt: Date
) {
  await prisma.positionSnapshot.deleteMany({ where: { connectionId: connId } });
  await prisma.positionSnapshot.create({
    data: {
      userId: t.userId,
      connectionId: connId,
      contractId: "CON.F.US.MES.U25",
      symbol: "MES",
      side: "long",
      size: 2,
      avgPrice: 5210.25,
      lastPrice: 5198.25,
      priceSource: "bar",
      openPnl,
      readAt,
    },
  });
  await prisma.brokerConnection.update({
    where: { id: connId },
    data: { lastLiveAt: readAt, liveStatus: "ok", lastLiveError: null },
  });
}

beforeEach(() => {
  session.current = null;
});
afterAll(cleanup);

describe("the alert and the Prop page agree", () => {
  it("closed trades only: same daily buffer", async () => {
    const t = await makeTrader();
    await addClosedTrade(t, -820, NOW);
    await generateAlerts(t.userId, NOW);
    const alert = (await openAlerts(t.userId)).find((a) => metaOf(a).measure === "daily_loss")!;
    const [prop] = await getPropStatus(t.userId);
    expect(metaOf(alert).left).toBe(prop.dailyLossBuffer);
    expect(metaOf(alert).value).toBe(prop.todayLoss);
    expect(prop.dailyLossBuffer).toBe(180);
  });

  it("with an open loss from a live read: the same figure on both, and both say it includes open P&L", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, -700, NOW);
    await liveRead(t, conn.id, -120, new Date());
    await generateAlerts(t.userId, new Date());

    const alert = (await openAlerts(t.userId)).find((a) => metaOf(a).measure === "daily_loss")!;
    const [prop] = await getPropStatus(t.userId);
    expect(prop.live.includesOpen).toBe(true);
    expect(prop.live.openPnl).toBe(-120);
    expect(prop.dailyLossBuffer).toBe(180);
    expect(metaOf(alert).left).toBe(prop.dailyLossBuffer);
    expect(metaOf(alert).value).toBe(prop.todayLoss);
    expect(metaOf(alert)).toMatchObject({ source: "live", openCount: 1, openEstimated: true });

    // Drawdown uses the same figure on both sides too.
    const dd = (await openAlerts(t.userId)).find((a) => metaOf(a).measure === "drawdown");
    if (dd) expect(metaOf(dd).value).toBe(prop.currentDrawdown);
    expect(prop.currentDrawdown).toBe(820);
  });

  it("a stale read (older than 3 minutes) falls back to closed trades on BOTH", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, -700, NOW);
    await liveRead(t, conn.id, -120, new Date(Date.now() - 10 * 60_000));
    const [prop] = await getPropStatus(t.userId);
    expect(prop.live.includesOpen).toBe(false);
    expect(prop.live.health).toBe("stale");
    expect(prop.dailyLossBuffer).toBe(300);
  });

  it("profit-target progress never counts open P&L", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, 1000, NOW);
    await liveRead(t, conn.id, 500, new Date());
    const [prop] = await getPropStatus(t.userId);
    expect(prop.netProfit).toBe(1000);
    expect(prop.profitTargetPct).toBeCloseTo(1000 / 3000);
  });

  it("the drawdown peak includes the highest open profit seen at a read", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, 100, later(-60 * 24));
    // A past live read once saw equity at 50,400 (open profit), then the position closed flat.
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { livePeakEquity: 50400 } });
    await prisma.positionSnapshot.deleteMany({ where: { connectionId: conn.id } });
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { lastLiveAt: new Date(), liveStatus: "ok" },
    });
    const [prop] = await getPropStatus(t.userId);
    expect(prop.peakEquity).toBe(50400);
    expect(prop.currentDrawdown).toBe(300);
  });
});

describe("self-clearing", () => {
  it("an alert whose condition ended is closed and no longer returned", async () => {
    const t = await makeTrader();
    await addClosedTrade(t, -850, NOW);
    await generateAlerts(t.userId, NOW);
    const [first] = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(metaOf(first).step).toBe(80);

    await addClosedTrade(t, 600, NOW); // recovered to -250: under half
    await generateAlerts(t.userId, later(1));
    expect((await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss")).toHaveLength(0);
    const row = await prisma.alert.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.status).toBe("resolved");
    expect(typeof metaOf(row).resolvedAt).toBe("string");
    expect((await getOpenAlerts(t.userId)).map((a) => a.id)).not.toContain(first.id);
    expect((await getLiveSnapshot(t.userId)).alerts.map((a) => a.id)).not.toContain(first.id);
  });

  it("resolved alerts older than 30 days are deleted; younger ones are kept", async () => {
    const t = await makeTrader();
    const old = await prisma.alert.create({
      data: {
        userId: t.userId,
        type: "drawdown",
        title: "old",
        message: "old",
        status: "resolved",
        meta: JSON.stringify({ auto: true, key: "drawdown:gone", resolvedAt: later(-31 * 24 * 60).toISOString() }),
      },
    });
    const fresh = await prisma.alert.create({
      data: {
        userId: t.userId,
        type: "drawdown",
        title: "fresh",
        message: "fresh",
        status: "resolved",
        meta: JSON.stringify({ auto: true, key: "drawdown:gone2", resolvedAt: later(-5 * 24 * 60).toISOString() }),
      },
    });
    await generateAlerts(t.userId, NOW);
    expect(await prisma.alert.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.alert.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });

  it("a stale live link never clears or lowers a warning that open P&L raised", async () => {
    const t = await makeTrader();
    const conn = await connect(t);
    await addClosedTrade(t, -700, NOW);
    const read = new Date();
    await liveRead(t, conn.id, -120, read);
    await generateAlerts(t.userId, read);
    const [a] = (await openAlerts(t.userId)).filter((x) => metaOf(x).measure === "daily_loss");
    expect(metaOf(a).step).toBe(80);

    // Ten minutes later the broker is unreachable (no new read); a recompute runs.
    await generateAlerts(t.userId, new Date(read.getTime() + 10 * 60_000));
    const after = (await openAlerts(t.userId)).filter((x) => metaOf(x).measure === "daily_loss");
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(a.id);
    expect(metaOf(after[0])).toMatchObject({ step: 80, value: 820, asAt: read.toISOString() });
  });
});

describe("one alert per account per measure, updated in place", () => {
  it("steps change the SAME row; regenerating never stacks a second one", async () => {
    const t = await makeTrader();
    await addClosedTrade(t, -550, NOW);
    await generateAlerts(t.userId, NOW);
    await generateAlerts(t.userId, later(1));
    const one = (await openAlerts(t.userId)).filter((a) => metaOf(a).measure === "daily_loss");
    expect(one).toHaveLength(1);
    expect(metaOf(one[0]).step).toBe(50);

    await addClosedTrade(t, -300, NOW); // -850: 80%
    await generateAlerts(t.userId, later(2));
    await addClosedTrade(t, -200, NOW); // -1050: 100%
    await generateAlerts(t.userId, later(3));
    await generateAlerts(t.userId, later(4));

    const rows = await prisma.alert.findMany({ where: { userId: t.userId } });
    const dl = rows.filter((a) => metaOf(a).measure === "daily_loss");
    expect(dl).toHaveLength(1); // never stacked, never recreated
    expect(dl[0].id).toBe(one[0].id);
    expect(dl[0].status).toBe("open");
    expect(metaOf(dl[0]).step).toBe(100);
    expect(dl[0].severity).toBe("high");
    // And at most one per measure across the whole account.
    const keys = rows.filter((a) => a.status === "open").map((a) => metaOf(a).key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every alert carries its value and an as-at time", async () => {
    const t = await makeTrader();
    await addClosedTrade(t, -2100, later(-60 * 24 * 5));
    await addClosedTrade(t, -850, NOW);
    await generateAlerts(t.userId, NOW);
    const alerts = await openAlerts(t.userId);
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    for (const a of alerts) {
      const m = metaOf(a);
      expect(typeof m.value).toBe("number");
      expect(m.asAt).toBe(NOW.toISOString());
    }
  });
});

describe("dismiss", () => {
  it("sticks across regenerations and reloads; returns at a higher step; returns after clear-and-recur", async () => {
    const t = await makeTrader();
    signIn(t);
    await addClosedTrade(t, -850, NOW);
    await generateAlerts(t.userId, NOW);
    const [a] = (await openAlerts(t.userId)).filter((x) => metaOf(x).measure === "daily_loss");

    const res = await dismiss(a.id);
    expect(res.status).toBe(200);
    expect((await getLiveSnapshot(t.userId)).alerts.map((x) => x.id)).not.toContain(a.id);
    expect((await getOpenAlerts(t.userId)).map((x) => x.id)).not.toContain(a.id);

    // Regenerate several times at the same step: still dismissed, same row.
    await generateAlerts(t.userId, later(1));
    await generateAlerts(t.userId, later(2));
    let row = await prisma.alert.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("open");
    expect(row.dismissedAt).not.toBeNull();
    expect((await getLiveSnapshot(t.userId)).alerts.map((x) => x.id)).not.toContain(a.id);

    // It does NOT come back when the loss eases a little (80 -> 50) ...
    await addClosedTrade(t, 300, NOW); // -550: 55%
    await generateAlerts(t.userId, later(3));
    expect((await getLiveSnapshot(t.userId)).alerts.map((x) => x.id)).not.toContain(a.id);

    // ... nor when it returns to the step it was dismissed at.
    await addClosedTrade(t, -300, NOW); // -850: 80% again
    await generateAlerts(t.userId, later(4));
    expect((await getLiveSnapshot(t.userId)).alerts.map((x) => x.id)).not.toContain(a.id);

    // It comes back when the loss reaches the NEXT step, as the same row.
    await addClosedTrade(t, -200, NOW); // -1050: 100%
    await generateAlerts(t.userId, later(5));
    const shown = (await getLiveSnapshot(t.userId)).alerts.find((x) => x.id === a.id);
    expect(shown?.step).toBe(100);
    row = await prisma.alert.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.dismissedAt).toBeNull();

    // Dismiss at 100, clear completely, then it happens again: a NEW alert appears.
    await dismiss(a.id);
    await addClosedTrade(t, 1500, NOW); // +450 today
    await generateAlerts(t.userId, later(6));
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("resolved");
    await addClosedTrade(t, -1500, NOW); // -1050 again
    await generateAlerts(t.userId, later(7));
    const again = (await getLiveSnapshot(t.userId)).alerts.filter((x) => x.measure === "daily_loss");
    expect(again).toHaveLength(1);
    expect(again[0].id).not.toBe(a.id);
  });

  it("is refused for the demo desk, and an unknown id answers 404", async () => {
    const t = await makeTrader();
    signIn(t);
    const missing = await dismiss("does-not-exist");
    expect(missing.status).toBe(404);
    session.current = { id: t.userId, email: "demo@tradeos.app", plan: "elite", billingStatus: "active" };
    const demo = await dismiss("anything");
    expect(demo.status).toBe(403);
    expect((await demo.json()).code).toBe("demo");
  });

  it("is behind the write limit (the 61st dismiss in a minute answers 429)", async () => {
    const t = await makeTrader();
    signIn(t);
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await dismiss("nope")).status;
    expect(last).toBe(429);
  });
});

describe("one trader can never see or touch another's alerts, positions or switch", () => {
  it("isolation across GET /api/alerts, dismiss, snapshots and the near-live switch", async () => {
    const a = await makeTrader({ prefix: "iso-a" });
    const b = await makeTrader({ prefix: "iso-b" });
    const connA = await connect(a, { username: "iso-a-user" });
    await connect(b, { username: "iso-b-user" });
    await addClosedTrade(a, -850, NOW);
    await liveRead(a, connA.id, -50, new Date());
    await generateAlerts(a.userId, new Date());
    await generateAlerts(b.userId, new Date());
    const aliceAlert = (await openAlerts(a.userId))[0];

    // Bob's alerts feed has none of Alice's rows, accounts or positions.
    signIn(b);
    const alertsRoute = await import("@/app/api/alerts/route");
    const bobJson = await (await alertsRoute.GET()).json();
    expect(bobJson.ok).toBe(true);
    expect(bobJson.alerts.map((x: { id: string }) => x.id)).not.toContain(aliceAlert.id);
    expect(bobJson.positions).toHaveLength(0);
    expect(JSON.stringify(bobJson)).not.toContain(a.accountId);
    expect((await getLiveSnapshot(b.userId)).positions).toHaveLength(0);

    // Bob cannot dismiss Alice's alert: 404, and it stays visible to her.
    const res = await dismiss(aliceAlert.id);
    expect(res.status).toBe(404);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: aliceAlert.id } })).dismissedAt).toBeNull();

    // Bob cannot flip Alice's near-live switch.
    const connectors = await import("@/app/api/connectors/route");
    const patch = await connectors.PATCH(
      new Request("http://localhost/api/connectors", {
        method: "PATCH",
        body: JSON.stringify({ id: connA.id, nearLive: false }),
      })
    );
    expect(patch.status).toBe(404);
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: connA.id } })).nearLive).toBe(true);

    // Alice sees her own.
    signIn(a);
    const aliceJson = await (await alertsRoute.GET()).json();
    expect(aliceJson.alerts.map((x: { id: string }) => x.id)).toContain(aliceAlert.id);
    expect(aliceJson.positions).toHaveLength(1);
  });

  it("GET /api/alerts is behind the read limit (the 121st read in a minute answers 429)", async () => {
    const t = await makeTrader({ prefix: "iso-limit" });
    signIn(t);
    const alertsRoute = await import("@/app/api/alerts/route");
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await alertsRoute.GET()).status;
    expect(last).toBe(429);
  });
});

describe("the near-live switch", () => {
  it("turns reads off and on, behind the write limit; a rejected key cannot be switched on", async () => {
    const t = await makeTrader();
    signIn(t);
    const conn = await connect(t);
    const connectors = await import("@/app/api/connectors/route");
    const patch = (body: unknown) =>
      connectors.PATCH(new Request("http://localhost/api/connectors", { method: "PATCH", body: JSON.stringify(body) }));

    expect((await patch({ id: conn.id, nearLive: false })).status).toBe(200);
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).nearLive).toBe(false);
    expect((await patch({ id: conn.id, nearLive: true })).status).toBe(200);
    expect((await patch({ id: conn.id })).status).toBe(400); // zod

    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { liveStatus: "rejected", nearLive: false } });
    const refused = await patch({ id: conn.id, nearLive: true });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toContain("Reconnect first");

    let last = 0;
    for (let i = 0; i < 61; i++) last = (await patch({ id: conn.id, nearLive: false })).status;
    expect(last).toBe(429);
  });
});
