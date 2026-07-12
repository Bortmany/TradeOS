import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getTradeDetail } from "@/lib/journal";
import { TradeContextChart } from "@/components/journal/trade-context-chart";
import { TradeReplay } from "@/components/journal/trade-replay";
import { TradeEditor } from "@/components/journal/trade-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import {
  formatCurrency,
  formatNumber,
  formatDuration,
  formatDateTime,
  pnlColor,
} from "@/lib/utils";
import type { EvalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Score-band text color — same bands as the dashboard ring (>=80/60-79/<60). */
function scoreTextClass(score: number): string {
  if (score >= 80) return "text-score-high";
  if (score >= 60) return "text-score-mid";
  return "text-score-low";
}
function scoreBarClass(score: number): string {
  if (score >= 80) return "bg-score-high";
  if (score >= 60) return "bg-score-mid";
  return "bg-score-low";
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const detail = await getTradeDetail(user.id, id);
  if (!detail) notFound();

  const { trade, account, evaluations } = detail;
  const open = trade.exitTime === null || trade.exitPrice === null;

  const holdMinutes =
    trade.exitTime !== null
      ? (trade.exitTime.getTime() - trade.entryTime.getTime()) / 60000
      : NaN;

  const mult = pointMultiplier(trade.symbol);
  const grossPnl = trade.pnlGross ?? trade.pnl + trade.fees;
  const points = !open && mult > 0 && trade.quantity > 0 ? grossPnl / (trade.quantity * mult) : null;

  // R-multiple approximation using a 1%-of-account risk convention (only
  // derivable when the account has a starting balance).
  const riskUnit = account && account.startingBalance > 0 ? account.startingBalance * 0.01 : null;
  const rMultiple = !open && riskUnit ? trade.pnl / riskUnit : null;

  const failCount = evaluations.filter((e) => e.status === "fail").length;
  const passCount = evaluations.filter((e) => e.status === "pass").length;
  const applicable = passCount + failCount;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <Link
        href="/journal"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to journal
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{trade.symbol}</h1>
          <Badge variant={trade.side === "long" ? "profit" : "loss"}>{trade.side}</Badge>
          {account && (
            <span className="text-sm text-muted-foreground">
              {account.name} · {account.kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Net P&amp;L</p>
            <p className={`text-xl font-semibold tabular ${pnlColor(trade.pnl)}`}>
              {open ? "Open" : formatCurrency(trade.pnl, { sign: true })}
            </p>
          </div>
          <div className="hidden h-9 w-px bg-border sm:block" />
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Compliance</p>
            {trade.complianceScore == null ? (
              <p className="text-xl font-semibold text-muted-foreground">—</p>
            ) : (
              <p
                className={`text-xl font-semibold tabular ${scoreTextClass(trade.complianceScore)}`}
              >
                {trade.complianceScore}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — the chart workspace */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Price Action</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Illustrative path around your fills — synthesized from this trade&apos;s prices
                  &amp; times, not live market data.
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className={`text-lg font-semibold tabular ${open ? "text-warning" : pnlColor(trade.pnl)}`}>
                  {open ? "Open" : formatCurrency(trade.pnl, { sign: true })}
                </p>
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {open ? "Position live" : `Held ${formatDuration(holdMinutes)}`}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="context">
                <TabsList className="mb-4">
                  <TabsTrigger value="context">Context</TabsTrigger>
                  <TabsTrigger value="replay">Replay</TabsTrigger>
                </TabsList>
                <TabsContent value="context">
                  <TradeContextChart
                    tradeId={trade.id}
                    side={trade.side}
                    entryPrice={trade.entryPrice}
                    exitPrice={trade.exitPrice}
                    isWin={trade.isWin}
                    pnl={trade.pnl}
                  />
                </TabsContent>
                <TabsContent value="replay">
                  <TradeReplay
                    id={trade.id}
                    symbol={trade.symbol}
                    side={trade.side}
                    entryPrice={trade.entryPrice}
                    exitPrice={trade.exitPrice}
                    entryTime={trade.entryTime}
                    exitTime={trade.exitTime}
                    quantity={trade.quantity}
                    pnl={trade.pnl}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trade Facts</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Fact label="Entry" value={formatNumber(trade.entryPrice, 2)} sub={formatDateTime(trade.entryTime)} />
                <Fact
                  label="Exit"
                  value={open ? "Open" : formatNumber(trade.exitPrice as number, 2)}
                  sub={open ? "Position still open" : formatDateTime(trade.exitTime as Date)}
                />
                <Fact label="Quantity" value={formatNumber(trade.quantity)} sub={`${mult}× point mult`} />
                <Fact
                  label="Net P&L"
                  value={open ? "—" : formatCurrency(trade.pnl, { sign: true })}
                  valueClass={open ? undefined : pnlColor(trade.pnl)}
                />
                <Fact label="Gross P&L" value={open ? "—" : formatCurrency(grossPnl, { sign: true })} />
                <Fact label="Fees" value={formatCurrency(trade.fees)} />
                <Fact label="Hold time" value={formatDuration(holdMinutes)} />
                <Fact
                  label="Points"
                  value={points == null ? "—" : `${points >= 0 ? "+" : ""}${formatNumber(points, 2)}`}
                  valueClass={points == null ? undefined : pnlColor(points)}
                />
                <Fact
                  label="R ≈ (1% risk)"
                  value={rMultiple == null ? "—" : `${rMultiple >= 0 ? "+" : ""}${formatNumber(rMultiple, 2)}R`}
                  valueClass={rMultiple == null ? undefined : pnlColor(rMultiple)}
                />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right column — the graded-trade breakdown is the star */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Rule Evaluations</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  This trade, graded against your rulebook.
                </p>
              </div>
              {applicable > 0 && (
                <Badge variant={failCount > 0 ? "loss" : "profit"} className="tabular">
                  {failCount > 0 ? `${failCount} failed` : "Clean"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {trade.complianceScore != null && evaluations.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Compliance score
                    </span>
                    <span
                      className={`text-sm font-semibold tabular ${scoreTextClass(trade.complianceScore)}`}
                    >
                      {trade.complianceScore} / 100
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${scoreBarClass(trade.complianceScore)}`}
                      style={{ width: `${Math.max(0, Math.min(100, trade.complianceScore))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-2xs tabular text-muted-foreground">
                    {passCount} of {applicable} applicable rules passed
                  </p>
                </div>
              )}
              {evaluations.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="h-6 w-6" />}
                  title="No rules evaluated this trade"
                  description="Define your rulebook and every trade gets a pass/fail breakdown here."
                  className="py-6"
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/rules">Open the Rulebook</Link>
                    </Button>
                  }
                />
              ) : (
                evaluations.map((e) => (
                  <EvalRow
                    key={e.id}
                    status={e.status}
                    name={e.ruleName}
                    severity={e.severity}
                    explanation={e.explanation}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Journal</CardTitle>
            </CardHeader>
            <CardContent>
              <TradeEditor
                tradeId={trade.id}
                notes={trade.notes}
                emotions={trade.emotions}
                strategyTag={trade.strategyTag}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium tabular ${valueClass ?? ""}`}>{value}</dd>
      {sub && <dd className="text-2xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function EvalRow({
  status,
  name,
  severity,
  explanation,
}: {
  status: EvalStatus;
  name: string;
  severity: string;
  explanation: string;
}) {
  const pass = status === "pass";
  const fail = status === "fail";
  // Same graded-trade chip treatment as the landing page's discipline card,
  // using the profit/loss-muted pairs so it reads in both themes.
  const chip = pass
    ? "bg-profit-muted text-profit"
    : fail
      ? "bg-loss-muted text-loss"
      : "bg-surface-overlay text-muted-foreground";
  const chipLabel = pass ? "Pass" : fail ? "Fail" : "N/A";
  const sevDot =
    severity === "high" ? "bg-loss" : severity === "medium" ? "bg-warning" : "bg-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sevDot}`} title={`${severity} severity`} />
          <p className="truncate text-sm font-medium">{name}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase ${chip}`}
        >
          {chipLabel}
        </span>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">{explanation}</p>
    </div>
  );
}
