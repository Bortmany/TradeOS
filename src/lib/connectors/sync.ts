// TradeOS — broker connection sync. Pulls fills from the gateway, pairs them
// into round trips, and upserts into the normalized Trade table.
//
// Sync strategy: every run re-fetches the trailing 90-day window and relies on
// the [accountId, externalId] unique constraint for dedupe. That makes syncs
// idempotent and keeps FIFO pairing consistent even when a position was opened
// before the previous sync's cutoff — at the cost of a slightly larger fetch,
// which is negligible for a single trading account.

// NOTE: intentionally NOT importing "server-only" — this module is shared by
// Next.js route handlers, the in-process auto-sync scheduler, and the
// standalone scripts/sync-all.ts cron script (plain Node via tsx).
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
  getSessionToken,
  setSessionToken,
  dropSessionToken,
  sessionKey,
} from "@/lib/connectors/session";
import { REJECTED_MESSAGE } from "@/lib/live/messages";
import {
  pxLogin,
  pxSearchTrades,
  pairFills,
  ConnectorError,
} from "@/lib/connectors/topstepx";
import {
  isAllowedBaseUrl,
  DISALLOWED_BASE_URL_MESSAGE,
  MT5_FIRM_ID,
  metaApiSwitchedOn,
} from "@/lib/connectors/firms";
import {
  MT5_LIVE_MESSAGES,
  MetaApiError,
  mapDealsToTrades,
  maReadDeals,
} from "@/lib/connectors/metaapi";
import { mt5PlanAllowed } from "@/lib/connectors/mt5-access";
import type { NormalizedTrade } from "@/lib/types";

const WINDOW_DAYS = 90;

export interface SyncResult {
  imported: number;
  skipped: number;
}

/** Thrown by `beforeCall` when the shared call budget says "not now": nothing is recorded as an error. */
export class SyncDeferred extends Error {
  constructor(message = "Sync deferred: the broker call budget is used up or backing off.") {
    super(message);
    this.name = "SyncDeferred";
  }
}

export interface SyncOptions {
  /** Awaited before EVERY broker call (login or fills) so background jobs can count it in the shared budget. Throw SyncDeferred to stop. */
  beforeCall?: () => Promise<void>;
  /** The broker answered 429: lets the caller start the shared back-off. */
  onRateLimit?: (retryAfterSec?: number) => void;
}

export async function syncConnection(
  connectionId: string,
  userId: string,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const gate = async () => {
    await opts.beforeCall?.();
  };
  const conn = await prisma.brokerConnection.findFirst({
    where: { id: connectionId, userId },
    include: { account: true },
  });
  if (!conn) throw new ConnectorError("Connection not found.");

  if (conn.broker === MT5_FIRM_ID) return syncMt5(conn, userId, opts, gate);

  try {
    // Older connections were stored with a user-typed gateway URL. The server
    // only calls addresses on the firm registry's allow-list — anything else
    // (a private/loopback address, an unknown host) is refused, never fetched.
    if (!isAllowedBaseUrl(conn.baseUrl)) {
      throw new ConnectorError(DISALLOWED_BASE_URL_MESSAGE, "key_rejected");
    }

    let apiKey: string;
    try {
      apiKey = decryptSecret(conn.apiKeyEnc);
    } catch {
      throw new ConnectorError(
        "Stored credentials could not be decrypted (was AUTH_SECRET rotated?). Disconnect and reconnect this account.",
        "key_rejected"
      );
    }
    // Reuse the day's session token when there is one (it lives in memory only);
    // a rejected token is replaced with one fresh login, once.
    const tokenKey = sessionKey(conn.baseUrl, conn.username, apiKey);
    let token = getSessionToken(tokenKey);
    let freshLogin = false;
    if (!token) {
      await gate();
      token = await pxLogin(conn.baseUrl, conn.username, apiKey);
      setSessionToken(tokenKey, token);
      freshLogin = true;
    }
    const start = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const fetchFills = (t: string) =>
      pxSearchTrades(conn.baseUrl, t, conn.externalAccountId, start);
    let fills;
    try {
      await gate();
      fills = await fetchFills(token);
    } catch (err) {
      if (err instanceof ConnectorError && err.kind === "auth" && !freshLogin) {
        dropSessionToken(tokenKey);
        await gate();
        token = await pxLogin(conn.baseUrl, conn.username, apiKey);
        setSessionToken(tokenKey, token);
        await gate();
        fills = await fetchFills(token);
      } else {
        throw err;
      }
    }
    const trades = pairFills(fills);
    return await saveTrades(conn, userId, trades);
  } catch (err) {
    // A budget "not now" is not a failure of the connection: record nothing.
    if (err instanceof SyncDeferred) throw err;
    if (err instanceof ConnectorError && err.kind === "rate_limit") {
      opts.onRateLimit?.(err.retryAfterSec);
    }
    const message =
      err instanceof ConnectorError ? err.message : "Sync failed unexpectedly.";
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: {
        status: "error",
        lastError: message,
        // A rejected key also stops the live reads until the trader reconnects.
        ...(err instanceof ConnectorError && err.kind === "key_rejected"
          ? { liveStatus: "rejected", lastLiveError: REJECTED_MESSAGE }
          : {}),
      },
    });
    throw err instanceof ConnectorError ? err : new ConnectorError(message);
  }
}


/** Save paired trades (deduped by [accountId, externalId]), mark the connection synced, refresh the scores. */
async function saveTrades(
  conn: { id: string; accountId: string },
  userId: string,
  trades: NormalizedTrade[]
): Promise<SyncResult> {
  let imported = 0;
  let skipped = 0;
  for (const t of trades) {
    try {
      await prisma.trade.create({
        data: {
          userId,
          accountId: conn.accountId,
          symbol: t.symbol,
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice ?? null,
          quantity: t.quantity,
          entryTime: t.entryTime,
          exitTime: t.exitTime ?? null,
          fees: t.fees ?? 0,
          pnl: t.pnl ?? 0,
          pnlGross: t.pnlGross ?? null,
          source: "api",
          externalId: t.externalId ?? null,
          assetClass: t.assetClass ?? null,
          isWin: t.exitTime ? (t.pnl ?? 0) > 0 : null,
        },
      });
      imported++;
    } catch {
      skipped++; // unique-constraint dedupe on [accountId, externalId]
    }
  }

  await prisma.brokerConnection.update({
    where: { id: conn.id },
    data: { status: "connected", lastSyncAt: new Date(), lastError: null },
  });

  if (imported > 0) {
    try {
      const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
      await recomputeUserCompliance(userId);
    } catch {
      /* best-effort */
    }
  }
  return { imported, skipped };
}

/**
 * MT5 through MetaApi: read the closed deals of the bridge account and turn them into
 * trades (see mapDealsToTrades). Read-only; every call is asked of the shared call
 * budget through `gate`. Refused (and nothing recorded) while the owner's switch is
 * off or the trader's plan doesn't include it.
 */
async function syncMt5(
  conn: { id: string; accountId: string; externalAccountId: string },
  userId: string,
  opts: SyncOptions,
  gate: () => Promise<void>
): Promise<SyncResult> {
  if (!metaApiSwitchedOn()) throw new ConnectorError(MT5_LIVE_MESSAGES.off);
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, billingStatus: true },
  });
  if (!owner || !mt5PlanAllowed(owner)) throw new ConnectorError(MT5_LIVE_MESSAGES.plan);

  try {
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);
    let deals;
    try {
      deals = await maReadDeals(conn.externalAccountId, from, to, { gate });
    } catch (err) {
      // The bridge is still downloading this account's history: nothing to import yet, not a failure.
      if (err instanceof MetaApiError && err.code === "not_ready" && err.status === undefined) {
        return { imported: 0, skipped: 0 };
      }
      throw err;
    }
    return await saveTrades(conn, userId, mapDealsToTrades(deals).trades);
  } catch (err) {
    if (err instanceof SyncDeferred) throw err;
    if (err instanceof ConnectorError && err.kind === "rate_limit") {
      opts.onRateLimit?.(err.retryAfterSec);
    }
    const message = err instanceof ConnectorError ? err.message : "Sync failed unexpectedly.";
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { status: "error", lastError: message },
    });
    throw err instanceof ConnectorError ? err : new ConnectorError(message);
  }
}
