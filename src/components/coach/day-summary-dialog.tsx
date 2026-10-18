"use client";

// Journal "Summarise my day": pick a day, press the button, read the note.
// The server page decides whether the coach is on; nothing is fetched on load.

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { NoteDTO } from "@/lib/ai/notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CoachNote } from "./coach-note";
import { CoachNotice, NoteSkeleton, RemainingPill } from "./coach-states";
import { DEMO_LINE, coachingErrorText, fetchNotes, generateNote } from "./use-coaching";

export function DaySummaryDialog({
  enabled,
  defaultDate,
  todayKey,
  demo = false,
  hasTrades = true,
}: {
  enabled: boolean;
  defaultDate: string | null;
  todayKey: string;
  demo?: boolean;
  hasTrades?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(defaultDate ?? todayKey);
  const [note, setNote] = React.useState<NoteDTO | null>(null);
  const [loadingSaved, setLoadingSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ code?: string; text: string } | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<{ used: number; limit: number } | null>(null);
  const [atLimit, setAtLimit] = React.useState(false);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayKey;

  // Switching day shows that day's saved note (a plain read, no model call).
  React.useEffect(() => {
    if (!enabled || !open || !valid || demo) {
      setNote(null);
      return;
    }
    let live = true;
    setLoadingSaved(true);
    setInfo(null);
    setError(null);
    fetchNotes({ kind: "day", subject: date, limit: 1 }).then((n) => {
      if (!live) return;
      setNote(n && n[0] ? n[0] : null);
      setLoadingSaved(false);
    });
    return () => {
      live = false;
    };
  }, [enabled, open, date, valid, demo]);

  if (!enabled) return null;

  async function generate() {
    setError(null);
    setInfo(null);
    if (!valid) return;
    if (demo) {
      setError({ code: "demo", text: DEMO_LINE });
      return;
    }
    setBusy(true);
    const r = await generateNote({ kind: "day", date });
    setBusy(false);
    if (!r.ok) {
      setError({ code: r.code, text: coachingErrorText(r.code, "Couldn't read that day. Please try again.") });
      if (r.code === "limit" || r.code === "global_limit") setAtLimit(true);
      return;
    }
    setNote(r.note);
    if (r.cached) setInfo("Nothing has changed since this note.");
    else setCounts(r.usage);
  }

  const noTrades = !hasTrades;
  const noticeKind =
    error?.code === "limit" || error?.code === "global_limit" || error?.code === "no_data" || error?.code === "demo"
      ? error.code
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 sm:flex-none print:hidden">
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="h-11 w-full sm:h-9 sm:w-auto" disabled={noTrades}>
                  <Sparkles aria-hidden />
                  Summarise my day
                </Button>
              </DialogTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent aria-hidden>
            {noTrades ? "Import some trades first" : "Get a coach's read on one trading day"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Summarise my day</DialogTitle>
          <DialogDescription>Your coach reads one day of trades against your rules.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="coach-day">Day</Label>
          <Input
            id="coach-day"
            type="date"
            value={date}
            max={todayKey}
            aria-invalid={!valid}
            aria-describedby={!valid ? "coach-day-error" : undefined}
            className={!valid ? "border-loss" : undefined}
            onChange={(e) => setDate(e.target.value)}
          />
          {!valid && (
            <p id="coach-day-error" role="alert" className="text-sm text-loss">
              Pick a day that has already happened.
            </p>
          )}
        </div>

        {(atLimit || noticeKind) && (
          <CoachNotice
            kind={atLimit && noticeKind !== "global_limit" ? "limit" : (noticeKind ?? "limit")}
          />
        )}

        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy || !valid || atLimit}
            aria-busy={busy}
            onClick={generate}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {busy ? "Reading your day" : note ? "Summarise again" : "Summarise this day"}
          </Button>
          {counts && <RemainingPill used={counts.used} limit={counts.limit} />}
          {error && !noticeKind && (
            <p role="alert" className="text-sm text-warning">
              {error.text}
            </p>
          )}
          {info && (
            <p role="status" className="text-sm text-muted-foreground">
              {info}
            </p>
          )}
        </div>

        {busy || loadingSaved ? (
          <NoteSkeleton />
        ) : note ? (
          <CoachNote
            note={note}
            onFocus={() => undefined}
            focusLabel="Make this my focus tomorrow"
          />
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="lg" className="sm:h-9">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
