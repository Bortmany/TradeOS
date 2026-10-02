"use client";

// The dashboard's "Open Alerts" card: each alert shows its title, the exact
// number, how much is left, the 50/80 tick meter and an honest footer ("Includes
// 1 open position, estimated. As at 2:14 PM ET."), with a Dismiss control. The
// card refreshes itself every 60 seconds (see live-provider.tsx).
//
// Read-only: nothing here acts on a broker. Dismiss only hides an alert.

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, ShieldX, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone-provider";
import { Hint } from "@/components/hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StepMeter, usedTone } from "@/components/live/step-meter";
import { LiveStatusChip } from "@/components/live/live-status-chip";
import { useLive } from "@/components/live/live-provider";
import { formatAsAt, money } from "@/lib/live/format";
import type { AlertView } from "@/lib/alerts/view";

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

export const ESTIMATED_HINT =
  "TopstepX didn't give a live price for this position, so TradeOS uses the latest 1-minute price. It can differ a little from your platform's number.";

const STEP_CHIP: Record<number, { loss: string; profit: string; variant: "warning" | "loss" | "info" }> = {
  50: { loss: "Heads up", profit: "Halfway", variant: "warning" },
  80: { loss: "Close to the limit", profit: "Nearly there", variant: "warning" },
  100: { loss: "Limit reached", profit: "Target reached", variant: "loss" },
};

function dismissHint(step: number | null): string {
  return step === 100
    ? "Dismiss. Hides this warning. It only comes back if you recover and then hit the limit again."
    : "Dismiss. Hides this warning while you stay at 80%. It comes back if you reach the next step.";
}

function dismissedLine(a: AlertView): string {
  if (a.measure === "profit_target") return "Warning dismissed. It comes back at the next step.";
  if (a.step === 100 || a.step == null) {
    return "Warning dismissed. It comes back only if you recover and hit the limit again.";
  }
  return "Warning dismissed. It comes back if the loss reaches 100%.";
}

export function LiveAlerts() {
  const { snap, slow, fetchFailed, lastGoodAt, notice, announcement } = useLive();
  const alerts = snap.alerts;
  const chip = (
    <LiveStatusChip
      accounts={snap.accounts}
      updating={slow}
      refreshFailed={fetchFailed}
      lastGoodAt={lastGoodAt}
    />
  );

  return (
    <>
      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
      {alerts.length === 0 && !notice ? (
        // No alerts: no card. Only the chip when a broker is linked.
        snap.accounts.length > 0 ? <div className="flex">{chip}</div> : null
      ) : (
        <Card>
          <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Open Alerts</CardTitle>
              {alerts.length > 0 && <Badge variant="outline">{alerts.length}</Badge>}
            </div>
            {chip}
          </CardHeader>
          <CardContent className="space-y-3">
            {notice && (
              <p
                key={notice.id}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                {notice.text}
              </p>
            )}
            <div
              className={cn(
                "grid grid-cols-1 gap-3",
                alerts.length > 1 && "md:grid-cols-2 xl:grid-cols-3"
              )}
            >
              {alerts.map((a) => (
                <AlertRow key={a.id} alert={a} single={alerts.length === 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Skeleton for an in-card reload (used after "Try again"). */
export function LiveAlertsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Skeleton className="shimmer h-4 w-24" />
        <Skeleton className="shimmer h-5 w-7" />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[120px] space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="shimmer h-5 w-5 rounded-full" />
              <Skeleton className="shimmer h-3.5 w-40" />
            </div>
            <Skeleton className="shimmer h-3 w-24" />
            <Skeleton className="shimmer h-6 w-16" />
            <Skeleton className="shimmer h-1.5 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AlertRow({ alert: a, single }: { alert: AlertView; single: boolean }) {
  const tz = useTimeZone();
  const { removeAlert } = useLive();
  const [busy, setBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [demo, setDemo] = React.useState(false);

  const stepped = a.measure !== null && a.step !== null && a.usedPct !== null && a.limit !== null;
  const isProfit = a.measure === "profit_target";
  const step = a.step ?? 0;
  const loss100 = step === 100 && !isProfit;

  async function onDismiss() {
    setBusy(true);
    setError(null);
    setDemo(false);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(a.id)}/dismiss`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setLeaving(true);
        setTimeout(() => removeAlert(a.id, dismissedLine(a)), 150);
        return;
      }
      if (json?.code === "demo") setDemo(true);
      else setError("Couldn't dismiss that. Check your connection and try again.");
    } catch {
      setError("Couldn't dismiss that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const accent = isProfit
    ? { icon: <Target className="h-5 w-5 shrink-0 text-info" />, text: "text-info", bar: "bg-info" }
    : loss100
      ? { icon: <ShieldX className="h-5 w-5 shrink-0 text-loss" />, text: "text-loss", bar: "bg-loss" }
      : {
          icon: <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />,
          text: "text-warning",
          bar: "bg-warning",
        };

  const rowTone = isProfit
    ? step === 100
      ? "border-primary/40 bg-primary/10"
      : "border-border bg-surface-raised"
    : step === 100
      ? "border-loss/40 bg-loss-muted"
      : step === 80
        ? "border-warning/40 bg-warning-muted"
        : "border-border bg-surface-raised";

  const chipSpec = STEP_CHIP[step];
  const title = stepped ? measureTitle(a) : a.title;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all duration-150 motion-reduce:transition-none",
        rowTone,
        leaving && "scale-95 opacity-0"
      )}
    >
      <div className={cn(single && "lg:flex lg:items-center lg:gap-6")}>
        {/* Title line */}
        <div className={cn("flex items-start gap-2", single && "lg:w-1/3")}>
          {accent.icon}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", loss100 ? "font-semibold" : "font-medium")}>{title}</p>
            {a.accountName && (
              <p className="text-xs text-muted-foreground">{a.accountName}</p>
            )}
            {stepped && chipSpec && (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={isProfit ? "info" : chipSpec.variant}>
                  {isProfit ? chipSpec.profit : chipSpec.loss}
                </Badge>
                <span aria-hidden className="flex gap-0.5">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1.5 w-4 rounded-full",
                        n <= (step === 100 ? 3 : step === 80 ? 2 : 1)
                          ? isProfit
                            ? "bg-info"
                            : loss100
                              ? "bg-loss"
                              : "bg-warning"
                          : "bg-muted"
                      )}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>
          {!single && (
            <DismissButton a={a} busy={busy} onDismiss={onDismiss} />
          )}
        </div>

        {stepped ? (
          <>
            {/* The number, set apart */}
            <div className={cn("mt-2", single && "lg:mt-0 lg:flex-1")}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0">
                  <span className={cn("text-lg font-semibold tabular", accent.text)}>
                    {money(a.value ?? 0)}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">{valueTail(a)}</span>
                </p>
                <p className="shrink-0 text-sm tabular text-foreground">{rightText(a)}</p>
              </div>
              <StepMeter
                usedPct={Math.min(100, a.usedPct ?? 0)}
                indicatorClassName={accent.bar}
                className={cn("mt-2", single && "max-w-md")}
                label={`${measureName(a)} used`}
              />
              <p className="mt-1 text-2xs tabular text-muted-foreground">
                {a.usedPct}% {isProfit ? "of the target" : "used"}
              </p>
            </div>
          </>
        ) : (
          <p className={cn("mt-1 text-2xs text-muted-foreground", single && "lg:mt-0 lg:flex-1")}>
            {a.message}
          </p>
        )}

        <div className={cn("mt-2 flex items-start justify-between gap-2", single && "lg:mt-0 lg:w-1/4 lg:flex-col lg:items-end")}>
          <Footer a={a} tz={tz} />
          {single && <DismissButton a={a} busy={busy} onDismiss={onDismiss} />}
        </div>
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1 text-2xs text-loss">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {demo && (
        <p className="mt-2 text-2xs text-muted-foreground" role="status">
          {DEMO_LINE}{" "}
          <Link href="/register" className="text-primary underline underline-offset-2">
            Create a free account
          </Link>
        </p>
      )}
    </div>
  );
}

function DismissButton({
  a,
  busy,
  onDismiss,
}: {
  a: AlertView;
  busy: boolean;
  onDismiss: () => void;
}) {
  const label = `Dismiss ${measureName(a)} warning${a.accountName ? ` for ${a.accountName}` : ""}`;
  return (
    <Hint label={dismissHint(a.step)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        disabled={busy}
        onClick={onDismiss}
        className="-m-1.5 h-11 w-11 shrink-0 p-0 print:hidden"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-overlay active:bg-surface-overlay">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </Button>
    </Hint>
  );
}

function Footer({ a, tz }: { a: AlertView; tz: string }) {
  const at = formatAsAt(a.asAt, tz);
  const timeClass = a.stale ? "text-warning" : undefined;
  let lead: React.ReactNode = null;
  if (a.measure === "profit_target") {
    lead = "Closed trades only. ";
  } else if (a.measure === "daily_loss" || a.measure === "drawdown") {
    if (a.source === "live") {
      if (a.unpricedCount > 0) {
        lead = (
          <span className="text-warning">
            Includes all positions except {a.unpricedCount} we couldn&apos;t price.{" "}
          </span>
        );
      } else if (a.openCount > 0) {
        lead = (
          <>
            Includes {a.openCount} open position{a.openCount === 1 ? "" : "s"}
            {a.openEstimated ? (
              <>
                ,{" "}
                <Hint label={ESTIMATED_HINT}>
                  <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Badge variant="outline" className="h-4 text-2xs normal-case tracking-normal">
                      estimated
                    </Badge>
                  </span>
                </Hint>
              </>
            ) : null}
            .{" "}
          </>
        );
      } else {
        lead = "Closed trades only, nothing open. ";
      }
    } else {
      lead = "Closed trades only. ";
    }
  }
  return (
    <p className="text-2xs tabular text-muted-foreground">
      {lead}
      <span className={cn("inline-block", timeClass)}>As at {at}.</span>
      {a.stale && <span className="text-warning"> Can&apos;t refresh.</span>}
    </p>
  );
}

function measureName(a: AlertView): string {
  switch (a.measure) {
    case "daily_loss":
      return "daily loss";
    case "drawdown":
      return "drawdown";
    case "profit_target":
      return "profit target";
    case "overtrading":
      return "overtrading";
    default:
      return "alert";
  }
}

function measureTitle(a: AlertView): string {
  switch (a.measure) {
    case "daily_loss":
      return `Daily loss: ${a.step}% used`;
    case "drawdown":
      return `Drawdown: ${a.step}% used`;
    case "profit_target":
      return `Profit target: ${a.step}% reached`;
    default:
      return a.title;
  }
}

function valueTail(a: AlertView): string {
  const limit = money(a.limit ?? 0);
  switch (a.measure) {
    case "daily_loss":
      return `down of a ${limit} daily limit`;
    case "drawdown":
      return `below your peak of a ${limit} limit`;
    case "profit_target":
      return `up of a ${limit} target`;
    default:
      return "";
  }
}

function rightText(a: AlertView): string {
  if (a.measure === "profit_target") {
    return a.step === 100 ? "Target reached" : `${money(a.left ?? 0)} to go`;
  }
  return a.step === 100 ? "Limit reached" : `${money(a.left ?? 0)} left`;
}
