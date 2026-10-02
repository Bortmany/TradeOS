// TradeOS — deterministic alert generation. Runs at the end of a compliance
// recompute AND after every near-live broker read, so the alert feed reflects
// current data within about a minute.
//
// Honest alerts (live-links slice 1):
//   - The figures come from the ONE shared calculation in src/lib/risk/limits.ts
//     (also used by the Prop page), so an alert and the Prop-page buffer match.
//   - One live alert per account per measure ("daily_loss", "drawdown",
//     "profit_target", "overtrading"; plus one user-level "rule_violation").
//     Identity is meta.key. A step change UPDATES the row in place (never
//     delete-and-recreate), so a dismissal sticks.
//   - Every alert carries its value and an "as at" time in meta.
//   - When the condition ends the alert is marked resolved (status "resolved"),
//     and resolved alerts older than 30 days are deleted.
//   - Dismiss hides an alert at its step; it returns only at a higher step, or
//     after the condition cleared and later happened again (a new row).
//   - A failed or missing live read never clears an alert that open P&L raised.
//
// IMPORTANT: this module must stay node-safe (the seed script calls recompute →
// generateAlerts outside a Next.js request). It therefore uses prisma directly
// and only imports pure modules.

import { prisma } from "@/lib/db";
import {
  computeLimitFigures,
  etDayKey,
  stepFor,
  type OpenState,
} from "@/lib/risk/limits";
import { loadLiveState, openStateFor } from "@/lib/live/state";

export type AlertMeasure =
  | "daily_loss"
  | "drawdown"
  | "profit_target"
  | "overtrading"
  | "rule_violation";

/** What every auto alert stores in Alert.meta (documented in docs/CONTRACTS.md). */
export interface AlertMeta {
  auto: true;
  /** Identity: "<measure>:<propId | accountId | user>". One open alert per key. */
  key: string;
  measure: AlertMeasure;
  /** 50 | 80 | 100, or null for measures with no ladder (overtrading, rule_violation). */
  step: 50 | 80 | 100 | null;
  /** The headline number: loss, drawdown, profit or trade count. */
  value: number;
  limit: number | null;
  /** What is left before the limit (or still to go to the target). */
  left: number | null;
  usedPct: number | null;
  /** When the number was true (ISO): the live read time, or when it was worked out. */
  asAt: string;
  /** "live" = includes a fresh near-live read; "closed" = closed trades only. */
  source: "live" | "closed";
  /** The account has a near-live link (so "closed only" can mean "stale"). */
  liveLinked: boolean;
  openCount: number;
  openEstimated: boolean;
  unpricedCount: number;
  /** Set by the dismiss route: the step at which the trader dismissed it. */
  dismissedStep?: number;
  /** Set when the alert is resolved (ISO). */
  resolvedAt?: string;
}

interface AlertSpec {
  key: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  accountId: string | null;
  meta: Omit<AlertMeta, "auto" | "key">;
}

const DAY_MS = 86_400_000;
const OVERTRADING_DEFAULT = 10;
const RESOLVED_KEEP_DAYS = 30;
// A stale live link protects an alert for at most a day.
const STALE_PROTECT_MS = DAY_MS;

// One pass at a time per trader inside this process, so a recompute and a live
// read finishing together cannot both create the same alert.
const chains = new Map<string, Promise<unknown>>();

export function generateAlerts(userId: string, now: Date = new Date()): Promise<number> {
  const prev = chains.get(userId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => generateAlertsNow(userId, now));
  chains.set(userId, next);
  void next.then(
    () => chains.get(userId) === next && chains.delete(userId),
    () => chains.get(userId) === next && chains.delete(userId)
  );
  return next;
}

function parseMeta(raw: string | null): Partial<AlertMeta> | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? (m as Partial<AlertMeta>) : null;
  } catch {
    return null;
  }
}

const pct = (n: number) => Math.min(100, Math.round(n * 100));

async function generateAlertsNow(userId: string, now: Date): Promise<number> {
  const [accounts, closedTrades, propAccounts, highFails, live] = await Promise.all([
    prisma.tradingAccount.findMany({ where: { userId } }),
    prisma.trade.findMany({
      where: { userId, exitTime: { not: null } },
      orderBy: { exitTime: "asc" },
      select: { accountId: true, pnl: true, exitTime: true },
    }),
    prisma.propAccount.findMany({ where: { userId }, include: { account: true } }),
    prisma.ruleEvaluation.count({
      where: {
        userId,
        status: "fail",
        severity: "high",
        trade: { entryTime: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      },
    }),
    loadLiveState(userId, now),
  ]);

  const specs: AlertSpec[] = [];
  // Keys whose figure came from a stale/missing live read: never lowered or cleared by it.
  const protectedKeys = new Set<string>();

  const byAccount = new Map<string, { pnl: number; exitTime: Date }[]>();
  for (const t of closedTrades) {
    const arr = byAccount.get(t.accountId) ?? [];
    arr.push({ pnl: t.pnl, exitTime: t.exitTime as Date });
    byAccount.set(t.accountId, arr);
  }

  const liveFor = (accountId: string) =>
    live.connections.find((c) => c.accountId === accountId);

  /** Fields every spec of one account shares. */
  function liveMeta(accountId: string, open: OpenState | null) {
    const conn = liveFor(accountId);
    const linked = !!conn && conn.nearLive && conn.health !== "rejected";
    return {
      source: (open ? "live" : "closed") as "live" | "closed",
      liveLinked: linked,
      openCount: open?.openCount ?? 0,
      openEstimated: open?.estimated ?? false,
      unpricedCount: open?.unpricedCount ?? 0,
      asAt: (open && conn?.lastLiveAt ? conn.lastLiveAt : now).toISOString(),
      // A linked account without a fresh read: existing figures are never lowered by this pass.
      stale: linked && !open,
    };
  }

  // ---- Prop-firm guardrails (the high-value alerts) --------------------
  for (const p of propAccounts) {
    const conn = liveFor(p.accountId);
    const open = openStateFor(conn, live.positions);
    const f = computeLimitFigures({
      startingBalance: p.account.startingBalance,
      trades: byAccount.get(p.accountId) ?? [],
      now,
      open,
      livePeakEquity: conn?.livePeakEquity ?? null,
    });
    const lm = liveMeta(p.accountId, open);
    const { stale, ...shared } = lm;
    const label = `${p.account.name}`;

    // Stepped drawdown warnings — one alert per account, at the highest step.
    if (p.maxDrawdown != null && p.maxDrawdown > 0) {
      const key = `drawdown:${p.id}`;
      if (stale) protectedKeys.add(key);
      const used = f.currentDrawdown / p.maxDrawdown;
      const step = stepFor(f.currentDrawdown, p.maxDrawdown);
      const buffer = Math.max(0, p.maxDrawdown - f.currentDrawdown);
      const amounts = `$${f.currentDrawdown.toFixed(0)} of the $${p.maxDrawdown.toFixed(0)} limit (${pct(used)}% used)`;
      const meta = {
        ...shared,
        measure: "drawdown" as const,
        step: step || null,
        value: f.currentDrawdown,
        limit: p.maxDrawdown,
        left: buffer,
        usedPct: pct(used),
      };
      if (step === 100) {
        specs.push({
          key,
          type: "drawdown",
          severity: "high",
          accountId: p.accountId,
          title: `${label}: trailing drawdown breached`,
          message: `Drawdown ${amounts}. This account is failed.`,
          meta,
        });
      } else if (step === 80) {
        specs.push({
          key,
          type: "drawdown",
          severity: "medium",
          accountId: p.accountId,
          title: `${label}: 80% of your drawdown is gone`,
          message: `Drawdown ${amounts}. Only $${buffer.toFixed(0)} of buffer left — size down or stop for the day.`,
          meta,
        });
      } else if (step === 50) {
        specs.push({
          key,
          type: "drawdown",
          severity: "low",
          accountId: p.accountId,
          title: `${label}: halfway to your drawdown limit`,
          message: `Drawdown ${amounts}, $${buffer.toFixed(0)} of buffer left. Nothing is broken — just worth knowing.`,
          meta,
        });
      }
    }

    // Stepped daily-loss warnings — same three steps, today's ET session only.
    if (p.maxDailyLoss != null && p.maxDailyLoss > 0) {
      const key = `daily_loss:${p.id}`;
      if (stale) protectedKeys.add(key);
      const used = f.todayLoss / p.maxDailyLoss;
      const step = stepFor(f.todayLoss, p.maxDailyLoss);
      const buffer = Math.max(0, p.maxDailyLoss - f.todayLoss);
      const amounts = `$${f.todayLoss.toFixed(0)} of a $${p.maxDailyLoss.toFixed(0)} daily limit (${pct(used)}% used)`;
      const meta = {
        ...shared,
        measure: "daily_loss" as const,
        step: step || null,
        value: f.todayLoss,
        limit: p.maxDailyLoss,
        left: buffer,
        usedPct: pct(used),
      };
      if (step === 100) {
        specs.push({
          key,
          type: "daily_loss_limit",
          severity: "high",
          accountId: p.accountId,
          title: `${label}: daily loss limit hit`,
          message: `Today's loss is ${amounts}. Stop trading this account today.`,
          meta,
        });
      } else if (step === 80) {
        specs.push({
          key,
          type: "daily_loss_limit",
          severity: "medium",
          accountId: p.accountId,
          title: `${label}: 80% of today's loss limit used`,
          message: `Down ${amounts}. One more average loser ends your day — $${buffer.toFixed(0)} left.`,
          meta,
        });
      } else if (step === 50) {
        specs.push({
          key,
          type: "daily_loss_limit",
          severity: "low",
          accountId: p.accountId,
          title: `${label}: halfway to today's loss limit`,
          message: `Down ${amounts}, $${buffer.toFixed(0)} left. Nothing is broken — just worth knowing.`,
          meta,
        });
      }
    }

    // Profit target: closed profit only (open P&L is ignored), evaluation phase.
    if (p.profitTarget != null && p.profitTarget > 0 && p.phase === "evaluation") {
      const key = `profit_target:${p.id}`;
      const ratio = f.netProfit / p.profitTarget;
      const step = f.netProfit > 0 ? stepFor(f.netProfit, p.profitTarget) : 0;
      const togo = Math.max(0, p.profitTarget - f.netProfit);
      const meta = {
        ...shared,
        // Target progress never uses open P&L, so it is always "closed trades only".
        source: "closed" as const,
        openCount: 0,
        openEstimated: false,
        unpricedCount: 0,
        measure: "profit_target" as const,
        step: step || null,
        value: f.netProfit,
        limit: p.profitTarget,
        left: togo,
        usedPct: pct(ratio),
      };
      if (step === 100) {
        specs.push({
          key,
          type: "profit_target",
          severity: "low",
          accountId: p.accountId,
          title: `${label}: profit target reached`,
          message: `Net $${f.netProfit.toFixed(0)} meets the $${p.profitTarget.toFixed(0)} target. Check consistency & min-days before requesting a payout.`,
          meta,
        });
      } else if (step === 80) {
        specs.push({
          key,
          type: "profit_target",
          severity: "low",
          accountId: p.accountId,
          title: `${label}: 80% of your profit target`,
          message: `Net $${f.netProfit.toFixed(0)} of the $${p.profitTarget.toFixed(0)} target (${pct(ratio)}%). $${togo.toFixed(0)} to go.`,
          meta,
        });
      } else if (step === 50) {
        specs.push({
          key,
          type: "profit_target",
          severity: "low",
          accountId: p.accountId,
          title: `${label}: halfway to your profit target`,
          message: `Net $${f.netProfit.toFixed(0)} of the $${p.profitTarget.toFixed(0)} target (${pct(ratio)}%). $${togo.toFixed(0)} to go.`,
          meta,
        });
      }
    }
  }

  // ---- Overtrading (per account, today's ET session only) ---------------
  const todayKey = etDayKey(now);
  for (const [accountId, trades] of byAccount) {
    const f = computeLimitFigures({ startingBalance: 0, trades, now });
    if (f.todayTradeCount > OVERTRADING_DEFAULT) {
      const name = accounts.find((a) => a.id === accountId)?.name ?? "Account";
      specs.push({
        key: `overtrading:${accountId}`,
        type: "overtrading",
        severity: "medium",
        accountId,
        title: `${name}: overtrading on ${todayKey}`,
        message: `${f.todayTradeCount} trades in a single session (limit ${OVERTRADING_DEFAULT}). Overtrading is the most common cause of a good day turning red.`,
        meta: {
          measure: "overtrading",
          step: null,
          value: f.todayTradeCount,
          limit: OVERTRADING_DEFAULT,
          left: null,
          usedPct: null,
          asAt: now.toISOString(),
          source: "closed",
          liveLinked: false,
          openCount: 0,
          openEstimated: false,
          unpricedCount: 0,
        },
      });
    }
  }

  // ---- Recent high-severity rule violations ----------------------------
  if (highFails >= 3) {
    specs.push({
      key: "rule_violation:user",
      type: "rule_violation",
      severity: "medium",
      accountId: null,
      title: `${highFails} high-severity rule breaks this week`,
      message: `You've broken high-severity rules ${highFails} times in the last 7 days. Review your Rule Engine.`,
      meta: {
        measure: "rule_violation",
        step: null,
        value: highFails,
        limit: null,
        left: null,
        usedPct: null,
        asAt: now.toISOString(),
        source: "closed",
        liveLinked: false,
        openCount: 0,
        openEstimated: false,
        unpricedCount: 0,
      },
    });
  }

  await reconcile(userId, specs, protectedKeys, now);
  return specs.length;
}

/**
 * Bring the stored auto alerts in line with `specs`: update in place, create
 * what is new, resolve what ended, delete resolved rows older than 30 days.
 * Manually created or seeded alerts (without meta.auto) are never touched.
 */
async function reconcile(
  userId: string,
  specs: AlertSpec[],
  protectedKeys: Set<string>,
  now: Date
): Promise<void> {
  const existing = await prisma.alert.findMany({
    where: { userId, meta: { contains: '"auto":true' } },
  });

  const openByKey = new Map<string, (typeof existing)[number]>();
  const stillOpenDupes: (typeof existing)[number][] = [];
  const resolvedRows: (typeof existing)[number][] = [];
  // Newest first so a stray duplicate (from an old race) is the one resolved.
  for (const a of [...existing].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
    if (a.status !== "open") {
      if (a.status === "resolved") resolvedRows.push(a);
      continue;
    }
    const m = parseMeta(a.meta);
    const key = typeof m?.key === "string" ? m.key : null;
    if (key && !openByKey.has(key)) openByKey.set(key, a);
    else stillOpenDupes.push(a);
  }

  const specKeys = new Set(specs.map((s) => s.key));

  for (const spec of specs) {
    const row = openByKey.get(spec.key);
    const stepNow = spec.meta.step ?? 0;
    if (!row) {
      await prisma.alert.create({
        data: {
          userId,
          accountId: spec.accountId,
          type: spec.type,
          severity: spec.severity,
          title: spec.title,
          message: spec.message,
          status: "open",
          meta: JSON.stringify({ auto: true, key: spec.key, ...spec.meta }),
        },
      });
      continue;
    }
    const old = parseMeta(row.meta) ?? {};
    // A stale link never lowers a figure that a live read raised.
    if (protectedKeys.has(spec.key) && isRecent(old.asAt, now) && stepNow < (old.step ?? 0)) {
      continue;
    }
    // (If a dismissal landed between our read and this write, dismissedAt is set but
    // the step note may be missing: fall back to the step the alert was at.)
    const dismissedStep =
      typeof old.dismissedStep === "number"
        ? old.dismissedStep
        : row.dismissedAt
          ? (old.step ?? 0)
          : undefined;
    // Dismissed stays dismissed at the same (or a lower) step; a higher step brings it back.
    const resurface = dismissedStep !== undefined && stepNow > dismissedStep;
    const meta: AlertMeta = {
      auto: true,
      key: spec.key,
      ...spec.meta,
      ...(dismissedStep !== undefined && !resurface ? { dismissedStep } : {}),
    };
    await prisma.alert.update({
      where: { id: row.id },
      data: {
        accountId: spec.accountId,
        type: spec.type,
        severity: spec.severity,
        title: spec.title,
        message: spec.message,
        meta: JSON.stringify(meta),
        ...(resurface ? { dismissedAt: null } : {}),
      },
    });
  }

  // Conditions that ended: mark resolved (the live read never clears what it did not see).
  for (const [key, row] of openByKey) {
    if (specKeys.has(key)) continue;
    const old = parseMeta(row.meta) ?? {};
    if (protectedKeys.has(key) && isRecent(old.asAt, now)) continue;
    await resolveRow(row.id, old, now);
  }
  for (const row of stillOpenDupes) {
    await resolveRow(row.id, parseMeta(row.meta) ?? {}, now);
  }

  // Housekeeping: resolved auto alerts older than 30 days.
  const cutoff = now.getTime() - RESOLVED_KEEP_DAYS * DAY_MS;
  const expired = resolvedRows
    .filter((r) => {
      const at = parseMeta(r.meta)?.resolvedAt;
      const t = at ? new Date(at).getTime() : r.createdAt.getTime();
      return t < cutoff;
    })
    .map((r) => r.id);
  if (expired.length) {
    await prisma.alert.deleteMany({ where: { userId, id: { in: expired } } });
  }
}

function isRecent(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now.getTime() - t < STALE_PROTECT_MS;
}

async function resolveRow(id: string, old: Partial<AlertMeta>, now: Date): Promise<void> {
  await prisma.alert.update({
    where: { id },
    data: {
      status: "resolved",
      meta: JSON.stringify({ ...old, resolvedAt: now.toISOString() }),
    },
  });
}
