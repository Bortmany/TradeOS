"use client";

// Reports header navigator: previous / next period arrows, the window label
// and a date picker. The anchor is a New York calendar day ("YYYY-MM-DD") kept
// in the address bar as ?date=; the server builds the report for it. While the
// next report loads, the arrows are disabled (no double-clicks) and the body
// shows the page skeleton.

import { createContext, forwardRef, useContext, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isDayKey } from "@/lib/et-days";

const NavContext = createContext<{ pending: boolean; go: (href: string) => void }>({
  pending: false,
  go: () => {},
});

/** Shares "a new report is loading" between the navigator and the body. */
export function ReportNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (href: string) => startTransition(() => router.push(href));
  return <NavContext.Provider value={{ pending, go }}>{children}</NavContext.Provider>;
}

/**
 * A link inside Reports (period tabs, "show my last trading day") that moves
 * through the same client navigation as the arrows, so the skeleton shows and
 * the arrows lock while the next report loads. It stays a real link: a
 * middle-click or a modified click opens it normally.
 */
export const ReportNavLink = forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>(function ReportNavLink({ href, onClick, children, ...props }, ref) {
  const { go } = useContext(NavContext);
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href);
      }}
      {...props}
    >
      {children}
    </Link>
  );
});

/** The report body, swapped for the stat-grid skeleton while the next period loads. */
export function ReportPendingBody({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(NavContext);
  if (!pending) return <>{children}</>;
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="h-5 w-44" />
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>
  );
}

export function ReportNavigator({
  prevHref,
  nextHref,
  atLatest,
  label,
  shortLabel,
  anchorKey,
  todayKey,
  dateHref,
}: {
  prevHref: string;
  /** Null when the window already contains today's New York day. */
  nextHref: string | null;
  atLatest: boolean;
  /** "Sep 9 – Sep 15 ET" (laptop). */
  label: string;
  /** "Sep 9 – 15 ET" (phone). */
  shortLabel: string;
  anchorKey: string;
  todayKey: string;
  /** Address for a picked date: the string "__DATE__" is replaced by the day key. */
  dateHref: string;
}) {
  const { pending, go } = useContext(NavContext);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(anchorKey);

  const nextDisabled = atLatest || !nextHref || pending;

  function onOpenChange(next: boolean) {
    if (next) setDraft(anchorKey);
    setOpen(next);
  }

  function goToDate(e: React.FormEvent) {
    e.preventDefault();
    if (!isDayKey(draft)) return;
    // A typed future day snaps to today (the server does the same).
    const key = draft > todayKey ? todayKey : draft;
    setOpen(false);
    go(dateHref.replace("__DATE__", key));
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Previous period"
              disabled={pending}
              onClick={() => go(prevHref)}
              className="h-10 w-10 shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous period</TooltipContent>
        </Tooltip>

        <p
          aria-live="polite"
          className="min-w-0 flex-1 whitespace-nowrap text-center text-sm font-medium tabular sm:flex-none sm:px-2"
        >
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>

        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button fires no hover events, so the tooltip hangs off this wrapper. */}
            <span tabIndex={nextDisabled ? 0 : -1} className="inline-flex rounded-md">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Next period"
                aria-disabled={nextDisabled}
                disabled={nextDisabled}
                onClick={() => nextHref && go(nextHref)}
                className="h-10 w-10 shrink-0 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{atLatest ? "You're at the latest period" : "Next period"}</TooltipContent>
        </Tooltip>

        <Popover open={open} onOpenChange={onOpenChange}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Pick a date (New York day)"
                  disabled={pending}
                  className={cn("h-10 w-10 shrink-0 gap-1.5 px-0 sm:w-auto sm:px-3")}
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">Pick date</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Pick a date (New York day)</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-64 p-4">
            <form className="space-y-3" onSubmit={goToDate}>
              <div className="space-y-1.5">
                <Label htmlFor="report-date">Report ending on (ET)</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={draft}
                  max={todayKey}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={!isDayKey(draft)}>
                Go to date
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
