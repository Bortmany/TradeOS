import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getTradeDetail } from "@/lib/journal";
import { TradeContextChart } from "@/components/journal/trade-context-chart";
import { TradeEditor } from "@/components/journal/trade-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function scoreBadgeVariant(score: number): "profit" | "warning" | "loss" {
  if (score >= 80) return "profit";
  if (score >= 60) return "warning";
  return "loss";
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
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Net P&amp;L</p>
            <p className={`text-xl font-semibold tabular ${pnlColor(trade.pnl)}`}>
              {open ? "Open" : formatCurrency(trade.pnl, { sign: true })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Compliance</p>
            {trade.complianceScore == null ? (
              <p className="text-xl font-semibold text-muted-foreground">—</p>
            ) : (
              <Badge variant={scoreBadgeVariant(trade.complianceScore)} className="mt-0.5 text-sm">
                {trade.complianceScore}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Price Context</CardTitle>
              <p className="text-sm text-muted-foreground">
                Illustrative path around your fills — synthesized from this trade&apos;s prices &amp;
                times, not live market data.
              </p>
            </CardHeader>
            <CardContent>
              <TradeContextChart
                tradeId={trade.id}
                side={trade.side}
                entryPrice={trade.entryPrice}
                exitPrice={trade.exitPrice}
                isWin={trade.isWin}
                pnl={trade.pnl}
              />
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

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Rule Evaluations</CardTitle>
              <Badge variant={failCount > 0 ? "loss" : "profit"}>
                {failCount > 0 ? `${failCount} failed` : "Clean"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {evaluations.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active rules evaluated this trade.
                </p>
              ) : (
                evaluations.map((e) => <EvalRow key={e.id} status={e.status} name={e.ruleName} severity={e.severity} explanation={e.explanation} />)
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
  const Icon = pass ? CheckCircle2 : fail ? XCircle : MinusCircle;
  const wrap = pass
    ? "border-profit/30 bg-profit-muted/40"
    : fail
      ? "border-loss/30 bg-loss-muted/40"
      : "border-border bg-surface-raised";
  const iconClass = pass ? "text-profit" : fail ? "text-loss" : "text-muted-foreground";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${wrap}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <Badge
              variant={severity === "high" ? "loss" : severity === "medium" ? "warning" : "secondary"}
              className="shrink-0"
            >
              {severity}
            </Badge>
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">{explanation}</p>
        </div>
      </div>
    </div>
  );
}
