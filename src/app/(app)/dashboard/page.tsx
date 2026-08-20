import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TrendingUp,
  Target,
  Scale,
  Activity,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getDashboardData, getOpenAlerts, getTrades } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { AccountSwitcher } from "@/components/account-switcher";
import { EquityChart } from "@/components/charts/equity-chart";
import { BucketBar } from "@/components/charts/bucket-bar";
import { ScoreRing, ScoreMeter } from "@/components/charts/score-ring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LoadSampleData } from "@/components/load-sample-data";
import {
  formatCurrency,
  formatPercent,
  pnlColor,
  formatDuration,
  formatDateTime,
  formatDate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { account } = await searchParams;

  const [accounts, data, alerts, trades] = await Promise.all([
    getAccounts(user.id),
    getDashboardData(user.id, account),
    getOpenAlerts(user.id),
    // Same user-scoped, account-filtered set the dashboard data uses — read only,
    // so violations can be shown with the symbol, date and P&L of their trade.
    getTrades(user.id, account ? { accountId: account } : {}),
  ]);

  const activeAccount = account ? accounts.find((a) => a.id === account) : null;
  const m = data.metrics;

  if (data.tradeCount === 0) {
    return (
      <div className="container max-w-7xl py-6">
        <PageHeader title="Dashboard" description="Your trading, quantified." />
        <div className="mt-10">
          <EmptyState
            icon={<Activity className="h-8 w-8" />}
            title="Your discipline score starts here"
            description="Three steps and every trade you take gets graded against your own rules."
            steps={[
              { label: "Import trades from your broker (or load the sample set)" },
              { label: "Define your rulebook in the Rule Engine" },
              { label: "Watch your 0–100 discipline score on every trade" },
            ]}
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <LoadSampleData />
                <Button asChild variant="secondary">
                  <Link href="/import">Import your trades</Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const startingBalance = activeAccount?.startingBalance ?? 0;

  // Failing evaluations, newest trade first, carrying enough of the trade for the
  // feed to read like a journal entry (which rule, what it cost, when).
  const violations = trades
    .flatMap((t) =>
      (data.evaluations[t.id] ?? [])
        .filter((e) => e.status === "fail")
        .map((e) => ({
          tradeId: t.id,
          symbol: t.symbol,
          entryTime: t.entryTime,
          pnl: t.pnl,
          isOpen: t.exitTime === null,
          ...e,
        }))
    )
    .slice(0, 5);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Dashboard"
        description={
          activeAccount ? `${activeAccount.name} · ${activeAccount.kind}` : "All accounts combined"
        }
      >
        <AccountSwitcher accounts={accounts} />
      </PageHeader>

      {/* Discipline hero — the score is the product's anchor metric */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Discipline Score</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every trade graded against your own rulebook — deterministic, no black box.
            </p>
          </div>
          <Button asChild variant="outline" size="lg" className="shrink-0 px-4">
            <Link href="/rules">Rulebook</Link>
          </Button>
        </CardHeader>
        {/* The ring owns the card on its own row; the four sub-scores sit under
            it as a compact strip so nothing competes with the anchor metric. */}
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-1.5 py-2">
            <ScoreRing
              score={data.discipline.overall}
              size={208}
              strokeWidth={14}
              label="Overall"
            />
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              Out of 100 · {m.tradeCount} trades graded
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
            {data.discipline.breakdown.map((b) => (
              <ScoreMeter key={b.label} label={b.label} score={b.score} detail={b.detail} compact />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI row — compact, secondary to the score */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Net P&L"
          value={formatCurrency(m.netPnl, { sign: true })}
          valueClass={pnlColor(m.netPnl)}
          icon={TrendingUp}
          hint={`${m.tradeCount} trades · ${formatCurrency(m.totalFees)} fees`}
        />
        <Kpi
          label="Win Rate"
          value={formatPercent(m.winRate)}
          icon={Target}
          hint={`${m.winCount}W / ${m.lossCount}L`}
        />
        <Kpi
          label="Profit Factor"
          value={isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"}
          icon={Scale}
          hint={`Expectancy ${formatCurrency(m.expectancy, { sign: true })}`}
        />
        <Kpi
          label="Max Drawdown"
          value={formatCurrency(-m.maxDrawdown)}
          valueClass="text-loss"
          icon={AlertTriangle}
          hint={formatPercent(m.maxDrawdownPct)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Equity curve */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Equity Curve</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Cumulative net P&L over time
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-lg font-semibold tabular ${pnlColor(m.netPnl)}`}>
                {formatCurrency(m.netPnl, { sign: true })}
              </p>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                Streak{" "}
                <span className={`tabular ${pnlColor(m.currentStreak)}`}>
                  {m.currentStreak > 0 ? `+${m.currentStreak}` : m.currentStreak}
                </span>
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <EquityChart data={data.equity} startingBalance={startingBalance} />
          </CardContent>
        </Card>

        {/* Recent violations — written as journal entries: the rule you broke,
            what it cost you, and when. Each one opens that trade's journal. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="min-w-0">
              <CardTitle>Recent Violations</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Straight from your journal — tap one to read the whole trade.
              </p>
            </div>
            <Badge variant={violations.length ? "loss" : "profit"}>
              {violations.length ? `${violations.length}` : "Clean"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {violations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No rule violations in this view. 🎯
              </p>
            ) : (
              violations.map((v, i) => (
                <Link
                  key={i}
                  href={`/journal/${v.tradeId}`}
                  className="block rounded-lg border border-border bg-surface-raised px-3 py-2.5 transition-colors hover:border-loss/40"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        v.severity === "high"
                          ? "bg-loss"
                          : v.severity === "medium"
                            ? "bg-warning"
                            : "bg-muted-foreground"
                      }`}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{v.ruleName}</p>
                    <span className={`shrink-0 text-2xs font-semibold tabular ${pnlColor(v.pnl)}`}>
                      {v.isOpen ? "Open" : formatCurrency(v.pnl, { sign: true })}
                    </span>
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                    {v.explanation}
                  </p>
                  <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground/60">
                    {v.symbol} · {formatDate(v.entryTime)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>P&L by Session</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketBar data={data.bySession} layout="vertical" height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>P&L by Weekday</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketBar data={data.byWeekday} height={220} />
          </CardContent>
        </Card>
      </div>

      {/* Open alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Open Alerts</CardTitle>
            <Link
              href="/prop"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === "high"
                      ? "text-loss"
                      : a.severity === "medium"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-2xs text-muted-foreground">{a.message}</p>
                  <p className="mt-0.5 text-2xs text-muted-foreground/60">
                    {formatDateTime(a.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="pt-2 text-center text-2xs text-muted-foreground">
        Avg hold {formatDuration(m.avgHoldMinutes)} · Largest win{" "}
        {formatCurrency(m.largestWin)} · Largest loss {formatCurrency(m.largestLoss)}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {/* Steps down a size where the column is narrow (2-up on phones, 4-up at
            lg) so long P&L figures stay fully readable instead of being cut off. */}
        <p
          className={`mt-2 truncate text-xl font-semibold tabular sm:text-2xl lg:text-xl xl:text-2xl ${valueClass ?? ""}`}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
