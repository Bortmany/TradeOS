"use client";

// "Add prop tracker": step 1 picks which of the trader's accounts to track
// (only accounts without a tracker are listed), step 2 picks the firm's rule
// set. Saving goes through the existing POST /api/prop route (preset path) —
// no new write route.

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TrackableAccount {
  id: string;
  name: string;
  /** Broker label from accountDisplay(). */
  broker: string;
  /** Account status label from accountDisplay(). */
  status: string;
}

export interface TrackerPreset {
  key: string;
  name: string;
  summary: string;
}

export function AddTrackerDialog({
  accounts,
  presets,
  className,
}: {
  accounts: TrackableAccount[];
  presets: TrackerPreset[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<string>(presets[0]?.key ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = accounts.find((a) => a.id === accountId) ?? null;
  const none = accounts.length === 0;

  function reset() {
    setAccountId(null);
    setPreset(presets[0]?.key ?? "");
    setError(null);
  }

  async function onSave() {
    if (!chosen || !preset) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/prop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: chosen.id, preset }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not add the tracker. Please try again.");
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const trigger = (
    <Button variant="secondary" disabled={none} className={cn("w-full gap-1.5 sm:w-auto", className)}>
      <Plus className="h-4 w-4" />
      Add prop tracker
    </Button>
  );

  if (none) {
    // A disabled button swallows hover, so the hint sits on a wrapper.
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className={cn("inline-flex w-full sm:w-auto", className)}>
              {trigger}
            </span>
          </TooltipTrigger>
          <TooltipContent>Every account already has a tracker</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {!chosen ? (
          <>
            <DialogHeader>
              <DialogTitle>Which account?</DialogTitle>
              <DialogDescription>Pick the account this prop tracker follows.</DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-raised active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block text-2xs text-muted-foreground">
                        {a.broker} · {a.status}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Firm rules for {chosen.name}</DialogTitle>
              <DialogDescription>
                Pick the rule set the firm gave you. The tracker measures your buffers against it.
              </DialogDescription>
            </DialogHeader>
            <div role="radiogroup" aria-label="Firm rule set" className="space-y-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={preset === p.key}
                  onClick={() => setPreset(p.key)}
                  className={cn(
                    "flex min-h-[52px] w-full flex-col justify-center rounded-lg border px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    preset === p.key
                      ? "border-primary/40 bg-primary/10"
                      : "border-border hover:bg-surface-raised"
                  )}
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-2xs text-muted-foreground">{p.summary}</span>
                </button>
              ))}
            </div>
            {error && (
              <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAccountId(null);
                  setError(null);
                }}
                disabled={submitting}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="button" onClick={onSave} disabled={submitting || !preset}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  "Start tracking"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
