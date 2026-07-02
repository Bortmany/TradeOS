// TradeOS — deterministic alert generation (Phase 2, implemented as backend
// flags rather than push notifications). Runs at the end of a compliance
// recompute so the alert feed always reflects current data.
//
// IMPORTANT: this module must stay node-safe (the seed script calls recompute →
// generateAlerts outside a Next.js request). It therefore uses prisma directly
// and only `import type` from server-only modules.

import { prisma } from "@/lib/db";

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const etDayKey = (d: Date) => ET_DAY.format(d);

interface AlertSpec {
  key: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  accountId?: string | null;
}

const DAY_MS = 86_400_000;
const OVERTRADING_DEFAULT = 10;

/**
 * Regenerates the user's auto-flagged open alerts. Manually created or seeded
 * alerts (without meta.auto) are left untouched. Deterministic given the data.
 */
export async function generateAlerts(userId: string): Promise<number> {
  const [accounts, closedTrades, propAccounts, highFails] = await Promise.all([
    prisma.tradingAccount.findMany({ where: { userId } }),
    prisma.trade.findMany({
      where: { userId, exitTime: { not: null } },
      orderBy: { exitTime: "asc" },
      select: { accountId: true, pnl: true, exitTime: true, entryTime: true },
    }),
    prisma.propAccount.findMany({ where: { userId }, include: { account: true } }),
    prisma.ruleEvaluation.count({
      where: {
        userId,
        status: "fail",
        severity: "high",
        trade: { entryTime: { gte: new Date(Date.now() - 7 * DAY_MS) } },
      },
    }),
  ]);

  const specs: AlertSpec[] = [];
  const todayKey = etDayKey(new Date());

  // Group closed trades by account for equity / daily math.
  const byAccount = new Map<string, typeof closedTrades>();
  for (const t of closedTrades) {
    const arr = byAccount.get(t.accountId) ?? [];
    arr.push(t);
    byAccount.set(t.accountId, arr);
  }

  const startingBalance = new Map(accounts.map((a) => [a.id, a.startingBalance]));

  // ---- Prop-firm guardrails (the high-value alerts) --------------------
  for (const p of propAccounts) {
    const trades = byAccount.get(p.accountId) ?? [];
    const base = p.account.startingBalance;
    let equity = base;
    let peak = base;
    const dayPnl = new Map<string, number>();
    for (const t of trades) {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      const k = etDayKey(t.exitTime as Date);
      dayPnl.set(k, (dayPnl.get(k) ?? 0) + t.pnl);
    }
    const netProfit = equity - base;
    const currentDrawdown = Math.max(0, peak - equity);
    const label = `${p.account.name}`;

    if (p.maxDrawdown != null) {
      const buffer = p.maxDrawdown - currentDrawdown;
      if (buffer <= 0) {
        specs.push({
          key: `prop_dd_breach_${p.id}`,
          type: "drawdown",
          severity: "high",
          accountId: p.accountId,
          title: `${label}: trailing drawdown breached`,
          message: `Drawdown $${currentDrawdown.toFixed(0)} exceeded the $${p.maxDrawdown.toFixed(0)} limit. This account is failed.`,
        });
      } else if (buffer < p.maxDrawdown * 0.25) {
        specs.push({
          key: `prop_dd_risk_${p.id}`,
          type: "drawdown",
          severity: "medium",
          accountId: p.accountId,
          title: `${label}: approaching drawdown limit`,
          message: `Only $${buffer.toFixed(0)} of drawdown buffer left before breach. Size down.`,
        });
      }
    }

    if (p.maxDailyLoss != null) {
      const todayPnl = dayPnl.get(todayKey) ?? 0;
      const todayLoss = Math.max(0, -todayPnl);
      if (todayLoss >= p.maxDailyLoss) {
        specs.push({
          key: `prop_dl_breach_${p.id}`,
          type: "daily_loss_limit",
          severity: "high",
          accountId: p.accountId,
          title: `${label}: daily loss limit hit`,
          message: `Today's loss $${todayLoss.toFixed(0)} reached the $${p.maxDailyLoss.toFixed(0)} limit. Stop trading this account today.`,
        });
      } else if (todayLoss >= p.maxDailyLoss * 0.75) {
        specs.push({
          key: `prop_dl_risk_${p.id}`,
          type: "daily_loss_limit",
          severity: "medium",
          accountId: p.accountId,
          title: `${label}: nearing daily loss limit`,
          message: `Down $${todayLoss.toFixed(0)} of a $${p.maxDailyLoss.toFixed(0)} daily limit. $${(p.maxDailyLoss - todayLoss).toFixed(0)} buffer left.`,
        });
      }
    }

    if (p.profitTarget != null && netProfit >= p.profitTarget && p.phase === "evaluation") {
      specs.push({
        key: `prop_pt_${p.id}`,
        type: "profit_target",
        severity: "low",
        accountId: p.accountId,
        title: `${label}: profit target reached`,
        message: `Net $${netProfit.toFixed(0)} meets the $${p.profitTarget.toFixed(0)} target. Check consistency & min-days before requesting a payout.`,
      });
    }
  }

  // ---- Overtrading (per account, most recent offending day) ------------
  for (const [accountId, trades] of byAccount) {
    const counts = new Map<string, number>();
    for (const t of trades) {
      const k = etDayKey(t.exitTime as Date);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const offending = [...counts.entries()]
      .filter(([, n]) => n > OVERTRADING_DEFAULT)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1));
    if (offending.length) {
      const [day, n] = offending[0];
      const name = accounts.find((a) => a.id === accountId)?.name ?? "Account";
      specs.push({
        key: `overtrading_${accountId}_${day}`,
        type: "overtrading",
        severity: "medium",
        accountId,
        title: `${name}: overtrading on ${day}`,
        message: `${n} trades in a single session (limit ${OVERTRADING_DEFAULT}). Overtrading is the most common cause of a good day turning red.`,
      });
    }
  }

  // ---- Recent high-severity rule violations ----------------------------
  if (highFails >= 3) {
    specs.push({
      key: `high_violations_week`,
      type: "rule_violation",
      severity: "medium",
      title: `${highFails} high-severity rule breaks this week`,
      message: `You've broken high-severity rules ${highFails} times in the last 7 days. Review your Rule Engine.`,
    });
  }

  // Avoid an unused-var lint on startingBalance while keeping it available.
  void startingBalance;

  // Replace only the previously auto-generated open alerts.
  await prisma.alert.deleteMany({
    where: { userId, status: "open", meta: { contains: '"auto":true' } },
  });

  if (specs.length) {
    await prisma.alert.createMany({
      data: specs.map((s) => ({
        userId,
        accountId: s.accountId ?? null,
        type: s.type,
        severity: s.severity,
        title: s.title,
        message: s.message,
        status: "open",
        meta: JSON.stringify({ auto: true, key: s.key }),
      })),
    });
  }

  return specs.length;
}
