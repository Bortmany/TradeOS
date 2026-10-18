"use client";

// The /coach page body: status strip, this week's review, focus list, history.
// Renders from server-loaded saved data; the model is only called when the
// "Review last week now" button is pressed.

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, Info, Loader2 } from "lucide-react";
import type { FocusDTO, NoteDTO } from "@/lib/ai/notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CoachNote, SampleBadge } from "./coach-note";
import { CoachNotice, NoteSkeleton } from "./coach-states";
import { FocusList } from "./focus-list";
import { NoteHistory } from "./note-history";
import { DEMO_LINE, generateNote, type CoachingStatus } from "./use-coaching";

function weekRange(note: NoteDTO | null): string | null {
  const ws = note && typeof note.content.weekStart === "string" ? note.content.weekStart : null;
  if (!ws) return null;
  const start = new Date(`${ws}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(start)} to ${f(end)}`;
}

export function CoachPage({ initial }: { initial: CoachingStatus }) {
  const demo = initial.demo;
  const [weekly, setWeekly] = React.useState<NoteDTO | null>(initial.latest.weekly);
  const [used, setUsed] = React.useState(initial.usedToday);
  const [focus, setFocus] = React.useState<FocusDTO[]>(initial.openFocus);
  const [focusKey, setFocusKey] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ code?: string; text: string } | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  // Full-page honest states.
  if (!initial.switchedOn) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Info />}
            title="AI coaching isn't switched on"
            description="The site owner hasn't turned it on yet. Your rules and your score work exactly the same without it."
          />
          <div className="px-6 pb-6">
            <CoachNotice kind="owner_off" />
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!initial.userEnabled && !demo) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Info />}
            title="Your coach is off"
            description="Turn it on in Settings whenever you want a second opinion on how you followed your rules."
            action={
              <Button asChild size="lg">
                <Link href="/settings">Open Settings</Link>
              </Button>
            }
          />
          <div className="px-6 pb-6">
            <CoachNotice kind="user_off" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const limit = initial.limit;
  const remaining = Math.max(0, limit - used);
  const atLimit = !demo && remaining <= 0;
  const planName = initial.plan.charAt(0).toUpperCase() + initial.plan.slice(1);

  async function review() {
    setError(null);
    setInfo(null);
    if (demo) {
      setError({ code: "demo", text: DEMO_LINE });
      return;
    }
    setBusy(true);
    const r = await generateNote({ kind: "weekly" });
    setBusy(false);
    if (!r.ok) {
      setError({ code: r.code, text: r.error });
      return;
    }
    setWeekly(r.note);
    if (r.cached) setInfo("Nothing has changed since this review.");
    else setUsed(r.usage.used);
  }

  async function refreshFocus() {
    try {
      const res = await fetch("/api/coaching/focus?status=open", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { items?: FocusDTO[] } | null;
      if (res.ok && json && Array.isArray(json.items)) {
        setFocus(json.items);
        setFocusKey((k) => k + 1);
      }
    } catch {
      /* the list keeps what it had */
    }
  }

  const range = weekRange(weekly);
  const reviewButton = (empty: boolean) => (
    <Button
      type="button"
      size="lg"
      variant={empty ? "secondary" : "ghost"}
      className="w-full lg:h-9 lg:w-auto print:hidden"
      disabled={busy || atLimit}
      aria-busy={busy}
      onClick={() => void review()}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck aria-hidden />}
      {busy ? "Writing your review" : empty ? "Review last week now" : "Refresh last week's review"}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3 print:hidden lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center justify-between gap-3 lg:justify-start">
          {demo ? <Badge variant="outline">Sample notes</Badge> : <Badge variant="info">Coach on</Badge>}
          <Link
            href="/settings"
            className="flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline lg:hidden"
          >
            Coach settings
          </Link>
        </div>
        <TooltipProvider delayDuration={300}>
          <div className="min-w-0 flex-1 space-y-1">
            {demo ? (
              <p className="text-sm text-muted-foreground">{DEMO_LINE}</p>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p tabIndex={0} className="tabular text-sm">
                      {remaining} of {limit} notes left today
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    A repeat press within {initial.cacheHours} hours re-uses your saved note and doesn&apos;t count.
                  </TooltipContent>
                </Tooltip>
                <Progress
                  className="h-1"
                  value={limit > 0 ? (used / limit) * 100 : 100}
                  aria-label="Notes used today"
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>
              {planName} plan, {limit} a day
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About your daily notes"
                  className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted lg:h-8 lg:w-8"
                >
                  <Info className="h-4 w-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Your plan sets how many notes you can ask for per day.</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <Link
          href="/settings"
          className="hidden text-sm text-primary underline-offset-4 hover:underline lg:block"
        >
          Coach settings
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* This week's review */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>This week&apos;s review</CardTitle>
                {range && <CardDescription>{range}</CardDescription>}
              </div>
              {demo && <SampleBadge />}
            </CardHeader>
            <CardContent className="space-y-4">
              {busy ? (
                <div aria-busy="true">
                  <NoteSkeleton lines={4} />
                </div>
              ) : weekly ? (
                <CoachNote
                  note={weekly}
                  focusLabel="Make this my focus next week"
                  onFeedback={(_, vote) => setWeekly((n) => (n ? { ...n, feedback: vote } : n))}
                  onDelete={() => setWeekly(null)}
                  onFocus={() => void refreshFocus()}
                />
              ) : (
                <EmptyState
                  className="py-6"
                  icon={<CalendarCheck />}
                  title="No review yet"
                  description="Your first review arrives Monday morning once you have a week of trades."
                />
              )}
              <div className="space-y-2">
                {atLimit && <CoachNotice kind="limit" />}
                {error && (
                  <CoachNotice
                    kind={error.code === "demo" ? "demo" : "unavailable"}
                    message={error.text}
                  />
                )}
                {info && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {info}
                  </p>
                )}
                {!busy && reviewButton(!weekly)}
                <p className="text-2xs text-muted-foreground">Counts toward today&apos;s notes.</p>
              </div>
            </CardContent>
          </Card>

          <NoteHistory demo={demo} />
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <FocusList key={focusKey} initial={focus} demo={demo} />
        </div>
      </div>
    </div>
  );
}
