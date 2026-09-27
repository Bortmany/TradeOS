// Weekly Review — the numbers must always belong to the week named on screen:
// Monday to Sunday in New York time, for this week or any earlier one, whatever
// the server clock or timezone. Also covers week-key parsing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildWeekReport, tradesInWeek } from "@/lib/reports";
import {
  INVALID_WEEK_MESSAGE,
  isRealDateKey,
  normalizeWeekKey,
  shiftWeekKey,
  weekKeyOf,
} from "@/lib/reviews";
import type { TradeRecord } from "@/lib/types";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

describe("week keys", () => {
  it("a week starts on Monday in New York time, not UTC", () => {
    // Sunday 27 Sep 2026, 23:30 New York = Monday 03:30 UTC — still last week.
    expect(weekKeyOf(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-21");
    // Monday 28 Sep 2026, 09:00 New York.
    expect(weekKeyOf(new Date("2026-09-28T13:00:00Z"))).toBe("2026-09-28");
  });

  it("snaps any real date to the Monday of its week", () => {
    expect(normalizeWeekKey("2026-01-15")).toBe("2026-01-12");
    expect(normalizeWeekKey("2026-09-27")).toBe("2026-09-21");
    expect(normalizeWeekKey("2026-09-21")).toBe("2026-09-21");
  });

  it("no week given means the current week", () => {
    const now = new Date("2026-09-30T15:00:00Z");
    expect(normalizeWeekKey(undefined, now)).toBe("2026-09-28");
    expect(normalizeWeekKey("", now)).toBe("2026-09-28");
  });

  it("rejects a well-formed but impossible date with a clear error", () => {
    const now = new Date("2026-09-30T15:00:00Z");
    expect(() => normalizeWeekKey("2026-99-99", now)).toThrow(INVALID_WEEK_MESSAGE);
    expect(() => normalizeWeekKey("2026-02-30", now)).toThrow(INVALID_WEEK_MESSAGE);
    expect(() => normalizeWeekKey("2026-13-01", now)).toThrow(INVALID_WEEK_MESSAGE);
    expect(isRealDateKey("2026-99-99")).toBe(false);
    expect(isRealDateKey("2028-02-29")).toBe(true); // leap day is real
  });
});

describe("tradesInWeek", () => {
  const t = (id: string, iso: string) =>
    ({ id, entryTime: new Date(iso), exitTime: new Date(iso) }) as unknown as TradeRecord;

  it("keeps exactly the trades whose New York day is inside Monday–Sunday", () => {
    const trades = [
      t("before", "2026-09-21T03:30:00Z"), // Sun 20 Sep 23:30 NY — previous week
      t("mon", "2026-09-21T04:30:00Z"), // Mon 21 Sep 00:30 NY
      t("sun", "2026-09-28T03:30:00Z"), // Sun 27 Sep 23:30 NY
      t("after", "2026-09-28T12:00:00Z"), // Mon 28 Sep 08:00 NY — next week
    ];
    expect(tradesInWeek(trades, "2026-09-21").map((x) => x.id)).toEqual(["mon", "sun"]);
  });
});

describe("buildWeekReport", () => {
  const stamp = Date.now();
  let userId = "";

  async function trade(accountId: string, iso: string, pnl: number) {
    const entry = new Date(iso);
    await prisma.trade.create({
      data: {
        userId,
        accountId,
        symbol: "ES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5000 + pnl / 50,
        quantity: 1,
        entryTime: entry,
        exitTime: new Date(entry.getTime() + 30 * 60_000),
        fees: 0,
        pnl,
        source: "manual",
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `weekly-${stamp}@example.com`, passwordHash: "x", displayName: "weekly" },
    });
    userId = user.id;
    const account = await prisma.tradingAccount.create({
      data: { userId, name: "weekly account", startingBalance: 50000 },
    });
    // Week of Mon 21 – Sun 27 Sep 2026 (New York summer time, UTC-4).
    await trade(account.id, "2026-09-21T03:30:00Z", 1000); // Sun 20 Sep NY — not this week
    await trade(account.id, "2026-09-21T04:30:00Z", 100); // Mon 21 Sep 00:30 NY
    await trade(account.id, "2026-09-24T14:00:00Z", -40); // Thu 24 Sep
    await trade(account.id, "2026-09-28T03:30:00Z", 25); // Sun 27 Sep 23:30 NY
    await trade(account.id, "2026-09-28T12:00:00Z", 5000); // Mon 28 Sep NY — next week
    // A past winter week: Mon 12 – Sun 18 Jan 2026 (UTC-5).
    await trade(account.id, "2026-01-14T15:00:00Z", 300);
    await trade(account.id, "2026-01-19T04:30:00Z", 7); // Sun 18 Jan 23:30 NY
    await trade(account.id, "2026-01-19T05:30:00Z", 9999); // Mon 19 Jan 00:30 NY — next week
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("a Monday-morning review of last week shows last week's trades", async () => {
    // It's Monday 28 Sep, 09:00 in New York; the trader opens "Previous week".
    const mondayMorning = new Date("2026-09-28T13:00:00Z");
    const lastWeek = shiftWeekKey(weekKeyOf(mondayMorning), -1);
    expect(lastWeek).toBe("2026-09-21");

    const report = await buildWeekReport(userId, lastWeek);
    expect(report.tradeCount).toBe(3);
    expect(report.metrics.netPnl).toBe(85);
    expect(report.dailyPnl.map((d) => d.date)).toEqual(["2026-09-21", "2026-09-24", "2026-09-27"]);
  });

  it("works for a week months in the past", async () => {
    const report = await buildWeekReport(userId, "2026-01-12");
    expect(report.tradeCount).toBe(2);
    expect(report.metrics.netPnl).toBe(307);
  });

  it("an empty week is zeroed, not an error", async () => {
    const report = await buildWeekReport(userId, "2026-03-02");
    expect(report.tradeCount).toBe(0);
    expect(report.metrics.netPnl).toBe(0);
  });

  it("never includes another trader's trades", async () => {
    const other = await prisma.user.create({
      data: { email: `weekly-other-${stamp}@example.com`, passwordHash: "x", displayName: "other" },
    });
    try {
      const report = await buildWeekReport(other.id, "2026-09-21");
      expect(report.tradeCount).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
