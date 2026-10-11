/// <reference types="vite/client" />
// MT5 live link through MetaApi (slice 4): built against recorded fixtures and
// SWITCHED OFF until the owner signs up. Everything here uses a FAKED network
// (test/fixtures/metaapi.ts): no real network, never a funded or personal
// account. Covers: the recorded deals becoming exactly the expected trades with
// the right US-dollar P&L (EURUSD, USDJPY, XAUUSD, GBPUSD), positions and balance
// read, a master (trading) password refused and cleaned up, switched off (routes
// refuse, poller skips, card hidden), plan and 2-account limits, user isolation,
// no order function or address anywhere, only allow-listed hosts, and keys never
// in a response or a log. The FIFO/trade-matching core is guarded here too.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { pnlFromPrices } from "@/lib/instruments";
import {
  ALLOWED_HOSTS,
  FIRMS,
  METAAPI_CLIENT_HOST,
  METAAPI_HOSTS,
  METAAPI_PROVISIONING_HOST,
  MT5_FIRM,
  activeFirms,
  allowedHosts,
  getFirm,
  isAllowedBaseUrl,
  metaApiHostAllowed,
  metaApiSwitchedOn,
} from "@/lib/connectors/firms";
import * as metaapi from "@/lib/connectors/metaapi";
import {
  ALLOWED_ROUTES,
  MT5_LIVE_MESSAGES,
  MetaApiError,
  mapDealsToTrades,
  maConnectInvestor,
  maProvisionAccount,
  maReadDeals,
  maReadPositions,
  mt5AccessProblem,
} from "@/lib/connectors/metaapi";
import {
  MT5_MAX_ACCOUNTS,
  mt5PlanAllowed,
  mt5PlanEnded,
  readableConnectionsWhere,
  removeBridgeAccounts,
  removeBridgeAccountsReport,
  removeEndedMt5Links,
  removeMt5LinksForUser,
} from "@/lib/connectors/mt5-access";
import { plainDealNotes, syncConnection } from "@/lib/connectors/sync";
import { ConnectorError } from "@/lib/connectors/topstepx";
import { runLiveTick, clearFailureBackoff } from "@/lib/live/poller";
import { CallBudget, liveBudget } from "@/lib/live/budget";
import {
  BALANCE_DEAL,
  FAKE_INVESTOR_PASSWORD,
  FAKE_LOGIN,
  FAKE_MASTER_PASSWORD,
  FAKE_MT_TOKEN,
  FAKE_SERVER,
  MT5_ON,
  deal,
  installFakeMetaApi,
  recordedDeals,
} from "./fixtures/metaapi";
import { cleanup, makeTrader, userIds } from "./fixtures/live-helpers";
import { DEMO_EMAIL } from "@/lib/demo-desk";

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
  verifyPassword: async () => true,
  clearSessionCookie: async () => undefined,
}));

const T0 = new Date("2026-10-02T18:00:00Z");
const FORBIDDEN_NAME = /order|close|flatten|cancel|place|modify|liquidate|reduce/i;

let gw: ReturnType<typeof installFakeMetaApi>;
let logs: string[];
let takeSpy: ReturnType<typeof vi.spyOn>;

function on() {
  vi.stubEnv("METAAPI_ENABLED", MT5_ON.METAAPI_ENABLED);
  vi.stubEnv("METAAPI_TOKEN", MT5_ON.METAAPI_TOKEN);
}
function off() {
  vi.stubEnv("METAAPI_ENABLED", "");
  vi.stubEnv("METAAPI_TOKEN", "");
}

beforeEach(async () => {
  await prisma.brokerConnection.deleteMany();
  clearFailureBackoff();
  logs = [];
  off(); // every test starts switched OFF, like production before sign-up
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  }
  // The route draws from the process-wide budget; keep it from filling up across tests.
  takeSpy = vi.spyOn(liveBudget, "take").mockReturnValue(true);
});
afterEach(() => {
  gw?.restore();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  session.current = null;
});
afterAll(cleanup);

// ---------- helpers ----------

async function trader(plan = "pro", billingStatus = "active", prefix = "mt5") {
  const t = await makeTrader({ prefix });
  await prisma.user.update({ where: { id: t.userId }, data: { plan, billingStatus } });
  return { ...t, plan, billingStatus };
}
const asUser = (t: { userId: string; email: string; plan: string; billingStatus: string }) => {
  session.current = { id: t.userId, email: t.email, plan: t.plan, billingStatus: t.billingStatus };
};

let acctSeq = 0;
/** A stored MT5 link (its bridge account is registered with the fake network when one is installed). */
async function linkMt5(
  t: { userId: string; accountId?: string },
  opts: { bridgeId?: string; login?: string; kind?: "investor" | "master" } = {}
) {
  acctSeq += 1;
  const login = opts.login ?? `5000${acctSeq}`;
  const acc = await prisma.tradingAccount.create({
    data: { userId: t.userId, name: `MT5 ${login}`, broker: "mt5", kind: "live", startingBalance: 0 },
  });
  const bridgeId = opts.bridgeId ?? `bridge-${acctSeq}-${Date.now()}`;
  gw?.accounts.set(bridgeId, opts.kind ?? "investor");
  const conn = await prisma.brokerConnection.create({
    data: {
      userId: t.userId,
      accountId: acc.id,
      broker: "mt5",
      baseUrl: MT5_FIRM.apiBase,
      username: login,
      apiKeyEnc: encryptSecret("mt5-investor-password-not-stored"),
      externalAccountId: bridgeId,
      externalAccountName: `${FAKE_SERVER} · ${login}`,
    },
  });
  return { conn, bridgeId, accountId: acc.id };
}

const postMt5 = async (body: Record<string, unknown>) => {
  const route = await import("@/app/api/connectors/mt5/route");
  return route.POST(new Request("http://localhost/api/connectors/mt5", { method: "POST", body: JSON.stringify(body) }));
};
const goodBody = (extra: Record<string, unknown> = {}) => ({
  server: FAKE_SERVER,
  login: FAKE_LOGIN,
  password: FAKE_INVESTOR_PASSWORD,
  ...extra,
});

// --------------------------------------------------------------------------
// 1. Trade matching: the recorded deals become exactly these trades
// --------------------------------------------------------------------------

describe("recorded deals become exactly the expected trades (USD)", () => {
  const result = mapDealsToTrades(recordedDeals());

  it("makes a trade per close (a partial close counts at once), and names what it skipped", () => {
    expect(result.trades.map((t) => t.externalId)).toEqual([
      "mt5:7001",
      "mt5:7002",
      "mt5:7003",
      "mt5:7004",
      "mt5:7004:2",
      "mt5:7005",
    ]);
    expect(result.openCount).toBe(1); // 7005: 2 lots in, 1 closed so far (that lot IS a trade; the other is still open)
    expect(result.skipped).toBe(2);
    expect(result.notes.join(" | ")).toContain("position 7006: symbol BTCUSD is not supported yet");
    expect(result.notes.join(" | ")).toContain("position 7007: opened before the history window");
  });

  it("EURUSD long 1.00 lot: +500.00 gross, costs 8.20, net 491.80", () => {
    expect(result.trades[0]).toEqual({
      symbol: "EURUSD",
      side: "long",
      entryPrice: 1.08,
      exitPrice: 1.085,
      quantity: 1,
      entryTime: new Date("2026-09-14T08:00:00.000Z"),
      exitTime: new Date("2026-09-14T12:30:00.000Z"),
      fees: 8.2,
      pnl: 491.8,
      pnlGross: 500,
      strategyTag: null,
      notes: null,
      emotions: null,
      tags: null,
      source: "api",
      externalId: "mt5:7001",
      assetClass: "forex",
    });
  });

  it("USDJPY short 0.50 lot: +167.22 gross (yen turned to dollars), costs 5.00, net 162.22", () => {
    const t = result.trades[1];
    expect(t).toMatchObject({
      symbol: "USDJPY",
      side: "short",
      entryPrice: 150,
      exitPrice: 149.5,
      quantity: 0.5,
      fees: 5,
      pnl: 162.22,
      pnlGross: 167.22,
      assetClass: "forex",
    });
  });

  it("XAUUSD long 0.20 lot: +210.00 gross, costs 4.50, net 205.50, a CFD", () => {
    expect(result.trades[2]).toMatchObject({
      symbol: "XAUUSD",
      side: "long",
      entryPrice: 2300,
      exitPrice: 2310.5,
      quantity: 0.2,
      fees: 4.5,
      pnl: 205.5,
      pnlGross: 210,
      assetClass: "cfd",
    });
  });

  it("a position scaled out in two closes is one trade per close; together they equal the whole position", () => {
    expect(result.trades[3]).toMatchObject({
      symbol: "GBPUSD",
      side: "long",
      entryPrice: 1.3,
      exitPrice: 1.305,
      quantity: 0.4,
      entryTime: new Date("2026-09-17T09:00:00.000Z"),
      exitTime: new Date("2026-09-17T10:00:00.000Z"),
      fees: 2.8, // the close's 1.40 plus 0.4 of the 3.50 opening commission
      pnl: 197.2,
      pnlGross: 200,
      externalId: "mt5:7004",
    });
    expect(result.trades[4]).toMatchObject({
      entryPrice: 1.3,
      exitPrice: 1.31,
      quantity: 0.6,
      entryTime: new Date("2026-09-17T09:00:00.000Z"),
      exitTime: new Date("2026-09-17T11:00:00.000Z"),
      fees: 4.2,
      pnl: 595.8,
      pnlGross: 600,
      externalId: "mt5:7004:2",
    });
    const sum = (k: "quantity" | "fees" | "pnl" | "pnlGross") =>
      Math.round((result.trades[3][k] as number) * 100 + (result.trades[4][k] as number) * 100) / 100;
    expect([sum("fees"), sum("pnl"), sum("pnlGross")]).toEqual([7, 793, 800]);
    expect(Math.round(sum("quantity") * 100) / 100).toBe(1);
  });

  it("2 lots closed 1 lot at -$400: that lot is a trade now, the rest later (FIFO)", () => {
    const first = [
      deal("8101", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 2, 1.1, "2026-09-22T09:00:00.000Z", { commission: -7 }),
      deal("8101", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.096, "2026-09-22T10:00:00.000Z", { profit: -400 }),
    ];
    const a = mapDealsToTrades(first);
    expect(a.openCount).toBe(1);
    expect(a.trades).toHaveLength(1);
    expect(a.trades[0]).toMatchObject({ externalId: "mt5:8101", quantity: 1, pnlGross: -400, fees: 3.5, pnl: -403.5 });
    // Later the other lot closes too: the first trade is unchanged (same id, same numbers).
    const b = mapDealsToTrades([
      ...first,
      deal("8101", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.105, "2026-09-22T12:00:00.000Z", { profit: 500 }),
    ]);
    expect(b.openCount).toBe(0);
    expect(b.trades.map((t) => [t.externalId, t.quantity, t.pnlGross])).toEqual([
      ["mt5:8101", 1, -400],
      ["mt5:8101:2", 1, 500],
    ]);
    expect(b.trades[0]).toEqual(a.trades[0]);
  });

  it("a scale-in after a partial close: each close takes the oldest lots first", () => {
    const r = mapDealsToTrades([
      deal("8102", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 1, 1.1, "2026-09-22T09:00:00.000Z"),
      deal("8102", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 0.5, 1.11, "2026-09-22T10:00:00.000Z", { profit: 500 }),
      deal("8102", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 1, 1.2, "2026-09-22T11:00:00.000Z"),
      deal("8102", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.21, "2026-09-22T12:00:00.000Z", { profit: 1000 }),
    ]);
    expect(r.trades.map((t) => [t.quantity, t.entryPrice])).toEqual([
      [0.5, 1.1],
      [1, 1.15], // 0.5 left of the 1.10 lot, then 0.5 of the 1.20 lot
    ]);
  });

  it("OUT deals at the same moment are ONE close (one trade); a close at another time is its own", () => {
    const r = mapDealsToTrades([
      deal("8103", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 1, 1.1, "2026-09-22T09:00:00.000Z"),
      deal("8103", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 0.3, 1.11, "2026-09-22T10:00:00.000Z", { profit: 300 }),
      deal("8103", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 0.7, 1.11, "2026-09-22T10:00:00.000Z", { profit: 700 }),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ externalId: "mt5:8103", quantity: 1, pnlGross: 1000 });
  });

  it("tells the trader, in plain words, about positions opened before the 90-day window", () => {
    const r = mapDealsToTrades(recordedDeals());
    expect(plainDealNotes(r)).toEqual([
      "1 position was opened more than 90 days ago, so it was left out. Import your MT5 report file to add older trades.",
      "Trades in BTCUSD were left out because TradeOS doesn't support those symbols yet.",
    ]);
    expect(plainDealNotes(mapDealsToTrades([]))).toEqual([]);
  });

  it("the bridge's own profit equals the instruments-library maths for every symbol", () => {
    const calc = (symbol: string, side: "long" | "short", lots: number, entry: number, exit: number) =>
      pnlFromPrices({ symbol, side, lots, entryPrice: entry, exitPrice: exit, accountCurrency: "USD" });
    expect(calc("EURUSD", "long", 1, 1.08, 1.085)).toBe(result.trades[0].pnlGross);
    expect(calc("USDJPY", "short", 0.5, 150, 149.5)).toBe(result.trades[1].pnlGross);
    expect(calc("XAUUSD", "long", 0.2, 2300, 2310.5)).toBe(result.trades[2].pnlGross);
    expect(calc("GBPUSD", "long", 0.4, 1.3, 1.305)).toBe(result.trades[3].pnlGross);
    expect(calc("GBPUSD", "long", 0.6, 1.3, 1.31)).toBe(result.trades[4].pnlGross);
  });

  it("with no profit figure on a deal, the P&L comes from the instruments library", () => {
    const noProfit = [
      deal("8001", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "XAUUSD", 0.5, 2300, "2026-09-21T09:00:00.000Z"),
      { ...deal("8001", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "XAUUSD", 0.5, 2304, "2026-09-21T10:00:00.000Z"), profit: undefined },
    ];
    const r = mapDealsToTrades(noProfit);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].pnlGross).toBe(200); // 4 x 100 oz x 0.5
  });

  it("a short position is paired the other way round", () => {
    const r = mapDealsToTrades([
      deal("8002", "DEAL_TYPE_SELL", "DEAL_ENTRY_IN", "EURUSD", 1, 1.1, "2026-09-21T09:00:00.000Z"),
      deal("8002", "DEAL_TYPE_BUY", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.103, "2026-09-21T10:00:00.000Z", { profit: -300 }),
    ]);
    expect(r.trades[0]).toMatchObject({ side: "short", pnl: -300, pnlGross: -300 });
  });

  it("balance, credit and other non-trade deals are ignored; a reversal in one deal is skipped by name", () => {
    const r = mapDealsToTrades([
      BALANCE_DEAL,
      deal("8003", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 1, 1.1, "2026-09-21T09:00:00.000Z"),
      deal("8003", "DEAL_TYPE_SELL", "DEAL_ENTRY_INOUT", "EURUSD", 2, 1.11, "2026-09-21T10:00:00.000Z", { profit: 1000 }),
    ]);
    expect(r.trades).toHaveLength(0);
    expect(r.skipped).toBe(1);
    expect(r.notes[0]).toContain("reversed in one deal");
  });

  it("the same deals always give the same trades (deterministic, order of arrival does not matter)", () => {
    const shuffled = [...recordedDeals()].reverse();
    expect(mapDealsToTrades(shuffled).trades).toEqual(result.trades);
  });
});

// --------------------------------------------------------------------------
// 2. Reads: positions, balance, deals (against the fake network)
// --------------------------------------------------------------------------

describe("reads through the fake bridge", () => {
  it("reads balance, equity and the investor flag", async () => {
    on();
    gw = installFakeMetaApi({ balance: 12345.67, equity: 12400 });
    const { accountId, info } = await maConnectInvestor(
      { login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD },
      { sleep: async () => {} }
    );
    expect(accountId).toMatch(/^acc-/);
    expect(info).toEqual({ balance: 12345.67, equity: 12400, currency: "USD", investorMode: true, tradeAllowed: false });
  });

  it("reads open positions", async () => {
    on();
    gw = installFakeMetaApi({
      positions: [
        { id: "9001", type: "POSITION_TYPE_BUY", symbol: "EURUSD", volume: 1, openPrice: 1.08, currentPrice: 1.085, unrealizedProfit: 500 },
        { id: "9002", type: "POSITION_TYPE_SELL", symbol: "XAUUSD", volume: 0.2, openPrice: 2300, currentPrice: 2295, unrealizedProfit: 100 },
      ],
    });
    gw.accounts.set("acct-1", "investor");
    expect(await maReadPositions("acct-1")).toEqual([
      { id: "9001", side: "long", symbol: "EURUSD", volume: 1, openPrice: 1.08, currentPrice: 1.085, unrealizedProfit: 500 },
      { id: "9002", side: "short", symbol: "XAUUSD", volume: 0.2, openPrice: 2300, currentPrice: 2295, unrealizedProfit: 100 },
    ]);
  });

  it("reads deals page by page (1000 at a time)", async () => {
    on();
    const many = Array.from({ length: 1500 }, (_, i) => ({ ...BALANCE_DEAL, id: String(i + 1) }));
    gw = installFakeMetaApi({ deals: many });
    gw.accounts.set("acct-1", "investor");
    const got = await maReadDeals("acct-1", new Date("2026-07-01"), new Date("2026-10-01"));
    expect(got).toHaveLength(1500);
    expect(gw.count("GET", "/history-deals/time/")).toBe(2);
  });

  it("waits through 202 (still checking) and 504 (not connected yet), then connects", async () => {
    on();
    gw = installFakeMetaApi({ pendingCreates: 2, notReadyReads: 3 });
    const sleeps: number[] = [];
    const r = await maConnectInvestor(
      { login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD },
      { sleep: async (ms) => void sleeps.push(ms) }
    );
    expect(r.info.investorMode).toBe(true);
    expect(gw.count("POST", "/users/current/accounts")).toBe(3);
    expect(gw.count("GET", "/account-information")).toBe(4);
    expect(sleeps.length).toBe(5);
    // Every create attempt reuses ONE transaction id (MetaApi's own rule for polling a 202).
    const ids = gw.calls.filter((c) => c.method === "POST").map((c) => c.headers["transaction-id"]);
    expect(new Set(ids).size).toBe(1);
  });

  it("an account that never answers is removed again and the trader is told to retry", async () => {
    on();
    gw = installFakeMetaApi({ notReadyReads: 99 });
    await expect(
      maConnectInvestor({ login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD }, { sleep: async () => {} })
    ).rejects.toMatchObject({ code: "not_ready" });
    expect(gw.accounts.size).toBe(0);
  });

  it("a 429 becomes a rate-limit error carrying Retry-After (seconds or a date)", async () => {
    on();
    gw = installFakeMetaApi({ mode: "rate-limit", retryAfter: "42" });
    gw.accounts.set("a1", "investor");
    await expect(maReadPositions("a1")).rejects.toMatchObject({ kind: "rate_limit", retryAfterSec: 42 });
    gw.state.retryAfter = new Date(Date.now() + 90_000).toUTCString();
    const err = (await maReadPositions("a1").catch((e) => e)) as ConnectorError;
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfterSec).toBeGreaterThan(60);
    expect(err.retryAfterSec).toBeLessThanOrEqual(90);
  });
});

// --------------------------------------------------------------------------
// 3. Investor password only
// --------------------------------------------------------------------------

describe("investor password only: a trading password is refused and cleaned up", () => {
  it("mt5AccessProblem fails closed", () => {
    const ok = { investorMode: true, tradeAllowed: false, currency: "USD" } as const;
    expect(mt5AccessProblem(ok)).toBeNull();
    expect(mt5AccessProblem({ ...ok, investorMode: false })).toBe("trading_rights");
    expect(mt5AccessProblem({ ...ok, investorMode: null })).toBe("trading_rights"); // flag missing = not proven read-only
    expect(mt5AccessProblem({ ...ok, tradeAllowed: true })).toBe("trading_rights"); // flag says trading is allowed
    expect(mt5AccessProblem({ ...ok, currency: "EUR" })).toBe("not_usd");
    expect(mt5AccessProblem({ ...ok, currency: "usd" })).toBeNull();
  });

  it("a master password: refused with the plain message, bridge account deleted, nothing saved", async () => {
    on();
    gw = installFakeMetaApi({ passwordKind: "master" });
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody({ password: FAKE_MASTER_PASSWORD }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json).toMatchObject({ ok: false, code: "trading_rights", clearPassword: true });
    expect(json.error).toContain("That is a trading password. Please connect with the investor password instead.");
    expect(json.error).toContain("We removed it straight away and saved nothing.");
    expect(gw.count("DELETE", "/users/current/accounts/")).toBe(1); // cleaned up at once
    expect(gw.accounts.size).toBe(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
    expect(await prisma.tradingAccount.count({ where: { userId: t.userId, broker: "mt5" } })).toBe(0);
    // No positions or deals were ever read from the refused account.
    expect(gw.count("GET", "/positions")).toBe(0);
    expect(gw.count("GET", "/history-deals")).toBe(0);
  });

  it("an account that does not report the investor flag at all is refused too (fail closed)", async () => {
    on();
    gw = installFakeMetaApi({ omitInvestorMode: true });
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody());
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("trading_rights");
    expect(gw.accounts.size).toBe(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
  });

  it("an account not in US dollars is refused with the plain message and removed", async () => {
    on();
    gw = installFakeMetaApi({ currency: "EUR" });
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody());
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.error).toBe("This account isn't in US dollars, so it can't be linked yet.");
    expect(gw.accounts.size).toBe(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
  });

  it("if the clean-up itself fails the trader is still refused, saved nothing, and the id (never a password) is logged", async () => {
    on();
    gw = installFakeMetaApi({ passwordKind: "master" });
    const t = await trader();
    asUser(t);
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    gw.state.mode = "ok";
    // Break only the DELETE call.
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (async (input: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "DELETE" ? new Response("{}", { status: 500 }) : real(input, init)) as typeof fetch);
    const res = await postMt5(goodBody({ password: FAKE_MASTER_PASSWORD }));
    expect(res.status).toBe(422);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
    const line = logs.find((l) => l.includes("could not remove a bridge account"));
    expect(line).toMatch(/acc-1-aaaa-bbbb/);
    for (const l of logs) expect(l).not.toContain(FAKE_MASTER_PASSWORD);
    vi.stubGlobal("setTimeout", realSleep);
  });

  it("wrong details and unknown server get their own plain messages, and nothing is saved", async () => {
    on();
    gw = installFakeMetaApi({ mode: "bad-login" });
    const t = await trader();
    asUser(t);
    const a = await postMt5(goodBody());
    expect(a.status).toBe(401);
    expect((await a.json()).error).toBe(MT5_LIVE_MESSAGES.badLogin);
    gw.state.mode = "server-missing";
    const b = await postMt5(goodBody());
    expect(b.status).toBe(400);
    expect((await b.json()).code).toBe("server_not_found");
    expect(gw.accounts.size).toBe(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
  });

  it("an unreachable bridge says so plainly", async () => {
    on();
    gw = installFakeMetaApi({ mode: "network" });
    const t = await trader();
    asUser(t);
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout); // skip the recovery waits
    const res = await postMt5(goodBody());
    vi.stubGlobal("setTimeout", realSleep);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("We couldn't reach our MT5 bridge. Try again in a minute.");
  });
});

// --------------------------------------------------------------------------
// 4. The connect route when it works
// --------------------------------------------------------------------------

describe("connecting an investor-password account", () => {
  it("saves the link, imports the history, keeps no password, and counts every call in the shared budget", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals(), balance: 25000 });
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, imported: 6 });
    expect(json.notes).toHaveLength(2); // the position opened before the window, and the unsupported symbol

    const conn = await prisma.brokerConnection.findFirstOrThrow({ where: { userId: t.userId } });
    expect(conn.broker).toBe("mt5");
    expect(conn.username).toBe(FAKE_LOGIN);
    expect(conn.externalAccountId).toMatch(/^acc-/);
    expect(conn.externalAccountName).toBe(`${FAKE_SERVER} · ${FAKE_LOGIN}`);
    expect(conn.lastBalance).toBe(25000);
    expect(conn.apiKeyEnc.startsWith("v1:")).toBe(true); // encrypted marker
    expect(JSON.stringify(conn)).not.toContain(FAKE_INVESTOR_PASSWORD);

    const trades = await prisma.trade.findMany({ where: { userId: t.userId }, orderBy: { exitTime: "asc" } });
    expect(trades.map((x) => [x.symbol, x.pnl, x.assetClass, x.source, x.externalId])).toEqual([
      ["EURUSD", 491.8, "forex", "api", "mt5:7001"],
      ["USDJPY", 162.22, "forex", "api", "mt5:7002"],
      ["XAUUSD", 205.5, "cfd", "api", "mt5:7003"],
      ["GBPUSD", 197.2, "forex", "api", "mt5:7004"],
      ["GBPUSD", 595.8, "forex", "api", "mt5:7004:2"],
      ["EURUSD", 193, "forex", "api", "mt5:7005"],
    ]);
    // create + account info (the connect check) + account info (the sync's re-check) + one page
    // of deals = 4 calls, each asked of the shared budget
    expect(gw.calls.length).toBe(4);
    expect(takeSpy).toHaveBeenCalledTimes(4);
    // The password went out ONCE, in the create call body, and nowhere else.
    expect(gw.calls.filter((c) => JSON.stringify(c.body).includes(FAKE_INVESTOR_PASSWORD)).length).toBe(1);
  });

  it("syncing again imports nothing new (dedupe by mt5:<position id>), and the file import's ids line up", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const first = await syncConnection(conn.id, t.userId);
    const second = await syncConnection(conn.id, t.userId);
    expect(first).toMatchObject({ imported: 6, skipped: 0 });
    expect(first.notes).toHaveLength(2);
    expect(second).toMatchObject({ imported: 0, skipped: 6 });
    expect(await prisma.trade.count({ where: { userId: t.userId } })).toBe(6);
  });

  it("history the bridge is still downloading imports nothing and is not an error", async () => {
    on();
    gw = installFakeMetaApi({ deals: [], synchronizing: true });
    const t = await trader();
    const { conn } = await linkMt5(t);
    expect(await syncConnection(conn.id, t.userId)).toEqual({ imported: 0, skipped: 0 });
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).status).toBe("connected");
  });

  it("a sync failure is recorded in plain English on the link, never the bridge's own words", async () => {
    on();
    gw = installFakeMetaApi({ mode: "network" });
    const t = await trader();
    const { conn } = await linkMt5(t);
    await expect(syncConnection(conn.id, t.userId)).rejects.toBeInstanceOf(ConnectorError);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ status: "error", lastError: MT5_LIVE_MESSAGES.bridgeDown });
  });

  it("bad input is refused before any network call", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    asUser(t);
    for (const bad of [
      goodBody({ login: "12ab" }),
      goodBody({ login: "" }),
      goodBody({ server: "" }),
      goodBody({ server: "evil/../server" }),
      goodBody({ password: "" }),
      goodBody({ password: "x".repeat(201) }),
      {},
    ]) {
      const res = await postMt5(bad as Record<string, unknown>);
      expect(res.status).toBe(400);
    }
    expect(gw.calls).toHaveLength(0);
  });

  it("the same login and server cannot be linked twice", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    asUser(t);
    expect((await postMt5(goodBody())).status).toBe(200);
    const again = await postMt5(goodBody());
    expect(again.status).toBe(409);
    expect(gw.accounts.size).toBe(1);
  });
});

// --------------------------------------------------------------------------
// 5. Plan gate and the 2-account limit
// --------------------------------------------------------------------------

describe("who may connect: paid plans only, 2 accounts at most (fail closed)", () => {
  it("only an active Pro or Elite plan passes", () => {
    expect(mt5PlanAllowed({ plan: "pro", billingStatus: "active" })).toBe(true);
    expect(mt5PlanAllowed({ plan: "elite", billingStatus: "active" })).toBe(true);
    for (const [plan, billingStatus] of [
      ["free", "active"],
      ["free", "trialing"],
      ["pro", "trialing"],
      ["pro", "past_due"],
      ["elite", "canceled"],
      ["", ""],
      ["admin", "active"],
    ]) {
      expect(mt5PlanAllowed({ plan, billingStatus }), `${plan}/${billingStatus}`).toBe(false);
    }
  });

  it("a Starter (free) trader is refused, with no call to MetaApi", async () => {
    on();
    gw = installFakeMetaApi();
    for (const [plan, status] of [["free", "trialing"], ["free", "active"], ["pro", "trialing"], ["pro", "canceled"]]) {
      const t = await trader(plan, status, `plan-${plan}-${status}`);
      asUser(t);
      const res = await postMt5(goodBody());
      expect(res.status, `${plan}/${status}`).toBe(403);
      expect((await res.json()).error).toBe("MT5 live links are on paid plans.");
    }
    expect(gw.calls).toHaveLength(0);
  });

  it("Elite is allowed", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("elite");
    asUser(t);
    expect((await postMt5(goodBody())).status).toBe(200);
  });

  it("the 3rd MT5 connection is refused with the plain limit message, with no call to MetaApi", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    await linkMt5(t);
    await linkMt5(t);
    asUser(t);
    const res = await postMt5(goodBody());
    const json = await res.json();
    expect(MT5_MAX_ACCOUNTS).toBe(2);
    expect(res.status).toBe(403);
    expect(json.error).toBe("You've linked 2 MT5 accounts, the most your plan allows. Disconnect one to add another.");
    expect(gw.calls).toHaveLength(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId, broker: "mt5" } })).toBe(2);
  });

  it("two connects at the same moment cannot slip past the limit", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    await linkMt5(t); // one already linked
    asUser(t);
    const [a, b] = await Promise.all([
      postMt5(goodBody({ login: "11110001" })),
      postMt5(goodBody({ login: "11110002" })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).not.toBe(200);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId, broker: "mt5" } })).toBe(2);
    expect(gw.accounts.size).toBe(2); // the one already linked plus the one new link: the refused try left nothing behind
  });

  it("a disconnect frees a slot", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    const first = await linkMt5(t);
    await linkMt5(t);
    asUser(t);
    const connectors = await import("@/app/api/connectors/route");
    const del = await connectors.DELETE(
      new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: first.conn.id }) })
    );
    expect(del.status).toBe(200);
    expect((await postMt5(goodBody())).status).toBe(200);
  });
});

// --------------------------------------------------------------------------
// 6. Switched off: routes refuse, the poller skips, the card is hidden
// --------------------------------------------------------------------------

describe("switched off (the state it ships in)", () => {
  it("is off unless BOTH the flag and a token are set", () => {
    expect(metaApiSwitchedOn({})).toBe(false);
    expect(metaApiSwitchedOn({ METAAPI_ENABLED: "true" })).toBe(false);
    expect(metaApiSwitchedOn({ METAAPI_TOKEN: "x" })).toBe(false);
    expect(metaApiSwitchedOn({ METAAPI_ENABLED: "1", METAAPI_TOKEN: "x" })).toBe(false);
    expect(metaApiSwitchedOn({ METAAPI_ENABLED: "true", METAAPI_TOKEN: "   " })).toBe(false);
    expect(metaApiSwitchedOn({ METAAPI_ENABLED: "true", METAAPI_TOKEN: "x" })).toBe(true);
  });

  it("the MetaApi hosts are not in the registry or the host list while off", () => {
    expect(metaApiSwitchedOn()).toBe(false);
    expect(activeFirms().map((f) => f.id)).toEqual(["topstepx"]);
    expect(getFirm("mt5")).toBeUndefined();
    for (const h of METAAPI_HOSTS) {
      expect(allowedHosts().has(h)).toBe(false);
      expect(isAllowedBaseUrl(`https://${h}`)).toBe(false);
      expect(metaApiHostAllowed(h)).toBe(false);
    }
  });

  it("the connect route refuses everything, with no network call", async () => {
    gw = installFakeMetaApi();
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, code: "mt5_off", error: "MT5 live links aren't switched on yet." });
    expect(gw.calls).toHaveLength(0);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
  });

  it("the TopstepX route cannot be used to reach MT5 (firm id 'mt5' is not accepted)", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    asUser(t);
    const connectors = await import("@/app/api/connectors/route");
    const res = await connectors.POST(
      new Request("http://localhost/api/connectors", {
        method: "POST",
        body: JSON.stringify({ action: "discover", firm: "mt5", username: "u", apiKey: "k" }),
      })
    );
    expect(res.status).toBe(400);
    expect(gw.calls).toHaveLength(0);
  });

  it("the poller skips MT5 links: no call, nothing touched", async () => {
    gw = installFakeMetaApi();
    const t = await trader();
    const { conn } = await linkMt5(t);
    const stats = await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(gw.calls).toHaveLength(0);
    expect(stats.groups).toBe(0);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.lastLiveAt).toBeNull();
    expect(row.liveStatus).toBe("ok");
  });

  it("the sweep, the cron route and the script load no MT5 row while off, and a manual sync is refused", async () => {
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const rows = await prisma.brokerConnection.findMany({ where: { ...readableConnectionsWhere(), userId: t.userId } });
    expect(rows).toHaveLength(0);
    await expect(syncConnection(conn.id, t.userId)).rejects.toThrow("MT5 live links aren't switched on yet.");
    expect(gw.calls).toHaveLength(0);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.status).toBe("connected"); // nothing recorded as an error either
  });

  it("the Import page leaves the MT5 card out", async () => {
    const t = await trader();
    asUser(t);
    const { default: ImportPage } = await import("@/app/(app)/import/page");
    const { Mt5LiveCard } = await import("@/components/import/mt5-live-card");
    expect(containsType(await ImportPage(), Mt5LiveCard)).toBe(false);
  });

  it("with the switch on, the card appears (open to paid plans, locked on Starter)", async () => {
    on();
    const { default: ImportPage } = await import("@/app/(app)/import/page");
    const { Mt5LiveCard } = await import("@/components/import/mt5-live-card");
    const paid = await trader();
    asUser(paid);
    const cardOf = (tree: unknown) => findElement(tree, Mt5LiveCard);
    expect(cardOf(await ImportPage())?.props).toMatchObject({ planAllowed: true, count: 0, max: 2 });
    const starter = await trader("free", "trialing", "starter");
    asUser(starter);
    expect(cardOf(await ImportPage())?.props).toMatchObject({ planAllowed: false });
  });

  it("switching off later keeps the clean-up possible: a disconnect still removes the account at MetaApi when the token remains", async () => {
    gw = installFakeMetaApi();
    const t = await trader();
    const { conn, bridgeId } = await linkMt5(t);
    vi.stubEnv("METAAPI_TOKEN", FAKE_MT_TOKEN); // token present, flag off
    asUser(t);
    const connectors = await import("@/app/api/connectors/route");
    const res = await connectors.DELETE(
      new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: conn.id }) })
    );
    expect(res.status).toBe(200);
    expect(gw.accounts.has(bridgeId)).toBe(false);
    expect(gw.calls.map((c) => c.method)).toEqual(["DELETE"]); // nothing else is reachable while off
    expect(metaApiHostAllowed(METAAPI_CLIENT_HOST, { cleanup: true })).toBe(true);
    expect(metaApiHostAllowed(METAAPI_CLIENT_HOST)).toBe(false);
  });
});

function findElement(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findElement(n, type);
      if (f) return f;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === type) return { props: el.props ?? {} };
  return findElement(el.props?.children, type);
}
const containsType = (node: unknown, type: unknown) => findElement(node, type) !== null;

// --------------------------------------------------------------------------
// 7. The live poller: positions + balance, budget, lease, back-off
// --------------------------------------------------------------------------

describe("near-live reads of an MT5 link", () => {
  const EUR = { id: "9001", type: "POSITION_TYPE_BUY", symbol: "EURUSD", volume: 1, openPrice: 1.08, currentPrice: 1.085, unrealizedProfit: 500 } as const;
  const XAU = { id: "9002", type: "POSITION_TYPE_SELL", symbol: "XAUUSD.r", volume: 0.2, openPrice: 2300, currentPrice: 2295, unrealizedProfit: 100 } as const;

  it("saves the open positions and the balance, with two budgeted read-only calls", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR, XAU], balance: 54321 });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const budget = new CallBudget(100, () => 0);
    const stats = await runLiveTick({ now: T0, budget });
    expect(stats).toMatchObject({ groups: 1, reads: 1, failed: 0, rejected: 0 });
    expect(budget.used()).toBe(2); // account information + positions, nothing else
    expect(gw.calls.map((c) => `${c.method} ${c.path.split("/").pop()}`)).toEqual([
      "GET account-information",
      "GET positions",
    ]);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ lastBalance: 54321, liveStatus: "ok", lastLiveError: null });
    expect(row.lastLiveAt?.toISOString()).toBe(T0.toISOString());
    const snap = await prisma.positionSnapshot.findMany({ where: { connectionId: conn.id }, orderBy: { contractId: "asc" } });
    expect(snap.map((s) => [s.symbol, s.side, s.size, s.avgPrice, s.lastPrice, s.openPnl, s.priceSource])).toEqual([
      ["EURUSD", "long", 1, 1.08, 1.085, 500, "broker"],
      ["XAUUSD", "short", 0.2, 2300, 2295, 100, "broker"], // ".r" broker ending tidied to the table's name
    ]);
  });

  it("a read is never faster than once a minute per link", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR] });
    const t = await trader();
    await linkMt5(t);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    const n = gw.calls.length;
    await runLiveTick({ now: new Date(T0.getTime() + 20_000), budget: new CallBudget(100, () => 20_000) });
    expect(gw.calls.length).toBe(n);
    await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget: new CallBudget(100, () => 61_000) });
    expect(gw.calls.length).toBe(n + 2);
  });

  it("stops when the shared call budget is used up (the link is read first next tick)", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR] });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const tiny = new CallBudget(1, () => 0);
    const stats = await runLiveTick({ now: T0, budget: tiny });
    expect(stats.reads).toBe(0);
    expect(gw.calls.length).toBe(1); // only the one call the budget allowed
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastLiveAt).toBeNull();
  });

  it("a 429 starts the shared back-off and does not mark the link rejected", async () => {
    on();
    gw = installFakeMetaApi({ mode: "rate-limit", retryAfter: "120" });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const clock = { t: 0 };
    const budget = new CallBudget(100, () => clock.t);
    await runLiveTick({ now: T0, budget });
    expect(budget.inBackoff()).toBe(true);
    expect(budget.backoffRemainingMs()).toBe(120_000);
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).liveStatus).toBe("ok");
  });

  it("an unreachable bridge marks the link unreachable with a fixed message", async () => {
    on();
    gw = installFakeMetaApi({ mode: "network" });
    const t = await trader();
    const { conn } = await linkMt5(t);
    const stats = await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(stats.failed).toBe(1);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ liveStatus: "unreachable", lastLiveError: MT5_LIVE_MESSAGES.readUnreachable });
  });

  it("a link whose login can now trade is marked rejected and nothing more is read from it", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR] });
    const t = await trader();
    const { conn } = await linkMt5(t, { kind: "master" });
    const stats = await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(stats.rejected).toBe(1);
    expect(gw.count("GET", "/positions")).toBe(0);
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ liveStatus: "rejected", lastLiveError: MT5_LIVE_MESSAGES.readRejected });
  });

  it("a link the bridge no longer knows is marked rejected (reconnect needed)", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    const { conn, bridgeId } = await linkMt5(t);
    gw.accounts.delete(bridgeId);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).liveStatus).toBe("rejected");
  });

  it("a trader who has dropped to a free plan is no longer read (paid plans only)", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR] });
    const t = await trader("free", "active", "downgraded");
    await linkMt5(t);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(gw.calls).toHaveLength(0);
  });

  it("when a position closes, the fills are fetched at once through the same budget", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR], deals: [] });
    const t = await trader();
    const { conn } = await linkMt5(t);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    gw.state.positions = [];
    gw.state.deals = recordedDeals();
    const budget = new CallBudget(100, () => 61_000);
    const stats = await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget });
    expect(stats.fillSyncs).toBe(1);
    expect(budget.used()).toBe(4); // account info + positions, then the sync's account check + one page of deals
    expect(await prisma.trade.count({ where: { userId: t.userId, accountId: conn.accountId } })).toBe(6);
  });

  it("a trader's MT5 read never touches another trader's data", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EUR] });
    const a = await trader("pro", "active", "iso-a");
    const b = await trader("pro", "active", "iso-b");
    const linkA = await linkMt5(a);
    const linkB = await linkMt5(b);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    const snapA = await prisma.positionSnapshot.findMany({ where: { userId: a.userId } });
    const snapB = await prisma.positionSnapshot.findMany({ where: { userId: b.userId } });
    expect(snapA.every((s) => s.connectionId === linkA.conn.id)).toBe(true);
    expect(snapB.every((s) => s.connectionId === linkB.conn.id)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// 8. User isolation, disconnect and account deletion
// --------------------------------------------------------------------------

describe("each trader sees and removes only their own MT5 links", () => {
  it("the connection list shows only my links; another trader's disconnect gets a 404 and removes nothing", async () => {
    on();
    gw = installFakeMetaApi();
    const a = await trader("pro", "active", "own-a");
    const b = await trader("pro", "active", "own-b");
    const linkA = await linkMt5(a);
    await linkMt5(b);
    const connectors = await import("@/app/api/connectors/route");

    asUser(b);
    const list = (await (await connectors.GET()).json()) as { connections: { id: string }[] };
    expect(list.connections).toHaveLength(1);
    expect(list.connections.map((c) => c.id)).not.toContain(linkA.conn.id);

    const del = await connectors.DELETE(
      new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: linkA.conn.id }) })
    );
    expect(del.status).toBe(404);
    expect(gw.accounts.has(linkA.bridgeId)).toBe(true); // A's bridge account untouched
    expect(gw.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
    expect(await prisma.brokerConnection.findUnique({ where: { id: linkA.conn.id } })).not.toBeNull();
  });

  it("each trader has their own 2-account allowance", async () => {
    on();
    gw = installFakeMetaApi();
    const a = await trader("pro", "active", "quota-a");
    const b = await trader("pro", "active", "quota-b");
    await linkMt5(a);
    await linkMt5(a);
    asUser(b);
    expect((await postMt5(goodBody())).status).toBe(200);
  });

  it("disconnecting removes the MetaApi account (and so the password held there) before the link", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    const { conn, bridgeId } = await linkMt5(t);
    asUser(t);
    const connectors = await import("@/app/api/connectors/route");
    const res = await connectors.DELETE(
      new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: conn.id }) })
    );
    expect(res.status).toBe(200);
    expect(gw.accounts.has(bridgeId)).toBe(false);
    expect(gw.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(await prisma.brokerConnection.findUnique({ where: { id: conn.id } })).toBeNull();
    // the journal account and its trades stay
    expect(await prisma.tradingAccount.count({ where: { userId: t.userId, broker: "mt5" } })).toBe(1);
  });

  it("if MetaApi does not confirm the removal, the link is kept and the trader is told to retry", async () => {
    on();
    gw = installFakeMetaApi({ mode: "delete-fails" });
    const t = await trader();
    const { conn } = await linkMt5(t);
    asUser(t);
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    const connectors = await import("@/app/api/connectors/route");
    const res = await connectors.DELETE(
      new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: conn.id }) })
    );
    vi.stubGlobal("setTimeout", realSleep);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(MT5_LIVE_MESSAGES.cleanupFailed);
    expect(await prisma.brokerConnection.findUnique({ where: { id: conn.id } })).not.toBeNull();
  });

  it("deleting the whole account removes every MetaApi account first", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("pro", "active", "wipe");
    const one = await linkMt5(t);
    const two = await linkMt5(t);
    asUser(t);
    const route = await import("@/app/api/profile/delete/route");
    const res = await route.POST(
      new Request("http://localhost/api/profile/delete", { method: "POST", body: JSON.stringify({ password: "whatever" }) })
    );
    expect(res.status).toBe(200);
    expect(gw.accounts.has(one.bridgeId)).toBe(false);
    expect(gw.accounts.has(two.bridgeId)).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: t.userId } })).toBeNull();
    userIds.splice(userIds.indexOf(t.userId), 1); // already gone: the file's clean-up has nothing to delete
  });

  it("if MetaApi will not confirm, the whole-account deletion still goes ahead and the MetaApi ids are logged for the owner", async () => {
    on();
    gw = installFakeMetaApi({ mode: "delete-fails" });
    const t = await trader("pro", "active", "wipe-fail");
    await linkMt5(t);
    asUser(t);
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    const link = await prisma.brokerConnection.findFirstOrThrow({ where: { userId: t.userId } });
    const route = await import("@/app/api/profile/delete/route");
    const res = await route.POST(
      new Request("http://localhost/api/profile/delete", { method: "POST", body: JSON.stringify({ password: "whatever" }) })
    );
    vi.stubGlobal("setTimeout", realSleep);
    expect(res.status).toBe(200); // the trader is not trapped
    expect(await prisma.user.findUnique({ where: { id: t.userId } })).toBeNull();
    userIds.splice(userIds.indexOf(t.userId), 1);
    const line = logs.find((l) => l.includes("[account-delete]"));
    expect(line).toContain(link.externalAccountId); // the owner can remove it by hand
    expect(logs.join("\n")).not.toContain(FAKE_MT_TOKEN);
  });

  it("the demo desk is refused (even with the switch on) and nothing is called", async () => {
    on();
    gw = installFakeMetaApi();
    session.current = { id: "demo-id", email: DEMO_EMAIL, plan: "elite", billingStatus: "active" };
    const res = await postMt5(goodBody());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("demo");
    expect(gw.calls).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// 9. THE SAFETY LINE: read-only, no order function, no order address, fixed hosts
// --------------------------------------------------------------------------

const connectorsDir = fileURLToPath(new URL("../src/lib/connectors", import.meta.url));
const metaSource = readFileSync(`${connectorsDir}/metaapi.ts`, "utf8");

describe("the MetaApi adapter can only read (plus create and delete its own bridge account)", () => {
  it("exports nothing that places, changes, cancels or closes", () => {
    for (const name of Object.keys(metaapi)) {
      expect(name, `metaapi.ts exports "${name}"`).not.toMatch(FORBIDDEN_NAME);
    }
    for (const mod of ["mt5-access", "sync", "firms"]) {
      const src = readFileSync(`${connectorsDir}/${mod}.ts`, "utf8");
      for (const m of src.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)) {
        expect(m[1], `${mod}.ts exports "${m[1]}"`).not.toMatch(FORBIDDEN_NAME);
      }
    }
  });

  it("the allow-list is exactly three reads and the two bridge-account writes", () => {
    expect(
      Object.values(ALLOWED_ROUTES)
        .map((r) => `${r.api} ${r.method} ${r.path}`)
        .sort()
    ).toEqual(
      [
        "client GET /users/current/accounts/:id/account-information",
        "client GET /users/current/accounts/:id/history-deals/time/:from/:to",
        "client GET /users/current/accounts/:id/positions",
        "provisioning DELETE /users/current/accounts/:id",
        "provisioning POST /users/current/accounts",
      ].sort()
    );
    // The only non-GET routes touch the bridge account, never an order or a position.
    for (const r of Object.values(ALLOWED_ROUTES)) {
      if (r.method !== "GET") expect(r.api).toBe("provisioning");
    }
  });

  it("the source names no trading address: every path it spells is on the allow-list", () => {
    const allowed = new Set<string>(Object.values(ALLOWED_ROUTES).map((r) => r.path));
    const spelled = [...metaSource.matchAll(/["'`](\/users\/current\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect(spelled.length).toBeGreaterThan(0);
    for (const p of spelled) expect(allowed.has(p), `metaapi.ts names ${p}`).toBe(true);
    // MetaApi's trade-placing address and the order/symbol routes appear nowhere in the code.
    const code = metaSource.replace(/\/\/.*$/gm, "");
    for (const bad of [/\/trade\b/i, /history-orders/i, /\/orders?\b/i, /\/symbols/i, /current-(price|tick|book|candles)/i, /\/positions\/:/, /closePosition|closeBy|partialClose/i]) {
      expect(code, String(bad)).not.toMatch(bad);
    }
  });

  it("no other source file names a MetaApi path or host", () => {
    const dirs = ["../src/lib", "../src/app", "../src/components"];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []
      );
    for (const d of dirs) {
      for (const f of walk(fileURLToPath(new URL(d, import.meta.url)))) {
        if (f.endsWith("/connectors/metaapi.ts") || f.endsWith("/connectors/firms.ts")) continue;
        const src = readFileSync(f, "utf8");
        expect(src, f).not.toMatch(/agiliumtrade/);
        expect(src, f).not.toMatch(/\/users\/current\//);
      }
    }
  });

  it("a full connect, read, sync and disconnect only ever makes allow-listed requests to the MetaApi hosts", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals(), positions: [{ id: "9001", type: "POSITION_TYPE_BUY", symbol: "EURUSD", volume: 1, openPrice: 1.08, currentPrice: 1.085, unrealizedProfit: 500 }] });
    const t = await trader();
    asUser(t);
    const res = await postMt5(goodBody());
    const connId = (await res.json()).connectionId as string;
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    await syncConnection(connId, t.userId);
    const connectors = await import("@/app/api/connectors/route");
    await connectors.DELETE(new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: connId }) }));

    expect(gw.violations).toEqual([]);
    expect(gw.calls.length).toBeGreaterThan(6);
    const hosts = new Set(gw.calls.map((c) => c.host));
    for (const h of hosts) expect(METAAPI_HOSTS).toContain(h);
    // reads go to the client host, the two writes to the provisioning host
    for (const c of gw.calls) {
      expect(c.redirect).toBe("error");
      if (c.method === "GET") expect(c.host).toBe(METAAPI_CLIENT_HOST);
      else expect(c.host).toBe(METAAPI_PROVISIONING_HOST);
    }
    expect(new Set(gw.calls.map((c) => c.method))).toEqual(new Set(["GET", "POST", "DELETE"]));
    expect(gw.calls.filter((c) => c.method === "POST").every((c) => c.path === "/users/current/accounts")).toBe(true);
  });

  it("while on, the host list is the registry plus exactly the two MetaApi hosts, and nothing else passes", () => {
    on();
    expect([...allowedHosts()].sort()).toEqual([...ALLOWED_HOSTS, ...METAAPI_HOSTS].sort());
    expect(METAAPI_HOSTS).toEqual(["mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai", "mt-client-api-v1.new-york.agiliumtrade.ai"]);
    expect(isAllowedBaseUrl(`https://${METAAPI_CLIENT_HOST}`)).toBe(true);
    expect(isAllowedBaseUrl(`https://${METAAPI_PROVISIONING_HOST}`)).toBe(true);
    for (const bad of [
      "https://mt-client-api-v1.london.agiliumtrade.ai",
      "https://agiliumtrade.ai",
      `https://${METAAPI_CLIENT_HOST}.evil.example`,
      `http://${METAAPI_CLIENT_HOST}`,
      `https://user:pw@${METAAPI_CLIENT_HOST}`,
      "https://mt-client-api-v1.new-york.agiliumtrade.ai?x=1",
    ]) {
      expect(isAllowedBaseUrl(bad), bad).toBe(false);
    }
    expect(getFirm("mt5")).toBe(MT5_FIRM);
    // The static list the TopstepX flow uses never gains a MetaApi host.
    expect(FIRMS.map((f) => f.id)).toEqual(["topstepx"]);
    for (const h of METAAPI_HOSTS) expect(ALLOWED_HOSTS.has(h)).toBe(false);
  });

  it("a request is refused before the network when the switch is off (no token to send)", async () => {
    gw = installFakeMetaApi();
    gw.accounts.set("a1", "investor");
    await expect(maReadPositions("a1")).rejects.toMatchObject({ code: "off" });
    await expect(maReadPositions("../../x")).rejects.toBeInstanceOf(MetaApiError);
    expect(gw.calls).toHaveLength(0);
  });

  it("an account id that could smuggle a path is refused before any request", async () => {
    on();
    gw = installFakeMetaApi();
    for (const bad of ["../trade", "a/b", "a?x=1", "", "x".repeat(65), "a b"]) {
      await expect(maReadPositions(bad), bad).rejects.toBeInstanceOf(MetaApiError);
    }
    expect(gw.calls).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// 10. Keys never logged or returned
// --------------------------------------------------------------------------

describe("passwords and the MetaApi token never reach a response, a log or the database", () => {
  it("connect, refusal, poll, sync, list and disconnect leave no trace of any secret", async () => {
    on();
    gw = installFakeMetaApi({
      deals: recordedDeals(),
      positions: [{ id: "9001", type: "POSITION_TYPE_BUY", symbol: "EURUSD", volume: 1, openPrice: 1.08, currentPrice: 1.085, unrealizedProfit: 500 }],
    });
    const t = await trader("pro", "active", "secrets");
    asUser(t);
    const responses: string[] = [];
    const take = async (r: Response) => {
      responses.push(await r.clone().text());
      return r;
    };
    const connectors = await import("@/app/api/connectors/route");
    const alertsRoute = await import("@/app/api/alerts/route");

    // A refused master password, then a good connect.
    gw.state.passwordKind = "master";
    await take(await postMt5(goodBody({ password: FAKE_MASTER_PASSWORD })));
    gw.state.passwordKind = "investor";
    const ok = await take(await postMt5(goodBody()));
    const connId = (await ok.clone().json()).connectionId as string;
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    gw.state.mode = "network";
    await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget: new CallBudget(100, () => 61_000) });
    gw.state.mode = "ok";
    await syncConnection(connId, t.userId).catch(() => undefined);
    await take(await connectors.GET());
    await take(await alertsRoute.GET());
    await take(await connectors.DELETE(new Request("http://localhost/api/connectors", { method: "DELETE", body: JSON.stringify({ id: connId }) })));

    expect(responses.length).toBeGreaterThanOrEqual(5);
    const secrets = [FAKE_INVESTOR_PASSWORD, FAKE_MASTER_PASSWORD, FAKE_MT_TOKEN];
    for (const body of responses) {
      for (const s of secrets) expect(body).not.toContain(s);
      expect(body).not.toContain("apiKeyEnc");
    }
    for (const line of logs) for (const s of secrets) expect(line).not.toContain(s);

    // Nothing is stored: not in any connection row, trading account, trade, snapshot or alert.
    const linkRows = await prisma.brokerConnection.findMany({ where: { userId: t.userId } });
    const dump = JSON.stringify([
      linkRows,
      await prisma.tradingAccount.findMany({ where: { userId: t.userId } }),
      await prisma.trade.findMany({ where: { userId: t.userId } }),
      await prisma.positionSnapshot.findMany({ where: { userId: t.userId } }),
      await prisma.alert.findMany({ where: { userId: t.userId } }),
    ]);
    for (const s of secrets) expect(dump).not.toContain(s);

    // The token travels only in the auth-token header; a password only in the create body.
    for (const c of gw.calls) {
      expect(JSON.stringify(c.body)).not.toContain(FAKE_MT_TOKEN);
      expect(c.url).not.toContain(FAKE_MT_TOKEN);
      expect(c.url).not.toContain(FAKE_INVESTOR_PASSWORD);
      if (c.method !== "POST") expect(JSON.stringify(c.body)).not.toMatch(/password/i);
    }
  });

  it("a stored link's key column holds only the encrypted marker, never a password", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader();
    asUser(t);
    await postMt5(goodBody());
    const row = await prisma.brokerConnection.findFirstOrThrow({ where: { userId: t.userId } });
    expect(row.apiKeyEnc).toMatch(/^v1:/);
    expect(row.apiKeyEnc).not.toContain(FAKE_INVESTOR_PASSWORD);
  });
});

// --------------------------------------------------------------------------
// Fix round: lost create answers, rejected links, attaching to an existing account,
// plan end, and the honest clean-up logs
// --------------------------------------------------------------------------

const instantSleep = async () => {};
const ACCOUNT_NAME = /TradeOS [0-9a-f]{8}/;

describe("creating the bridge account when the answer is lost (no stranded account)", () => {
  it("a lost answer is recovered with the SAME transaction id: the account id is learned and nothing is left behind", async () => {
    on();
    gw = installFakeMetaApi({ lostCreateResponses: 1 });
    const id = await maProvisionAccount(
      { login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD },
      { sleep: instantSleep }
    );
    expect(gw.accounts.has(id)).toBe(true);
    expect(gw.accounts.size).toBe(1); // a repeat made no second account
    const posts = gw.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(new Set(posts.map((c) => c.headers["transaction-id"])).size).toBe(1);
  });

  it("a lost answer for a MASTER password: the account is found and deleted by the investor check", async () => {
    on();
    gw = installFakeMetaApi({ lostCreateResponses: 1, passwordKind: "master" });
    await expect(
      maConnectInvestor({ login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_MASTER_PASSWORD }, { sleep: instantSleep })
    ).rejects.toMatchObject({ code: "trading_rights" });
    expect(gw.accounts.size).toBe(0); // not stranded
  });

  it("six 'still checking' answers, then a recovery round that learns the id", async () => {
    on();
    gw = installFakeMetaApi({ pendingCreates: 6 });
    const id = await maProvisionAccount(
      { login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD },
      { sleep: instantSleep }
    );
    expect(gw.accounts.has(id)).toBe(true);
    const posts = gw.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(7);
    expect(new Set(posts.map((c) => c.headers["transaction-id"])).size).toBe(1);
  });

  it("if the id still cannot be learned, the account NAME (never the password) is logged for the owner", async () => {
    on();
    gw = installFakeMetaApi({ mode: "network" });
    await expect(
      maProvisionAccount({ login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_MASTER_PASSWORD }, { sleep: instantSleep })
    ).rejects.toMatchObject({ code: "bridge_down" });
    const posts = gw.calls.filter((c) => c.method === "POST");
    expect(posts.length).toBe(4); // the first try plus three recovery tries
    expect(new Set(posts.map((c) => c.headers["transaction-id"])).size).toBe(1);
    const sentName = String(posts[0].body.name);
    expect(sentName).toMatch(ACCOUNT_NAME);
    const line = logs.find((l) => l.includes("could not confirm whether a bridge account was created"));
    expect(line).toContain(sentName);
    const all = logs.join("\n");
    expect(all).not.toContain(FAKE_MASTER_PASSWORD);
    expect(all).not.toContain(FAKE_MT_TOKEN);
  });

  it("a clear 'no' from MetaApi (wrong login) needs no recovery and logs nothing", async () => {
    on();
    gw = installFakeMetaApi({ mode: "bad-login" });
    await expect(
      maProvisionAccount({ login: FAKE_LOGIN, server: FAKE_SERVER, password: FAKE_INVESTOR_PASSWORD }, { sleep: instantSleep })
    ).rejects.toMatchObject({ code: "bad_login" });
    expect(gw.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(logs.some((l) => l.includes("could not confirm"))).toBe(false);
  });
});

describe("a link whose login can trade is deleted at MetaApi and never read again", () => {
  it("the live read: the bridge account is deleted, the link rejected, and the sweep skips it", async () => {
    on();
    gw = installFakeMetaApi({ positions: [] });
    const t = await trader("pro", "active", "reject-live");
    const { conn, bridgeId } = await linkMt5(t, { kind: "master" });
    const stats = await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });
    expect(stats.rejected).toBe(1);
    expect(gw.accounts.has(bridgeId)).toBe(false); // deleted, not just marked
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ liveStatus: "rejected", lastLiveError: MT5_LIVE_MESSAGES.readRejected });
    const readable = await prisma.brokerConnection.findMany({
      where: { ...readableConnectionsWhere(), userId: t.userId },
    });
    expect(readable).toHaveLength(0); // a rejected link is not readable
    const calls = gw.calls.length;
    await runLiveTick({ now: new Date(T0.getTime() + 120_000), budget: new CallBudget(100, () => 0) });
    expect(gw.calls.length).toBe(calls); // not one more call
  });

  it("readableConnectionsWhere keeps a healthy MT5 link and drops a rejected one", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("pro", "active", "readable");
    const good = await linkMt5(t);
    const bad = await linkMt5(t);
    await prisma.brokerConnection.update({ where: { id: bad.conn.id }, data: { liveStatus: "rejected" } });
    const rows = await prisma.brokerConnection.findMany({
      where: { ...readableConnectionsWhere(), userId: t.userId },
      select: { id: true },
    });
    expect(rows.map((r) => r.id)).toEqual([good.conn.id]);
  });

  it("the history sync re-checks the investor flag BEFORE reading deals (even with near-live off)", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader("pro", "active", "reject-sync");
    const { conn, bridgeId } = await linkMt5(t, { kind: "master" });
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { nearLive: false } });
    await expect(syncConnection(conn.id, t.userId)).rejects.toBeInstanceOf(ConnectorError);
    expect(gw.count("GET", "/history-deals/")).toBe(0); // no deal was read
    expect(gw.accounts.has(bridgeId)).toBe(false); // the bridge account is gone
    const row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row).toMatchObject({ liveStatus: "rejected", lastError: MT5_LIVE_MESSAGES.readRejected });
    expect(await prisma.trade.count({ where: { userId: t.userId } })).toBe(0);
    // A rejected link is refused on the next sync without any call.
    const calls = gw.calls.length;
    await expect(syncConnection(conn.id, t.userId)).rejects.toBeInstanceOf(ConnectorError);
    expect(gw.calls.length).toBe(calls);
  });

  it("a read-only login passes the sync check and imports as before", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader("pro", "active", "ok-sync");
    const { conn } = await linkMt5(t);
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { nearLive: false } });
    expect((await syncConnection(conn.id, t.userId)).imported).toBe(6);
  });

  it("if MetaApi cannot delete it right then, the link is still rejected and the id is logged", async () => {
    on();
    gw = installFakeMetaApi({ mode: "delete-fails", deals: recordedDeals() });
    const t = await trader("pro", "active", "reject-fail");
    const { conn, bridgeId } = await linkMt5(t, { kind: "master" });
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    await expect(syncConnection(conn.id, t.userId)).rejects.toBeInstanceOf(ConnectorError);
    vi.stubGlobal("setTimeout", realSleep);
    expect((await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } })).liveStatus).toBe("rejected");
    expect(logs.join("\n")).toContain(bridgeId);
    expect(logs.join("\n")).not.toContain(FAKE_MT_TOKEN);
  });
});

describe("attaching the live link to a trading account that already holds the file import", () => {
  const fileTrade = (t: { userId: string }, accountId: string, id: string, quantity: number, symbol = "EURUSD") =>
    prisma.trade.create({
      data: {
        userId: t.userId,
        accountId,
        symbol,
        side: "long",
        entryPrice: 1.08,
        exitPrice: 1.085,
        quantity,
        entryTime: new Date("2026-09-14T08:00:00.000Z"),
        exitTime: new Date("2026-09-14T12:30:00.000Z"),
        fees: 8.2,
        pnl: 491.8,
        pnlGross: 500,
        source: "csv",
        externalId: id,
        isWin: true,
      },
    });

  it("a position already imported from the MT5 file is not counted again by the live link", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader("pro", "active", "attach");
    const mine = await prisma.tradingAccount.create({
      data: { userId: t.userId, name: "My MT5 file account", broker: "mt5", currency: "USD" },
    });
    await fileTrade(t, mine.id, "mt5:7001", 1);
    // The file also holds the WHOLE 7004 position as one trade (1 lot): the live link's second close must not add to it.
    await fileTrade(t, mine.id, "mt5:7004", 1, "GBPUSD");
    asUser(t);
    const res = await postMt5(goodBody({ accountId: mine.id }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.accountId).toBe(mine.id);
    // No extra "MT5 <login>" account was made; the link points at the chosen account.
    expect(await prisma.tradingAccount.count({ where: { userId: t.userId } })).toBe(2);
    expect(await prisma.tradingAccount.count({ where: { userId: t.userId, name: { startsWith: "MT5 " } } })).toBe(0);
    const conn = await prisma.brokerConnection.findFirstOrThrow({ where: { userId: t.userId } });
    expect(conn.accountId).toBe(mine.id);
    // 6 live trades, minus 7001 (already there) and 7004 / 7004:2 (the file holds the whole position) = 3 new + 2 file.
    const ids = (await prisma.trade.findMany({ where: { accountId: mine.id }, orderBy: { externalId: "asc" } })).map(
      (x) => x.externalId
    );
    expect(ids).toEqual(["mt5:7001", "mt5:7002", "mt5:7003", "mt5:7004", "mt5:7005"]);
    // The file's own rows are untouched.
    const first = await prisma.trade.findFirstOrThrow({ where: { accountId: mine.id, externalId: "mt5:7001" } });
    expect(first.source).toBe("csv");
    // Syncing again changes nothing.
    const again = await syncConnection(conn.id, t.userId);
    expect(again.imported).toBe(0);
    expect(await prisma.trade.count({ where: { accountId: mine.id } })).toBe(5);
  });

  it("without a chosen account a new 'MT5 <login>' account is made, as before", async () => {
    on();
    gw = installFakeMetaApi({ deals: recordedDeals() });
    const t = await trader("pro", "active", "attach-new");
    asUser(t);
    const res = await postMt5(goodBody());
    expect(res.status).toBe(200);
    expect(await prisma.tradingAccount.count({ where: { userId: t.userId, name: `MT5 ${FAKE_LOGIN}` } })).toBe(1);
  });

  it("someone else's account id is refused (404) before any call to MetaApi", async () => {
    on();
    gw = installFakeMetaApi();
    const a = await trader("pro", "active", "attach-a");
    const b = await trader("pro", "active", "attach-b");
    asUser(a);
    const res = await postMt5(goodBody({ accountId: b.accountId }));
    expect(res.status).toBe(404);
    expect(gw.calls).toHaveLength(0);
    expect(await prisma.brokerConnection.count({ where: { userId: { in: [a.userId, b.userId] } } })).toBe(0);
  });

  it("an account already linked to a broker, or not in US dollars, is refused before any call", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("pro", "active", "attach-bad");
    const linked = await linkMt5(t);
    const eur = await prisma.tradingAccount.create({
      data: { userId: t.userId, name: "EUR account", broker: "mt5", currency: "EUR" },
    });
    asUser(t);
    const callsBefore = gw.calls.length;
    const r1 = await postMt5(goodBody({ accountId: linked.accountId, login: "777001" }));
    expect(r1.status).toBe(409);
    const r2 = await postMt5(goodBody({ accountId: eur.id, login: "777002" }));
    expect(r2.status).toBe(422);
    expect(gw.calls.length).toBe(callsBefore);
  });

  it("if saving the link fails after the bridge account is made, the bridge account goes but the chosen account stays", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("pro", "active", "attach-keep");
    const mine = await prisma.tradingAccount.create({
      data: { userId: t.userId, name: "Keep me", broker: "mt5", currency: "USD" },
    });
    await fileTrade(t, mine.id, "mt5:1", 1);
    // Make the save fail: another link grabs this account while the bridge account is being made.
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await real(input, init);
      if ((init?.method ?? "GET") === "POST") {
        await prisma.brokerConnection.create({
          data: {
            userId: t.userId, accountId: mine.id, broker: "mt5", username: "1", apiKeyEnc: "x",
            externalAccountId: "someone-else", externalAccountName: "x · 1",
          },
        });
      }
      return res;
    }) as typeof fetch);
    asUser(t);
    const res = await postMt5(goodBody({ accountId: mine.id, login: "888001" }));
    expect(res.status).toBe(500);
    expect(gw.accounts.size).toBe(0); // the bridge account was removed again
    expect(await prisma.tradingAccount.findUnique({ where: { id: mine.id } })).not.toBeNull();
    expect(await prisma.trade.count({ where: { accountId: mine.id } })).toBe(1);
  });
});

describe("a plan that ends removes the bridge account; honest clean-up logs", () => {
  it("mt5PlanEnded: a free plan or a cancelled one ends it; a failed payment (past_due) only pauses", () => {
    expect(mt5PlanEnded({ plan: "free", billingStatus: "canceled" })).toBe(true);
    expect(mt5PlanEnded({ plan: "free", billingStatus: "active" })).toBe(true);
    expect(mt5PlanEnded({ plan: "pro", billingStatus: "canceled" })).toBe(true);
    expect(mt5PlanEnded({ plan: "pro", billingStatus: "past_due" })).toBe(false);
    expect(mt5PlanEnded({ plan: "elite", billingStatus: "active" })).toBe(false);
  });

  it("removeMt5LinksForUser deletes the bridge account and the link; the journal account and trades stay", async () => {
    on();
    gw = installFakeMetaApi();
    const t = await trader("free", "canceled", "ended");
    const one = await linkMt5(t);
    await prisma.trade.create({
      data: {
        userId: t.userId, accountId: one.accountId, symbol: "EURUSD", side: "long", entryPrice: 1, exitPrice: 1.1,
        quantity: 1, entryTime: T0, exitTime: T0, pnl: 10, source: "api", externalId: "mt5:1",
      },
    });
    const r = await removeMt5LinksForUser(t.userId);
    expect(r).toEqual({ removed: 1, kept: 0 });
    expect(gw.accounts.has(one.bridgeId)).toBe(false);
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(0);
    expect(await prisma.tradingAccount.findUnique({ where: { id: one.accountId } })).not.toBeNull();
    expect(await prisma.trade.count({ where: { accountId: one.accountId } })).toBe(1);
  });

  it("if MetaApi will not confirm, the link is kept (so the sweep can retry) and the id is logged", async () => {
    on();
    gw = installFakeMetaApi({ mode: "delete-fails" });
    const t = await trader("free", "canceled", "ended-fail");
    const one = await linkMt5(t);
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    const r = await removeMt5LinksForUser(t.userId);
    vi.stubGlobal("setTimeout", realSleep);
    expect(r).toEqual({ removed: 0, kept: 1 });
    expect(await prisma.brokerConnection.count({ where: { userId: t.userId } })).toBe(1);
    expect(logs.join("\n")).toContain(one.bridgeId);
  });

  it("the 30-minute sweep retries ended plans only (a paid, or merely past_due, trader is untouched)", async () => {
    on();
    gw = installFakeMetaApi();
    const ended = await trader("free", "active", "sweep-ended");
    const paid = await trader("pro", "active", "sweep-paid");
    const late = await trader("pro", "past_due", "sweep-late");
    const e = await linkMt5(ended);
    const p = await linkMt5(paid);
    const l = await linkMt5(late);
    expect(await removeEndedMt5Links()).toBe(1);
    expect(gw.accounts.has(e.bridgeId)).toBe(false);
    expect(gw.accounts.has(p.bridgeId)).toBe(true);
    expect(gw.accounts.has(l.bridgeId)).toBe(true);
    // With no token on this server nothing is attempted.
    off();
    expect(await removeEndedMt5Links()).toBe(0);
  });

  it("with no MetaApi token, 'skipped' is logged with the account id so the owner can remove it", async () => {
    off();
    const r = await removeBridgeAccounts(["acct-leftover-1", "acct-leftover-2"], {});
    expect(r).toBe("skipped");
    const line = logs.find((l) => l.includes("NOT removed"));
    expect(line).toContain("acct-leftover-1");
    expect(line).toContain("acct-leftover-2");
  });

  it("every account is tried even when the first fails, and the failed ids are reported", async () => {
    on();
    gw = installFakeMetaApi();
    gw.accounts.set("good-1", "investor");
    const realSleep = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void) => realSleep(fn, 0)) as unknown as typeof setTimeout);
    gw.state.mode = "delete-fails";
    const bad = await removeBridgeAccountsReport(["good-1"], { METAAPI_TOKEN: FAKE_MT_TOKEN });
    vi.stubGlobal("setTimeout", realSleep);
    expect(bad).toEqual({ result: "failed", failed: ["good-1"] });
    gw.state.mode = "ok";
    expect(await removeBridgeAccountsReport(["good-1"], { METAAPI_TOKEN: FAKE_MT_TOKEN })).toEqual({
      result: "removed",
      failed: [],
    });
  });
});

describe("MT5 partial closes keep the loss counted all the way through (live read to trade)", () => {
  const EURPOS = { id: "9101", type: "POSITION_TYPE_BUY", symbol: "EURUSD", volume: 2, openPrice: 1.1, currentPrice: 1.096, unrealizedProfit: -800 } as const;

  it("a 2-lot position closed 1 lot at -$400: the pending loss is held, then that lot's own trade replaces it", async () => {
    on();
    gw = installFakeMetaApi({ positions: [EURPOS], deals: [] });
    const t = await trader("pro", "active", "partial");
    const { conn, accountId } = await linkMt5(t);
    await runLiveTick({ now: T0, budget: new CallBudget(100, () => 0) });

    // 1 of the 2 lots closes at the broker; the bridge shows 1 lot open (-$400) and no deal yet.
    gw.state.positions = [{ ...EURPOS, volume: 1, unrealizedProfit: -400 }];
    await runLiveTick({ now: new Date(T0.getTime() + 61_000), budget: new CallBudget(100, () => 61_000) });
    let row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.pendingCloseLoss).toBe(-400);
    const items = JSON.parse(row.pendingCloseItems ?? "[]");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "9101", ext: "mt5:9101", symbol: "EURUSD", side: "long", size: 1, loss: -400 });

    // The deal for that lot arrives (a partial close is a trade now): the loss moves from pending to realized.
    gw.state.deals = [
      deal("9101", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 2, 1.1, new Date(T0.getTime() - 3600_000).toISOString()),
      deal("9101", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.096, new Date(T0.getTime() + 30_000).toISOString(), {
        profit: -400,
      }),
    ];
    await runLiveTick({ now: new Date(T0.getTime() + 122_000), budget: new CallBudget(100, () => 122_000) });
    const trades = await prisma.trade.findMany({ where: { accountId } });
    expect(trades.map((x) => [x.externalId, x.quantity, x.pnl])).toEqual([["mt5:9101", 1, -400]]);
    row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    // Next read tidies the pending item away (its own trade has landed); the remaining lot stays open.
    await runLiveTick({ now: new Date(T0.getTime() + 183_000), budget: new CallBudget(100, () => 183_000) });
    row = await prisma.brokerConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.pendingCloseItems).toBeNull();
    expect(row.pendingCloseLoss).toBeNull();
  });
});
