// TradeOS — one recorded backtest. Results are a self-contained snapshot: the
// page renders entirely from the stored JSON (metrics, curves, buckets and row
// samples), so it keeps working even after the source dataset is deleted.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBacktestRun } from "@/lib/backtest-data";
import { computeDrawdownSeries } from "@/lib/analytics";
import {
  BACKTEST_KIND_LABELS,
  SESSION_LABELS,
  SIM_STRATEGY_LABELS,
  WEEKDAY_SHORT,
} from "@/lib/backtest/labels";
import type {
  BacktestKind,
  ReplayConfig,
  SessionKey,
  SimConfig,
  SimStrategy,
  StoredMetrics,
} from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  pnlColor,
} from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { BucketBar } from "@/components/charts/bucket-bar";
import { RunRowActions } from "@/components/backtest/backtest-manager";

export const dynamic = "force-dynamic";

// After the JSON round-trip, config dates are ISO strings.
type StoredConfig = Partial<Omit<ReplayConfig, "from" | "to"> & Omit<SimConfig, "kind">> & {
  from?: string;
  to?: string;
};

export default async function BacktestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const run = await getBacktestRun(user.id, id);
  if (!run) notFound();

  const results = run.results;
  const cfg = (run.config ?? {}) as StoredConfig;
  const kindLabel = BACKTEST_KIND_LABELS[run.kind as BacktestKind] ?? run.kind;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader title={run.name} description={`${kindLabel} test · ${formatDate(run.createdAt)}`}>
        <div className="flex items-center gap-2">
          <RunRowActions id={run.id} name={run.name} notes={run.notes} redirectTo="/backtest" />
          <Button asChild variant="outline" size="sm">
            <Link href="/backtest">
              <ArrowLeft className="h-4 w-4" /> All tests
            </Link>
          </Button>
        </div>
      </PageHeader>

      {run.status === "failed" || !results || results.error ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium">This test did not complete</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {results?.error ?? "The stored results are unreadable."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <BacktestResultsView run={run} results={results} cfg={cfg} />
      )}
    </div>
  );
}

function BacktestResultsView({
  run,
  results,
  cfg,
}: {
  run: NonNullable<Awaited<ReturnType<typeof getBacktestRun>>>;
  results: NonNullable<NonNullable<Awaited<ReturnType<typeof getBacktestRun>>>["results"]>;
  cfg: StoredConfig;
}) {
  const variant = results.variant as StoredMetrics | undefined;
  const baseline = (results.baseline ?? null) as StoredMetrics | null;
  const isReplay = run.kind === "replay";
  const winRate = variant?.winRate ?? null;
  const baselineWinRate = baseline?.winRate ?? null;

  const equityVariant = results.equityVariant ?? [];
  const equityBaseline = results.equityBaseline ?? [];
  const drawdown = computeDrawdownSeries(equityVariant);

  const profitFactorText = (m: StoredMetrics | null): string => {
    if (!m) return "—";
    if (m.profitFactor !== null && m.profitFactor !== undefined) return m.profitFactor.toFixed(2);
    // Sanitized Infinity: wins with zero losses.
    return (m.winCount ?? 0) > 0 ? "∞" : "—";
  };

  return (
    <>
      {results.truncated && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-muted-foreground">
              This test hit the 10,000-trade query cap — results cover the most recent
              10,000 trades in the window.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Headline metrics */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Net P&L"
            value={
              <span className={pnlColor(variant?.netPnl ?? 0)}>
                {formatCurrency(variant?.netPnl ?? 0, { sign: true })}
              </span>
            }
            delta={
              isReplay && baseline
                ? `actual: ${formatCurrency(baseline.netPnl ?? 0, { sign: true })}`
                : undefined
            }
          />
          <Stat
            label="Win rate"
            value={winRate !== null ? formatPercent(winRate) : "—"}
            delta={
              isReplay && baselineWinRate !== null
                ? `actual: ${formatPercent(baselineWinRate)}`
                : undefined
            }
          />
          <Stat
            label="Trades"
            value={results.tradeCountTotal ?? 0}
            delta={
              isReplay && baseline ? `actual: ${baseline.tradeCount ?? 0}` : undefined
            }
          />
          <Stat
            label="Profit factor"
            value={profitFactorText(variant ?? null)}
            delta={isReplay && baseline ? `actual: ${profitFactorText(baseline)}` : undefined}
          />
          <Stat
            label="Expectancy"
            value={formatCurrency(variant?.expectancy ?? 0, { sign: true })}
            hint="avg $ per trade"
          />
          <Stat
            label="Max drawdown"
            value={
              <span className={(variant?.maxDrawdown ?? 0) > 0 ? "text-loss" : ""}>
                {formatCurrency(-(variant?.maxDrawdown ?? 0))}
              </span>
            }
            delta={
              isReplay && baseline
                ? `actual: ${formatCurrency(-(baseline.maxDrawdown ?? 0))}`
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Equity + drawdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Equity curve</CardTitle>
            {isReplay && (
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                Strategy (solid) vs. what you actually did (dashed)
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ComparisonChart
              variant={equityVariant}
              baseline={isReplay ? equityBaseline : []}
              variantLabel="Strategy"
              baselineLabel="Actual"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Drawdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DrawdownChart data={drawdown} height={280} />
          </CardContent>
        </Card>
      </div>

      {/* Buckets */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By session</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketBar data={results.bySession ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By hour</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketBar data={results.byHour ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By weekday</CardTitle>
          </CardHeader>
          <CardContent>
            <BucketBar data={results.byWeekday ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Config + notes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test settings</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              {configRows(run.kind, cfg, run.datasetName).map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {run.notes ? (
              <p className="whitespace-pre-wrap text-sm">{run.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No notes yet — use the pencil above to record what this test told you.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exclusions (replay + rulebook) */}
      {isReplay && (results.excludedCountTotal ?? 0) > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Excluded by the rulebook</CardTitle>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {(results.exclusions?.length ?? 0) < (results.excludedCountTotal ?? 0)
                ? `showing ${results.exclusions?.length} of ${results.excludedCountTotal}`
                : `${results.excludedCountTotal} trade${results.excludedCountTotal === 1 ? "" : "s"}`}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead>Broken rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(results.exclusions ?? []).map((x) => (
                  <TableRow key={x.tradeId}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(new Date(x.entryTime))}
                    </TableCell>
                    <TableCell className="tabular">{x.symbol}</TableCell>
                    <TableCell className={`text-right tabular ${pnlColor(x.pnl)}`}>
                      {formatCurrency(x.pnl, { sign: true })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {x.failedRules.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Trades */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{isReplay ? "Trades kept by the strategy" : "Simulated trades"}</CardTitle>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            {(results.trades?.length ?? 0) < (results.tradeCountTotal ?? 0)
              ? `showing ${results.trades?.length} of ${results.tradeCountTotal}`
              : `${results.tradeCountTotal ?? 0} trade${(results.tradeCountTotal ?? 0) === 1 ? "" : "s"}`}
          </p>
        </CardHeader>
        <CardContent>
          {(results.trades?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No trades matched this test.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry px</TableHead>
                  <TableHead className="text-right">Exit px</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(results.trades ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(new Date(t.entryTime))}
                    </TableCell>
                    <TableCell className="tabular">{t.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={t.side === "long" ? "profit" : "loss"}>{t.side}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{t.quantity}</TableCell>
                    <TableCell className="text-right tabular">{t.entryPrice}</TableCell>
                    <TableCell className="text-right tabular">{t.exitPrice ?? "—"}</TableCell>
                    <TableCell className={`text-right tabular ${pnlColor(t.pnl)}`}>
                      {formatCurrency(t.pnl, { sign: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function configRows(
  kind: string,
  cfg: StoredConfig,
  datasetName: string | null
): { label: string; value: string }[] {
  if (kind === "replay") {
    return [
      { label: "Strategies", value: cfg.strategyTags?.length ? cfg.strategyTags.join(", ") : "All" },
      { label: "Symbols", value: cfg.symbols?.length ? cfg.symbols.join(", ") : "All" },
      {
        label: "Sessions",
        value: cfg.sessions?.length
          ? cfg.sessions.map((s) => SESSION_LABELS[s as SessionKey] ?? s).join(", ")
          : "All",
      },
      {
        label: "Weekdays",
        value: cfg.weekdays?.length
          ? cfg.weekdays.map((d) => WEEKDAY_SHORT[d] ?? String(d)).join(", ")
          : "All",
      },
      { label: "Side", value: cfg.side ?? "Long & short" },
      {
        label: "Window",
        value:
          cfg.from || cfg.to
            ? `${cfg.from ? formatDate(new Date(cfg.from)) : "start"} – ${cfg.to ? formatDate(new Date(cfg.to)) : "now"}`
            : "All history",
      },
      { label: "Rulebook filter", value: cfg.ruleBookId ? "Skip rule-breaking trades" : "None" },
    ];
  }
  const strategy = cfg.strategy as SimStrategy | undefined;
  const rows = [
    { label: "Dataset", value: datasetName ?? "Deleted dataset" },
    { label: "Strategy", value: strategy ? SIM_STRATEGY_LABELS[strategy] : "—" },
    { label: "Direction", value: cfg.direction ?? "both" },
    { label: "Contracts", value: String(cfg.contracts ?? 1) },
    {
      label: "Bracket",
      value: `${cfg.stopPoints != null ? `${cfg.stopPoints}pt stop` : "no stop"} / ${cfg.targetPoints != null ? `${cfg.targetPoints}pt target` : "no target"}`,
    },
    { label: "Flatten at (ET)", value: cfg.flattenAt ?? "15:55" },
    {
      label: "Costs",
      value: `$${cfg.feesPerSide ?? 2.25}/side · ${cfg.slippageTicks ?? 0} tick slippage`,
    },
  ];
  if (strategy === "opening_range_breakout") {
    rows.splice(2, 0, { label: "Opening range", value: `${cfg.rangeMinutes ?? 15} min` });
  }
  if (strategy === "ma_cross") {
    rows.splice(2, 0, {
      label: "Averages",
      value: `${(cfg.maType ?? "sma").toUpperCase()} ${cfg.fastPeriod ?? 9} / ${cfg.slowPeriod ?? 21}`,
    });
  }
  if (strategy === "prev_day_level") {
    rows.splice(2, 0, { label: "Level", value: cfg.levelSide ?? "both" });
  }
  return rows;
}
