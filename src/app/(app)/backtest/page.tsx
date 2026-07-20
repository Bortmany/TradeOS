// TradeOS — the Testing Portal. Every strategy test the user runs is recorded
// here: replay tests over their own history and simulations over uploaded
// candle data, with the datasets managed alongside.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, FlaskConical, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import {
  getBacktestRuns,
  getMarketDatasets,
  getReplayFormOptions,
} from "@/lib/backtest-data";
import { BACKTEST_KIND_LABELS } from "@/lib/backtest/labels";
import { formatCurrency, formatDate, formatPercent, pnlColor } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NewReplayDialog,
  NewSimulationDialog,
  NewDatasetDialog,
  DatasetDeleteButton,
  RunRowActions,
} from "@/components/backtest/backtest-manager";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const gated = !hasFeature(user.plan as Plan, user.billingStatus, "backtesting");
  if (gated) {
    return (
      <div className="container max-w-7xl py-6">
        <PageHeader
          title="Backtesting"
          description="Test strategies on your past sessions and record every run."
        />
        <div className="mt-10">
          <EmptyState
            icon={<Lock className="h-8 w-8" />}
            title="Backtesting is a Pro feature"
            description="Upgrade to replay your history with what-if filters, simulate strategies on market data, and keep every test recorded in one portal."
            action={
              <Button asChild>
                <Link href="/settings/billing">Upgrade to Pro</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const [runs, datasets, options] = await Promise.all([
    getBacktestRuns(user.id),
    getMarketDatasets(user.id),
    getReplayFormOptions(user.id),
  ]);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Backtesting"
        description="Test strategies on your past sessions — every run is recorded here."
      >
        <div className="flex items-center gap-2">
          <NewDatasetDialog />
          <NewSimulationDialog
            datasets={datasets.map((d) => ({ id: d.id, name: d.name, symbol: d.symbol }))}
          />
          <NewReplayDialog options={options} />
        </div>
      </PageHeader>

      {runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<FlaskConical className="h-8 w-8" />}
            title="Run your first strategy test"
            description="Replay your recorded trades with what-if filters, or simulate a strategy on uploaded market data. Results are saved here so tests build on each other."
            steps={[
              { label: "Import trades so there is history to replay", done: options.strategyTags.length > 0 },
              { label: "Run a replay test — pick a strategy, sessions, or a rulebook" },
              { label: "Upload a candle CSV to simulate strategies on market data" },
            ]}
            action={<NewReplayDialog options={options} />}
          />
        </div>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recorded tests</CardTitle>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link
                        href={`/backtest/${run.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {run.name}
                      </Link>
                      {run.status === "failed" && (
                        <Badge variant="loss" className="ml-2">
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.kind === "replay" ? "info" : "secondary"}>
                        {BACKTEST_KIND_LABELS[run.kind as "replay" | "simulation"] ?? run.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {run.tradeCount ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {run.winRate !== null ? formatPercent(run.winRate) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular ${run.netPnl !== null ? pnlColor(run.netPnl) : ""}`}
                    >
                      {run.netPnl !== null ? formatCurrency(run.netPnl, { sign: true }) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(run.createdAt)}
                    </TableCell>
                    <TableCell>
                      <RunRowActions id={run.id} name={run.name} notes={run.notes} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Market datasets</CardTitle>
          <NewDatasetDialog />
        </CardHeader>
        <CardContent>
          {datasets.length === 0 ? (
            <EmptyState
              icon={<Database className="h-8 w-8" />}
              title="No market data yet"
              description="Upload a candle CSV export (TradingView, NinjaTrader) to run strategy simulations. Replay tests need no market data."
              action={<NewDatasetDialog />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Bar size</TableHead>
                  <TableHead className="text-right">Candles</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell className="font-medium">{ds.name}</TableCell>
                    <TableCell className="tabular">{ds.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{ds.timeframe}</TableCell>
                    <TableCell className="text-right tabular">
                      {ds.candleCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ds.firstTime && ds.lastTime
                        ? `${formatDate(ds.firstTime)} – ${formatDate(ds.lastTime)}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DatasetDeleteButton id={ds.id} name={ds.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
