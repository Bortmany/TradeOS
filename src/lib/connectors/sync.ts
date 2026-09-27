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
  pxLogin,
  pxSearchTrades,
  pairFills,
  ConnectorError,
} from "@/lib/connectors/topstepx";
import { isAllowedBaseUrl, DISALLOWED_BASE_URL_MESSAGE } from "@/lib/connectors/firms";

const WINDOW_DAYS = 90;

export interface SyncResult {
  imported: number;
  skipped: number;
}

export async function syncConnection(
  connectionId: string,
  userId: string
): Promise<SyncResult> {
  const conn = await prisma.brokerConnection.findFirst({
    where: { id: connectionId, userId },
    include: { account: true },
  });
  if (!conn) throw new ConnectorError("Connection not found.");

  try {
    // Older connections were stored with a user-typed gateway URL. The server
    // only calls addresses on the firm registry's allow-list — anything else
    // (a private/loopback address, an unknown host) is refused, never fetched.
    if (!isAllowedBaseUrl(conn.baseUrl)) {
      throw new ConnectorError(DISALLOWED_BASE_URL_MESSAGE, "auth");
    }

    let apiKey: string;
    try {
      apiKey = decryptSecret(conn.apiKeyEnc);
    } catch {
      throw new ConnectorError(
        "Stored credentials could not be decrypted (was AUTH_SECRET rotated?). Disconnect and reconnect this account.",
        "auth"
      );
    }
    const token = await pxLogin(conn.baseUrl, conn.username, apiKey);
    const start = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const fills = await pxSearchTrades(
      conn.baseUrl,
      token,
      conn.externalAccountId,
      start
    );
    const trades = pairFills(fills);

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
  } catch (err) {
    const message =
      err instanceof ConnectorError ? err.message : "Sync failed unexpectedly.";
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { status: "error", lastError: message },
    });
    throw err instanceof ConnectorError ? err : new ConnectorError(message);
  }
}
