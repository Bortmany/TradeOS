// TradeOS — who may use the MT5 live link, and which stored connections the
// background jobs may touch.
//
// Approved defaults: built switched off; once on, paid plans only (Pro and above,
// a PAID subscription: the free plan and a free trial are refused, because every
// MT5 account costs the owner money at MetaApi) and at most 2 MT5 accounts per
// trader. Every check fails closed: a missing or odd value means "no".

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MT5_FIRM_ID, metaApiSwitchedOn } from "@/lib/connectors/firms";
import { MT5_LIVE_MESSAGES, maDeleteAccountWithRetry } from "@/lib/connectors/metaapi";

export const MT5_MAX_ACCOUNTS = 2;

/** Pro or Elite with an active (paid) subscription. Anything else, including a trial or an odd value, is "no". */
export function mt5PlanAllowed(user: { plan: string; billingStatus: string }): boolean {
  return (user.plan === "pro" || user.plan === "elite") && user.billingStatus === "active";
}

/** How many MT5 links this trader has now (their own only). */
export async function countMt5Connections(userId: string): Promise<number> {
  return prisma.brokerConnection.count({ where: { userId, broker: MT5_FIRM_ID } });
}

/**
 * The connections the 30-minute sweep, the cron route, the script and the live poll
 * may read. TopstepX rows always. MT5 rows only while the owner's switch is on AND
 * their owner is on a paid plan AND the link has not been rejected; with the switch
 * off, no MT5 row is ever loaded.
 */
export function readableConnectionsWhere(
  env: Record<string, string | undefined> = process.env
): Prisma.BrokerConnectionWhereInput {
  if (!metaApiSwitchedOn(env)) return { broker: { not: MT5_FIRM_ID } };
  return {
    OR: [
      { broker: { not: MT5_FIRM_ID } },
      {
        broker: MT5_FIRM_ID,
        // A rejected link (its login can trade, or its bridge account is gone) is never read again.
        liveStatus: { not: "rejected" },
        user: { plan: { in: ["pro", "elite"] }, billingStatus: "active" },
      },
    ],
  };
}

/**
 * Remove MT5 bridge accounts at MetaApi (and so the investor password MetaApi holds).
 *  - "removed": every account is gone (or was already).
 *  - "skipped": nothing to do, or no MetaApi token on this server so we cannot reach it
 *    (the ids are logged so the owner can remove them by hand).
 *  - "failed": MetaApi did not confirm for at least one; `failed` lists their ids. Every
 *    account is tried, and each failed id is logged for the owner.
 * Used when a trader disconnects an MT5 link, deletes their whole account, or loses the plan.
 */
export async function removeBridgeAccountsReport(
  ids: string[],
  env: Record<string, string | undefined> = process.env
): Promise<{ result: "removed" | "skipped" | "failed"; failed: string[] }> {
  if (ids.length === 0) return { result: "skipped", failed: [] };
  if (!(env.METAAPI_TOKEN ?? "").trim()) {
    console.error(
      "[metaapi] no METAAPI_TOKEN on this server, so these bridge accounts were NOT removed; the owner must remove them at MetaApi:",
      ids.join(", ")
    );
    return { result: "skipped", failed: [] };
  }
  const failed: string[] = [];
  for (const id of ids) {
    if (!(await maDeleteAccountWithRetry(id))) failed.push(id);
  }
  return { result: failed.length > 0 ? "failed" : "removed", failed };
}

export async function removeBridgeAccounts(
  ids: string[],
  env: Record<string, string | undefined> = process.env
): Promise<"removed" | "skipped" | "failed"> {
  return (await removeBridgeAccountsReport(ids, env)).result;
}

/**
 * This MT5 link can trade (a master password got through, or the account's flag changed)
 * or its bridge account is gone: delete the bridge account at once (it may hold a trading
 * password) and mark the link rejected, so nothing reads it again. `bridgeGone` = the
 * bridge already says it has no such account, so there is nothing to delete.
 */
export async function rejectMt5Link(
  conn: { id: string; externalAccountId: string },
  opts: { bridgeGone?: boolean } = {}
): Promise<void> {
  if (!opts.bridgeGone) {
    const removed = await maDeleteAccountWithRetry(conn.externalAccountId);
    if (!removed) {
      console.error(
        "[metaapi] an MT5 link can trade and its bridge account could not be removed; the owner must remove it at MetaApi:",
        conn.externalAccountId
      );
    }
  }
  await prisma.brokerConnection.update({
    where: { id: conn.id },
    data: {
      liveStatus: "rejected",
      lastLiveError: MT5_LIVE_MESSAGES.readRejected,
      status: "error",
      lastError: MT5_LIVE_MESSAGES.readRejected,
    },
  });
}

/**
 * A trader who is no longer on an active Pro or Elite plan keeps no bridge account: remove
 * their MT5 links at MetaApi and drop the links (their journal accounts and trades stay).
 * A link MetaApi would not confirm stays (and its id is logged) so a later pass can retry.
 */
export async function removeMt5LinksForUser(
  userId: string
): Promise<{ removed: number; kept: number }> {
  const rows = await prisma.brokerConnection.findMany({
    where: { userId, broker: MT5_FIRM_ID },
    select: { id: true, externalAccountId: true },
  });
  let removed = 0;
  let kept = 0;
  for (const row of rows) {
    const r = await removeBridgeAccountsReport([row.externalAccountId]);
    if (r.result !== "removed") {
      kept++; // MetaApi unreachable or no token here: keep the link so a later pass retries
      continue;
    }
    await prisma.brokerConnection.deleteMany({ where: { id: row.id, userId } });
    removed++;
  }
  return { removed, kept };
}

/**
 * The plan has ENDED (moved to a free plan, or cancelled), as opposed to merely paused
 * for a failed payment (`past_due`, where reading stops but the account stays while the
 * payment is retried). Only an ended plan removes the bridge account.
 */
export function mt5PlanEnded(user: { plan: string; billingStatus: string }): boolean {
  return !(user.plan === "pro" || user.plan === "elite") || user.billingStatus === "canceled";
}

/**
 * Retry for links the plan-end clean-up could not remove at the time (MetaApi was down,
 * or this server had no token). Run from the 30-minute sweep. Returns how many were removed.
 */
export async function removeEndedMt5Links(): Promise<number> {
  if (!(process.env.METAAPI_TOKEN ?? "").trim()) return 0;
  const rows = await prisma.brokerConnection.findMany({
    where: {
      broker: MT5_FIRM_ID,
      user: { OR: [{ plan: { notIn: ["pro", "elite"] } }, { billingStatus: "canceled" }] },
    },
    select: { userId: true },
  });
  let removed = 0;
  for (const userId of new Set(rows.map((r) => r.userId))) {
    removed += (await removeMt5LinksForUser(userId)).removed;
  }
  return removed;
}
