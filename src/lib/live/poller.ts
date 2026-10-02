// TradeOS — the near-live reader. Every 60 seconds (never faster) it READS each
// opted-in TopstepX connection's balance and open positions, saves the latest
// snapshot, and then refreshes that trader's alerts so warnings appear within
// about a minute.
//
// SAFETY: strictly read-only. The only broker calls are the read-only paths on
// the allow-list in src/lib/connectors/topstepx.ts: login, Account/search,
// Position/searchOpen, Trade/search (the fill sync) and, only to estimate a
// price, History/retrieveBars. There is no function anywhere that places,
// changes or cancels an order.
//
// Shape of a tick:
//   1. take the single-runner lease (own key; one copy of the server polls)
//   2. pick connections that are on, not key-rejected, not read in the last
//      minute and not in a failure back-off; group them by trader key (one
//      login + one balance read per key)
//   3. stalest group first; before EVERY call ask the budget (about 100/min
//      server-wide). When it says no, stop; the rest go first next tick.
//   4. HTTP 429 -> back off (Retry-After up to 30 min, else 30s/60s/120s, max 5 min)
//   5. a failed read marks the connection unreachable and changes NO alert; only
//      the login's explicit "bad key" answer marks it rejected. A good read
//      replaces the snapshot and refreshes alerts.
//   6. a position that disappeared (or shrank) triggers an immediate fill sync
//      for that connection, and its last open loss stays counted until the
//      closed trade lands, so a warning never drops in the gap.
//
// The tick stops on its own deadline (45 s of a 60 s rhythm; the lease is longer
// and renewed while work runs, so two ticks can never overlap). Phone warnings
// are sent after the lease is given back, capped at 8 s.
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
import { MT5_FIRM_ID, getFirm, isAllowedBaseUrl } from "@/lib/connectors/firms";
import {
  MT5_LIVE_MESSAGES,
  MetaApiError,
  maReadAccountInfo,
  maReadPositions,
  mt5AccessProblem,
  mt5DisplaySymbol,
} from "@/lib/connectors/metaapi";
import { readableConnectionsWhere } from "@/lib/connectors/mt5-access";
import {
  dropSessionToken,
  getSessionToken,
  sessionKey,
  setSessionToken,
} from "@/lib/connectors/session";
import { syncConnection, SyncDeferred } from "@/lib/connectors/sync";
import { knownPointValue } from "@/lib/instruments/futures";
import { priceOpenPosition } from "@/lib/risk/limits";
import { generateAlerts } from "@/lib/alerts/generate";
import { notifyAlertSteps } from "@/lib/push/alerts";
import { withSingleRunner, type RunContext } from "@/lib/single-runner";
import { CallBudget, liveBudget } from "@/lib/live/budget";
import { positionsLeft } from "@/lib/live/closed-between";
import { PENDING_GONE_MAX_MS, pendingLanded, pendingLossOf } from "@/lib/live/state";
import {
  DECRYPT_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  REFUSED_MESSAGE,
  REJECTED_MESSAGE,
  UNREACHABLE_MESSAGE,
} from "@/lib/live/messages";
import { LIVE_MIN_GAP_MS, liveEnabled, livePollIntervalSec } from "@/lib/live/config";

export const LIVE_LOCK_KEY = 4927002; // its own key, different from the 30-minute sweep's 4927001
/** The tick stops itself after this long (of a 60-second rhythm). */
const LIVE_DEADLINE_MS = 45_000;
/** The lease is longer than the deadline and renewed while the tick works. */
const LIVE_LEASE_MS = 90_000;
/** Phone warnings may take this long after the lease is given back. */
const PUSH_CAP_MS = 8_000;

export interface LiveTickStats {
  skipped?: "backoff" | "already-running" | "other-instance";
  groups: number;
  reads: number;
  failed: number;
  rejected: number;
  /** Immediate fill syncs attempted for connections whose positions closed. */
  fillSyncs: number;
  /** Set when the whole tick failed (also logged and kept on the runner's health row). */
  error?: string;
}

/** The round must stop now: the call budget is used up, the broker is backing off, or the tick's deadline hit. */
class BudgetStop extends Error {}
class KeyRejected extends Error {
  constructor(public readonly text: string = REJECTED_MESSAGE) {
    super("key rejected");
  }
}

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
  pendingCloseLoss: number | null;
  pendingCloseAt: Date | null;
}

interface Group {
  key: string;
  baseUrl: string;
  username: string;
  apiKey: string;
  /** An MT5 link through MetaApi: one connection per group, no login, no stored key. */
  mt5?: boolean;
  conns: ConnRow[];
}

let running = false;

// Per-connection retry back-off after failed reads (in memory; resets on restart).
// First failure: retry next tick. Then about 2, 4, 8 minutes, capped at 10.
const failureState = new Map<string, { count: number; nextAt: number }>();
const FAILURE_SLACK_MS = 5_000;

function noteFailure(ids: string[], now: Date): void {
  for (const id of ids) {
    const count = (failureState.get(id)?.count ?? 0) + 1;
    const delayMs = count <= 1 ? 0 : Math.min(60_000 * 2 ** (count - 1), 10 * 60_000);
    failureState.set(id, { count, nextAt: now.getTime() + delayMs });
  }
}

function noteSuccess(id: string): void {
  failureState.delete(id);
}

/** Test helper: forget every connection's failure back-off. */
export function clearFailureBackoff(): void {
  failureState.clear();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One live round. Safe to call twice in a row: the guard is released in `finally`. */
export async function runLiveTick(
  opts: { now?: Date; budget?: CallBudget; pushCapMs?: number } = {}
): Promise<LiveTickStats> {
  const stats: LiveTickStats = { groups: 0, reads: 0, failed: 0, rejected: 0, fillSyncs: 0 };
  const budget = opts.budget ?? liveBudget;
  if (running) return { ...stats, skipped: "already-running" };
  if (budget.inBackoff()) return { ...stats, skipped: "backoff" };

  // `running` clears only in `finally`, i.e. only when the work has really ended.
  running = true;
  try {
    const pushUsers = new Set<string>();
    const outcome = await withSingleRunner(
      LIVE_LOCK_KEY,
      "live-poll",
      (ctx) => tickWork(ctx, opts.now ?? new Date(), budget, stats, pushUsers),
      { deadlineMs: LIVE_DEADLINE_MS, leaseMs: LIVE_LEASE_MS }
    );
    if (outcome === "skipped") return { ...stats, skipped: "other-instance" };
    if (outcome === "failed") {
      stats.error = "The live read failed; see the server log.";
    }
    await sendPushes(pushUsers, opts.pushCapMs ?? PUSH_CAP_MS);
    return stats;
  } finally {
    running = false;
  }
}

/** Phone warnings, after the pass and outside the lease: never blocks the tick for long. */
async function sendPushes(userIds: Set<string>, capMs: number): Promise<void> {
  if (userIds.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled([...userIds].map((u) => notifyAlertSteps(u))),
      new Promise<void>((r) => {
        timer = setTimeout(r, capMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tickWork(
  ctx: RunContext,
  now: Date,
  budget: CallBudget,
  stats: LiveTickStats,
  pushUsers: Set<string>
): Promise<void> {
  // Errors here are NOT swallowed: the runner logs them and records the failure.
  const rows = await prisma.brokerConnection.findMany({
    // MT5 rows are only ever loaded while the owner's switch is on and the owner is on a paid plan.
    where: { AND: [{ nearLive: true, liveStatus: { not: "rejected" } }, readableConnectionsWhere()] },
    include: { account: { select: { startingBalance: true } } },
  });

  const groups = new Map<string, Group>();
  for (const c of rows) {
    if (!getFirm(c.broker)) continue;
    // The floor, in code: never read one account faster than once a minute.
    if (c.lastLiveAt && now.getTime() - c.lastLiveAt.getTime() < LIVE_MIN_GAP_MS) continue;
    // Retry back-off after repeated failures (a bad day at the broker is not hammered).
    const fs = failureState.get(c.id);
    if (fs && now.getTime() < fs.nextAt - FAILURE_SLACK_MS) continue;
    const row: ConnRow = {
      id: c.id,
      userId: c.userId,
      accountId: c.accountId,
      baseUrl: c.baseUrl,
      username: c.username,
      externalAccountId: c.externalAccountId,
      lastLiveAt: c.lastLiveAt,
      livePeakEquity: c.livePeakEquity,
      startingBalance: c.account.startingBalance ?? 0,
      pendingCloseLoss: c.pendingCloseLoss,
      pendingCloseAt: c.pendingCloseAt,
    };
    if (c.broker === MT5_FIRM_ID) {
      // No login to share and no stored password: each MT5 link is its own group.
      const key = `mt5:${c.id}`;
      groups.set(key, { key, baseUrl: c.baseUrl, username: c.username, apiKey: "", mt5: true, conns: [row] });
      continue;
    }
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
    g.conns.push(row);
    groups.set(key, g);
  }

  // Stalest first (never read = oldest of all), so a short budget never starves anyone.
  const ordered = [...groups.values()].sort(
    (a, b) => oldest(a).getTime() - oldest(b).getTime()
  );

  const touchedUsers = new Set<string>();
  for (const g of ordered) {
    if (ctx.expired()) break; // out of time: the stalest go first next tick
    stats.groups++;
    try {
      if (g.mt5) await readMt5Group(g, ctx, now, budget, touchedUsers, stats);
      else await readGroup(g, ctx, now, budget, touchedUsers, stats);
    } catch (err) {
      if (err instanceof BudgetStop) break; // minute's budget used or deadline; resume next tick
      if (err instanceof ConnectorError && err.kind === "rate_limit") {
        budget.onRateLimited(err.retryAfterSec);
        break;
      }
      const ids = g.conns.map((c) => c.id);
      if (err instanceof KeyRejected) {
        await markFailure(ids, "rejected", err.text);
        stats.rejected += ids.length;
      } else if (err instanceof ConnectorError) {
        await markFailure(ids, "unreachable", g.mt5 ? MT5_LIVE_MESSAGES.readUnreachable : messageFor(err));
        noteFailure(ids, now);
        stats.failed += ids.length;
      } else {
        console.error("[live-poll] unexpected error:", (err as Error).message);
        stats.failed += ids.length;
      }
    }
  }

  // Alerts follow reads: only traders with at least one GOOD read this tick. Phone
  // warnings are held back and sent after the lease is given back.
  for (const userId of touchedUsers) {
    try {
      await generateAlerts(userId, now, { skipPush: true });
      pushUsers.add(userId);
    } catch (err) {
      console.error("[live-poll] alert pass failed:", (err as Error).message);
    }
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

/** Run one broker call, but give up waiting when the tick's own deadline arrives. */
function withinDeadline<T>(ctx: RunContext, p: Promise<T>): Promise<T> {
  const ms = ctx.remainingMs();
  if (ms <= 0) {
    p.catch(() => undefined);
    return Promise.reject(new BudgetStop());
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cutoff = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BudgetStop()), ms);
  });
  return Promise.race([p, cutoff]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readGroup(
  g: Group,
  ctx: RunContext,
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
    if (ctx.expired() || !budget.take()) throw new BudgetStop();
    try {
      token = await withinDeadline(ctx, pxLogin(g.baseUrl, g.username, g.apiKey));
    } catch (err) {
      // ONLY the login's explicit "bad key" answer is a rejected key. A bare 401/403 or a
      // hiccup is just "unreachable" and is retried with back-off.
      if (err instanceof ConnectorError && err.kind === "key_rejected") throw new KeyRejected();
      throw err;
    }
    setSessionToken(g.key, token, now.getTime());
    loggedInThisRound = true;
  }

  // One budgeted broker call. A rejected cached token is replaced with ONE
  // fresh login and the call is tried once more; never a retry loop.
  async function call<T>(fn: (t: string) => Promise<T>): Promise<T> {
    if (!token) await login();
    if (ctx.expired() || !budget.take()) throw new BudgetStop();
    try {
      const r = await withinDeadline(ctx, fn(tok()));
      budget.onSuccess();
      return r;
    } catch (err) {
      if (err instanceof ConnectorError && err.kind === "auth" && !loggedInThisRound) {
        dropSessionToken(g.key);
        token = null;
        await login();
        if (ctx.expired() || !budget.take()) throw new BudgetStop();
        return withinDeadline(ctx, fn(tok()));
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
    if (ctx.expired()) throw new BudgetStop();
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

      // Did a position vanish (or shrink) since the last read? Then its open loss is
      // about to leave the snapshot before the closed trade reaches us.
      const before = await prisma.positionSnapshot.findMany({
        where: { connectionId: c.id, userId: c.userId },
        select: { contractId: true, side: true, size: true, openPnl: true },
      });
      const gone = positionsLeft(before, views);

      const pendingAt = await persistRead(c, views, balanceOf.get(c.externalAccountId), now, gone);
      noteSuccess(c.id);
      touchedUsers.add(c.userId);
      stats.reads++;

      if (pendingAt) await fetchFills(c, ctx, budget, touchedUsers, stats);
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
        noteFailure([c.id], now);
        stats.failed++;
        continue;
      }
      throw err;
    }
  }
}

/**
 * One MT5 link through MetaApi: read the account (balance, equity, the investor flag)
 * and its open positions, then save the snapshot like any other read. Two budgeted
 * calls per read. If the account no longer reports the read-only investor flag, the
 * link is marked rejected and nothing more is read from it.
 */
async function readMt5Group(
  g: Group,
  ctx: RunContext,
  now: Date,
  budget: CallBudget,
  touchedUsers: Set<string>,
  stats: LiveTickStats
): Promise<void> {
  const c = g.conns[0];
  const gate = async () => {
    if (ctx.expired() || !budget.take()) throw new BudgetStop();
  };
  const bounded = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      const r = await withinDeadline(ctx, fn());
      budget.onSuccess();
      return r;
    } catch (err) {
      // The bridge no longer knows this account: only reconnecting helps.
      if (err instanceof MetaApiError && err.code === "not_found") {
        throw new KeyRejected(MT5_LIVE_MESSAGES.readRejected);
      }
      throw err;
    }
  };

  const info = await bounded(() => maReadAccountInfo(c.externalAccountId, { gate }));
  if (mt5AccessProblem(info) === "trading_rights") {
    throw new KeyRejected(MT5_LIVE_MESSAGES.readRejected);
  }
  const positions = await bounded(() => maReadPositions(c.externalAccountId, { gate }));

  const views: SnapshotInput[] = positions.map((p) => ({
    contractId: p.id,
    symbol: mt5DisplaySymbol(p.symbol),
    side: p.side,
    size: p.volume,
    avgPrice: p.openPrice,
    lastPrice: p.currentPrice,
    priceSource: p.currentPrice != null ? ("broker" as const) : null,
    // The bridge's own open profit, already in the account's currency (USD only).
    openPnl: p.unrealizedProfit,
    notPricedReason: p.unrealizedProfit == null ? ("no_price" as const) : null,
  }));

  const before = await prisma.positionSnapshot.findMany({
    where: { connectionId: c.id, userId: c.userId },
    select: { contractId: true, side: true, size: true, openPnl: true },
  });
  const gone = positionsLeft(before, views);
  const pendingAt = await persistRead(c, views, info.balance, now, gone);
  noteSuccess(c.id);
  touchedUsers.add(c.userId);
  stats.reads++;
  if (pendingAt) await fetchFills(c, ctx, budget, touchedUsers, stats);
}

/**
 * A position closed since the last read (or an earlier close is still waiting for its
 * fills): fetch the fills right away, counted in the shared budget. The loss that
 * left stays counted (see state.ts) until a closed trade has landed, so this never
 * lowers a warning; a failure or "not now" just means we try again next tick.
 */
async function fetchFills(
  c: ConnRow,
  ctx: RunContext,
  budget: CallBudget,
  touchedUsers: Set<string>,
  stats: LiveTickStats
): Promise<void> {
  stats.fillSyncs++;
  try {
    await syncConnection(c.id, c.userId, {
      beforeCall: async () => {
        if (ctx.expired() || !budget.take()) throw new SyncDeferred();
      },
      onRateLimit: (s) => budget.onRateLimited(s),
    });
    touchedUsers.add(c.userId);
  } catch (err) {
    // Deferred (budget/deadline) or failed (recorded on the connection by the sync):
    // the open loss stays protected and the next tick tries again.
    if (!(err instanceof SyncDeferred) && !(err instanceof ConnectorError)) {
      console.error("[live-poll] fill sync error:", (err as Error).message);
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
  now: Date,
  gone: { left: boolean; loss: number }
): Promise<Date | null> {
  const openSum = views.reduce((s, v) => s + (v.openPnl ?? 0), 0);
  const closed = await prisma.trade.aggregate({
    where: { userId: c.userId, accountId: c.accountId, exitTime: { not: null } },
    _sum: { pnl: true },
  });
  // Highest equity seen at any read (open profit included): the cautious drawdown peak.
  const equity = c.startingBalance + (closed._sum.pnl ?? 0) + openSum;
  const peak =
    c.livePeakEquity == null || equity > c.livePeakEquity ? equity : c.livePeakEquity;

  // A position left: keep its open loss counted until the closed trade lands. An
  // earlier close still waiting for its trade (not lapsed, not landed) adds to the new
  // loss and keeps its clock; the clock starts at the last read that still saw the
  // position open.
  let earlier = 0;
  let earlierSince: Date | null = null;
  if (
    c.pendingCloseAt &&
    now.getTime() - c.pendingCloseAt.getTime() < PENDING_GONE_MAX_MS &&
    !(await pendingLanded(c.userId, c.accountId, c.pendingCloseAt))
  ) {
    earlier = pendingLossOf({ pendingCloseLoss: c.pendingCloseLoss, pendingCloseAt: c.pendingCloseAt }, now);
    earlierSince = c.pendingCloseAt;
  }
  let pendingAt: Date | null = earlierSince;
  let pending: { pendingCloseLoss?: number | null; pendingCloseAt?: Date | null } = {};
  if (gone.left) {
    pendingAt = earlierSince ?? c.lastLiveAt ?? now;
    pending = { pendingCloseLoss: Math.min(0, earlier + gone.loss), pendingCloseAt: pendingAt };
    // The closed trade may already be here (30-minute sweep): nothing to wait for.
    if (await pendingLanded(c.userId, c.accountId, pendingAt)) {
      pendingAt = null;
      pending = { pendingCloseLoss: null, pendingCloseAt: null };
    }
  } else if (c.pendingCloseAt && !earlierSince) {
    pending = { pendingCloseLoss: null, pendingCloseAt: null }; // landed or lapsed: tidy up
  }

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
        ...pending,
      },
    }),
  ]);
  return pendingAt;
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
