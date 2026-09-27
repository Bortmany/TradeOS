import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  HeartPulse,
  AlertTriangle,
  ClipboardList,
  NotebookPen,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { buildReport, type ReportPeriod, type ReportData } from "@/lib/reports";
import type { TradeRecord } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/reports/print-button";
import {
  cn,
  formatCurrency,
  formatPercent,
  formatDateTime,
  formatDate,
  pnlColor,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS: { period: ReportPeriod; label: string; sub: string }[] = [
  { period: "day", label: "Daily", sub: "Today" },
  { period: "week", label: "Weekly", sub: "Last 7 days" },
  { period: "month", label: "Monthly", sub: "Last 30 days" },
];

function normalizePeriod(raw?: string): ReportPeriod {
  return raw === "week" || raw === "month" ? raw : "day";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; account?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { period: periodParam, account } = await searchParams;
  const period = normalizePeriod(periodParam);
  const active = TABS.find((t) => t.period === period)!;

  const report = await buildReport(user.id, period, account);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Reports"
        description="Print-ready performance & compliance summaries."
      >
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" className="gap-1.5 print:hidden">
            <Link href="/reports/review">
              <NotebookPen className="h-4 w-4" />
              Weekly review
            </Link>
          </Button>
          <PrintButton />
        </div>
      </PageHeader>

      {/* Server-driven tabs */}
      <div className="flex items-center justify-between print:hidden">
        <div className="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1">
          {TABS.map((t) => {
            const href = `/reports?period=${t.period}${account ? `&account=${account}` : ""}`;
            const isActive = t.period === period;
            return (
              <Link
                key={t.period}
                href={href}
                className={cn(
                  "inline-flex items-center rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-surface-overlay text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          {formatDate(report.from)} – {formatDate(report.to)}
        </p>
      </div>

      {report.tradeCount === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title={`No trades in this ${active.label.toLowerCase()} window`}
          description="Nothing to report for the selected period. Try a wider window or import more trades."
          action={
            <Button asChild variant="secondary" className="print:hidden">
              <Link href="/import">Import trades</Link>
            </Button>
          }
        />
      ) : (
        <ReportBody report={report} periodLabel={active.label} />
      )}
    </div>
  );
}

function ReportBody({ report, periodLabel }: { report: ReportData; periodLabel: string }) {
  const m = report.metrics;
  return (
    <div className="space-y-6">
      {/* Performance summary — the date range lives here (not only in the
          screen-only tab row) so a printed report still states its window. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{periodLabel} Performance</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDate(report.from)} – {formatDate(report.to)} · {report.tradeCount}{" "}
              trades · {m.tradeCount} closed
            </p>
          </div>
          <Badge variant={m.netPnl >= 0 ? "profit" : "loss"} className="tabular">
            {formatCurrency(m.netPnl, { sign: true })}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat
              label="Net P&L"
              value={formatCurrency(m.netPnl, { sign: true })}
              accent={m.netPnl >= 0 ? "profit" : "loss"}
            />
            <Stat label="Win Rate" value={formatPercent(m.winRate)} hint={`${m.winCount}W / ${m.lossCount}L`} />
            <Stat
              label="Profit Factor"
              value={isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"}
            />
            <Stat
              label="Expectancy"
              value={formatCurrency(m.expectancy, { sign: true })}
              accent={m.expectancy >= 0 ? "profit" : "loss"}
            />
            <Stat label="Avg Win" value={formatCurrency(m.avgWin)} accent="profit" />
            <Stat label="Avg Loss" value={formatCurrency(m.avgLoss)} accent="loss" />
            <Stat label="Largest Win" value={formatCurrency(m.largestWin)} accent="profit" />
            <Stat label="Total Fees" value={formatCurrency(m.totalFees)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Compliance */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Rule Compliance</CardTitle>
            </div>
            <Badge variant={report.compliance.totalFails === 0 ? "profit" : "warning"}>
              {report.compliance.totalFails === 0 ? "Clean" : `${report.compliance.totalFails} fails`}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Adherence
                </span>
                <span className="text-2xl font-semibold tabular">
                  {report.compliance.adherencePct.toFixed(0)}%
                </span>
              </div>
              <Progress value={report.compliance.adherencePct} className="mt-2" />
            </div>
            {report.compliance.topViolations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Top violations
                </p>
                {report.compliance.topViolations.map((v) => (
                  <div
                    key={v.ruleName}
                    className="flex items-center justify-between rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{v.ruleName}</span>
                    <Badge variant="loss">{v.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emotional summary */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Emotional Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {report.emotions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No emotions tagged this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Emotion</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Net P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.emotions.map((e) => (
                    <TableRow key={e.tag}>
                      <TableCell className="font-medium capitalize">{e.tag}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
                        {e.count}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular ${pnlColor(e.netPnl)}`}>
                        {formatCurrency(e.netPnl, { sign: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Key mistakes */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <CardTitle>Key Mistakes</CardTitle>
        </CardHeader>
        <CardContent>
          {report.compliance.topViolations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No rule breaks — disciplined {periodLabel.toLowerCase()}. 🎯
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {report.compliance.topViolations.map((v, i) => (
                <div
                  key={v.ruleName}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-loss-muted text-2xs font-semibold text-loss">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.ruleName}</p>
                    <p className="text-2xs text-muted-foreground">
                      Broken {v.count} {v.count === 1 ? "time" : "times"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Best / worst trades */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TradeList title="Best Trades" trades={report.best} tone="profit" />
        <TradeList title="Worst Trades" trades={report.worst} tone="loss" />
      </div>

      {/* Daily breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {report.dailyPnl.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No closed trades in this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.dailyPnl
                  .slice()
                  .reverse()
                  .map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium">{formatDate(`${d.date}T12:00:00`)}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
                        {d.trades}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular ${pnlColor(d.pnl)}`}>
                        {formatCurrency(d.pnl, { sign: true })}
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

function TradeList({
  title,
  trades,
  tone,
}: {
  title: string;
  trades: TradeRecord[];
  tone: "profit" | "loss";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {trades.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tone === "loss" ? "No losing trades. 🎯" : "No trades yet."}
          </p>
        ) : (
          trades.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t.symbol}{" "}
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {t.side}
                  </span>
                </p>
                <p className="truncate text-2xs text-muted-foreground">
                  {formatDateTime(t.entryTime)}
                  {t.strategyTag ? ` · ${t.strategyTag}` : ""}
                </p>
              </div>
              <span className={`shrink-0 font-semibold tabular ${pnlColor(t.pnl)}`}>
                {formatCurrency(t.pnl, { sign: true })}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
