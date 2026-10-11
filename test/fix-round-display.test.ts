// Display-only fixes from the Step 7 fix round: report navigation logic, price
// and lot formatting, the drawdown tile, account/trade labels, size-calculator
// number parsing, and the phone step-meter marks. None of this touches scoring.
import { describe, it, expect } from "vitest";
import {
  NAV_STUCK_MS,
  canStartNav,
  currentHref,
  isNavPending,
  needsDateRedirect,
} from "@/lib/report-nav";
import { formatLots, formatPrice, priceDecimals } from "@/lib/instruments/format";
import { drawdownTile } from "@/lib/analytics/drawdown-display";
import { accountDisplay, accountStatusLabel, tradeSourceLabel } from "@/lib/account-display";
import { looksLikeDecimalComma, numberProblemMessage, parseNumberText, withCommas } from "@/lib/sizing/parse";
import { STEP_MARKS } from "@/components/live/step-meter";

describe("report navigation logic", () => {
  const here = currentHref("/reports", "?period=day&date=2026-09-25");
  it("builds the address the way the address bar shows it", () => {
    expect(here).toBe("/reports?period=day&date=2026-09-25");
    expect(currentHref("/reports", "")).toBe("/reports");
  });
  it("is loading only while the address still shows where we left", () => {
    const t = { href: "/reports?period=day&date=2026-09-24", from: here };
    expect(isNavPending(t, here)).toBe(true);
    expect(isNavPending(t, t.href)).toBe(false);
    expect(isNavPending(null, here)).toBe(false);
  });
  it("ignores a click while moving and a click to the page we are on", () => {
    const t = { href: "/x", from: here };
    expect(canStartNav(t, here, "/y")).toBe(false);
    expect(canStartNav(null, here, here)).toBe(false);
    expect(canStartNav(null, here, "/reports?period=week&date=2026-09-25")).toBe(true);
  });
  it("has a bounded fallback and replaces a bare /reports", () => {
    expect(NAV_STUCK_MS).toBeGreaterThan(0);
    expect(NAV_STUCK_MS).toBeLessThanOrEqual(15000);
    expect(needsDateRedirect(undefined)).toBe(true);
    expect(needsDateRedirect("")).toBe(true);
    expect(needsDateRedirect("2026-09-25")).toBe(false);
  });
});

describe("price and lot formatting", () => {
  it("uses the instrument's own precision", () => {
    expect(priceDecimals("EURUSD", "forex")).toBe(5);
    expect(priceDecimals("USDJPY", "forex")).toBe(3);
    expect(priceDecimals("XAUUSD", "cfd")).toBe(2);
    expect(priceDecimals("US30", "cfd")).toBe(2);
    expect(priceDecimals("MES", "futures")).toBe(2);
    expect(priceDecimals("MES")).toBe(2);
  });
  it("does not collapse forex prices", () => {
    expect(formatPrice(1.1, "EURUSD", "forex")).toBe("1.10000");
    expect(formatPrice(1.105, "EURUSD", "forex")).toBe("1.10500");
    expect(formatPrice(150.123, "USDJPY", "forex")).toBe("150.123");
    expect(formatPrice(5301.25, "MES", "futures")).toBe("5,301.25");
  });
  it("prints lots with two decimals and futures contracts whole", () => {
    expect(formatLots(0.1, "XAUUSD", "cfd")).toBe("0.10");
    expect(formatLots(0.5, "USDJPY", "forex")).toBe("0.50");
    expect(formatLots(3, "MES", "futures")).toBe("3");
    expect(formatLots(2, "MES")).toBe("2");
  });
});

describe("drawdown tile", () => {
  it("shows a percent only while the fall is within the profit it fell from", () => {
    expect(drawdownTile(100, 0.25).value).toBe("25.0%");
  });
  it("shows dollars instead of an absurd percent", () => {
    const t = drawdownTile(921.8, 9.218);
    expect(t.value).toBe("-$921.80");
    expect(t.value).not.toContain("%");
  });
  it("shows dollars when there was never a positive peak, and zero when nothing fell", () => {
    expect(drawdownTile(50, 0).value).toBe("-$50.00");
    expect(drawdownTile(0, 0).value).toBe("$0.00");
  });
});

describe("account and trade labels", () => {
  it("an account with no kind reads Not set, not Live", () => {
    expect(accountStatusLabel("unspecified")).toBe("Not set");
    expect(accountStatusLabel(null)).toBe("Not set");
    expect(accountStatusLabel("live")).toBe("Live");
  });
  it("an imported trade shows its real source, never Manual", () => {
    expect(tradeSourceLabel("csv")).toBe("CSV import");
    expect(tradeSourceLabel("sample")).toBe("Sample data");
    const acct = { name: "A", kind: "unspecified", broker: "manual" };
    expect(accountDisplay(acct, "csv").broker).toBe("CSV import");
    expect(accountDisplay(acct, "manual").broker).toBe("Manual");
    expect(accountDisplay({ ...acct, broker: "mt5" }, "csv").broker).toBe("MetaTrader 5");
  });
});

describe("size calculator number text", () => {
  it("refuses a decimal comma instead of reading 1,5 as 15", () => {
    expect(looksLikeDecimalComma("1,5")).toBe(true);
    expect(parseNumberText("1,5").kind).toBe("nan");
    expect(withCommas("1,5")).toBe("1,5");
    expect(numberProblemMessage("1,5", false)).toBe("Use a dot for decimals.");
  });
  it("still reads thousands commas and says Enter a number for an empty box", () => {
    expect(parseNumberText("50,000")).toEqual({ kind: "ok", value: 50000 });
    expect(parseNumberText("1.5")).toEqual({ kind: "ok", value: 1.5 });
    expect(numberProblemMessage("", true)).toBe("Enter a number.");
  });
});

describe("prop step meter", () => {
  it("marks 50%, 80% and 100%", () => {
    expect([...STEP_MARKS]).toEqual([50, 80, 100]);
  });
});
