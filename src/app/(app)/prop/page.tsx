import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Trophy,
  Target,
  TrendingDown,
  CalendarClock,
  Scale,
  Landmark,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPropStatus, type PropStatus, type PropStatusLevel } from "@/lib/prop";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatPercent, pnlColor, cn, clamp } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FIRM_LABEL: Record<string, string> = {
  topstep: "Topstep",
  apex: "Apex",
  tpt: "Take Profit Trader",
  custom: "Custom",
};

const STATUS_META: Record<
  PropStatusLevel,
  {
    label: string;
    badge: "profit" | "warning" | "loss" | "info";
    iconClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  on_track: { label: "On Track", badge: "profit", iconClass: "text-profit", icon: ShieldCheck },
  at_risk: { label: "At Risk", badge: "warning", iconClass: "text-warning", icon: ShieldAlert },
  breached: { label: "Breached", badge: "loss", iconClass: "text-loss", icon: ShieldX },
  passed: { label: "Passed", badge: "info", iconClass: "text-info", icon: Trophy },
};

// Color a buffer by how much headroom is left. This is the trust signal.
function bufferTone(pct: number): { text: string; bar: string } {
  if (pct <= 0) return { text: "text-loss", bar: "bg-loss" };
  if (pct < 0.25) return { text: "text-loss", bar: "bg-loss" };
  if (pct < 0.5) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-profit", bar: "bg-profit" };
}

export default async function PropPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const statuses = await getPropStatus(user.id);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Prop Firm Tracker"
        description="Live compliance cockpit for your evaluation and funded accounts."
      />

      {statuses.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<Landmark className="h-8 w-8" />}
            title="No prop accounts tracked"
            description="Know exactly how close you are to a breach — before the firm tells you."
            steps={[
              { label: "Add an evaluation or funded account under Accounts" },
              { label: "Attach its prop-firm ruleset (drawdown, daily loss, target)" },
              { label: "Every buffer updates here with each imported trade" },
            ]}
            action={
              <Button asChild>
                <Link href="/accounts">Connect a prop account</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Status strip — one honest count per compliance state */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(Object.keys(STATUS_META) as PropStatusLevel[]).map((level) => {
              const meta = STATUS_META[level];
              const count = statuses.filter((s) => s.status === level).length;
              const Icon = meta.icon;
              return (
                <Card key={level}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </p>
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          count > 0 ? meta.iconClass : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-2xl font-semibold tabular",
                        count > 0 ? meta.iconClass : "text-muted-foreground"
                      )}
                    >
                      {count}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {statuses.map((s) => (
              <PropCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PropCard({ s }: { s: PropStatus }) {
  const meta = STATUS_META[s.status];
  const StatusIcon = meta.icon;

  const ddTone = s.drawdown ? bufferTone(s.drawdown.bufferPct) : bufferTone(1);
  const dailyTone = s.dailyLoss ? bufferTone(s.dailyLoss.bufferPct) : bufferTone(1);

  return (
    <Card className={cn(s.status === "breached" && "border-loss/40")}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn("h-4 w-4 shrink-0", meta.iconClass)} />
            <h3 className="truncate text-base font-semibold">{s.accountName}</h3>
          </div>
          <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
            {FIRM_LABEL[s.firm] ?? s.firm} · {formatCurrency(s.size, { compact: true })} · {s.phase}
          </p>
        </div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Hero: trailing drawdown buffer — the number funded traders pay for. */}
        {s.drawdown && (
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {s.drawdownType === "eod_trailing"
                    ? "EOD Trailing"
                    : s.drawdownType === "static"
                      ? "Static"
                      : "Trailing"}{" "}
                  Drawdown · Buffer Remaining
                </p>
                <p className={cn("mt-1 text-4xl font-bold tabular", ddTone.text)}>
                  {formatCurrency(Math.max(0, s.drawdownBuffer))}
                </p>
              </div>
              <div className="text-right text-2xs text-muted-foreground">
                <p>
                  Equity <span className="tabular text-foreground">{formatCurrency(s.currentEquity, { compact: true })}</span>
                </p>
                <p className="mt-0.5">
                  Peak <span className="tabular text-foreground">{formatCurrency(s.peakEquity, { compact: true })}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Progress
                value={clamp((s.drawdown.used / s.drawdown.limit) * 100, 0, 100)}
                indicatorClassName={ddTone.bar}
              />
              <div className="mt-1.5 flex justify-between text-2xs text-muted-foreground">
                <span className="tabular">{formatCurrency(s.currentDrawdown)} used</span>
                <span className="tabular">{formatCurrency(s.maxDrawdown ?? 0)} limit</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Profit target */}
          {s.profitTarget != null && (
            <Guardrail
              icon={Target}
              label="Profit Target"
              headline={
                <span className={pnlColor(s.netProfit)}>{formatPercent(clamp(s.profitTargetPct, 0, 2))}</span>
              }
              value={clamp(s.profitTargetPct * 100, 0, 100)}
              barClass={s.profitTargetPct >= 1 ? "bg-info" : "bg-primary"}
              left={`${formatCurrency(s.netProfit, { sign: true })}`}
              right={`of ${formatCurrency(s.profitTarget)}`}
            />
          )}

          {/* Daily loss limit */}
          {s.dailyLoss && (
            <Guardrail
              icon={Scale}
              label="Daily Loss · Buffer"
              headline={
                <span className={dailyTone.text}>{formatCurrency(Math.max(0, s.dailyLossBuffer))}</span>
              }
              value={clamp((s.dailyLoss.used / s.dailyLoss.limit) * 100, 0, 100)}
              barClass={dailyTone.bar}
              left={
                <span className={pnlColor(s.todayPnl)}>Today {formatCurrency(s.todayPnl, { sign: true })}</span>
              }
              right={`limit ${formatCurrency(s.maxDailyLoss ?? 0)}`}
            />
          )}

          {/* Consistency */}
          {s.consistency && (
            <Guardrail
              icon={Scale}
              label="Consistency"
              headline={
                <span className={s.consistency.ok ? "text-profit" : "text-loss"}>
                  {formatPercent(s.consistency.ratio)}
                </span>
              }
              value={
                s.consistency.cap > 0
                  ? clamp((s.consistency.ratio / s.consistency.cap) * 100, 0, 100)
                  : 0
              }
              barClass={s.consistency.ok ? "bg-profit" : "bg-loss"}
              left={`best day ${formatCurrency(s.largestDayProfit)}`}
              right={`cap ${formatPercent(s.consistency.cap)}`}
            />
          )}

          {/* Min trading days */}
          {s.minTradingDays != null && (
            <Guardrail
              icon={CalendarClock}
              label="Min Trading Days"
              headline={
                <span className={s.tradingDaysOk ? "text-profit" : "text-foreground"}>
                  {s.tradingDays}
                  <span className="text-lg text-muted-foreground">/{s.minTradingDays}</span>
                </span>
              }
              value={clamp((s.tradingDays / s.minTradingDays) * 100, 0, 100)}
              barClass={s.tradingDaysOk ? "bg-profit" : "bg-primary"}
              left={`${s.tradingDays} day${s.tradingDays === 1 ? "" : "s"} traded`}
              right={s.tradingDaysOk ? "requirement met" : `${s.minTradingDays - s.tradingDays} to go`}
            />
          )}
        </div>

        <p className="border-t border-border pt-3 text-2xs text-muted-foreground">
          {s.tradeCount} closed trade{s.tradeCount === 1 ? "" : "s"} · Worst day{" "}
          <span className="tabular text-loss">{formatCurrency(-s.worstDayLoss)}</span> · Net{" "}
          <span className={cn("tabular", pnlColor(s.netProfit))}>{formatCurrency(s.netProfit, { sign: true })}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Guardrail({
  icon: Icon,
  label,
  headline,
  value,
  barClass,
  left,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  headline: React.ReactNode;
  value: number;
  barClass?: string;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/60 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular">{headline}</p>
      <div className="mt-2">
        <Progress value={value} indicatorClassName={barClass} />
        <div className="mt-1.5 flex justify-between text-2xs text-muted-foreground">
          <span className="tabular">{left}</span>
          <span className="tabular">{right}</span>
        </div>
      </div>
    </div>
  );
}
