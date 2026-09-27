// Rule engine — the core-guarantee suite for src/lib/rules/engine.ts.
//
// One passing AND one failing case for every rule type TradeOS has, plus the
// not_applicable case each type can reach (an open trade, a malformed config,
// no closed trades on the day, etc.), and a guard proving a broken config
// degrades to not_applicable instead of throwing.
//
// All timestamps are UTC; the engine anchors time-of-day / calendar-day logic
// to America/New_York. In July that is EDT (UTC-4), so 14:00Z == 10:00 ET.

import { describe, it, expect } from "vitest";
import { evaluateTrade, type RuleLike } from "@/lib/rules/engine";
import type { TradeRecord, EvalStatus, Severity, RuleType } from "@/lib/types";

let seq = 0;
function mkTrade(o: Partial<TradeRecord> = {}): TradeRecord {
  seq += 1;
  return {
    id: `t${seq}`,
    userId: "u1",
    accountId: "a1",
    symbol: "ES",
    side: "long",
    entryPrice: 5000,
    exitPrice: 5002,
    quantity: 1,
    entryTime: new Date("2026-07-01T14:00:00Z"), // 10:00 ET
    exitTime: new Date("2026-07-01T14:10:00Z"),
    fees: 0,
    pnl: 100,
    pnlGross: 100,
    strategyTag: "orb",
    notes: "clean setup",
    emotions: null,
    tags: "vwap_reclaim",
    source: "manual",
    externalId: null,
    isWin: true,
    complianceScore: null,
    violationCount: 0,
    ...o,
  };
}

function mkRule(type: RuleType, config: unknown, severity: Severity = "medium"): RuleLike {
  return { id: `r-${type}`, name: type, type, severity, weight: 1, config };
}

// Evaluate one trade against one rule, return just the status.
function status(rule: RuleLike, trade: TradeRecord, dayTrades: TradeRecord[] = [trade], ctx?: { hasScreenshot?: boolean }): EvalStatus {
  return evaluateTrade(trade, dayTrades, [rule], ctx)[0].status;
}

// ---------------------------------------------------------------------------

describe("time_window", () => {
  const rule = mkRule("time_window", { start: "09:30", end: "16:00" });
  it("pass — entered 10:00 ET, inside the window", () =>
    expect(status(rule, mkTrade({ entryTime: new Date("2026-07-01T14:00:00Z") }))).toBe("pass"));
  it("fail — entered 08:00 ET, before the window opens", () =>
    expect(status(rule, mkTrade({ entryTime: new Date("2026-07-01T12:00:00Z") }))).toBe("fail"));
  it("not_applicable — malformed config (missing start)", () =>
    expect(status(mkRule("time_window", { end: "16:00" }), mkTrade())).toBe("not_applicable"));
});

describe("risk_limit", () => {
  const rule = mkRule("risk_limit", { maxLossPerTrade: 200 });
  it("pass — lost $100, within the $200 limit", () =>
    expect(status(rule, mkTrade({ pnl: -100 }))).toBe("pass"));
  it("fail — lost $300, over the $200 limit", () =>
    expect(status(rule, mkTrade({ pnl: -300 }))).toBe("fail"));
  it("not_applicable — trade still open (no realized P&L)", () =>
    expect(status(rule, mkTrade({ exitTime: null, exitPrice: null }))).toBe("not_applicable"));
});

describe("max_trades", () => {
  const rule = mkRule("max_trades", { maxPerDay: 3 });
  it("pass — trade #1 of 3 allowed", () => {
    const t = mkTrade();
    expect(status(rule, t, [t])).toBe("pass");
  });
  it("fail — trade #4 of the day, over the 3/day limit", () => {
    const day = [mkTrade(), mkTrade(), mkTrade(), mkTrade()];
    expect(status(rule, day[3], day)).toBe("fail");
  });
  it("not_applicable — malformed config (maxPerDay missing)", () =>
    expect(status(mkRule("max_trades", {}), mkTrade())).toBe("not_applicable"));
});

describe("max_contracts", () => {
  const rule = mkRule("max_contracts", { maxContracts: 5 });
  it("pass — 2 contracts, within the 5 limit", () =>
    expect(status(rule, mkTrade({ quantity: 2 }))).toBe("pass"));
  it("fail — 10 contracts, over the 5 limit", () =>
    expect(status(rule, mkTrade({ quantity: 10 }))).toBe("fail"));
  it("not_applicable — malformed config (maxContracts missing)", () =>
    expect(status(mkRule("max_contracts", {}), mkTrade())).toBe("not_applicable"));
});

describe("max_daily_loss", () => {
  const rule = mkRule("max_daily_loss", { maxDailyLoss: 500 });
  it("pass — day's worst cumulative -$200, within the $500 limit", () => {
    const day = [mkTrade({ pnl: -200 }), mkTrade({ pnl: 100 })];
    expect(status(rule, day[1], day)).toBe("pass");
  });
  it("fail — day's cumulative reaches -$600, breaching the $500 limit", () => {
    const day = [mkTrade({ pnl: -300 }), mkTrade({ pnl: -300 })];
    expect(status(rule, day[1], day)).toBe("fail");
  });
  it("not_applicable — no closed trades on the day", () => {
    const t = mkTrade({ exitTime: null, exitPrice: null });
    expect(status(rule, t, [t])).toBe("not_applicable");
  });
});

describe("behavioral — revenge_trading", () => {
  const rule = mkRule("behavioral", { kind: "revenge_trading", withinMinutes: 5 });
  const prior = mkTrade({
    entryTime: new Date("2026-07-01T14:00:00Z"),
    exitTime: new Date("2026-07-01T14:02:00Z"),
    pnl: -100,
  });
  it("fail — re-entered 3 min after a losing trade", () => {
    const revenge = mkTrade({ entryTime: new Date("2026-07-01T14:05:00Z") });
    expect(status(rule, revenge, [prior, revenge])).toBe("fail");
  });
  it("pass — waited 8 min after the loss, outside the window", () => {
    const patient = mkTrade({ entryTime: new Date("2026-07-01T14:10:00Z") });
    expect(status(rule, patient, [prior, patient])).toBe("pass");
  });
  it("not_applicable — malformed config (unknown kind)", () =>
    expect(status(mkRule("behavioral", { kind: "not_a_kind" }), mkTrade())).toBe("not_applicable"));
});

describe("behavioral — overtrading", () => {
  const rule = mkRule("behavioral", { kind: "overtrading", threshold: 3, windowMinutes: 15 });
  it("fail — 4 trades inside a 15-min window", () => {
    const day = [
      mkTrade({ entryTime: new Date("2026-07-01T14:00:00Z") }),
      mkTrade({ entryTime: new Date("2026-07-01T14:05:00Z") }),
      mkTrade({ entryTime: new Date("2026-07-01T14:10:00Z") }),
      mkTrade({ entryTime: new Date("2026-07-01T14:12:00Z") }),
    ];
    expect(status(rule, day[3], day)).toBe("fail");
  });
  it("pass — only 2 trades inside the window", () => {
    const day = [
      mkTrade({ entryTime: new Date("2026-07-01T14:00:00Z") }),
      mkTrade({ entryTime: new Date("2026-07-01T14:12:00Z") }),
    ];
    expect(status(rule, day[1], day)).toBe("pass");
  });
  it("not_applicable — malformed config (threshold not positive)", () =>
    expect(status(mkRule("behavioral", { kind: "overtrading", threshold: -1 }), mkTrade())).toBe(
      "not_applicable"
    ));
});

describe("indicator", () => {
  const rule = mkRule("indicator", { requireTag: "vwap_reclaim" });
  it("pass — required tag present", () =>
    expect(status(rule, mkTrade({ tags: "vwap_reclaim,breakout" }))).toBe("pass"));
  it("fail — required tag missing", () =>
    expect(status(rule, mkTrade({ tags: "orb" }))).toBe("fail"));
  it("not_applicable — malformed config (requireTag missing)", () =>
    expect(status(mkRule("indicator", {}), mkTrade())).toBe("not_applicable"));
});

describe("setup_validation", () => {
  const rule = mkRule("setup_validation", {
    requireStrategyTag: true,
    requireNotes: true,
    requireScreenshot: true,
  });
  it("pass — strategy tag + notes + screenshot all present", () =>
    expect(
      status(rule, mkTrade({ strategyTag: "orb", notes: "n" }), undefined, { hasScreenshot: true })
    ).toBe("pass"));
  it("fail — missing strategy tag", () =>
    expect(
      status(rule, mkTrade({ strategyTag: null, notes: "n" }), undefined, { hasScreenshot: true })
    ).toBe("fail"));
  it("not_applicable — malformed config (non-boolean flag)", () =>
    expect(status(mkRule("setup_validation", { requireNotes: "yes" }), mkTrade())).toBe(
      "not_applicable"
    ));
});

describe("malformed rule config degrades to not_applicable and never throws", () => {
  const garbage: RuleLike[] = [
    mkRule("time_window", { start: 123 }),
    mkRule("risk_limit", { maxLossPerTrade: "lots" }),
    mkRule("max_trades", { maxPerDay: 0 }),
    mkRule("max_contracts", { maxContracts: -3 }),
    mkRule("max_daily_loss", { maxDailyLoss: null }),
    mkRule("behavioral", { kind: "revenge_trading", withinMinutes: -1 }),
    mkRule("indicator", {}),
    mkRule("setup_validation", { requireScreenshot: "sometimes" }),
  ];
  it("does not throw on any garbage config", () => {
    const t = mkTrade();
    expect(() => evaluateTrade(t, [t], garbage)).not.toThrow();
  });
  it("marks every garbage-config rule not_applicable", () => {
    const t = mkTrade();
    const results = evaluateTrade(t, [t], garbage);
    expect(results).toHaveLength(garbage.length);
    for (const r of results) expect(r.status).toBe("not_applicable");
  });
});
