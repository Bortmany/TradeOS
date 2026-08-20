// Stepped risk alerts — the deterministic 50 / 80 / 100% ladder in
// src/lib/alerts/generate.ts, for BOTH the prop trailing drawdown and the daily
// loss limit.
//
// Each case builds its own trader, trading account and prop account in the
// THROWAWAY test database, runs the real generator, and asserts exactly which
// step was raised. Under-threshold cases are included so "quiet" can never be
// confused with "broken".

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { generateAlerts } from "@/lib/alerts/generate";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();
let seq = 0;
const userIds: string[] = [];

const MAX_DRAWDOWN = 2000;
const MAX_DAILY_LOSS = 1000;

/**
 * Builds a trader whose account is exactly `pastLoss` into its drawdown (booked
 * on an earlier day) and `todayLoss` down today, then runs the generator and
 * returns that trader's open alerts.
 */
async function alertsFor(opts: {
  pastLoss?: number;
  todayLoss?: number;
  withDrawdownLimit?: boolean;
  withDailyLimit?: boolean;
}) {
  seq += 1;
  const user = await prisma.user.create({
    data: { email: `alerts-${seq}-${stamp}@example.com`, passwordHash: "x" },
  });
  userIds.push(user.id);

  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, name: `Prop ${seq}`, kind: "evaluation", startingBalance: 50000 },
  });
  await prisma.propAccount.create({
    data: {
      userId: user.id,
      accountId: account.id,
      firm: "topstep",
      presetName: "Test 50K",
      accountSize: 50000,
      maxDrawdown: opts.withDrawdownLimit === false ? null : MAX_DRAWDOWN,
      maxDailyLoss: opts.withDailyLimit === false ? null : MAX_DAILY_LOSS,
    },
  });

  async function addTrade(pnl: number, when: Date) {
    await prisma.trade.create({
      data: {
        userId: user.id,
        accountId: account.id,
        symbol: "ES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5000 + pnl / 50,
        quantity: 1,
        entryTime: when,
        exitTime: when,
        fees: 0,
        pnl,
        source: "manual",
      },
    });
  }

  // An earlier ET day, so it counts toward drawdown but not today's loss.
  const earlier = new Date(Date.now() - 5 * 86_400_000);
  if (opts.pastLoss) await addTrade(-opts.pastLoss, earlier);
  if (opts.todayLoss) await addTrade(-opts.todayLoss, new Date());

  await generateAlerts(user.id);

  const alerts = await prisma.alert.findMany({
    where: { userId: user.id, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  return { userId: user.id, accountId: account.id, alerts };
}

afterAll(async () => {
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("prop drawdown ladder", () => {
  it("stays quiet below half the limit", async () => {
    const { alerts } = await alertsFor({ pastLoss: 900, withDailyLimit: false }); // 45%
    expect(alerts.filter((a) => a.type === "drawdown")).toHaveLength(0);
  });

  it("raises a low-severity heads-up at 50% used", async () => {
    const { alerts } = await alertsFor({ pastLoss: 1000, withDailyLimit: false });
    const dd = alerts.filter((a) => a.type === "drawdown");
    expect(dd).toHaveLength(1);
    expect(dd[0].severity).toBe("low");
    expect(dd[0].message).toContain("50% used");
  });

  it("raises a medium-severity warning at 80% used", async () => {
    const { alerts } = await alertsFor({ pastLoss: 1600, withDailyLimit: false });
    const dd = alerts.filter((a) => a.type === "drawdown");
    expect(dd).toHaveLength(1);
    expect(dd[0].severity).toBe("medium");
    expect(dd[0].message).toContain("80% used");
  });

  it("raises a single high-severity breach at 100% used", async () => {
    const { alerts } = await alertsFor({ pastLoss: 2100, withDailyLimit: false });
    const dd = alerts.filter((a) => a.type === "drawdown");
    expect(dd).toHaveLength(1);
    expect(dd[0].severity).toBe("high");
    expect(dd[0].title).toContain("breached");
  });
});

describe("daily loss ladder", () => {
  it("stays quiet below half the limit", async () => {
    const { alerts } = await alertsFor({ todayLoss: 400, withDrawdownLimit: false }); // 40%
    expect(alerts.filter((a) => a.type === "daily_loss_limit")).toHaveLength(0);
  });

  it("raises a low-severity heads-up at 50% used", async () => {
    const { alerts } = await alertsFor({ todayLoss: 500, withDrawdownLimit: false });
    const dl = alerts.filter((a) => a.type === "daily_loss_limit");
    expect(dl).toHaveLength(1);
    expect(dl[0].severity).toBe("low");
    expect(dl[0].message).toContain("50% used");
  });

  it("raises a medium-severity warning at 80% used", async () => {
    const { alerts } = await alertsFor({ todayLoss: 800, withDrawdownLimit: false });
    const dl = alerts.filter((a) => a.type === "daily_loss_limit");
    expect(dl).toHaveLength(1);
    expect(dl[0].severity).toBe("medium");
    expect(dl[0].message).toContain("80% used");
  });

  it("raises a single high-severity breach at 100% used", async () => {
    const { alerts } = await alertsFor({ todayLoss: 1000, withDrawdownLimit: false });
    const dl = alerts.filter((a) => a.type === "daily_loss_limit");
    expect(dl).toHaveLength(1);
    expect(dl[0].severity).toBe("high");
    expect(dl[0].title).toContain("daily loss limit hit");
  });
});

describe("regeneration behaviour", () => {
  it("never duplicates its own alerts and never deletes a hand-made one", async () => {
    const { userId, alerts } = await alertsFor({ pastLoss: 1600, withDailyLimit: false });
    expect(alerts).toHaveLength(1);

    // A manually created alert (no meta.auto) must survive a regeneration.
    const manual = await prisma.alert.create({
      data: {
        userId,
        type: "rule_violation",
        severity: "medium",
        title: "Hand-made alert",
        message: "Written by the trader, not the generator.",
        status: "open",
      },
    });

    await generateAlerts(userId);
    await generateAlerts(userId);

    const after = await prisma.alert.findMany({ where: { userId, status: "open" } });
    expect(after.filter((a) => a.type === "drawdown")).toHaveLength(1);
    expect(after.some((a) => a.id === manual.id)).toBe(true);
  });

  it("alerts are scoped to the trader who owns the account", async () => {
    const a = await alertsFor({ pastLoss: 2100, withDailyLimit: false });
    const b = await alertsFor({ pastLoss: 900, withDailyLimit: false });
    expect(a.alerts.every((x) => x.userId === a.userId)).toBe(true);
    expect(b.alerts.some((x) => x.userId === a.userId)).toBe(false);
  });
});
