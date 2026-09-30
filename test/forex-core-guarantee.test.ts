// Forex/CFD trades and TradeOS's core guarantee (Step 4).
//
//  (a) A forex TradeRecord runs through the real rule engine and discipline
//      score and gives the same, deterministic answer every time (the new
//      assetClass label is never read by either).
//  (b) Trade rows for one user, forex included, never show up for another user
//      (same pattern as cross-user-isolation.test.ts).
//  (c) The trade page: a forex trade reads in pips and lots; a futures trade
//      page is unchanged.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TradeReplay } from "@/components/journal/trade-replay";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { evaluateTrades, type RuleLike } from "@/lib/rules/engine";
import { computeDisciplineScore } from "@/lib/discipline/score";
import { ingestCsv } from "@/lib/ingestion";
import { getTrades, getTradesPage, mapTrade } from "@/lib/data";
import { getTradeDetail } from "@/lib/journal";
import type { TradeRecord, NormalizedTrade } from "@/lib/types";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

// Who is "signed in" for the page test.
let signedInId = "";
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => (signedInId ? { id: signedInId, timezone: "America/New_York" } : null),
}));
// The page embeds client components that ask for the router; outside Next.js
// there is none, so give them a stand-in.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));

const SAMPLE = readFileSync(
  fileURLToPath(new URL("../public/samples/mt5-sample.csv", import.meta.url)),
  "utf8"
);

function toRecord(t: NormalizedTrade, i: number): TradeRecord {
  return {
    id: `fx${i}`,
    userId: "u-fx",
    accountId: "a-fx",
    symbol: t.symbol,
    side: t.side,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice ?? null,
    quantity: t.quantity,
    entryTime: t.entryTime,
    exitTime: t.exitTime ?? null,
    fees: t.fees,
    pnl: t.pnl ?? 0,
    pnlGross: t.pnlGross ?? null,
    strategyTag: null,
    notes: null,
    emotions: null,
    tags: null,
    source: "csv",
    externalId: t.externalId ?? null,
    assetClass: t.assetClass ?? null,
    isWin: (t.pnl ?? 0) > 0,
    complianceScore: null,
    violationCount: 0,
  };
}

const rules: RuleLike[] = [
  { id: "r1", name: "Max lots", type: "max_contracts", severity: "medium", weight: 1, config: { maxContracts: 1 } },
  { id: "r2", name: "Max trades", type: "max_trades", severity: "low", weight: 1, config: { maxPerDay: 1 } },
  { id: "r3", name: "Risk limit", type: "risk_limit", severity: "high", weight: 2, config: { maxLossPerTrade: 300 } },
];

describe("(a) a forex trade goes through the rule engine and discipline score deterministically", () => {
  const records = ingestCsv(SAMPLE).trades.map(toRecord);

  it("the sample gives five forex/cfd records", () => {
    expect(records).toHaveLength(5);
    expect(records.map((r) => r.assetClass)).toEqual(["forex", "forex", "cfd", "forex", "forex"]);
  });

  it("the verdicts are the expected ones: lots over 1 and the big loss fail", () => {
    const ev = evaluateTrades(records, rules);
    const status = (tradeId: string, ruleId: string) => ev[tradeId].find((e) => e.ruleId === ruleId)?.status;
    // fx3 is GBPUSD.r, 2.00 lots, a -511.90 loss.
    expect(status("fx3", "r1")).toBe("fail");
    expect(status("fx3", "r3")).toBe("fail");
    // fx0 is 1.00 lot and a profit.
    expect(status("fx0", "r1")).toBe("pass");
    expect(status("fx0", "r3")).toBe("pass");
  });

  it("running it twice gives identical evaluations and an identical score", () => {
    const first = evaluateTrades(records, rules);
    const second = evaluateTrades(records.map((r) => ({ ...r })), rules);
    expect(second).toEqual(first);
    const s1 = computeDisciplineScore({ trades: records, evaluations: first });
    const s2 = computeDisciplineScore({ trades: records.map((r) => ({ ...r })), evaluations: second });
    expect(s2).toEqual(s1);
    expect(Number.isInteger(s1.overall)).toBe(true);
    expect(s1.overall).toBeGreaterThanOrEqual(0);
    expect(s1.overall).toBeLessThanOrEqual(100);
  });

  it("the asset-class label is never read: dropping it changes nothing", () => {
    const plain = records.map((r) => ({ ...r, assetClass: null }));
    const withLabel = evaluateTrades(records, rules);
    const without = evaluateTrades(plain, rules);
    expect(without).toEqual(withLabel);
    expect(computeDisciplineScore({ trades: plain, evaluations: without })).toEqual(
      computeDisciplineScore({ trades: records, evaluations: withLabel })
    );
  });
});

// --------------------------------------------------------------------------
// (b) and (c) need the throwaway database
// --------------------------------------------------------------------------

const stamp = Date.now();
type Trader = { userId: string; accountId: string; forexId: string; futuresId: string };

async function makeTrader(label: string, symbol: string): Promise<Trader> {
  const user = await prisma.user.create({
    data: { email: `fx-${label}-${stamp}@example.com`, passwordHash: "x", displayName: label },
  });
  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, name: `${label} account`, startingBalance: 10000 },
  });
  const forex = await prisma.trade.create({
    data: {
      userId: user.id,
      accountId: account.id,
      symbol,
      side: "long",
      entryPrice: symbol === "XAUUSD" ? 2000 : 1.1,
      exitPrice: symbol === "XAUUSD" ? 2010.5 : 1.105,
      quantity: 0.5,
      entryTime: new Date("2026-09-14T06:15:00Z"),
      exitTime: new Date("2026-09-14T08:40:00Z"),
      fees: 3.5,
      pnl: symbol === "XAUUSD" ? 521.5 : 246.5,
      pnlGross: symbol === "XAUUSD" ? 525 : 250,
      source: "csv",
      externalId: `mt5:${label}1`,
      assetClass: symbol === "XAUUSD" ? "cfd" : "forex",
    },
  });
  const futures = await prisma.trade.create({
    data: {
      userId: user.id,
      accountId: account.id,
      symbol: "MES",
      side: "long",
      entryPrice: 5000,
      exitPrice: 5004,
      quantity: 2,
      entryTime: new Date("2026-09-15T14:00:00Z"),
      exitTime: new Date("2026-09-15T14:30:00Z"),
      fees: 0,
      pnl: 40,
      source: "manual",
    },
  });
  return { userId: user.id, accountId: account.id, forexId: forex.id, futuresId: futures.id };
}

let alice: Trader;
let bob: Trader;

beforeAll(async () => {
  alice = await makeTrader("alice", "EURUSD");
  bob = await makeTrader("bob", "XAUUSD");
});

afterAll(async () => {
  await prisma.trade.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } });
});

describe("(b) forex trade rows stay with their owner", () => {
  it("each trader sees only their own rows, with the kind label carried through", async () => {
    const a = await getTrades(alice.userId);
    const b = await getTrades(bob.userId);
    expect(a.map((t) => t.userId)).toEqual([alice.userId, alice.userId]);
    expect(b.map((t) => t.userId)).toEqual([bob.userId, bob.userId]);
    expect(a.find((t) => t.symbol === "EURUSD")?.assetClass).toBe("forex");
    expect(b.find((t) => t.symbol === "XAUUSD")?.assetClass).toBe("cfd");
    expect(a.find((t) => t.symbol === "MES")?.assetClass ?? null).toBeNull();
    expect(a.some((t) => t.symbol === "XAUUSD")).toBe(false);
    expect(b.some((t) => t.symbol === "EURUSD")).toBe(false);
  });

  it("the journal page of rows is per trader too", async () => {
    const page = await getTradesPage(alice.userId, { limit: 50 });
    expect(page.total).toBe(2);
    expect(page.rows.every((r) => r.userId === alice.userId)).toBe(true);
  });

  it("one trader cannot open the other's forex trade", async () => {
    expect(await getTradeDetail(bob.userId, alice.forexId)).toBeNull();
    expect(await getTradeDetail(alice.userId, bob.forexId)).toBeNull();
    expect((await getTradeDetail(alice.userId, alice.forexId))?.trade.assetClass).toBe("forex");
  });

  it("mapTrade keeps a missing label as null (older trades are futures)", () => {
    expect(mapTrade({ id: "x", userId: "u", accountId: "a", symbol: "ES", side: "long", entryPrice: 1, quantity: 1, entryTime: new Date(), fees: 0, pnl: 0, source: "manual" }).assetClass).toBeNull();
  });
});

describe("(c) the trade page", () => {
  async function render(tradeId: string, userId: string): Promise<string> {
    signedInId = userId;
    const { default: Page } = await import("@/app/(app)/journal/[id]/page");
    const tree = await Page({ params: Promise.resolve({ id: tradeId }) });
    return renderToStaticMarkup(tree);
  }

  it("a forex trade shows Pips and Lots, not Points and Quantity", async () => {
    const html = await render(alice.forexId, alice.userId);
    expect(html).toContain(">Pips<");
    expect(html).toContain("+50.0");
    expect(html).toContain(">Lots<");
    expect(html).toContain("0.50");
    expect(html).toContain("1 lot = standard size");
    expect(html).not.toContain(">Points<");
    expect(html).not.toContain(">Quantity<");
    expect(html).not.toContain("point mult");
  });

  it("a gold (cfd) trade reads in pips too: +105.0", async () => {
    const html = await render(bob.forexId, bob.userId);
    expect(html).toContain(">Pips<");
    expect(html).toContain("+105.0");
    expect(html).toContain(">Lots<");
  });

  // The page keeps the Replay tab closed until it is clicked, so the panel is
  // rendered on its own here.
  function replayHtml(assetClass: "forex" | "cfd" | null): string {
    return renderToStaticMarkup(
      createElement(TradeReplay, {
        id: "t1",
        symbol: assetClass ? "EURUSD" : "MES",
        side: "long",
        entryPrice: 1.1,
        exitPrice: 1.105,
        entryTime: new Date("2026-09-14T06:15:00Z"),
        exitTime: new Date("2026-09-14T08:40:00Z"),
        quantity: 1,
        pnl: 493,
        assetClass,
      })
    );
  }

  it("the forex replay's dollar readout is a dash with the hover hint; futures has no hint", () => {
    expect(replayHtml("forex")).toContain("Dollar value isn&#x27;t shown for forex replays yet.");
    expect(replayHtml("cfd")).toContain("Dollar value isn&#x27;t shown for forex replays yet.");
    expect(replayHtml(null)).not.toContain("Dollar value isn");
  });

  it("a futures trade page is unchanged: Points and Quantity, no pips or lots", async () => {
    const html = await render(alice.futuresId, alice.userId);
    expect(html).toContain(">Points<");
    expect(html).toContain("+4.00");
    expect(html).toContain(">Quantity<");
    expect(html).toContain("5× point mult");
    expect(html).not.toContain(">Pips<");
    expect(html).not.toContain(">Lots<");
  });
});
