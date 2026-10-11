"use client";

// "Live, updated 2:14 PM ET" and every other honest state of the live link:
// updating, stale (broker unreachable), key rejected, near-live off, waiting for
// the first read, and "our own refresh failed". Colour is never the only signal:
// every state has an icon and words. Read-only: nothing here acts on a broker.

import * as React from "react";
import Link from "next/link";
import { Clock, KeyRound, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone-provider";
import { Hint } from "@/components/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deriveChip, formatAsAt } from "@/lib/live/format";
import type { LiveAccountView } from "@/lib/alerts/view";

export const CHIP_HINT =
  "TradeOS checks your broker about every minute while this page is open. Warnings only move when TradeOS can read your broker; if it can't, the last warnings stay and show their own times.";

export function LiveStatusChip({
  accounts,
  updating = false,
  refreshFailed = false,
  lastGoodAt,
  className,
}: {
  accounts: LiveAccountView[];
  /** A refresh is taking over a second. */
  updating?: boolean;
  /** TradeOS itself could not be reached; `lastGoodAt` is what is still on screen. */
  refreshFailed?: boolean;
  lastGoodAt?: string;
  className?: string;
}) {
  const tz = useTimeZone();
  const chip = deriveChip(accounts);

  // Announce only when the state changes (to or from stale), never every minute.
  const kind = refreshFailed ? "refresh-failed" : (chip?.kind ?? "none");
  const [spoken, setSpoken] = React.useState("");
  const prevKind = React.useRef(kind);
  const text = chip ? chipText(chip, tz, refreshFailed, lastGoodAt) : "";
  React.useEffect(() => {
    if (prevKind.current !== kind) {
      prevKind.current = kind;
      setSpoken(text);
    }
  }, [kind, text]);

  if (!chip) return null;

  let tone = "border-border text-foreground";
  let icon = <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />;
  let label = text;
  let reconnect = false;
  if (refreshFailed) {
    tone = "border-warning/40 bg-warning-muted text-warning";
    icon = <WifiOff className="h-3.5 w-3.5 shrink-0" />;
  } else if (updating) {
    tone = "border-border text-muted-foreground";
    icon = <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
    label = "Updating…";
  } else if (chip.kind === "stale") {
    tone = "border-warning/40 bg-warning-muted text-warning";
    icon = <WifiOff className="h-3.5 w-3.5 shrink-0" />;
  } else if (chip.kind === "rejected") {
    tone = "border-loss/40 bg-loss-muted text-loss";
    icon = <KeyRound className="h-3.5 w-3.5 shrink-0" />;
    reconnect = true;
  } else if (chip.kind === "off") {
    tone = "border-border text-muted-foreground";
    icon = <Clock className="h-3.5 w-3.5 shrink-0" />;
  } else if (chip.kind === "waiting") {
    tone = "border-border text-muted-foreground";
    icon = <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
  }

  return (
    <div className={cn("inline-flex items-center gap-2 print:hidden", className)}>
      <Popover>
        <Hint label={CHIP_HINT}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-start text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tone
              )}
            >
              {icon}
              <span className="tabular">{label}</span>
            </button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent className="max-w-xs">{CHIP_HINT}</PopoverContent>
      </Popover>
      {reconnect && (
        <Link href="/import" className="text-xs text-primary underline underline-offset-2">
          Reconnect
        </Link>
      )}
      <span className="sr-only" aria-live="polite">
        {spoken}
      </span>
    </div>
  );
}

function chipText(
  chip: NonNullable<ReturnType<typeof deriveChip>>,
  tz: string,
  refreshFailed: boolean,
  lastGoodAt?: string
): string {
  if (refreshFailed) {
    return `Can't refresh right now.${lastGoodAt ? ` Showing ${formatAsAt(lastGoodAt, tz)}.` : ""}`;
  }
  const at = chip.at ? formatAsAt(chip.at, tz) : null;
  switch (chip.kind) {
    case "live":
      return `Live, updated ${at ?? "just now"}`;
    case "stale":
      return chip.accountName
        ? `Can't reach TopstepX for ${chip.accountName}.${at ? ` Last updated ${at}.` : ""}`
        : `${at ? `Last updated ${at}. ` : ""}Can't reach TopstepX.`;
    case "rejected":
      return "TopstepX rejected your key. Reconnect to resume.";
    case "off":
      return `Updates every 30 minutes.${at ? ` Last synced ${at}` : ""}`;
    case "waiting":
      return "Waiting for the first update…";
  }
}
