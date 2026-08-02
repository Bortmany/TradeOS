import { redirect } from "next/navigation";
import { BarChart3, TrendingDown } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getDashboardData, getTrades } from "@/lib/data";
import { dailyPnlSeries } from "@/lib/reports";
import { PageHeader } from "@/components/page-header";
import { AccountSwitcher } from "@/components/account-switcher";
import { BucketBar } from "@/components/charts/bucket-bar";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCurrency,
  formatPercent,
  formatDuration,
  pnlColor,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { account } = await searchParams;

  const [accounts, data, trades] = await Promise.all([
    getAccounts(user.id),
    getDashboardData(user.id, account),
    getTrades(user.id, account ? { accountId: account } : {}),
  ]);

  const activeAccount = account ? accounts.find((a) => a.id === account) : null;
  const m = data.metrics;
  const dailyPnl = dailyPnlSeries(trades);

  if (data.tradeCount === 0) {
    return (
      <div className="container max-w-7xl py-6">
        <PageHeader title="Analytics" description="Dissect every edge in your trading.">
          <AccountSwitcher accounts={accounts} />
        </PageHeader>
        <div className="mt-10">
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" />}
            title="No trades to analyze"
            description="Import trades or log one manually to unlock the full analytics suite."
            steps={[
              { label: "Import trades from your broker (or load the sample set)" },
              { label: "Define your rulebook in the Rule Engine" },
              { label: "Dissect your edge by hour, weekday, session and strategy" },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Analytics"
        description={
          activeAccount
            ? `${activeAccount.name} · ${activeAccount.kind}`
            : "All accounts combined"
        }
      >
        <AccountSwitcher accounts={accounts} />
      </PageHeader>

      {/* Performance metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Realized statistics across {m.tradeCount} closed trades
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Expectancy"
              value={formatCurrency(m.expectancy, { sign: true })}
              accent={m.expectancy >= 0 ? "profit" : "loss"}
              hint="Avg $ / trade"
            />
            <Stat
              label="Profit Factor"
              value={isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"}
              hint={`${formatCurrency(m.grossProfit)} / ${formatCurrency(m.grossLoss)}`}
            />
            <Stat
              label="Payoff Ratio"
              value={m.payoffRatio.toFixed(2)}
              hint="Avg win / avg loss"
            />
            <Stat
              label="Avg Win"
              value={formatCurrency(m.avgWin)}
              accent="profit"
              hint={`${m.winCount} wins`}
            />
            <Stat
              label="Avg Loss"
              value={formatCurrency(m.avgLoss)}
              accent="loss"
              hint={`${m.lossCount} losses`}
            />
            <Stat
              label="Largest Win"
              value={formatCurrency(m.largestWin)}
              accent="profit"
            />
            <Stat
              label="Largest Loss"
              value={formatCurrency(m.largestLoss)}
              accent="loss"
            />
            <Stat label="Avg Hold" value={formatDuration(m.avgHoldMinutes)} />
            <Stat
              label="Total Fees"
              value={formatCurrency(m.totalFees)}
              hint="Commissions & fees"
            />
            <Stat
              label="Win Rate"
              value={formatPercent(m.winRate)}
              hint={`${m.winCount}W / ${m.lossCount}L`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Drawdown */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Drawdown</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Underwater equity — peak-to-trough decline
            </p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <TrendingDown className="h-4 w-4 text-loss" />
            <div>
              <p className="text-lg font-semibold tabular text-loss">
                {formatCurrency(-m.maxDrawdown)}
              </p>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                Max · {formatPercent(m.maxDrawdownPct)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DrawdownChart data={data.drawdown} height={220} />
        </CardContent>
      </Card>

      {/* Time-based edge */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By Hour</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">ET hour of entry</p>
          </CardHeader>
          <CardContent>
            <BucketBar data={data.byHour} height={180} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By Weekday</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">P&L by day of week</p>
          </CardHeader>
          <CardContent>
            <BucketBar data={data.byWeekday} height={180} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By Session</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">US futures sessions</p>
          </CardHeader>
          <CardContent>
            <BucketBar data={data.bySession} layout="vertical" height={180} />
          </CardContent>
        </Card>
      </div>

      {/* Strategy */}
      <Card>
        <CardHeader>
          <CardTitle>By Strategy</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Which playbooks actually pay
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BucketBar data={data.byStrategy} layout="vertical" height={220} />
          <BreakdownTable rows={data.byStrategy} label="Strategy" />
        </CardContent>
      </Card>

      {/* Symbols */}
      <Card>
        <CardHeader>
          <CardTitle>By Symbol</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Instrument-level performance
          </p>
        </CardHeader>
        <CardContent>
          <BreakdownTable rows={data.bySymbol} label="Symbol" />
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>P&L Calendar</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Daily realized P&L — intensity scales with magnitude
          </p>
        </CardHeader>
        <CardContent>
          <PnlCalendar data={dailyPnl} />
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownTable({
  rows,
  label,
}: {
  rows: { key: string; netPnl: number; tradeCount: number; winRate: number }[];
  label: string;
}) {
  const sorted = rows.slice().sort((a, b) => b.netPnl - a.netPnl);
  if (sorted.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No data.
      </div>
    );
  }
  return (
    <>
      {/* Phone layout: stacked rows instead of a sideways-scrolling table. */}
      <div className="sm:hidden">
        {sorted.map((r) => (
          <div
            key={r.key}
            className="flex items-baseline justify-between gap-3 border-b border-border py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{r.key}</p>
              <p className="text-xs tabular text-muted-foreground">
                {r.tradeCount} {r.tradeCount === 1 ? "trade" : "trades"}
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                {formatPercent(r.winRate)} win
              </p>
            </div>
            <span className={`shrink-0 font-semibold tabular ${pnlColor(r.netPnl)}`}>
              {formatCurrency(r.netPnl, { sign: true })}
            </span>
          </div>
        ))}
      </div>
      {/* sm and up: the full table, unchanged. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Win %</TableHead>
              <TableHead className="text-right">Net P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.key}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">
                  {r.tradeCount}
                </TableCell>
                <TableCell className="text-right tabular">
                  {formatPercent(r.winRate)}
                </TableCell>
                <TableCell className={`text-right font-semibold tabular ${pnlColor(r.netPnl)}`}>
                  {formatCurrency(r.netPnl, { sign: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
