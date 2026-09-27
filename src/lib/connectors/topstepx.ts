// TradeOS — TopstepX live connector (ProjectX Gateway API).
//
// TopstepX runs on the ProjectX platform, which exposes a documented REST
// gateway (default https://api.topstepx.com). Auth is username + API key →
// short-lived session token. This module contains:
//   1. a thin, defensive HTTP client for the three endpoints we need
//      (Auth/loginKey, Account/search, Trade/search)
//   2. contractId → symbol mapping
//   3. a pure FIFO pairing engine that converts half-turn fills into
//      round-trip trades in our NormalizedTrade schema (unit-testable, no I/O)
//
// The gateway returns FILLS (half-turns), one row per execution, with
// profitAndLoss populated only on position-reducing fills. We rebuild round
// trips ourselves so the result is broker-agnostic and auditable.
// No orders are ever placed — this connector is strictly read-only.

import type { NormalizedTrade } from "@/lib/types";
import { pointMultiplier } from "@/lib/ingestion/symbols";

export const DEFAULT_BASE_URL = "https://api.topstepx.com";

// --------------------------------------------------------------------------
// Wire types (shape of the ProjectX gateway responses we consume)
// --------------------------------------------------------------------------

export interface ProjectXFill {
  id: number | string;
  accountId: number | string;
  contractId: string; // e.g. "CON.F.US.EP.U25"
  creationTimestamp: string; // ISO
  price: number;
  profitAndLoss: number | null; // null on position-opening fills
  fees: number;
  side: number; // 0 = buy, 1 = sell
  size: number;
  voided?: boolean;
  orderId?: number | string;
}

export interface DiscoveredAccount {
  id: string;
  name: string;
  balance?: number;
  canTrade?: boolean;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "network" | "api" = "api"
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

// --------------------------------------------------------------------------
// HTTP client
// --------------------------------------------------------------------------

async function pxPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new ConnectorError(
      `Could not reach the broker gateway (${(err as Error).message}). Check the base URL and your network.`,
      "network"
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new ConnectorError("The broker rejected these credentials.", "auth");
  }
  if (!res.ok) {
    throw new ConnectorError(`Broker gateway error (HTTP ${res.status}).`);
  }
  return (await res.json()) as T;
}

/** Exchange username + API key for a session token. */
export async function pxLogin(
  baseUrl: string,
  userName: string,
  apiKey: string
): Promise<string> {
  const json = await pxPost<{
    token?: string;
    success?: boolean;
    errorMessage?: string | null;
  }>(baseUrl, "/api/Auth/loginKey", { userName, apiKey });
  if (!json.success || !json.token) {
    throw new ConnectorError(
      json.errorMessage || "Login failed — check your TopstepX username and API key.",
      "auth"
    );
  }
  return json.token;
}

/** List the user's active broker-side accounts. */
export async function pxSearchAccounts(
  baseUrl: string,
  token: string
): Promise<DiscoveredAccount[]> {
  const json = await pxPost<{
    accounts?: { id: number | string; name?: string; balance?: number; canTrade?: boolean }[];
    success?: boolean;
    errorMessage?: string | null;
  }>(baseUrl, "/api/Account/search", { onlyActiveAccounts: true }, token);
  if (!json.success || !Array.isArray(json.accounts)) {
    throw new ConnectorError(json.errorMessage || "Could not list broker accounts.");
  }
  return json.accounts.map((a) => ({
    id: String(a.id),
    name: a.name ?? `Account ${a.id}`,
    balance: typeof a.balance === "number" ? a.balance : undefined,
    canTrade: a.canTrade,
  }));
}

/** Fetch fills (half-turns) for an account in a time window. */
export async function pxSearchTrades(
  baseUrl: string,
  token: string,
  accountId: string,
  startTimestamp: Date,
  endTimestamp?: Date
): Promise<ProjectXFill[]> {
  const json = await pxPost<{
    trades?: ProjectXFill[];
    success?: boolean;
    errorMessage?: string | null;
  }>(
    baseUrl,
    "/api/Trade/search",
    {
      accountId: /^\d+$/.test(accountId) ? Number(accountId) : accountId,
      startTimestamp: startTimestamp.toISOString(),
      ...(endTimestamp ? { endTimestamp: endTimestamp.toISOString() } : {}),
    },
    token
  );
  if (!json.success || !Array.isArray(json.trades)) {
    throw new ConnectorError(json.errorMessage || "Could not fetch trades from the broker.");
  }
  return json.trades.filter((f) => !f.voided);
}

// --------------------------------------------------------------------------
// Symbol mapping — ProjectX contract ids look like "CON.F.US.EP.U25".
// The 4th segment is the product root; map the gateway roots that differ from
// the exchange symbols traders know, pass everything else through.
// --------------------------------------------------------------------------

const ROOT_TO_SYMBOL: Record<string, string> = {
  EP: "ES", // E-mini S&P 500
  ENQ: "NQ", // E-mini Nasdaq-100
  MES: "MES",
  MNQ: "MNQ",
  RTY: "RTY",
  M2K: "M2K",
  YM: "YM",
  MYM: "MYM",
  CL: "CL",
  MCL: "MCL",
  GC: "GC",
  MGC: "MGC",
  NG: "NG",
  SI: "SI",
};

export function contractIdToSymbol(contractId: string): string {
  const parts = contractId.split(".");
  const root = (parts.length >= 4 ? parts[3] : contractId).toUpperCase();
  return ROOT_TO_SYMBOL[root] ?? root;
}

// --------------------------------------------------------------------------
// FIFO pairing — pure & deterministic.
// One round-trip trade is emitted per position-REDUCING fill: entry price is
// the size-weighted average of the FIFO lots it consumes, exit is the fill
// price. A fill larger than the open position closes it and opens the
// remainder in the other direction (reversal). Gateway-reported P&L is used
// when present; otherwise P&L is computed from prices × point multiplier.
// --------------------------------------------------------------------------

interface OpenLot {
  side: "long" | "short";
  size: number;
  price: number;
  time: Date;
  feesPerUnit: number;
}

export function pairFills(fills: ProjectXFill[]): NormalizedTrade[] {
  const sorted = [...fills].sort(
    (a, b) =>
      new Date(a.creationTimestamp).getTime() - new Date(b.creationTimestamp).getTime()
  );

  // Key open lots by account AND contract. Grouping by contract alone would
  // cross-pair two different accounts' positions in the same instrument if a
  // caller ever fed this function fills from more than one account at once.
  const lotsByAccountContract = new Map<string, OpenLot[]>();
  const trades: NormalizedTrade[] = [];

  for (const fill of sorted) {
    const fillSide: "long" | "short" = fill.side === 0 ? "long" : "short";
    const lotKey = `${fill.accountId}|${fill.contractId}`;
    const lots = lotsByAccountContract.get(lotKey) ?? [];
    lotsByAccountContract.set(lotKey, lots);

    const time = new Date(fill.creationTimestamp);
    const feesPerUnit = fill.size > 0 ? (fill.fees ?? 0) / fill.size : 0;
    let remaining = fill.size;

    const positionSide = lots[0]?.side;
    if (!positionSide || positionSide === fillSide) {
      // Opening / adding — just stack the lot.
      lots.push({ side: fillSide, size: remaining, price: fill.price, time, feesPerUnit });
      continue;
    }

    // Reducing (and possibly reversing): consume FIFO lots.
    let consumedQty = 0;
    let consumedCost = 0; // Σ price × qty
    let consumedFees = 0;
    const entryTime = lots[0].time; // FIFO: entry is the oldest consumed lot

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.size, remaining);
      consumedQty += take;
      consumedCost += lot.price * take;
      consumedFees += lot.feesPerUnit * take;
      lot.size -= take;
      remaining -= take;
      if (lot.size <= 1e-9) lots.shift();
    }

    if (consumedQty > 0) {
      const symbol = contractIdToSymbol(fill.contractId);
      const mult = pointMultiplier(symbol);
      const entryPrice = consumedCost / consumedQty;
      const tradeSide = positionSide; // the side of the position being closed
      const closeFees = feesPerUnit * consumedQty;
      const fees = round2(consumedFees + closeFees);
      const gross =
        tradeSide === "long"
          ? (fill.price - entryPrice) * consumedQty * mult
          : (entryPrice - fill.price) * consumedQty * mult;
      // Prefer the gateway's own P&L when it covers this fill entirely and the
      // fill didn't split across our computed qty; it already excludes fees.
      const pnlGross =
        typeof fill.profitAndLoss === "number" && consumedQty === fill.size
          ? fill.profitAndLoss
          : round2(gross);

      trades.push({
        symbol,
        side: tradeSide,
        entryPrice: round4(entryPrice),
        exitPrice: fill.price,
        quantity: consumedQty,
        entryTime,
        exitTime: time,
        fees,
        pnl: round2(pnlGross - fees),
        pnlGross,
        strategyTag: null,
        notes: null,
        emotions: null,
        tags: null,
        source: "api",
        externalId: `px-${fill.id}`,
      });
    }

    // Reversal remainder opens a new position on the fill's side.
    if (remaining > 0) {
      lots.push({ side: fillSide, size: remaining, price: fill.price, time, feesPerUnit });
    }
  }

  return trades;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
