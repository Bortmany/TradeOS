"use client";

// "History" card: every saved note, newest first, filtered by kind.
// Reads saved notes only (no model call).

import * as React from "react";
import { History, Loader2 } from "lucide-react";
import type { NoteDTO, NoteKind } from "@/lib/ai/notes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachNote, SampleBadge } from "./coach-note";
import { NoteSkeleton } from "./coach-states";

const PAGE = 10;

const TABS: { value: string; label: string; kind?: NoteKind; empty: string }[] = [
  { value: "all", label: "All", empty: "No notes yet" },
  { value: "suggestions", label: "Suggestions", kind: "suggestions", empty: "No suggestions yet" },
  { value: "clusters", label: "Mistakes", kind: "clusters", empty: "No mistake checks yet" },
  { value: "day", label: "Days", kind: "day", empty: "No day notes yet" },
  { value: "trade", label: "Trades", kind: "trade", empty: "No trade notes yet" },
  { value: "weekly", label: "Weekly", kind: "weekly", empty: "No weekly reviews yet" },
];

async function load(kind: NoteKind | undefined, before?: string) {
  const q = new URLSearchParams({ limit: String(PAGE) });
  if (kind) q.set("kind", kind);
  if (before) q.set("before", before);
  try {
    const res = await fetch(`/api/coaching/notes?${q.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; notes?: NoteDTO[]; nextCursor?: string | null }
      | null;
    if (!res.ok || !json || json.ok === false || !Array.isArray(json.notes)) return null;
    return { notes: json.notes, nextCursor: json.nextCursor ?? null };
  } catch {
    return null;
  }
}

export function NoteHistory({ demo }: { demo: boolean }) {
  const [tab, setTab] = React.useState("all");
  const [notes, setNotes] = React.useState<NoteDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [error, setError] = React.useState(false);
  const seq = React.useRef(0);

  const kind = TABS.find((t) => t.value === tab)?.kind;

  const reload = React.useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(false);
    const r = await load(kind);
    if (my !== seq.current) return;
    if (!r) setError(true);
    else {
      setNotes(r.notes);
      setCursor(r.nextCursor);
    }
    setLoading(false);
  }, [kind]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!cursor) return;
    const my = seq.current;
    setMore(true);
    const r = await load(kind, cursor);
    if (my !== seq.current) return;
    setMore(false);
    if (!r) {
      setError(true);
      return;
    }
    setNotes((n) => [...n, ...r.notes.filter((x) => !n.some((y) => y.id === x.id))]);
    setCursor(r.nextCursor);
  }

  const current = TABS.find((t) => t.value === tab) ?? TABS[0];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <CardTitle>History</CardTitle>
          {demo && <SampleBadge />}
        </div>
        <CardDescription>Everything your coach has written, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tab} onValueChange={setTab} className="print:hidden">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="min-h-11 shrink-0 px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div aria-busy={loading} className="space-y-3">
          {loading ? (
            <>
              <NoteSkeleton />
              <NoteSkeleton />
            </>
          ) : error && notes.length === 0 ? (
            <p role="alert" className="text-sm text-warning">
              Couldn&apos;t load your history.{" "}
              <Button type="button" variant="ghost" size="sm" className="h-11 lg:h-8" onClick={() => void reload()}>
                Try again
              </Button>
            </p>
          ) : notes.length === 0 ? (
            <EmptyState
              className="py-8"
              icon={<History />}
              title={current.empty}
              description={
                tab === "all"
                  ? "Ask for suggestions on the dashboard or summarise a day in the Journal and they'll collect here."
                  : "They show up here after you ask for one."
              }
            />
          ) : (
            <>
              {notes.map((n) => (
                <CoachNote
                  key={n.id}
                  note={n}
                  compact
                  onFeedback={(id, vote) =>
                    setNotes((list) => list.map((x) => (x.id === id ? { ...x, feedback: vote } : x)))
                  }
                  onDelete={(id) => setNotes((list) => list.filter((x) => x.id !== id))}
                />
              ))}
              {error && (
                <p role="alert" className="text-sm text-warning">
                  Couldn&apos;t load more. Please try again.
                </p>
              )}
              {cursor ? (
                <div className="flex justify-center print:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full lg:h-9 lg:w-auto"
                    disabled={more}
                    aria-busy={more}
                    onClick={() => void loadMore()}
                  >
                    {more && <Loader2 className="animate-spin" aria-hidden />}
                    {more ? "Loading" : "Load more"}
                  </Button>
                </div>
              ) : (
                <p className="text-center text-2xs text-muted-foreground">That&apos;s everything.</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
