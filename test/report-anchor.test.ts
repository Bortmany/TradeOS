// Reports you can aim (spec test 6). A report is anchored on a New York
// calendar day (?date=YYYY-MM-DD): Daily = that day, Weekly = the 7 days
// ending that day, Monthly = the 30 days ending that day. The anchor in the
// past returns exactly that window's trades and totals, identically whatever
// the machine's own time zone; back-then-forward returns the same report; and
// with no date the page opens on the latest ET day that has trades.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildReport, resolveReportAnchor, tradesInDayRange } from "@/lib/reports";
import { etDayKey } from "@/lib/rules/engine";
import { mapTrade } from "@/lib/data";
import {
  reportWindowKeys,
  previousAnchor,
  nextAnchor,
  shiftDayKey,
  isDayKey,
  formatDayKeyRange,
  formatDayKeyRangeShort,
  formatDayFilterLabel,
  type ReportWindowPeriod,
} from "@/lib/et-days";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const NB = " ";
const MACHINE_ZONES = ["UTC", "America/Los_Angeles", "Asia/Muscat", "Pacific/Kiritimati", "Asia/Tokyo"];
const originalTZ = process.env.TZ;
const stamp = Date.now();
const NOW = new Date("2026-08-15T16:00:00Z"); // Sat 15 Aug 2026, noon New York
let userId = "";
let accountId = "";
let emptyAccountId = "";
let emptyUserId = "";

// Trades with a gap: 1–3 July, then 20 July. Two sit on the ET day boundary.
const FIXTURE: { iso: string; pnl: number }[] = [
  { iso: "2026-07-01T13:45:00Z", pnl: 120 }, // Wed 1 Jul 09:45 ET
  { iso: "2026-07-01T03:30:00Z", pnl: -40 }, // Tue 30 Jun 23:30 ET — a 30 June trade
  { iso: "2026-07-02T14:10:00Z", pnl: -75 }, // Thu 2 Jul
  { iso: "2026-07-03T03:59:00Z", pnl: 30 }, // Thu 2 Jul 23:59 ET — still 2 July
  { iso: "2026-07-03T04:01:00Z", pnl: 55 }, // Fri 3 Jul 00:01 ET
  { iso: "2026-07-20T15:00:00Z", pnl: 210 }, // Mon 20 Jul — after a gap
];

afterAll(async () => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
  await prisma.trade.deleteMany({ where: { userId: { in: [userId, emptyUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, emptyUserId] } } });
});

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `report-anchor-${stamp}@example.com`, passwordHash: "x", displayName: "Anchor" },
  });
  userId = u.id;
  accountId = (await prisma.tradingAccount.create({ data: { userId, name: "Anchor A" } })).id;
  emptyAccountId = (await prisma.tradingAccount.create({ data: { userId, name: "Anchor empty" } })).id;
  for (const f of FIXTURE) {
    const at = new Date(f.iso);
    await prisma.trade.create({
      data: {
        userId,
        accountId,
        symbol: "ES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5000 + f.pnl / 50,
        quantity: 1,
        entryTime: at,
        exitTime: new Date(at.getTime() + 5 * 60_000),
        pnl: f.pnl,
        source: "manual",
      },
    });
  }
  const e = await prisma.user.create({
    data: { email: `report-anchor-empty-${stamp}@example.com`, passwordHash: "x", displayName: "Empty" },
  });
  emptyUserId = e.id;
});

/** Expected trades of a window, straight from the fixture and etDayKey. */
function expectedWindow(period: ReportWindowPeriod, anchorKey: string) {
  const { startKey, endKey } = reportWindowKeys(period, anchorKey);
  const inside = FIXTURE.filter((f) => {
    const k = etDayKey(new Date(f.iso));
    return k >= startKey && k <= endKey;
  });
  return { count: inside.length, net: inside.reduce((s, f) => s + f.pnl, 0), startKey, endKey };
}

/** Run `fn` under several machine zones, proving the zone really moved. */
async function underMachineZones<T>(fn: () => Promise<T>): Promise<T[]> {
  const offsets = new Set<number>();
  const out: T[] = [];
  for (const z of MACHINE_ZONES) {
    process.env.TZ = z;
    offsets.add(new Date("2026-07-01T12:00:00Z").getTimezoneOffset());
    out.push(await fn());
  }
  expect(offsets.size).toBeGreaterThan(1);
  return out;
}

describe("report windows (pure day-key arithmetic)", () => {
  it("Daily = the day, Weekly = 7 days ending it, Monthly = 30 days ending it", () => {
    expect(reportWindowKeys("day", "2026-07-02")).toEqual({ startKey: "2026-07-02", endKey: "2026-07-02" });
    expect(reportWindowKeys("week", "2026-07-02")).toEqual({ startKey: "2026-06-26", endKey: "2026-07-02" });
    expect(reportWindowKeys("month", "2026-07-02")).toEqual({ startKey: "2026-06-03", endKey: "2026-07-02" });
  });

  it("previous then next is the same anchor; next never passes today", () => {
    for (const p of ["day", "week", "month"] as const) {
      expect(nextAnchor(p, previousAnchor(p, "2026-07-20"), "2026-08-15")).toBe("2026-07-20");
      expect(nextAnchor(p, "2026-08-14", "2026-08-15")).toBe("2026-08-15");
    }
    // Windows tile: the previous window ends the day before this one starts.
    const { startKey } = reportWindowKeys("week", "2026-07-20");
    expect(reportWindowKeys("week", previousAnchor("week", "2026-07-20")).endKey).toBe(shiftDayKey(startKey, -1));
  });

  it("day keys cross month, year and leap-day edges correctly", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-7-1")).toBe(false);
    expect(isDayKey("2026-07-01")).toBe(true);
  });

  it("window labels read in New York days with one ET label", () => {
    expect(formatDayKeyRange("2026-09-09", "2026-09-15")).toBe(`Sep 9 – Sep 15${NB}ET`);
    expect(formatDayKeyRangeShort("2026-09-09", "2026-09-15")).toBe(`Sep 9 – 15${NB}ET`);
    expect(formatDayKeyRangeShort("2026-08-28", "2026-09-03")).toBe(`Aug 28 – Sep 3${NB}ET`);
    expect(formatDayKeyRange("2026-09-15", "2026-09-15")).toBe(`Sep 15${NB}ET`);
    expect(formatDayFilterLabel("2026-09-01", null)).toBe(`From Sep 1${NB}ET`);
    expect(formatDayFilterLabel(null, "2026-09-15")).toBe(`Until Sep 15${NB}ET`);
    expect(formatDayFilterLabel(null, null)).toBeNull();
  });
});

describe("buildReport — anchored on a past New York day", () => {
  const cases: [ReportWindowPeriod, string][] = [
    ["day", "2026-06-30"],
    ["day", "2026-07-02"],
    ["day", "2026-07-03"],
    ["week", "2026-07-03"],
    ["week", "2026-07-20"],
    ["month", "2026-07-20"],
    ["week", "2026-07-12"], // the gap: empty
  ];

  it("returns exactly that window's trades and totals", async () => {
    for (const [period, anchor] of cases) {
      const want = expectedWindow(period, anchor);
      const r = await buildReport(userId, period, accountId, anchor);
      expect(r.startKey).toBe(want.startKey);
      expect(r.endKey).toBe(want.endKey);
      expect(r.tradeCount).toBe(want.count);
      expect(r.metrics.netPnl).toBeCloseTo(want.net, 6);
      expect(r.dailyPnl.every((d) => d.date >= want.startKey && d.date <= want.endKey)).toBe(true);
    }
    // Boundary trades land on their New York day, not the UTC one.
    expect((await buildReport(userId, "day", accountId, "2026-06-30")).tradeCount).toBe(1);
    expect((await buildReport(userId, "day", accountId, "2026-07-02")).tradeCount).toBe(2);
    expect((await buildReport(userId, "day", accountId, "2026-07-03")).tradeCount).toBe(1);
  });

  it("is identical under different machine time zones", async () => {
    for (const [period, anchor] of cases) {
      const runs = await underMachineZones(async () =>
        JSON.stringify(await buildReport(userId, period, accountId, anchor))
      );
      expect(new Set(runs).size).toBe(1);
    }
  });

  it("back one period then forward one returns the same report", async () => {
    for (const period of ["day", "week", "month"] as const) {
      const anchor = "2026-07-20";
      const back = previousAnchor(period, anchor);
      const forward = nextAnchor(period, back, "2026-08-15");
      expect(forward).toBe(anchor);
      const a = await buildReport(userId, period, accountId, anchor);
      const b = await buildReport(userId, period, accountId, forward);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it("uses the same figures as the engine's own ET-day filter over the same trades", async () => {
    const all = (await prisma.trade.findMany({ where: { userId } })).map(mapTrade);
    const kept = tradesInDayRange(all, "2026-06-26", "2026-07-02");
    const r = await buildReport(userId, "week", accountId, "2026-07-02");
    expect(r.tradeCount).toBe(kept.length);
    expect(r.metrics.netPnl).toBeCloseTo(kept.reduce((s, t) => s + t.pnl, 0), 6);
  });
});

describe("resolveReportAnchor — where the page opens", () => {
  it("with no date, opens on the latest New York day with trades (after a gap)", async () => {
    const a = await resolveReportAnchor(userId, undefined, undefined, NOW);
    expect(a).toEqual({ anchorKey: "2026-07-20", todayKey: "2026-08-15", latestKey: "2026-07-20" });
    const scoped = await resolveReportAnchor(userId, undefined, accountId, NOW);
    expect(scoped.anchorKey).toBe("2026-07-20");
    // The opening window has trades in it.
    expect((await buildReport(userId, "week", accountId, a.anchorKey)).tradeCount).toBe(1);
  });

  it("the same under every machine time zone", async () => {
    const runs = await underMachineZones(async () =>
      JSON.stringify(await resolveReportAnchor(userId, undefined, undefined, NOW))
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("an account (or trader) with no trades has no latest day and opens on today", async () => {
    const acct = await resolveReportAnchor(userId, undefined, emptyAccountId, NOW);
    expect(acct).toEqual({ anchorKey: "2026-08-15", todayKey: "2026-08-15", latestKey: null });
    const user = await resolveReportAnchor(emptyUserId, undefined, undefined, NOW);
    expect(user.latestKey).toBeNull();
    expect(user.anchorKey).toBe("2026-08-15");
    expect((await buildReport(emptyUserId, "month", undefined, user.anchorKey)).tradeCount).toBe(0);
  });

  it("a real past date is used as given; malformed or future dates snap to today (ET)", async () => {
    expect((await resolveReportAnchor(userId, "2026-07-02", undefined, NOW)).anchorKey).toBe("2026-07-02");
    for (const bad of ["2026-08-16", "2030-01-01", "2026-02-30", "yesterday", "2026-7-2", "2026-07-02T00:00"]) {
      expect((await resolveReportAnchor(userId, bad, undefined, NOW)).anchorKey).toBe("2026-08-15");
    }
  });

  it("today is the New York day, not the machine's or UTC's", async () => {
    // 02:00 UTC on 16 Aug is still 15 Aug (22:00) in New York.
    const late = new Date("2026-08-16T02:00:00Z");
    const runs = await underMachineZones(async () => (await resolveReportAnchor(emptyUserId, undefined, undefined, late)).todayKey);
    expect(new Set(runs)).toEqual(new Set(["2026-08-15"]));
  });
});
