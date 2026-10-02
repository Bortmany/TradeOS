// TradeOS — MT5 live link through MetaApi (a cloud bridge). READ-ONLY, and
// SWITCHED OFF until the owner signs up with MetaApi (METAAPI_ENABLED=true plus a
// METAAPI_TOKEN; see src/lib/connectors/firms.ts `metaApiSwitchedOn`).
//
// SAFETY LINE: this module only reads positions, the account balance and closed
// deals. It has no function that places, changes or cancels an order or closes a
// position, and it never names MetaApi's trading address. The HTTP helper below
// refuses any route that is not on ALLOWED_ROUTES: three reads, plus creating and
// deleting the bridge account (the two writes, permitted by name; they change
// nothing at the broker). test/metaapi.test.ts proves it (export names, source
// text, every request a fake network sees).
//
// INVESTOR PASSWORD ONLY. MetaApi accepts either the read-only investor password
// or the master (trading) password. TradeOS asks for the investor one and, right
// after the bridge account is created, reads the account's own `investorMode`
// flag (MetaApi account-information; "investor password was used", cloud-g2
// accounts only). Anything but investorMode === true, or tradeAllowed === true,
// is refused and the bridge account is deleted at once, so a trading password
// is never kept. Fail closed: a missing flag counts as "not read-only".
//
// What is kept: the MetaApi account id, the server name and the login number.
// TradeOS does NOT keep the investor password: it goes straight to MetaApi in the
// create call and is never stored, logged or returned. The MetaApi token lives in
// the environment only. Broker text is never passed on: errors carry fixed
// plain-English wording and a code.

import { randomBytes } from "node:crypto";
import type { NormalizedTrade } from "@/lib/types";
import { getInstrument, pnlFromPrices } from "@/lib/instruments";
import { ConnectorError } from "@/lib/connectors/topstepx";
import {
  METAAPI_CLIENT_HOST,
  METAAPI_PROVISIONING_HOST,
  metaApiHostAllowed,
  metaApiSwitchedOn,
} from "@/lib/connectors/firms";

// --------------------------------------------------------------------------
// Plain-English messages (fixed text; the bridge's own words are never shown)
// --------------------------------------------------------------------------

export const MT5_LIVE_MESSAGES = {
  off: "MT5 live links aren't switched on yet.",
  plan: "MT5 live links are on paid plans.",
  limit: "You've linked 2 MT5 accounts, the most your plan allows. Disconnect one to add another.",
  badLogin:
    "We couldn't sign in with those details. Check the server name, the login number and the investor password.",
  serverNotFound:
    "We couldn't find that server name. Copy it exactly as it appears at the top of your MT5 login window.",
  tradingRights:
    "That is a trading password. Please connect with the investor password instead. We removed it straight away and saved nothing.",
  notUsd: "This account isn't in US dollars, so it can't be linked yet.",
  bridgeDown: "We couldn't reach our MT5 bridge. Try again in a minute.",
  busy: "The MT5 bridge is busy. Try again in a minute.",
  cleanupFailed:
    "We couldn't remove the MT5 link from MetaApi just now. Please try again in a few minutes.",
  // Stored on a connection when a live read fails (fixed strings, like src/lib/live/messages.ts).
  readRejected:
    "This MT5 link can no longer be read, or its login can trade. Disconnect it and connect again with the investor password.",
  readUnreachable: "Can't reach the MT5 bridge.",
} as const;

export type MetaApiCode =
  | "off"
  | "bad_login"
  | "server_not_found"
  | "trading_rights"
  | "not_usd"
  | "bridge_down"
  | "busy"
  | "not_ready"
  | "not_found"
  | "refused"
  | "api";

export class MetaApiError extends ConnectorError {
  constructor(
    message: string,
    public readonly code: MetaApiCode,
    kind: ConnectorError["kind"] = "api",
    retryAfterSec?: number,
    public readonly status?: number
  ) {
    super(message, kind, retryAfterSec);
    this.name = "MetaApiError";
  }
}

// --------------------------------------------------------------------------
// The allow-list. An allow-list, not a deny-list: the HTTP helper takes a KEY
// from this table, so no other path can even be expressed.
// --------------------------------------------------------------------------

export interface MetaApiRoute {
  api: "provisioning" | "client";
  method: "GET" | "POST" | "DELETE";
  path: string;
}

export const ALLOWED_ROUTES = {
  // The two writes (they create / remove the bridge account only; no broker effect).
  createAccount: { api: "provisioning", method: "POST", path: "/users/current/accounts" },
  deleteAccount: { api: "provisioning", method: "DELETE", path: "/users/current/accounts/:id" },
  // The reads.
  accountInformation: {
    api: "client",
    method: "GET",
    path: "/users/current/accounts/:id/account-information",
  },
  positions: { api: "client", method: "GET", path: "/users/current/accounts/:id/positions" },
  dealsByTime: {
    api: "client",
    method: "GET",
    path: "/users/current/accounts/:id/history-deals/time/:from/:to",
  },
} as const satisfies Record<string, MetaApiRoute>;

export type MetaApiRouteKey = keyof typeof ALLOWED_ROUTES;

const REQUEST_TIMEOUT_MS = 15_000;
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const DEALS_PAGE = 1000;
const DEALS_MAX_PAGES = 6;
const MT5_REGION = "new-york"; // the client host above serves this region only

/** Awaited before EVERY MetaApi call so callers can count it in the shared call budget (throw to stop). */
export type CallGate = () => Promise<void>;
export interface CallDeps {
  gate?: CallGate;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --------------------------------------------------------------------------
// HTTP client
// --------------------------------------------------------------------------

interface SendOptions {
  params?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  transactionId?: string;
  gate?: CallGate;
}

interface Sent {
  status: number;
  json: unknown;
  retryAfterSec?: number;
}

function retryAfterOf(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return secs;
  const when = Date.parse(raw); // MetaApi sends an HTTP date
  if (Number.isFinite(when)) {
    const diff = Math.ceil((when - Date.now()) / 1000);
    return diff > 0 ? diff : undefined;
  }
  return undefined;
}

async function send(key: MetaApiRouteKey, opts: SendOptions = {}): Promise<Sent> {
  const route: MetaApiRoute | undefined = ALLOWED_ROUTES[key];
  if (!route) throw new MetaApiError("That MT5 request is not permitted.", "api");
  const token = (process.env.METAAPI_TOKEN ?? "").trim();
  if (!token) throw new MetaApiError(MT5_LIVE_MESSAGES.off, "off");

  const host = route.api === "provisioning" ? METAAPI_PROVISIONING_HOST : METAAPI_CLIENT_HOST;
  // Host allow-list, checked before every call (and again on the built address below).
  if (!metaApiHostAllowed(host, { cleanup: key === "deleteAccount" })) {
    throw new MetaApiError(MT5_LIVE_MESSAGES.off, "off");
  }

  const params = opts.params ?? {};
  const path = route.path.replace(/:(\w+)/g, (_m, name: string) => {
    const v = params[name];
    if (typeof v !== "string" || v.length === 0 || v.length > 64) {
      throw new MetaApiError("That MT5 request is not valid.", "api");
    }
    if (name === "id" && !ID_PATTERN.test(v)) {
      throw new MetaApiError("That MT5 request is not valid.", "api");
    }
    return encodeURIComponent(v);
  });
  const qs = opts.query
    ? "?" +
      Object.entries(opts.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `https://${host}${path}${qs}`;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== host || parsed.username || parsed.password) {
    throw new MetaApiError("That MT5 address is not permitted.", "api");
  }

  await opts.gate?.();

  let res: Response;
  try {
    res = await fetch(url, {
      method: route.method,
      headers: {
        Accept: "application/json",
        "auth-token": token,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.transactionId ? { "transaction-id": opts.transactionId } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      cache: "no-store",
      // A redirect could send the token to another host: refuse every one.
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "bridge_down", "network");
  }

  const retryAfterSec = retryAfterOf(res);
  if (res.status === 429) {
    throw new MetaApiError(MT5_LIVE_MESSAGES.busy, "busy", "rate_limit", retryAfterSec, 429);
  }
  if (res.status === 401 || res.status === 403) {
    // Our own token was refused: a setup problem for the owner, never the trader's fault.
    throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "refused", "api", undefined, res.status);
  }
  let json: unknown = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }
  if (res.status === 404) {
    throw new MetaApiError("MetaApi has no such account.", "not_found", "api", undefined, 404);
  }
  if (res.status === 400) throw badRequestError(json);
  if (res.status === 202) return { status: 202, json, retryAfterSec };
  if (res.status >= 500 || res.status === 408 || res.status === 425) {
    throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "not_ready", "api", retryAfterSec, res.status);
  }
  if (!res.ok) {
    throw new MetaApiError(`MT5 bridge error (HTTP ${res.status}).`, "api", "api", undefined, res.status);
  }
  return { status: res.status, json, retryAfterSec };
}

/** A 400 from the create call: say WHY in a code, never with the bridge's own text. */
function badRequestError(json: unknown): MetaApiError {
  const o = (json ?? {}) as { details?: unknown; message?: unknown };
  const details =
    typeof o.details === "string"
      ? o.details
      : typeof (o.details as { code?: unknown } | null)?.code === "string"
        ? String((o.details as { code: string }).code)
        : "";
  if (details === "E_SRV_NOT_FOUND") {
    return new MetaApiError(MT5_LIVE_MESSAGES.serverNotFound, "server_not_found", "api", undefined, 400);
  }
  const text = typeof o.message === "string" ? o.message : "";
  if (details === "E_AUTH" || /authenticat|invalid account|account disabled|password/i.test(text)) {
    // The bridge's explicit "no" to these details.
    return new MetaApiError(MT5_LIVE_MESSAGES.badLogin, "bad_login", "key_rejected", undefined, 400);
  }
  return new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "refused", "api", undefined, 400);
}

// --------------------------------------------------------------------------
// Wire shapes (only what we read)
// --------------------------------------------------------------------------

export interface MetaApiAccountInfo {
  balance: number;
  equity: number;
  currency: string;
  /** true = the investor (read-only) password was used. Anything else is refused. */
  investorMode: boolean | null;
  tradeAllowed: boolean | null;
}

export interface MetaApiPosition {
  id: string;
  side: "long" | "short";
  symbol: string;
  volume: number; // lots
  openPrice: number;
  currentPrice: number | null;
  unrealizedProfit: number | null; // account currency, before swap and commission
}

export interface MetaApiDeal {
  id: string;
  type: string; // DEAL_TYPE_BUY | DEAL_TYPE_SELL | DEAL_TYPE_BALANCE ...
  entryType?: string; // DEAL_ENTRY_IN | OUT | INOUT | OUT_BY
  symbol?: string;
  time: string; // ISO, UTC
  volume?: number;
  price?: number;
  commission?: number;
  swap?: number;
  profit?: number;
  positionId?: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

/** Balance, equity, currency and the investor-mode flag of one bridge account. */
export async function maReadAccountInfo(id: string, deps: CallDeps = {}): Promise<MetaApiAccountInfo> {
  const { json } = await send("accountInformation", { params: { id }, gate: deps.gate });
  const o = (json ?? {}) as Record<string, unknown>;
  if (!isNum(o.balance)) {
    throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "not_ready", "api");
  }
  return {
    balance: o.balance,
    equity: isNum(o.equity) ? o.equity : o.balance,
    currency: typeof o.currency === "string" ? o.currency : "",
    investorMode: typeof o.investorMode === "boolean" ? o.investorMode : null,
    tradeAllowed: typeof o.tradeAllowed === "boolean" ? o.tradeAllowed : null,
  };
}

/** The account's current open positions (read-only). */
export async function maReadPositions(id: string, deps: CallDeps = {}): Promise<MetaApiPosition[]> {
  const { json } = await send("positions", { params: { id }, gate: deps.gate });
  if (!Array.isArray(json)) {
    throw new MetaApiError("Could not read open MT5 positions.", "api");
  }
  const out: MetaApiPosition[] = [];
  for (const raw of json as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const id2 = raw.id === undefined || raw.id === null ? "" : String(raw.id);
    const buy = raw.type === "POSITION_TYPE_BUY";
    const sell = raw.type === "POSITION_TYPE_SELL";
    if (!id2 || (!buy && !sell)) continue;
    if (!isNum(raw.volume) || raw.volume <= 0 || !isNum(raw.openPrice)) continue;
    out.push({
      id: id2,
      side: buy ? "long" : "short",
      symbol: typeof raw.symbol === "string" ? raw.symbol : "",
      volume: raw.volume,
      openPrice: raw.openPrice,
      currentPrice: isNum(raw.currentPrice) && raw.currentPrice > 0 ? raw.currentPrice : null,
      unrealizedProfit: numOrNull(raw.unrealizedProfit),
    });
  }
  return out;
}

/** Deals (fills) between two times, a page at a time (read-only). */
export async function maReadDeals(
  id: string,
  from: Date,
  to: Date,
  deps: CallDeps = {}
): Promise<MetaApiDeal[]> {
  const all: MetaApiDeal[] = [];
  for (let page = 0; page < DEALS_MAX_PAGES; page++) {
    const { json } = await send("dealsByTime", {
      params: { id, from: from.toISOString(), to: to.toISOString() },
      query: { offset: page * DEALS_PAGE, limit: DEALS_PAGE },
      gate: deps.gate,
    });
    const o = json as { historyDeals?: unknown; synchronizing?: unknown } | unknown[] | null;
    const list = Array.isArray(o) ? o : Array.isArray(o?.historyDeals) ? o.historyDeals : null;
    if (!list) throw new MetaApiError("Could not read MT5 history.", "api");
    if (!Array.isArray(o) && o?.synchronizing === true && list.length === 0 && page === 0) {
      // The bridge is still downloading this account's history: nothing to read yet.
      throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "not_ready", "api");
    }
    for (const d of list as Record<string, unknown>[]) {
      if (!d || typeof d !== "object") continue;
      if (d.id === undefined || d.id === null || typeof d.time !== "string") continue;
      all.push({
        id: String(d.id),
        type: typeof d.type === "string" ? d.type : "",
        entryType: typeof d.entryType === "string" ? d.entryType : undefined,
        symbol: typeof d.symbol === "string" ? d.symbol : undefined,
        time: d.time,
        volume: numOrNull(d.volume) ?? undefined,
        price: numOrNull(d.price) ?? undefined,
        commission: numOrNull(d.commission) ?? undefined,
        swap: numOrNull(d.swap) ?? undefined,
        profit: numOrNull(d.profit) ?? undefined,
        positionId: d.positionId === undefined || d.positionId === null ? undefined : String(d.positionId),
      });
    }
    if (list.length < DEALS_PAGE) break;
  }
  return all;
}

// --------------------------------------------------------------------------
// Investor-password enforcement
// --------------------------------------------------------------------------

/**
 * Is this bridge account safe to keep? null = yes (investor password, US dollars).
 * Fail closed: investorMode must be exactly true, and tradeAllowed must not be true.
 */
export function mt5AccessProblem(
  info: Pick<MetaApiAccountInfo, "investorMode" | "tradeAllowed" | "currency">
): "trading_rights" | "not_usd" | null {
  if (info.investorMode !== true || info.tradeAllowed === true) return "trading_rights";
  if (info.currency.trim().toUpperCase() !== "USD") return "not_usd";
  return null;
}

// --------------------------------------------------------------------------
// Create and delete the bridge account (the only two writes; no broker effect)
// --------------------------------------------------------------------------

export interface Mt5Credentials {
  /** Digits only (validated by the route). */
  login: string;
  server: string;
  /** The investor password. Passed straight to MetaApi; never stored, logged or returned. */
  password: string;
}

const PROVISION_ATTEMPTS = 6;
const READY_ATTEMPTS = 8;

/** Create the bridge account. A 202 ("still checking") is polled with the same transaction id. */
export async function maProvisionAccount(creds: Mt5Credentials, deps: CallDeps = {}): Promise<string> {
  const sleep = deps.sleep ?? realSleep;
  const transactionId = randomBytes(16).toString("hex");
  const body = {
    login: creds.login,
    password: creds.password,
    name: `TradeOS ${randomBytes(4).toString("hex")}`, // no personal detail in the label
    server: creds.server,
    platform: "mt5",
    magic: 0,
    type: "cloud-g2", // the only type that reports investorMode
    region: MT5_REGION,
  };
  for (let attempt = 0; attempt < PROVISION_ATTEMPTS; attempt++) {
    const r = await send("createAccount", { body, transactionId, gate: deps.gate });
    if (r.status === 202) {
      await sleep(Math.min(Math.max(r.retryAfterSec ?? 5, 1), 15) * 1000);
      continue;
    }
    const id = (r.json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "api");
    }
    return id;
  }
  throw new MetaApiError(MT5_LIVE_MESSAGES.busy, "busy");
}

/** Delete the bridge account (and so the password MetaApi holds). An account already gone counts as done. */
export async function maDeleteAccount(id: string, deps: CallDeps = {}): Promise<void> {
  try {
    await send("deleteAccount", { params: { id }, gate: deps.gate });
  } catch (err) {
    if (err instanceof MetaApiError && err.code === "not_found") return;
    throw err;
  }
}

/** Try to delete up to 3 times; true when the account is gone. Never throws. */
export async function maDeleteAccountWithRetry(id: string, deps: CallDeps = {}): Promise<boolean> {
  const sleep = deps.sleep ?? realSleep;
  for (let i = 0; i < 3; i++) {
    try {
      await maDeleteAccount(id, deps);
      return true;
    } catch (err) {
      if (err instanceof MetaApiError && err.code === "off") return false;
      if (i < 2) await sleep(2_000 * (i + 1));
    }
  }
  console.error("[metaapi] could not remove a bridge account; the owner must remove it at MetaApi:", id);
  return false;
}

export interface ConnectedMt5 {
  accountId: string;
  info: MetaApiAccountInfo;
}

/**
 * The whole connect check: create the bridge account with the investor password,
 * wait until it answers, then confirm it is read-only and in US dollars. On ANY
 * failure after the account exists it is deleted before the error is thrown.
 */
export async function maConnectInvestor(creds: Mt5Credentials, deps: CallDeps = {}): Promise<ConnectedMt5> {
  const sleep = deps.sleep ?? realSleep;
  const accountId = await maProvisionAccount(creds, deps);
  try {
    let info: MetaApiAccountInfo | null = null;
    for (let i = 0; i < READY_ATTEMPTS && !info; i++) {
      try {
        info = await maReadAccountInfo(accountId, deps);
      } catch (err) {
        const waiting = err instanceof MetaApiError && (err.code === "not_ready" || err.code === "not_found");
        if (!waiting) throw err;
        if (i < READY_ATTEMPTS - 1) await sleep(4_000);
      }
    }
    if (!info) throw new MetaApiError(MT5_LIVE_MESSAGES.bridgeDown, "not_ready");
    const problem = mt5AccessProblem(info);
    if (problem === "trading_rights") {
      throw new MetaApiError(MT5_LIVE_MESSAGES.tradingRights, "trading_rights");
    }
    if (problem === "not_usd") throw new MetaApiError(MT5_LIVE_MESSAGES.notUsd, "not_usd");
    return { accountId, info };
  } catch (err) {
    // The clean-up is not held back by the call budget; if it still fails the id (never the
    // password) is logged so the owner can remove the account at MetaApi.
    await maDeleteAccountWithRetry(accountId, { ...deps, gate: undefined });
    throw err;
  }
}

// --------------------------------------------------------------------------
// Deals -> trades. MT5 already ties every deal to a position (`positionId`):
// deals IN open it, deals OUT close it. One trade per FULLY closed position,
// the same shape as the Positions-table file import (`mt5:<positionId>` ids, so
// the same position imported by file and by the live link never doubles up):
//   entry = volume-weighted average of the IN deals, exit = of the OUT deals
//   quantity = lots closed; pnlGross = sum of the OUT deals' profit (the bridge's
//   own figure, already in the account currency, USD only for now); fees =
//   -(commission + swap over every deal of the position); pnl = profit + commission + swap.
// If a deal carries no profit figure, the P&L is worked out from the prices with
// src/lib/instruments (forex and CFD maths). Positions still open (or only partly
// closed), opened before the history window, or reversed in one deal are not made
// into trades; they are counted and named in `notes`.
// --------------------------------------------------------------------------

export interface DealsResult {
  trades: NormalizedTrade[];
  /** Positions not yet fully closed: waited for, not an error. */
  openCount: number;
  skipped: number;
  notes: string[];
}

const cents = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};
const dp = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const cleanSymbol = (s: string) => s.replace(/[^\x20-\x7e]/g, "").slice(0, 24);

export function mapDealsToTrades(deals: readonly MetaApiDeal[]): DealsResult {
  const result: DealsResult = { trades: [], openCount: 0, skipped: 0, notes: [] };
  const byPosition = new Map<string, MetaApiDeal[]>();
  for (const d of deals) {
    if (d.type !== "DEAL_TYPE_BUY" && d.type !== "DEAL_TYPE_SELL") continue; // balance, credit, charge ...
    if (!d.positionId || !/^\d{1,20}$/.test(d.positionId)) continue;
    const list = byPosition.get(d.positionId) ?? [];
    list.push(d);
    byPosition.set(d.positionId, list);
  }

  for (const [positionId, group] of byPosition) {
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time) || Number(a.id) - Number(b.id)
    );
    const skip = (why: string) => {
      result.skipped++;
      result.notes.push(`position ${positionId}: ${why}`);
    };
    const ins = sorted.filter((d) => d.entryType === "DEAL_ENTRY_IN");
    const outs = sorted.filter((d) => d.entryType === "DEAL_ENTRY_OUT" || d.entryType === "DEAL_ENTRY_OUT_BY");
    if (sorted.some((d) => d.entryType === "DEAL_ENTRY_INOUT")) {
      skip("reversed in one deal, which isn't supported yet");
      continue;
    }
    const valid = (d: MetaApiDeal) =>
      isNum(d.volume) && d.volume > 0 && isNum(d.price) && d.price > 0 && Number.isFinite(Date.parse(d.time));
    if (ins.length === 0) {
      if (outs.length > 0) skip("opened before the history window");
      continue;
    }
    if (outs.length === 0) {
      result.openCount++;
      continue;
    }
    if (![...ins, ...outs].every(valid)) {
      skip("a deal is missing its size, price or time");
      continue;
    }
    const inVol = dp(ins.reduce((s, d) => s + (d.volume as number), 0), 8);
    const outVol = dp(outs.reduce((s, d) => s + (d.volume as number), 0), 8);
    if (outVol < inVol - 1e-9) {
      result.openCount++; // partly closed: still open
      continue;
    }
    if (outVol > inVol + 1e-9) {
      skip("closed more than it opened");
      continue;
    }
    const instrument = getInstrument(ins[0].symbol ?? "");
    if (!instrument) {
      skip(`symbol ${cleanSymbol(ins[0].symbol ?? "") || "(blank)"} is not supported yet`);
      continue;
    }

    const side: "long" | "short" = ins[0].type === "DEAL_TYPE_BUY" ? "long" : "short";
    const entryPrice = ins.reduce((s, d) => s + (d.price as number) * (d.volume as number), 0) / inVol;
    const exitPrice = outs.reduce((s, d) => s + (d.price as number) * (d.volume as number), 0) / outVol;
    const commission = sorted.reduce((s, d) => s + (isNum(d.commission) ? d.commission : 0), 0);
    const swap = sorted.reduce((s, d) => s + (isNum(d.swap) ? d.swap : 0), 0);

    let profit: number;
    if (outs.every((d) => isNum(d.profit))) {
      profit = outs.reduce((s, d) => s + (d.profit as number), 0);
    } else {
      try {
        profit = pnlFromPrices({
          symbol: instrument.symbol,
          side,
          lots: outVol,
          entryPrice,
          exitPrice,
          accountCurrency: "USD",
        });
      } catch {
        skip("no profit figure and it can't be worked out from prices");
        continue;
      }
    }

    result.trades.push({
      symbol: instrument.symbol,
      side,
      entryPrice: dp(entryPrice, 6),
      exitPrice: dp(exitPrice, 6),
      quantity: outVol,
      entryTime: new Date(ins[0].time),
      exitTime: new Date(outs[outs.length - 1].time),
      fees: cents(-(commission + swap)),
      pnl: cents(profit + commission + swap),
      pnlGross: cents(profit),
      strategyTag: null,
      notes: null,
      emotions: null,
      tags: null,
      source: "api",
      externalId: `mt5:${positionId}`,
      assetClass: instrument.assetClass,
    });
  }
  result.trades.sort((a, b) => (a.exitTime?.getTime() ?? 0) - (b.exitTime?.getTime() ?? 0));
  return result;
}

/** The symbol TradeOS shows for a bridge symbol: the table's name when known, else the cleaned broker text. */
export function mt5DisplaySymbol(raw: string): string {
  return getInstrument(raw)?.symbol ?? (cleanSymbol(raw) || "?");
}

/** True when the owner's switch is on (re-exported so callers need one import). */
export const mt5SwitchedOn = metaApiSwitchedOn;
