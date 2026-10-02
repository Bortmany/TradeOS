// The pure maths behind near-live: open P&L from positions, the one shared
// daily-loss / drawdown calculation, the 50/80/100 steps, the call budget, the
// 60-second floor, and the small helpers the screens use. No database, no network.

import { describe, it, expect } from "vitest";
import {
  computeLimitFigures,
  priceOpenPosition,
  stepFor,
  etDayKey,
} from "@/lib/risk/limits";
import { knownPointValue, pointMultiplier } from "@/lib/instruments/futures";
import { CallBudget, LIVE_CALLS_PER_MINUTE } from "@/lib/live/budget";
import { LIVE_MIN_GAP_MS, livePollIntervalSec, liveEnabled } from "@/lib/live/config";
import { deriveChip, formatAsAt, money } from "@/lib/live/format";
import { alertKey, diffAlerts } from "@/lib/live/diff";
import { sortAlertViews, type AlertView, type LiveAccountView } from "@/lib/alerts/view";

describe("open P&L from a position", () => {
  const base = { avgPrice: 5210.25, size: 2, lastPrice: 5198.25, pointValue: 5 };

  it("long: (last - average) x size x point value", () => {
    expect(priceOpenPosition({ ...base, side: "long" })).toEqual({ openPnl: -120, notPricedReason: null });
    expect(priceOpenPosition({ ...base, side: "long", lastPrice: 5212.25 }).openPnl).toBe(20);
  });

  it("short is the reverse", () => {
    expect(priceOpenPosition({ ...base, side: "short" }).openPnl).toBe(120);
    expect(priceOpenPosition({ ...base, side: "short", lastPrice: 5212.25 }).openPnl).toBe(-20);
  });

  it("an ES contract uses its own point value", () => {
    const es = knownPointValue("ES");
    expect(es).toBe(50);
    expect(priceOpenPosition({ side: "long", size: 1, avgPrice: 5000, lastPrice: 4998, pointValue: es }).openPnl).toBe(-100);
  });

  it("MCL, NG and SI have no point value: 'not priced', never a guess", () => {
    for (const sym of ["MCL", "NG", "SI"]) {
      expect(knownPointValue(sym)).toBeNull();
      const r = priceOpenPosition({ side: "long", size: 1, avgPrice: 70, lastPrice: 71, pointValue: knownPointValue(sym) });
      expect(r).toEqual({ openPnl: null, notPricedReason: "no_point_value" });
    }
    // The old default of 1 is still what trade import uses; live never touches it.
    expect(pointMultiplier("MCL")).toBe(1);
  });

  it("a known contract with no price is 'no price', not zero", () => {
    expect(priceOpenPosition({ ...base, side: "long", lastPrice: null })).toEqual({
      openPnl: null,
      notPricedReason: "no_price",
    });
  });
});

describe("the one shared limit calculation", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  const today = new Date("2026-10-02T14:00:00Z");
  const earlier = new Date("2026-09-28T14:00:00Z");

  it("closed trades only: today's loss and the drawdown from the peak", () => {
    const f = computeLimitFigures({
      startingBalance: 50000,
      trades: [
        { pnl: 500, exitTime: earlier },
        { pnl: -700, exitTime: today },
      ],
      now,
    });
    expect(f.todayLoss).toBe(700);
    expect(f.peak).toBe(50500);
    expect(f.currentDrawdown).toBe(700);
    expect(f.includesOpen).toBe(false);
  });

  it("open P&L is added to the daily loss AND the drawdown", () => {
    const f = computeLimitFigures({
      startingBalance: 50000,
      trades: [{ pnl: -700, exitTime: today }],
      now,
      open: { openPnl: -120, openCount: 1, unpricedCount: 0, estimated: true },
    });
    expect(f.todayLoss).toBe(820);
    expect(f.currentDrawdown).toBe(820);
    expect(f.netProfit).toBe(-700); // profit-target progress never counts open P&L
    expect(f.includesOpen).toBe(true);
  });

  it("the peak may include open profit seen at a live read", () => {
    const f = computeLimitFigures({
      startingBalance: 50000,
      trades: [{ pnl: 100, exitTime: earlier }],
      now,
      open: { openPnl: 0, openCount: 0, unpricedCount: 0, estimated: false },
      livePeakEquity: 50400, // a live read once saw $300 of open profit
    });
    expect(f.peak).toBe(50400);
    expect(f.currentDrawdown).toBe(300);
  });

  it("open profit raises today's P&L, so a green open trade offsets a closed loss", () => {
    const f = computeLimitFigures({
      startingBalance: 0,
      trades: [{ pnl: -200, exitTime: today }],
      now,
      open: { openPnl: 250, openCount: 1, unpricedCount: 0, estimated: false },
    });
    expect(f.todayLoss).toBe(0);
    expect(f.todayPnl).toBe(50);
  });

  it("the day is midnight to midnight New York time", () => {
    // 11:30 PM ET on Oct 1 is already Oct 2 in UTC, but still Oct 1 in New York.
    expect(etDayKey(new Date("2026-10-02T03:30:00Z"))).toBe("2026-10-01");
    expect(etDayKey(new Date("2026-10-02T04:30:00Z"))).toBe("2026-10-02");
  });
});

describe("50 / 80 / 100% steps", () => {
  it("steps at exactly half, 80% and the limit", () => {
    expect(stepFor(499, 1000)).toBe(0);
    expect(stepFor(500, 1000)).toBe(50);
    expect(stepFor(799, 1000)).toBe(50);
    expect(stepFor(800, 1000)).toBe(80);
    expect(stepFor(999, 1000)).toBe(80);
    expect(stepFor(1000, 1000)).toBe(100);
    expect(stepFor(5, 0)).toBe(0);
  });
});

describe("interval floor", () => {
  it("raises anything under 60 seconds (and junk) to 60", () => {
    for (const raw of [undefined, "", "0", "1", "10", "59.9", "-5", "abc", "NaN"]) {
      expect(livePollIntervalSec(raw)).toBe(60);
    }
    expect(livePollIntervalSec("60")).toBe(60);
    expect(livePollIntervalSec("120")).toBe(120);
  });

  it("a connection read less than about a minute ago is never read again", () => {
    expect(LIVE_MIN_GAP_MS).toBeGreaterThanOrEqual(55_000);
    expect(LIVE_MIN_GAP_MS).toBeLessThanOrEqual(60_000);
  });

  it("runs by default in production, and in development only when asked", () => {
    expect(liveEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(liveEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(liveEnabled({ NODE_ENV: "development", LIVE_POLL_INTERVAL_SEC: "60" })).toBe(true);
  });
});

describe("server-wide call budget and 429 back-off", () => {
  it("never allows more than about 100 calls a minute, then frees up", () => {
    let t = 0;
    const b = new CallBudget(LIVE_CALLS_PER_MINUTE, () => t);
    let allowed = 0;
    for (let i = 0; i < 250; i++) if (b.take()) allowed++;
    expect(allowed).toBe(100);
    t += 30_000;
    expect(b.take()).toBe(false);
    t += 31_000;
    expect(b.take()).toBe(true);
  });

  it("honours Retry-After, otherwise backs off 30s, 60s, 120s, capped at 5 minutes", () => {
    let t = 0;
    const b = new CallBudget(100, () => t);
    b.onRateLimited();
    expect(b.backoffRemainingMs()).toBe(30_000);
    expect(b.take()).toBe(false);
    t += 30_000;
    expect(b.take()).toBe(true);
    b.onRateLimited();
    expect(b.backoffRemainingMs()).toBe(60_000);
    t += 60_000;
    b.onRateLimited();
    expect(b.backoffRemainingMs()).toBe(120_000);
    t += 120_000;
    for (let i = 0; i < 6; i++) {
      b.onRateLimited();
      t += b.backoffRemainingMs();
    }
    b.onRateLimited();
    expect(b.backoffRemainingMs()).toBe(300_000);
    t += 300_000;
    b.onSuccess();
    b.onRateLimited(45);
    expect(b.backoffRemainingMs()).toBe(45_000);
    b.onSuccess();
    t += 45_000;
    b.onRateLimited(); // after a success the ladder starts again at the bottom
    expect(b.backoffRemainingMs()).toBe(30_000);
  });
});

function alert(over: Partial<AlertView>): AlertView {
  return {
    id: "a1",
    accountId: "acc1",
    accountName: "Topstep 50K",
    type: "daily_loss_limit",
    severity: "medium",
    title: "t",
    message: "m",
    measure: "daily_loss",
    step: 80,
    value: 820,
    limit: 1000,
    left: 180,
    usedPct: 82,
    asAt: "2026-10-02T18:14:00Z",
    source: "live",
    openCount: 1,
    openEstimated: true,
    unpricedCount: 0,
    stale: false,
    createdAt: "2026-10-02T18:00:00Z",
    ...over,
  };
}

describe("alert changes between polls", () => {
  it("announces a new warning and a step change, and says when one cleared", () => {
    const first = diffAlerts([], [alert({})]);
    expect(first.announcements[0]).toBe("New warning: Topstep 50K daily loss, 80% used, $180 left.");

    const stepped = diffAlerts([alert({ step: 50, left: 450 })], [alert({})]);
    expect(stepped.announcements[0]).toBe("Topstep 50K daily loss is now 80% used, $180 left.");

    const gone = diffAlerts([alert({})], []);
    expect(gone.cleared[0]).toBe("Back under 80%. Topstep 50K daily loss warning cleared.");
  });

  it("a warning this browser just dismissed is not reported as cleared", () => {
    expect(diffAlerts([alert({})], [], new Set(["a1"])).cleared).toEqual([]);
  });

  it("one alert per account per measure is its identity", () => {
    expect(alertKey(alert({}))).toBe("acc1:daily_loss");
    expect(alertKey(alert({ measure: "drawdown" }))).toBe("acc1:drawdown");
  });

  it("sorts highest step first, profit target last", () => {
    const sorted = sortAlertViews([
      alert({ id: "p", measure: "profit_target", step: 100 }),
      alert({ id: "x", step: 50 }),
      alert({ id: "y", step: 100 }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["y", "x", "p"]);
  });
});

describe("status chip state", () => {
  const acc = (over: Partial<LiveAccountView>): LiveAccountView => ({
    accountId: "a",
    accountName: "Topstep 50K",
    nearLive: true,
    health: "live",
    lastLiveAt: "2026-10-02T18:14:00Z",
    lastError: null,
    lastSyncAt: "2026-10-02T18:00:00Z",
    ...over,
  });

  it("no link, no chip", () => {
    expect(deriveChip([])).toBeNull();
  });
  it("live quotes the OLDEST good read", () => {
    const c = deriveChip([acc({}), acc({ accountId: "b", lastLiveAt: "2026-10-02T18:10:00Z" })]);
    expect(c).toMatchObject({ kind: "live", at: "2026-10-02T18:10:00Z" });
  });
  it("stale names the account when there are several", () => {
    const c = deriveChip([acc({ health: "stale" }), acc({ accountId: "b" })]);
    expect(c).toMatchObject({ kind: "stale", accountName: "Topstep 50K" });
  });
  it("rejected, off and waiting each have their own state", () => {
    expect(deriveChip([acc({ health: "rejected" })])?.kind).toBe("rejected");
    expect(deriveChip([acc({ nearLive: false, health: "off" })])?.kind).toBe("off");
    expect(deriveChip([acc({ health: "waiting", lastLiveAt: null })])?.kind).toBe("waiting");
  });
});

describe("printing", () => {
  it("times carry the zone label; today is time only", () => {
    const now = new Date("2026-10-02T18:30:00Z");
    // The app joins time, AM/PM and zone with non-breaking spaces so they never split.
    const plain = (x: string) => x.replace(/[\u00a0\u202f]/g, " ");
    expect(plain(formatAsAt("2026-10-02T18:14:00Z", "America/New_York", now))).toBe("2:14 PM ET");
    expect(plain(formatAsAt("2026-10-01T18:14:00Z", "America/New_York", now))).toBe("Oct 1, 2:14 PM ET");
  });
  it("whole dollars with a sign for losses", () => {
    expect(money(820)).toBe("$820");
    expect(money(-120)).toBe("-$120");
    expect(money(1640)).toBe("$1,640");
  });
});
