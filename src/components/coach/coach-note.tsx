"use client";

// Renders any saved coaching note (suggestions, clusters, day, trade, weekly)
// plus its thumbs, delete and "Make this my focus" controls. The coach never
// touches the score, so no score or profit/loss colours are used here.

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Target, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import type { NoteDTO } from "@/lib/ai/notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEMO_LINE, deleteNote, makeFocus, sendFeedback } from "./use-coaching";

type Vote = "up" | "down" | null;

export interface CoachNoteProps {
  note: NoteDTO;
  compact?: boolean;
  onFeedback?: (id: string, vote: Vote) => void;
  onDelete?: (id: string) => void;
  onFocus?: (noteId: string, path: string) => void;
  /** Label for the single-focus button on day / weekly notes. */
  focusLabel?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function objList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
}

export function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}
function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function SampleBadge() {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0}>
            Sample
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Canned example for the demo desk</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const map = {
    high: { v: "warning", t: "High" },
    medium: { v: "info", t: "Medium" },
    low: { v: "secondary", t: "Low" },
  } as const;
  const m = map[priority as keyof typeof map] ?? map.low;
  return (
    <Badge variant={m.v}>
      {m.t}
      <span className="sr-only"> priority</span>
    </Badge>
  );
}

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent aria-hidden>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** "Make this my focus" with its own loading / done / error state. */
export function FocusButton({
  noteId,
  path,
  label = "Make this my focus",
  demo,
  onFocus,
}: {
  noteId: string;
  path: string;
  label?: string;
  demo: boolean;
  onFocus?: (noteId: string, path: string) => void;
}) {
  const [state, setState] = React.useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [demoLine, setDemoLine] = React.useState(false);

  async function press() {
    setError(null);
    if (demo) {
      setDemoLine(true);
      return;
    }
    setState("busy");
    const r = await makeFocus(noteId, path);
    if (!r.ok) {
      setState("idle");
      setError(r.error);
      return;
    }
    setState("done");
    onFocus?.(noteId, path);
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-8 print:hidden"
        disabled={state !== "idle"}
        aria-busy={state === "busy"}
        onClick={press}
      >
        {state === "busy" ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : state === "done" ? (
          <Check aria-hidden />
        ) : (
          <Target aria-hidden />
        )}
        {state === "busy" ? "Adding" : state === "done" ? "In your focus" : label}
      </Button>
      {state === "done" && (
        <p role="status" className="text-2xs text-muted-foreground">
          Added to your focus.{" "}
          <Link href="/coach" className="text-primary underline-offset-4 hover:underline">
            See your focus
          </Link>
        </p>
      )}
      {demoLine && (
        <p role="status" className="text-2xs text-muted-foreground">
          {DEMO_LINE}
        </p>
      )}
      {error && (
        <p role="alert" className="text-2xs text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

function NoteActions({
  note,
  demo,
  onFeedback,
  onDelete,
}: {
  note: NoteDTO;
  demo: boolean;
  onFeedback?: CoachNoteProps["onFeedback"];
  onDelete?: CoachNoteProps["onDelete"];
}) {
  const [vote, setVote] = React.useState<Vote>(note.feedback);
  const [thanks, setThanks] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [demoLine, setDemoLine] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [delError, setDelError] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setVote(note.feedback);
  }, [note.id, note.feedback]);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function press(which: "up" | "down") {
    setError(null);
    setThanks(false);
    if (demo) {
      setDemoLine(true);
      return;
    }
    const prev = vote;
    const next: Vote = prev === which ? null : which;
    setVote(next); // optimistic
    const r = await sendFeedback(note.id, next);
    if (!r.ok) {
      setVote(prev);
      setError("Couldn't save that. Please try again.");
      return;
    }
    onFeedback?.(note.id, next);
    setThanks(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setThanks(false), 3000);
  }

  async function confirmDelete() {
    setDelError(null);
    if (demo) {
      setDelError(DEMO_LINE);
      return;
    }
    setDeleting(true);
    const r = await deleteNote(note.id);
    setDeleting(false);
    if (!r.ok) {
      setDelError(r.error);
      return;
    }
    setDelOpen(false);
    onDelete?.(note.id);
  }

  const thumb = (which: "up" | "down") => {
    const Icon = which === "up" ? ThumbsUp : ThumbsDown;
    const chosen = vote === which;
    return (
      <IconTip label={which === "up" ? "Helpful" : "Not helpful"}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-11 w-11 sm:h-9 sm:w-9", chosen && "bg-accent")}
          aria-label={which === "up" ? "Mark this note helpful" : "Mark this note not helpful"}
          aria-pressed={chosen}
          onClick={() => press(which)}
        >
          <Icon className={cn(chosen && "text-primary")} aria-hidden />
        </Button>
      </IconTip>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {thumb("up")}
      {thumb("down")}
      <span className="min-w-0 flex-1 text-2xs text-muted-foreground">
        {thanks && <span role="status">Thanks, noted.</span>}
        {demoLine && <span role="status">{DEMO_LINE}</span>}
        {error && (
          <span role="alert" className="text-warning">
            {error}
          </span>
        )}
      </span>
      {onDelete && (
        <>
          <IconTip label="Delete this note">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-9 sm:w-9"
              aria-label="Delete this note"
              onClick={() => setDelOpen(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </IconTip>
          <Dialog open={delOpen} onOpenChange={(o) => !deleting && setDelOpen(o)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this note?</DialogTitle>
                <DialogDescription>
                  This can&apos;t be undone. Any focus item you made from it stays.
                </DialogDescription>
              </DialogHeader>
              {delError && (
                <p role="alert" className="text-sm text-warning">
                  {delError}
                </p>
              )}
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" size="lg" disabled={deleting}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={deleting}
                  aria-busy={deleting}
                  onClick={confirmDelete}
                >
                  {deleting && <Loader2 className="animate-spin" aria-hidden />}
                  {deleting ? "Deleting" : "Delete note"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Bullets({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function FocusBox({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  if (!text) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-raised p-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-sm text-foreground">{text}</p>
      {children}
    </div>
  );
}

export function CoachNote({ note, compact, onFeedback, onDelete, onFocus, focusLabel }: CoachNoteProps) {
  const c = note.content;
  const demo = note.source === "demo";
  const [showAll, setShowAll] = React.useState(false);
  const focus = (path: string, label?: string) =>
    onFocus ? (
      <FocusButton noteId={note.id} path={path} label={label} demo={demo} onFocus={onFocus} />
    ) : null;

  let body: React.ReactNode = null;

  if (note.kind === "suggestions") {
    const items = objList(c.items);
    body = (
      <div className="space-y-3">
        <div className={cn("grid gap-3", compact && "lg:grid-cols-2")}>
          {items.map((it, i) => (
            <div
              key={i}
              className={cn(
                "space-y-2 rounded-lg border border-border bg-surface-raised px-3 py-2",
                compact && i >= 3 && !showAll && "hidden lg:block"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{str(it.title)}</p>
                <PriorityChip priority={str(it.priority)} />
              </div>
              <p className="text-sm text-muted-foreground">{str(it.body)}</p>
              {focus(`items.${i}`)}
            </div>
          ))}
        </div>
        {compact && items.length > 3 && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full lg:hidden print:hidden"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        )}
      </div>
    );
  } else if (note.kind === "clusters") {
    const items = objList(c.items);
    body =
      items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No repeated breaches in the last 30 days.</p>
      ) : (
        <div className={cn("grid gap-3", compact && "lg:grid-cols-2")}>
          {items.map((it, i) => {
            const count = typeof it.count === "number" ? it.count : 0;
            return (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{str(it.label)}</p>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="tabular" tabIndex={0}>
                          x{count}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent aria-hidden>
                        Broken {count} {count === 1 ? "time" : "times"} in 30 days
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground">{str(it.suggestion)}</p>
                {focus(`items.${i}`)}
              </div>
            );
          })}
        </div>
      );
  } else if (note.kind === "day") {
    body = (
      <div className="space-y-3">
        <p className="text-sm">{str(c.summary)}</p>
        <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
          <Bullets label="What worked" items={strList(c.wins)} />
          <Bullets label="What cost you" items={strList(c.mistakes)} />
        </div>
        <FocusBox title="Focus tomorrow" text={str(c.focusTomorrow)}>
          {focus("focus", focusLabel ?? "Make this my focus tomorrow")}
        </FocusBox>
      </div>
    );
  } else if (note.kind === "trade") {
    body = (
      <div className="space-y-1">
        <p className="text-sm font-medium">{str(c.headline)}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{str(c.detail)}</p>
      </div>
    );
  } else if (note.kind === "weekly") {
    const verdict = typeof c.previousFocusVerdict === "string" ? c.previousFocusVerdict : null;
    body = (
      <div className="space-y-3">
        {verdict && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-raised p-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Last week&apos;s focus
              </p>
              <p className="text-sm">{verdict}</p>
            </div>
          </div>
        )}
        <p className="text-sm">{str(c.summary)}</p>
        <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
          <Bullets label="What worked" items={strList(c.wins)} />
          <Bullets label="What cost you" items={strList(c.mistakes)} />
        </div>
        <FocusBox title="Focus next week" text={str(c.focusNextWeek)}>
          {focus("focus", focusLabel ?? "Make this my focus next week")}
        </FocusBox>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(demo || note.kind === "day") && (
        <div className="flex flex-wrap items-center gap-2 text-2xs uppercase tracking-wide text-muted-foreground">
          {note.kind === "day" && <span>Day note {str(c.date)}</span>}
          {demo && <SampleBadge />}
        </div>
      )}
      {body}
      <NoteActions note={note} demo={demo} onFeedback={onFeedback} onDelete={onDelete} />
      <p className="text-2xs text-muted-foreground">
        {note.kind === "suggestions" || note.kind === "clusters"
          ? `From ${formatNoteDate(note.createdAt)}`
          : `Written ${formatNoteTime(note.createdAt)}`}
      </p>
    </div>
  );
}
