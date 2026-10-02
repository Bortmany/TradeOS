// TradeOS — the near-live reader. Every 60 seconds (never faster) it READS each
// opted-in TopstepX connection's balance and open positions, saves the latest
// snapshot, and then refreshes that trader's alerts so warnings appear within
// about a minute.
//
// SAFETY: strictly read-only. The only broker calls are the read-only paths on
// the allow-list in src/lib/connectors/topstepx.ts: login, Account/search,
// Position/searchOpen and, only to estimate a price, History/retrieveBars. There
// is no function anywhere that places, changes or cancels an order.
//
// Shape of a tick:
//   1. take the single-runner lock (own key; one copy of the server polls)
//   2. pick connections that are on, not key-rejected, and not read in the last
//      minute; group them by trader key (one login + one balance read per key)
//   3. stalest group first; before EVERY call ask the budget (about 100/min
//      server-wide). When it says no, stop; the rest go first next tick.
//   4. HTTP 429 -> back off (Retry-After, else 30s/60s/120s, max 5 min)
//   5. a failed read marks the connection unreachable (or key-rejected) and
//      changes NO alert; a good read replaces the snapshot and refreshes alerts.
//
// Keys and session tokens are never logged. Messages stored for the trader are
// fixed plain-English strings, never the broker's raw text.

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
  ConnectorError,
  contractIdToSymbol,
  pxLatestBarPrice,
  pxLogin,
  pxSearchAccounts,
  pxSearchOpenPositions,
  type ProjectXPosition,
} from "@/lib/connectors/topstepx";
import { getFirm, isAllowedBaseUrl } from "@/lib/connectors/firms";
import {
  dropSessionToken,
  getSessionToken,
  sessionKey,
  setSessionToken,
} from "@/lib/connectors/session";
import { knownPointValue } from "@/lib/instruments/futures";
import { priceOpenPosition } from "@/lib/risk/limits";
import { generateAlerts } from "@/lib/alerts/generate";
import { withSingleRunner } from "@/lib/single-runner";
import { CallBudget, liveBudget } from "@/lib/live/budget";
import {
  DECRYPT_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  REFUSED_MESSAGE,
  REJECTED_MESSAGE,
  UNREACHABLE_MESSAGE,
} from "@/lib/live/messages";
import { LIVE_MIN_GAP_MS, liveEnabled, livePollIntervalSec } from "@/lib/live/config";

const LIVE_LOCK_KEY = 4927002; // its own key, different from the 30-minute sweep's 4927001
const LIVE_MAX_RUN_MS = 10 * 60_000;

export interface LiveTickStats {
  skipped?: "backoff" | "already-running" | "other-instance";
  groups: number;
  reads: number;
  failed: number;
  rejected: number;
}

class BudgetStop extends Error {}
class KeyRejected extends Error {}

interface ConnRow {
  id: string;
  userId: string;
  accountId: string;
  baseUrl: string;
  username: string;
  externalAccountId: string;
  lastLiveAt: Date | null;
  livePeakEquity: number | null;
  startingBalance: number;
}

interface Group {
  key: string;
  baseUrl: string;
  username: string;
  apiKey: string;
  conns: ConnRow[];
}

let running = false;

/** One live round. Safe to call twice in a row: the guard is released in `finally`. */
export async function runLiveTick(
  opts: { now?: Date; budget?: CallBudget } = {}
): Promise<LiveTickStats> {
  const stats: LiveTickStats = { groups: 0, reads: 0, failed: 0, rejected: 0 };
  const budget = opts.budget ?? liveBudget;
  if (running) return { ...stats, skipped: "already-running" };
  if (budget.inBackoff()) return { ...stats, skipped: "backoff" };

  running = true;
  try {
    const outcome = await withSingleRunner(
      LIVE_LOCK_KEY,
      "live-poll",
      () => tickWork(opts.now ?? new Date(), budget, stats),
      LIVE_MAX_RUN_MS
    );
    if (outcome === "skipped") return { ...stats, skipped: "other-instance" };
    return stats;
  } finally {
    running = false;
  }
}

async function tickWork(now: Date, budget: CallBudget, stats: LiveTickStats): Promise<void> {
  try {
    const rows = await prisma.brokerConnection.findMany({
      where: { nearLive: true, liveStatus: { not: "rejected" } },
      include: { account: { select: { startingBalance: true } } },
    });

    const groups = new Map<string, Group>();
    for (const c of rows) {
      if (!getFirm(c.broker)) continue;
      // The floor, in code: never read one account faster than once a minute.
      if (c.lastLiveAt && now.getTime() - c.lastLiveAt.getTime() < LIVE_MIN_GAP_MS) continue;
      if (!isAllowedBaseUrl(c.baseUrl)) {
        await markFailure([c.id], "rejected", NOT_ALLOWED_MESSAGE);
        stats.rejected++;
        continue;
      }
      let apiKey: string;
      try {
        apiKey = decryptSecret(c.apiKeyEnc);
      } catch {
        await markFailure([c.id], "rejected", DECRYPT_MESSAGE);
        stats.rejected++;
        continue;
      }
      const key = sessionKey(c.baseUrl, c.username, apiKey);
      const g = groups.get(key) ?? { key, baseUrl: c.baseUrl, username: c.username, apiKey, conns: [] };
      g.conns.push({
        id: c.id,
        userId: c.userId,
        accountId: c.accountId,
        baseUrl: c.baseUrl,
        username: c.username,
        externalAccountId: c.externalAccountId,
        lastLiveAt: c.lastLiveAt,
        livePeakEquity: c.livePeakEquity,
        startingBalance: c.account.startingBalance ?? 0,
      });
      groups.set(key, g);
    }

    // Stalest first (never read = oldest of all), so a short budget never starves anyone.
    const ordered = [...groups.values()].sort(
      (a, b) => oldest(a).getTime() - oldest(b).getTime()
    );

    const touchedUsers = new Set<string>();
    for (const g of ordered) {
      stats.groups++;
      try {
        await readGroup(g, now, budget, touchedUsers, stats);
      } catch (err) {
        if (err instanceof BudgetStop) break; // minute's budget used; resume next tick
        if (err instanceof ConnectorError && err.kind === "rate_limit") {
          budget.onRateLimited(err.retryAfterSec);
          break;
        }
        const ids = g.conns.map((c) => c.id);
        if (err instanceof KeyRejected) {
          await markFailure(ids, "rejected", REJECTED_MESSAGE);
          stats.rejected += ids.length;
        } else if (err instanceof ConnectorError) {
          await markFailure(ids, "unreachable", messageFor(err));
          stats.failed += ids.length;
        } else {
          console.error("[live-poll] unexpected error:", (err as Error).message);
          stats.failed += ids.length;
        }
      }
    }

    // Alerts follow reads: only traders with at least one GOOD read this tick.
    for (const userId of touchedUsers) {
      try {
        await generateAlerts(userId, now);
      } catch (err) {
        console.error("[live-poll] alert pass failed:", (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[live-poll] tick error:", (err as Error).message);
  }
}

function oldest(g: Group): Date {
  let t = Number.POSITIVE_INFINITY;
  for (const c of g.conns) t = Math.min(t, c.lastLiveAt ? c.lastLiveAt.getTime() : 0);
  return new Date(t);
}

function messageFor(err: ConnectorError): string {
  if (err.kind === "network") return UNREACHABLE_MESSAGE;
  if (err.kind === "auth") return REFUSED_MESSAGE;
  return `${UNREACHABLE_MESSAGE} (${err.message.replace(/[^\w .,()-]/g, "").slice(0, 80)})`;
}

async function markFailure(
  ids: string[],
  status: "unreachable" | "rejected",
  message: string
): Promise<void> {
  await prisma.brokerConnection.updateMany({
    where: { id: { in: ids } },
    data: { liveStatus: status, lastLiveError: message },
  });
}

async function readGroup(
  g: Group,
  now: Date,
  budget: CallBudget,
  touchedUsers: Set<string>,
  stats: LiveTickStats
): Promise<void> {
  let token = getSessionToken(g.key, now.getTime());
  let loggedInThisRound = false;
  // login() assigns `token` from inside a closure, which TypeScript cannot follow.
  const tok = (): string => token as unknown as string;

  async function login(): Promise<void> {
    if (!budget.take()) throw new BudgetStop();
    try {
      token = await pxLogin(g.baseUrl, g.username, g.apiKey);
    } catch (err) {
      if (err instanceof ConnectorError && err.kind === "auth") throw new KeyRejected();
      throw err;
    }
    setSessionToken(g.key, token, now.getTime());
    loggedInThisRound = true;
  }

  // One budgeted broker call. A rejected cached token is replaced with ONE
  // fresh login and the call is tried once more; never a retry loop.
  async function call<T>(fn: (t: string) => Promise<T>): Promise<T> {
    if (!token) await login();
    if (!budget.take()) throw new BudgetStop();
    try {
      const r = await fn(tok());
      budget.onSuccess();
      return r;
    } catch (err) {
      if (err instanceof ConnectorError && err.kind === "auth" && !loggedInThisRound) {
        dropSessionToken(g.key);
        token = null;
        await login();
        if (!budget.take()) throw new BudgetStop();
        return fn(tok());
      }
      throw err;
    }
  }

  // One balance read for the trader's key covers every account on it.
  const accounts = await call((t) => pxSearchAccounts(g.baseUrl, t));
  const balanceOf = new Map(accounts.map((a) => [a.id, a.balance]));

  // One price lookup per open contract per read, shared by accounts on this key.
  const barPrice = new Map<string, number | null>();

  for (const c of g.conns) {
    try {
      const positions = await call((t) => pxSearchOpenPositions(g.baseUrl, t, c.externalAccountId));

      const views: SnapshotInput[] = [];
      for (const p of positions) {
        const symbol = contractIdToSymbol(p.contractId);
        const pointValue = knownPointValue(symbol);
        const side: "long" | "short" = p.type === 2 ? "short" : "long";
        let lastPrice: number | null = null;
        let priceSource: "broker" | "bar" | null = null;
        const given = livePriceOf(p);
        if (given != null) {
          lastPrice = given;
          priceSource = "broker";
        } else if (pointValue != null) {
          // Estimate from the latest 1-minute bar (read-only, counted in the budget).
          if (!barPrice.has(p.contractId)) {
            try {
              barPrice.set(p.contractId, await call((t) => pxLatestBarPrice(g.baseUrl, t, p.contractId, now)));
            } catch (err) {
              if (
                err instanceof BudgetStop ||
                err instanceof KeyRejected ||
                (err instanceof ConnectorError && err.kind === "rate_limit")
              ) {
                throw err;
              }
              barPrice.set(p.contractId, null); // price unavailable; the position is shown as not priced
            }
          }
          const bar = barPrice.get(p.contractId) ?? null;
          if (bar != null) {
            lastPrice = bar;
            priceSource = "bar";
          }
        }
        const priced = priceOpenPosition({
          side,
          size: p.size,
          avgPrice: p.averagePrice,
          lastPrice,
          pointValue,
        });
        views.push({
          contractId: p.contractId,
          symbol,
          side,
          size: p.size,
          avgPrice: p.averagePrice,
          lastPrice,
          priceSource,
          openPnl: priced.openPnl,
          notPricedReason: priced.notPricedReason,
        });
      }

      await persistRead(c, views, balanceOf.get(c.externalAccountId), now);
      touchedUsers.add(c.userId);
      stats.reads++;
    } catch (err) {
      if (
        err instanceof BudgetStop ||
        err instanceof KeyRejected ||
        (err instanceof ConnectorError && err.kind === "rate_limit")
      ) {
        throw err;
      }
      if (err instanceof ConnectorError) {
        await markFailure([c.id], "unreachable", messageFor(err));
        stats.failed++;
        continue;
      }
      throw err;
    }
  }
}

function livePriceOf(p: ProjectXPosition): number | null {
  for (const v of [p.currentPrice, p.lastPrice]) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

interface SnapshotInput {
  contractId: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  avgPrice: number;
  lastPrice: number | null;
  priceSource: "broker" | "bar" | null;
  openPnl: number | null;
  notPricedReason: "no_point_value" | "no_price" | null;
}

/** Replace the connection's snapshot with this read and record that it succeeded. */
async function persistRead(
  c: ConnRow,
  views: SnapshotInput[],
  balance: number | undefined,
  now: Date
): Promise<void> {
  const openSum = views.reduce((s, v) => s + (v.openPnl ?? 0), 0);
  const closed = await prisma.trade.aggregate({
    where: { userId: c.userId, accountId: c.accountId, exitTime: { not: null } },
    _sum: { pnl: true },
  });
  // Highest equity seen at any read (open profit included): the cautious drawdown peak.
  const equity = c.startingBalance + (closed._sum.pnl ?? 0) + openSum;
  const peak =
    c.livePeakEquity == null || equity > c.livePeakEquity ? equity : c.livePeakEquity;

  await prisma.$transaction([
    prisma.positionSnapshot.deleteMany({ where: { connectionId: c.id, userId: c.userId } }),
    prisma.positionSnapshot.createMany({
      data: views.map((v) => ({ ...v, userId: c.userId, connectionId: c.id, readAt: now })),
    }),
    prisma.brokerConnection.update({
      where: { id: c.id },
      data: {
        lastLiveAt: now,
        lastLiveError: null,
        liveStatus: "ok",
        livePeakEquity: peak,
        ...(typeof balance === "number" ? { lastBalance: balance } : {}),
      },
    }),
  ]);
}

// ── Timer ────────────────────────────────────────────────────────────────────

const globalPoller = globalThis as unknown as {
  __tradeosLivePoll?: ReturnType<typeof setInterval>;
};

/**
 * Start the live timer (persistent servers only; Vercel's serverless platform
 * has no long-running process). The interval comes from LIVE_POLL_INTERVAL_SEC
 * and is never below 60 seconds.
 */
export function startLivePoller(): void {
  if (globalPoller.__tradeosLivePoll) return;
  if (process.env.VERCEL) return;
  if (!liveEnabled()) return;

  const sec = livePollIntervalSec();
  console.log(`[live-poll] started — every ${sec}s (read-only)`);
  const timer = setInterval(() => void runLiveTick(), sec * 1000);
  timer.unref?.();
  globalPoller.__tradeosLivePoll = timer;
}
