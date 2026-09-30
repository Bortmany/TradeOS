import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TrendingUp,
  Target,
  Scale,
  Activity,
  AlertTriangle,
  ChevronRight,
  Info,
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
  resolveTimeZone,
} from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { collapseViolations } from "@/lib/violation-rows";
import { isDemoDesk } from "@/lib/demo-desk";

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

  // Failing evaluations, newest trade first, carrying enough of the trade for the
  // feed to read like a journal entry — built from the same trades the rest of
  // the dashboard uses, so nothing is loaded twice.
  const violations = data.recentViolations;
  // Same rule broken more than once on the same trade reads as one row + count.
  const violationRows = collapseViolations(violations);
  const tz = resolveTimeZone(user.timezone);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {isDemoDesk(user.email) && (
        <p className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-muted-foreground print:hidden">
          <Info className="h-3.5 w-3.5 shrink-0" />
          This is sample data. Import your own trades to replace it.
        </p>
      )}
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
          labelHint="How far you are below your best profit so far, as a share of that profit."
          value={formatPercent(m.maxDrawdownPct)}
          valueClass="text-loss"
          icon={AlertTriangle}
          hint={`of peak profit · ${formatCurrency(-m.maxDrawdown)}`}
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
              <TooltipProvider delayDuration={300}>
                {violationRows.map((v) => (
                  <Link
                    key={`${v.tradeId}-${v.ruleId}`}
                    href={`/journal/${v.tradeId}`}
                    className="flex min-h-[48px] items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 transition-colors hover:border-loss/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        v.severity === "high"
                          ? "bg-loss"
                          : v.severity === "medium"
                            ? "bg-warning"
                            : "bg-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{v.ruleName}</span>{" "}
                        <span className="text-muted-foreground">
                          {v.symbol} {v.side}
                        </span>
                      </p>
                      <p className="text-2xs tabular text-muted-foreground">
                        {formatDateTime(v.entryTime, tz)} ·{" "}
                        <span className={v.isOpen ? undefined : pnlColor(v.pnl)}>
                          {v.isOpen ? "open" : formatCurrency(v.pnl)}
                        </span>
                      </p>
                    </div>
                    {v.count > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="loss" className="shrink-0 tabular">
                            x{v.count}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Same rule broken {v.count} times on this trade
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                  </Link>
                ))}
              </TooltipProvider>
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
          <CardHeader>
            <CardTitle>Open Alerts</CardTitle>
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
                    {formatDateTime(a.createdAt, tz)}
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
  labelHint,
  value,
  valueClass,
  hint,
  icon: Icon,
}: {
  label: string;
  /** Optional hover hint explaining what the number means. */
  labelHint?: string;
  value: string;
  valueClass?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const labelText = (
    <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
  );
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {labelHint ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {labelText}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{labelHint}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            labelText
          )}
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
