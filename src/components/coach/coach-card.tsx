"use client";

// Dashboard "Coach" card: latest saved suggestions and repeated mistakes, plus
// two buttons that ask for a fresh note. Loads saved notes only; the model is
// called solely when a button is pressed. Never part of the discipline score.

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import type { NoteDTO } from "@/lib/ai/notes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CoachNote, SampleBadge } from "./coach-note";
import { CoachNotice, NoteSkeleton, RemainingPill, type CoachNoticeKind } from "./coach-states";
import { fetchStatus, generateNote, type CoachingStatus } from "./use-coaching";
import { cn } from "@/lib/utils";

type Kind = "suggestions" | "clusters";

export function CoachCard() {
  const [status, setStatus] = React.useState<CoachingStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [notes, setNotes] = React.useState<{ suggestions: NoteDTO | null; clusters: NoteDTO | null }>({
    suggestions: null,
    clusters: null,
  });
  const [counts, setCounts] = React.useState<{ used: number; limit: number } | null>(null);
  const [busy, setBusy] = React.useState<Kind | null>(null);
  const [notice, setNotice] = React.useState<{ kind: CoachNoticeKind; message?: string; where: Kind } | null>(
    null
  );
  const [info, setInfo] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let live = true;
    fetchStatus().then((s) => {
      if (!live) return;
      setStatus(s);
      if (s) {
        setNotes({ suggestions: s.latest.suggestions, clusters: s.latest.clusters });
        setCounts({ used: s.usedToday, limit: s.limit });
      }
      setLoaded(true);
    });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function flash(msg: string) {
    setInfo(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setInfo(null), 3000);
  }

  if (!loaded) {
    return (
      <Card aria-busy="true" className="print:hidden">
        <CardHeader>
          <CardTitle>Coach</CardTitle>
        </CardHeader>
        <CardContent>
          <NoteSkeleton lines={2} />
        </CardContent>
      </Card>
    );
  }
  if (!status || !status.switchedOn || (!status.userEnabled && !status.demo)) return null;

  const demo = status.demo;
  const remaining = counts ? Math.max(0, counts.limit - counts.used) : status.remaining;
  const atLimit = !demo && remaining <= 0;
  const hasAny = !!(notes.suggestions || notes.clusters);

  async function run(kind: Kind) {
    setNotice(null);
    setInfo(null);
    if (demo) {
      setNotice({ kind: "demo", where: kind });
      return;
    }
    setBusy(kind);
    const r = await generateNote({ kind });
    setBusy(null);
    if (!r.ok) {
      const k: CoachNoticeKind =
        r.code === "limit" || r.code === "global_limit" || r.code === "unavailable" || r.code === "no_data"
          ? r.code
          : "unavailable";
      setNotice({ kind: k, message: k === "unavailable" && r.code !== "unavailable" ? r.error : undefined, where: kind });
      return;
    }
    setNotes((n) => ({ ...n, [kind]: r.note }));
    if (r.cached) {
      setInfo("Nothing has changed since this note.");
    } else {
      setCounts(r.usage);
      flash(kind === "suggestions" ? "Fresh suggestions ready." : "Repeated mistakes updated.");
    }
  }

  const clusterItems = notes.clusters && Array.isArray(notes.clusters.content.items)
    ? (notes.clusters.content.items as unknown[]).length
    : 0;
  const limitKind: CoachNoticeKind | null = atLimit ? "limit" : null;

  const button = (kind: Kind, label: string, working: string, Icon: typeof Sparkles) => (
    <Button
      type="button"
      size="lg"
      variant={kind === "suggestions" && !hasAny ? "default" : "secondary"}
      className="w-full lg:h-9 lg:w-auto"
      disabled={busy !== null || atLimit}
      aria-busy={busy === kind}
      onClick={() => run(kind)}
    >
      {busy === kind ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
      {busy === kind ? working : label}
    </Button>
  );

  return (
    <Card className="print:hidden">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle>Coach</CardTitle>
            {demo && <SampleBadge />}
          </div>
          <CardDescription>Notes on how you followed your rules. Never part of your score.</CardDescription>
        </div>
        <Link
          href="/coach"
          className="shrink-0 py-3 text-sm text-primary underline-offset-4 hover:underline lg:py-0"
        >
          Open Coach
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {busy === "suggestions" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <NoteSkeleton />
            <NoteSkeleton />
          </div>
        ) : notes.suggestions ? (
          <CoachNote
            note={notes.suggestions}
            compact
            onFocus={() => undefined}
            onFeedback={(_, vote) =>
              setNotes((n) => (n.suggestions ? { ...n, suggestions: { ...n.suggestions, feedback: vote } } : n))
            }
          />
        ) : !notes.clusters ? (
          <EmptyState
            className="py-6"
            icon={<Sparkles />}
            title="No coaching notes yet"
            description="Your coach never sees your charts, only how you followed your rules. Ask for a first read."
          />
        ) : null}

        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span>Repeated mistakes (last 30 days)</span>
            <span className="flex items-center gap-2">
              {notes.clusters && (
                <Badge variant="outline" className="tabular">
                  {clusterItems}
                </Badge>
              )}
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
            </span>
          </Button>
          {open &&
            (busy === "clusters" ? (
              <NoteSkeleton />
            ) : notes.clusters ? (
              <CoachNote note={notes.clusters} compact />
            ) : (
              <p className="px-3 text-sm text-muted-foreground">Not checked yet. Press Find repeated mistakes.</p>
            ))}
        </div>

        <div className="space-y-2">
          {limitKind && <CoachNotice kind={limitKind} />}
          {notice && <CoachNotice kind={notice.kind} message={notice.message} />}
          {notice?.kind === "unavailable" && (
            <Button type="button" variant="ghost" size="sm" onClick={() => run(notice.where)}>
              Try again
            </Button>
          )}
          {info && (
            <p role="status" className="text-sm text-muted-foreground">
              {info}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {button("suggestions", "Get fresh suggestions", "Reading your trades", Sparkles)}
          {button("clusters", "Find repeated mistakes", "Looking for patterns", Search)}
          {!demo && counts && (
            <div className="lg:ml-auto">
              <RemainingPill used={counts.used} limit={counts.limit} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
