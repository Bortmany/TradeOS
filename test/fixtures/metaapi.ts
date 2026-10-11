// Recorded-style MetaApi responses and a faked network for the MT5 tests. NOTHING
// here touches a real network, a funded account or a personal account:
// `installFakeMetaApi` replaces global fetch, records every request, and logs as a
// violation any host that is not a MetaApi host, any request that is not on the
// adapter's allow-list, any redirect mode other than "error", and a missing or
// wrong token. Response shapes follow MetaApi's own documentation pages
// (createAccount 201/202/400, account-information, positions, history-deals).

import { vi } from "vitest";
import { METAAPI_HOSTS } from "@/lib/connectors/firms";
import { ALLOWED_ROUTES } from "@/lib/connectors/metaapi";

export const FAKE_MT_TOKEN = "FAKEMETAAPITOKEN-do-not-leak-a41f";
export const FAKE_INVESTOR_PASSWORD = "FAKEINVESTORPW-do-not-leak-3c9e";
export const FAKE_MASTER_PASSWORD = "FAKEMASTERPW-do-not-leak-91d7";
export const FAKE_SERVER = "ICMarketsSC-Demo";
export const FAKE_LOGIN = "51234567";

/** Env that switches the MT5 link on (test only: a fake token). */
export const MT5_ON = { METAAPI_ENABLED: "true", METAAPI_TOKEN: FAKE_MT_TOKEN } as const;

export interface FakePosition {
  id: string;
  type: "POSITION_TYPE_BUY" | "POSITION_TYPE_SELL";
  symbol: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  unrealizedProfit: number;
}

export interface MetaState {
  /** Which password the next created account "used": the read-only one, or the trading (master) one. */
  passwordKind: "investor" | "master";
  currency: string;
  /** Omit the flag entirely (an old account type that never reports it). */
  omitInvestorMode: boolean;
  balance: number;
  equity: number;
  positions: FakePosition[];
  deals: Record<string, unknown>[];
  /** How the network behaves right now. */
  mode: "ok" | "network" | "rate-limit" | "bad-login" | "server-missing" | "token-refused" | "delete-fails";
  /** The create call answers 202 this many times before 201. */
  pendingCreates: number;
  /** The next this-many create calls MAKE the account but the answer is lost (a timeout). */
  lostCreateResponses: number;
  /** account-information answers 504 this many times before working. */
  notReadyReads: number;
  synchronizing: boolean;
  retryAfter?: string;
}

export interface MetaCall {
  url: string;
  host: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  redirect?: string;
}

export function installFakeMetaApi(initial: Partial<MetaState> = {}) {
  const state: MetaState = {
    passwordKind: "investor",
    currency: "USD",
    omitInvestorMode: false,
    balance: 10_000,
    equity: 10_000,
    positions: [],
    deals: [],
    mode: "ok",
    pendingCreates: 0,
    lostCreateResponses: 0,
    notReadyReads: 0,
    synchronizing: false,
    ...initial,
  };
  const calls: MetaCall[] = [];
  const violations: string[] = [];
  /** account id -> the kind of password it was created with (live accounts only). */
  const accounts = new Map<string, "investor" | "master">();
  /** transaction id -> the account it made (MetaApi hands the same account back for a repeated id). */
  const byTransaction = new Map<string, string>();
  let seq = 0;

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  // The allow-list as patterns, built from the adapter's own table.
  const patterns = Object.values(ALLOWED_ROUTES).map((r) => ({
    method: r.method,
    re: new RegExp("^" + r.path.replace(/:\w+/g, "[^/]+") + "$"),
  }));

  const fake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url: url.href, host: url.hostname, path: url.pathname, method, body, headers, redirect: init?.redirect });

    if (!METAAPI_HOSTS.includes(url.hostname)) violations.push(`host ${url.hostname}`);
    if (!patterns.some((p) => p.method === method && p.re.test(url.pathname))) {
      violations.push(`route ${method} ${url.pathname}`);
    }
    if (init?.redirect !== "error") violations.push("redirect not refused");
    if (headers["auth-token"] !== FAKE_MT_TOKEN) violations.push("wrong or missing auth-token");
    if (url.protocol !== "https:") violations.push("not https");
    if (violations.length) throw new Error(`fake MetaApi refused: ${violations.join(", ")}`);

    if (state.mode === "network") throw new TypeError("fetch failed");
    if (state.mode === "rate-limit") {
      return json({}, 429, state.retryAfter ? { "retry-after": state.retryAfter } : {});
    }
    if (state.mode === "token-refused") return json({}, 401);

    // --- provisioning: create ---
    if (method === "POST" && url.pathname === "/users/current/accounts") {
      if (state.mode === "bad-login") {
        return json({
          id: 3,
          error: "ValidationError",
          message: "We failed to authenticate to your broker using credentials provided.",
          details: "E_AUTH",
        }, 400);
      }
      if (state.mode === "server-missing") {
        return json({
          id: 3,
          error: "ValidationError",
          message: ".dat file for server not found",
          details: { code: "E_SRV_NOT_FOUND", serversByBrokers: {} },
        }, 400);
      }
      const txn = headers["transaction-id"];
      if (txn && byTransaction.has(txn)) return json({ id: byTransaction.get(txn), state: "DEPLOYED" }, 201);
      if (state.pendingCreates > 0) {
        state.pendingCreates -= 1;
        return json({ message: "Automatic broker settings detection is in progress, please retry in 1 seconds" }, 202, {
          "retry-after": "1",
        });
      }
      seq += 1;
      const id = `acc-${seq}-aaaa-bbbb`;
      accounts.set(id, state.passwordKind);
      if (txn) byTransaction.set(txn, id);
      if (state.lostCreateResponses > 0) {
        state.lostCreateResponses -= 1;
        throw new TypeError("fetch failed"); // the account exists; the answer never arrived
      }
      return json({ id, state: "DEPLOYED" }, 201);
    }

    const m = /^\/users\/current\/accounts\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return json({}, 404);
    const id = m[1];
    const rest = m[2] ?? "";

    // --- provisioning: delete ---
    if (method === "DELETE") {
      if (state.mode === "delete-fails") return json({}, 500);
      if (!accounts.has(id)) return json({ message: "not found" }, 404);
      accounts.delete(id);
      return json(null, 204);
    }

    // --- client API reads ---
    if (!accounts.has(id)) return json({ message: "not found" }, 404);
    if (rest === "/account-information") {
      if (state.notReadyReads > 0) {
        state.notReadyReads -= 1;
        return json({ message: "account is not connected yet" }, 504);
      }
      const kind = accounts.get(id);
      return json({
        platform: "mt5",
        broker: "Raw Trading Ltd",
        currency: state.currency,
        server: FAKE_SERVER,
        balance: state.balance,
        equity: state.equity,
        margin: 0,
        freeMargin: state.equity,
        leverage: 500,
        tradeAllowed: kind === "master",
        ...(state.omitInvestorMode ? {} : { investorMode: kind === "investor" }),
        marginMode: "ACCOUNT_MARGIN_MODE_RETAIL_HEDGING",
        name: "Test Trader",
        login: Number(FAKE_LOGIN),
      });
    }
    if (rest === "/positions") {
      return json(
        state.positions.map((p) => ({
          platform: "mt5",
          magic: 0,
          time: "2026-10-02T14:03:10.400Z",
          updateTime: "2026-10-02T14:03:10.400Z",
          currentTickValue: 1,
          swap: 0,
          profit: p.unrealizedProfit,
          realizedProfit: 0,
          commission: 0,
          ...p,
        }))
      );
    }
    if (rest.startsWith("/history-deals/time/")) {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      return json({ historyDeals: state.deals.slice(offset, offset + limit), synchronizing: state.synchronizing });
    }
    return json({}, 404);
  });

  vi.stubGlobal("fetch", fake);
  const count = (method: string, pathPart: string) =>
    calls.filter((c) => c.method === method && c.path.includes(pathPart)).length;
  return { state, calls, violations, accounts, count, restore: () => vi.unstubAllGlobals() };
}

// --------------------------------------------------------------------------
// A recorded-style history: closed positions the expected trades are listed for.
// Times are the bridge's UTC `time`; commission and swap are negative costs.
// --------------------------------------------------------------------------

type DealType = "DEAL_TYPE_BUY" | "DEAL_TYPE_SELL";
type Entry = "DEAL_ENTRY_IN" | "DEAL_ENTRY_OUT" | "DEAL_ENTRY_INOUT";

let dealSeq = 1000;
export function deal(
  positionId: string,
  type: DealType,
  entryType: Entry,
  symbol: string,
  volume: number,
  price: number,
  time: string,
  extra: { commission?: number; swap?: number; profit?: number } = {}
) {
  dealSeq += 1;
  return {
    id: String(dealSeq),
    platform: "mt5",
    type,
    entryType,
    symbol,
    magic: 0,
    time,
    brokerTime: time.replace("T", " ").replace("Z", ""),
    volume,
    price,
    commission: extra.commission ?? 0,
    swap: extra.swap ?? 0,
    profit: extra.profit ?? 0,
    positionId,
    orderId: String(dealSeq + 5000),
    reason: "DEAL_REASON_CLIENT",
  };
}

export const BALANCE_DEAL = {
  id: "1001",
  platform: "mt5",
  type: "DEAL_TYPE_BALANCE",
  time: "2026-09-01T00:00:00.000Z",
  profit: 10000,
  commission: 0,
  swap: 0,
};

/** The deals fixture. Expected trades (USD) are in test/metaapi.test.ts. */
export function recordedDeals() {
  return [
    BALANCE_DEAL,
    // 7001 EURUSD long 1.00 lot: +0.0050 x 100000 = +500.00 gross
    deal("7001", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 1, 1.08, "2026-09-14T08:00:00.000Z", { commission: -3.5 }),
    deal("7001", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.085, "2026-09-14T12:30:00.000Z", {
      commission: -3.5,
      swap: -1.2,
      profit: 500,
    }),
    // 7002 USDJPY short 0.50 lot: 0.50 yen x 100000 x 0.5 = 25000 JPY = 167.22 USD at 149.50
    deal("7002", "DEAL_TYPE_SELL", "DEAL_ENTRY_IN", "USDJPY", 0.5, 150.0, "2026-09-15T01:15:00.000Z", { commission: -2.5 }),
    deal("7002", "DEAL_TYPE_BUY", "DEAL_ENTRY_OUT", "USDJPY", 0.5, 149.5, "2026-09-15T03:45:00.000Z", {
      commission: -2.5,
      profit: 167.22,
    }),
    // 7003 XAUUSD long 0.20 lot: 10.50 x 100 oz x 0.2 = +210.00
    deal("7003", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "XAUUSD", 0.2, 2300.0, "2026-09-16T13:00:00.000Z", { commission: -2 }),
    deal("7003", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "XAUUSD", 0.2, 2310.5, "2026-09-16T14:20:00.000Z", {
      commission: -2,
      swap: -0.5,
      profit: 210,
    }),
    // 7004 GBPUSD long 1.00 lot scaled out in two closes (0.4 at 1.3050, 0.6 at 1.3100)
    deal("7004", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "GBPUSD", 1, 1.3, "2026-09-17T09:00:00.000Z", { commission: -3.5 }),
    deal("7004", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "GBPUSD", 0.4, 1.305, "2026-09-17T10:00:00.000Z", {
      commission: -1.4,
      profit: 200,
    }),
    deal("7004", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "GBPUSD", 0.6, 1.31, "2026-09-17T11:00:00.000Z", {
      commission: -2.1,
      profit: 600,
    }),
    // 7005 EURUSD: 2 lots in, only 1 closed so far: still open, never made into a trade
    deal("7005", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "EURUSD", 2, 1.09, "2026-09-18T09:00:00.000Z", { commission: -7 }),
    deal("7005", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.092, "2026-09-18T10:00:00.000Z", {
      commission: -3.5,
      profit: 200,
    }),
    // 7006 BTCUSD: not in the instrument table: skipped by name
    deal("7006", "DEAL_TYPE_BUY", "DEAL_ENTRY_IN", "BTCUSD", 0.1, 60000, "2026-09-19T09:00:00.000Z"),
    deal("7006", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "BTCUSD", 0.1, 61000, "2026-09-19T10:00:00.000Z", { profit: 100 }),
    // 7007 opened before the history window (only the close is here): skipped by name
    deal("7007", "DEAL_TYPE_SELL", "DEAL_ENTRY_OUT", "EURUSD", 1, 1.07, "2026-09-20T10:00:00.000Z", { profit: -50 }),
  ];
}
