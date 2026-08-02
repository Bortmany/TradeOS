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
import { getAccounts, getDashboardData, getOpenAlerts } from "@/lib/data";
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

  const [accounts, data, alerts] = await Promise.all([
    getAccounts(user.id),
    getDashboardData(user.id, account),
    getOpenAlerts(user.id),
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

  // Flatten failing evaluations across trades for the "recent violations" feed.
  const violations = Object.entries(data.evaluations)
    .flatMap(([tradeId, evs]) =>
      evs.filter((e) => e.status === "fail").map((e) => ({ tradeId, ...e }))
    )
    .slice(0, 6);

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
        <CardContent className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex shrink-0 justify-center md:px-8">
            <ScoreRing
              score={data.discipline.overall}
              size={168}
              strokeWidth={12}
              label="Overall"
            />
          </div>
          <div className="hidden h-32 w-px shrink-0 bg-border md:block" />
          <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {data.discipline.breakdown.map((b) => (
              <ScoreMeter key={b.label} label={b.label} score={b.score} detail={b.detail} />
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

        {/* Recent violations */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Violations</CardTitle>
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
                  className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised px-3 py-2 transition-colors hover:border-loss/40"
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      v.severity === "high"
                        ? "bg-loss"
                        : v.severity === "medium"
                          ? "bg-warning"
                          : "bg-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.ruleName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{v.explanation}</p>
                  </div>
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
