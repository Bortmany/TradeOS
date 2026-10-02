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
import { maDeleteAccountWithRetry } from "@/lib/connectors/metaapi";

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
 * their owner is on a paid plan; with the switch off, no MT5 row is ever loaded.
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
        user: { plan: { in: ["pro", "elite"] }, billingStatus: "active" },
      },
    ],
  };
}

/**
 * Remove MT5 bridge accounts at MetaApi (and so the investor password MetaApi holds).
 *  - "removed": every account is gone (or was already).
 *  - "skipped": nothing to do, or no MetaApi token on this server so we cannot reach it.
 *  - "failed": MetaApi did not confirm; the caller keeps the connection and says so.
 * Used when a trader disconnects an MT5 link and when a trader deletes their whole account.
 */
export async function removeBridgeAccounts(
  ids: string[],
  env: Record<string, string | undefined> = process.env
): Promise<"removed" | "skipped" | "failed"> {
  if (ids.length === 0) return "skipped";
  if (!(env.METAAPI_TOKEN ?? "").trim()) return "skipped";
  for (const id of ids) {
    if (!(await maDeleteAccountWithRetry(id))) return "failed";
  }
  return "removed";
}
