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
  Loader2,
  WifiOff,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import {
  getPropStatus,
  PROP_PRESETS,
  type PropStatus,
  type PropStatusLevel,
} from "@/lib/prop";
import { getAccounts } from "@/lib/data";
import { accountDisplay, evalProgressLabel, EVAL_PROGRESS_HINT } from "@/lib/account-display";
import { PageHeader } from "@/components/page-header";
import { AddTrackerDialog, type TrackerPreset } from "@/components/prop/add-tracker-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatPercent, pnlColor, cn, clamp, resolveTimeZone } from "@/lib/utils";
import { Hint } from "@/components/hint";
import { StepMeter, usedTone } from "@/components/live/step-meter";
import { LiveStatusChip } from "@/components/live/live-status-chip";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { EstimatedBadge, PositionRows, WATCH_ONLY_LINE } from "@/components/live/open-positions";
import { formatAsAt } from "@/lib/live/format";
import { toPositionJson, type LiveAccountView } from "@/lib/alerts/view";

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

// Bar colour follows the SAME 50 / 80 / 100% steps as the alerts, so a bar and
// its alert can never disagree: under 50% used = headroom (green), 50 to under
// 80% = amber, 80% and over = red. (See usedTone in components/live/step-meter.)
function usedPctOf(m: { used: number; limit: number } | null): number {
  return m && m.limit > 0 ? clamp((m.used / m.limit) * 100, 0, 100) : 0;
}

const DAY_HINT =
  "TradeOS counts a day from midnight to midnight New York time, so it matches your alerts. Topstep's own trading day starts at 6 PM New York time, so check Topstep for the official figure.";
const PEAK_HINT =
  "To stay on the cautious side, the peak counts open profit TradeOS saw at any update, not only closed trades.";
const CLOSED_ONLY_HINT =
  "TradeOS couldn't read your open positions recently, so this figure leaves them out. If you have an open loss it could be worse than shown.";

function liveAccountsOf(statuses: PropStatus[]): LiveAccountView[] {
  return statuses
    .filter((s) => s.live.linked && s.live.health !== "none")
    .map((s) => ({
      accountId: s.accountId,
      accountName: s.accountName,
      nearLive: s.live.nearLive,
      health: s.live.health === "none" ? "off" : s.live.health,
      lastLiveAt: s.live.lastLiveAt ? s.live.lastLiveAt.toISOString() : null,
      lastError: s.live.lastError,
      lastSyncAt: null,
    }));
}

export default async function PropPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [statuses, accounts] = await Promise.all([getPropStatus(user.id), getAccounts(user.id)]);
  const tz = resolveTimeZone(user.timezone);
  const now = new Date();

  // Accounts without a tracker, evaluation and funded first — every one of them
  // can be picked from "Add prop tracker".
  const tracked = new Set(statuses.map((s) => s.accountId));
  const propKind = (k: string) => (k === "evaluation" || k === "funded" ? 0 : 1);
  const untracked = accounts
    .filter((a) => !tracked.has(a.id))
    .sort((a, b) => propKind(a.kind) - propKind(b.kind))
    .map((a) => {
      const shown = accountDisplay(a);
      return { id: a.id, name: shown.name, broker: shown.broker, status: shown.status };
    });
  const presets: TrackerPreset[] = Object.entries(PROP_PRESETS).map(([key, p]) => ({
    key,
    name: p.presetName,
    summary: [
      p.profitTarget ? `${formatCurrency(p.profitTarget, { compact: true })} target` : null,
      p.maxDrawdown ? `${formatCurrency(p.maxDrawdown, { compact: true })} drawdown` : null,
      p.maxDailyLoss ? `${formatCurrency(p.maxDailyLoss, { compact: true })} daily loss` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  // The server (POST /api/prop) is the real gate; this only decides which
  // control to show. Anyone without the feature sees a plain upgrade link.
  const canTrack = hasFeature(user.plan as Plan, user.billingStatus, "propFirmModule");
  const addTracker = canTrack ? (
    <AddTrackerDialog accounts={untracked} presets={presets} />
  ) : (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <p className="text-sm text-muted-foreground">The prop-firm tracker is included in Pro.</p>
      <Button asChild className="min-h-[52px] w-full sm:min-h-0 sm:w-auto">
        <Link href="/settings/billing">Upgrade to Pro</Link>
      </Button>
    </div>
  );

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Prop Firm Tracker"
        description="Live compliance cockpit for your evaluation and funded accounts."
      >
        <LiveStatusChip accounts={liveAccountsOf(statuses)} />
        {accounts.length > 0 && addTracker}
      </PageHeader>
      {/* Figures move on their own: the page re-reads about once a minute while visible. */}
      <AutoRefresh />

      {statuses.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<Landmark className="h-8 w-8" />}
            title="No prop accounts tracked"
            description="Track an evaluation or funded account: pick one of your accounts to start."
            action={
              accounts.length > 0 ? (
                addTracker
              ) : (
                <Button asChild>
                  <Link href="/accounts">Add an account first</Link>
                </Button>
              )
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

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {statuses.map((s) => (
              <PropCard key={s.id} s={s} tz={tz} now={now} />
            ))}
          </div>
          {statuses.some((s) => s.live.linked && s.live.nearLive) && (
            <div className="space-y-1 text-2xs text-muted-foreground">
              <p>{WATCH_ONLY_LINE}</p>
              {statuses.some((s) => s.live.estimated) && (
                <p>
                  Estimated: TopstepX didn&apos;t send a live price, so open P&amp;L uses the latest
                  1-minute price.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OpenLine({ s, tz, now }: { s: PropStatus; tz: string; now: Date }) {
  const l = s.live;
  if (!l.linked || !l.nearLive) {
    return <p className="text-2xs text-muted-foreground">Closed trades only.</p>;
  }
  if (l.includesOpen && l.lastLiveAt) {
    const at = <span className="inline-block">{formatAsAt(l.lastLiveAt, tz, now)}</span>;
    if (l.openCount === 0) {
      return (
        <p className="text-2xs tabular text-muted-foreground">
          Closed trades only, nothing open. As at {at}.
        </p>
      );
    }
    const pnl = formatCurrency(l.openPnl, { sign: true });
    if (l.unpricedCount > 0) {
      return (
        <p className="text-2xs tabular text-warning">
          Includes all positions except {l.unpricedCount} we couldn&apos;t price, {pnl} as at {at}.
        </p>
      );
    }
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-2xs tabular text-muted-foreground">
        <span>
          Includes open positions, {pnl} as at {at}.
        </span>
        {l.estimated && <EstimatedBadge />}
      </p>
    );
  }
  // Linked and on, but no fresh read: closed trades only, said out loud.
  return (
    <Hint label={CLOSED_ONLY_HINT}>
      <p tabIndex={0} className="text-2xs tabular text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {l.lastLiveAt
          ? `Closed trades only. Last live read ${formatAsAt(l.lastLiveAt, tz, now)}.`
          : "Closed trades only. Waiting for the first live read."}
      </p>
    </Hint>
  );
}

function OpenSection({ s, tz, now }: { s: PropStatus; tz: string; now: Date }) {
  const l = s.live;
  const positions = l.positions.map(toPositionJson);
  const stale = l.health === "stale" || l.health === "rejected";
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Open positions</p>
        {l.linked && l.nearLive && l.lastLiveAt && positions.length > 0 && (
          <span className="flex items-center gap-2">
            {l.estimated && <EstimatedBadge />}
            <span className={cn("text-2xs tabular", stale ? "text-warning" : "text-muted-foreground")}>
              As at {formatAsAt(l.lastLiveAt, tz, now)}
            </span>
          </span>
        )}
      </div>
      {!l.linked || !l.nearLive ? (
        <p className="text-sm text-muted-foreground">
          Open positions show here when Near-live updates are on for this account.{" "}
          <Link href="/import" className="text-primary underline underline-offset-2">
            Turn it on
          </Link>
        </p>
      ) : l.health === "waiting" && positions.length === 0 ? (
        <p className="flex min-h-[52px] items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the first update…
        </p>
      ) : (
        <>
          {l.health === "rejected" && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                TopstepX rejected your key, so this list stopped updating
                {l.lastLiveAt ? ` at ${formatAsAt(l.lastLiveAt, tz, now)}` : ""}.{" "}
                <Link href="/import" className="text-primary underline underline-offset-2">
                  Reconnect
                </Link>
              </span>
            </p>
          )}
          {l.health === "stale" && l.lastLiveAt && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Can&apos;t reach TopstepX. This is the list as at {formatAsAt(l.lastLiveAt, tz, now)} and may
                be out of date.
              </span>
            </p>
          )}
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open positions right now. Flat is a fine place to be.
            </p>
          ) : (
            <PositionRows positions={positions} />
          )}
        </>
      )}
    </div>
  );
}

function PropCard({ s, tz, now }: { s: PropStatus; tz: string; now: Date }) {
  const meta = STATUS_META[s.status];
  const StatusIcon = meta.icon;
  // Name, status and broker come from the account itself (same helper as the
  // Accounts page and trade header); the tracker's phase is only "Eval progress".
  const shown = accountDisplay({ name: s.accountName, kind: s.accountKind, broker: s.accountBroker });

  const ddUsedPct = usedPctOf(s.drawdown);
  const dailyUsedPct = usedPctOf(s.dailyLoss);
  const ddTone = usedTone(ddUsedPct);
  const dailyTone = usedTone(dailyUsedPct);

  return (
    <Card className={cn(s.status === "breached" && "border-loss/40")}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn("h-4 w-4 shrink-0", meta.iconClass)} />
            <h3 className="truncate text-base font-semibold">{shown.name}</h3>
            <Badge variant={shown.statusVariant} className="shrink-0">
              {shown.status}
            </Badge>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {shown.broker} · {FIRM_LABEL[s.firm] ?? s.firm} ·{" "}
            {formatCurrency(s.size, { compact: true })}
          </p>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="mt-2 inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Badge variant="secondary">{evalProgressLabel(s.phase)}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{EVAL_PROGRESS_HINT}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
                  <Hint label={PEAK_HINT}>
                    <span tabIndex={0} className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Peak
                    </span>
                  </Hint>{" "}
                  <span className="tabular text-foreground">{formatCurrency(s.peakEquity, { compact: true })}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <StepMeter
                usedPct={ddUsedPct}
                indicatorClassName={ddTone.bar}
                label="Drawdown used"
              />
              <div className="mt-1.5 flex justify-between text-2xs text-muted-foreground">
                <span className="tabular">{formatCurrency(s.currentDrawdown)} used</span>
                <span className="tabular">{formatCurrency(s.maxDrawdown ?? 0)} limit</span>
              </div>
              <div className="mt-1 space-y-0.5">
                <OpenLine s={s} tz={tz} now={now} />
                <p className="text-2xs text-muted-foreground">
                  Peak includes the highest open profit seen at any update.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Profit target */}
          {s.profitTarget != null && (
            <Guardrail
              icon={Target}
              label="Profit Target"
              headline={
                <span className={pnlColor(s.netProfit)}>{formatPercent(clamp(s.profitTargetPct, 0, 2))}</span>
              }
              value={clamp(s.profitTargetPct * 100, 0, 100)}
              ticks
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
              labelHint={DAY_HINT}
              badge={
                s.dailyLoss.breached ? <Badge variant="loss">Limit reached</Badge> : undefined
              }
              headline={
                <span className={dailyTone.text}>{formatCurrency(Math.max(0, s.dailyLossBuffer))}</span>
              }
              value={dailyUsedPct}
              ticks
              barClass={dailyTone.bar}
              notes={
                <>
                  <OpenLine s={s} tz={tz} now={now} />
                  <Hint label={DAY_HINT}>
                    <p tabIndex={0} className="cursor-help text-2xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Day = midnight to midnight New York time (ET).
                    </p>
                  </Hint>
                </>
              }
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

        <OpenSection s={s} tz={tz} now={now} />

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
  ticks = false,
  labelHint,
  badge,
  notes,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  headline: React.ReactNode;
  value: number;
  barClass?: string;
  left: React.ReactNode;
  right: React.ReactNode;
  /** Draw the 50% and 80% step marks on the bar (the alert steps). */
  ticks?: boolean;
  labelHint?: string;
  badge?: React.ReactNode;
  /** Extra small lines under the left/right pair (what the figure includes). */
  notes?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/60 p-3">
      <div className="flex items-center justify-between gap-2">
        {labelHint ? (
          <Hint label={labelHint}>
            <p
              tabIndex={0}
              className="flex cursor-help items-center gap-1.5 rounded-sm text-2xs uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </p>
          </Hint>
        ) : (
          <p className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </p>
        )}
        {badge}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular">{headline}</p>
      <div className="mt-2">
        {ticks ? (
          <StepMeter usedPct={value} indicatorClassName={barClass} label={label} />
        ) : (
          <Progress value={value} indicatorClassName={barClass} />
        )}
        <div className="mt-1.5 flex justify-between text-2xs text-muted-foreground">
          <span className="tabular">{left}</span>
          <span className="tabular">{right}</span>
        </div>
        {notes && <div className="mt-1 space-y-0.5">{notes}</div>}
      </div>
    </div>
  );
}
