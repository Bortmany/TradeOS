"use client";

// "Your focus" card: open items with Done / Dismiss, plus a collapsed Done
// group loaded on demand. Items are created from a coaching note, not here.

import * as React from "react";
import { Check, ChevronDown, Loader2, Target, X } from "lucide-react";
import type { FocusDTO } from "@/lib/ai/notes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SampleBadge } from "./coach-note";
import { DEMO_LINE, setFocusStatus } from "./use-coaching";
import { cn } from "@/lib/utils";

const SOURCE: Record<string, string> = {
  suggestions: "From a suggestion",
  clusters: "From mistakes",
  day: "From a day note",
  trade: "From a trade note",
  weekly: "From a weekly review",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function FocusList({ initial, demo }: { initial: FocusDTO[]; demo: boolean }) {
  const [open, setOpen] = React.useState<FocusDTO[]>(initial);
  const [done, setDone] = React.useState<FocusDTO[] | null>(null);
  const [doneOpen, setDoneOpen] = React.useState(false);
  const [doneLoading, setDoneLoading] = React.useState(false);
  const [doneError, setDoneError] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ text: string; error?: boolean; undo?: FocusDTO } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function say(m: { text: string; error?: boolean; undo?: FocusDTO }, ms = 6000) {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), ms);
  }

  async function move(item: FocusDTO, status: "open" | "done" | "dismissed") {
    if (demo) {
      say({ text: DEMO_LINE, error: false });
      return;
    }
    setBusy(item.id);
    const r = await setFocusStatus(item.id, status);
    setBusy(null);
    if (!r.ok) {
      say({ text: r.error, error: true });
      return;
    }
    if (status === "open") {
      setDone((d) => (d ? d.filter((x) => x.id !== item.id) : d));
      setOpen((o) => [r.item, ...o.filter((x) => x.id !== item.id)]);
      say({ text: "Back in your focus." }, 3000);
      return;
    }
    setOpen((o) => o.filter((x) => x.id !== item.id));
    if (status === "done") {
      setDone((d) => (d ? [r.item, ...d] : d));
      say({ text: "Marked as done. Nice work." }, 4000);
    } else {
      say({ text: "Dismissed.", undo: item });
    }
  }

  async function toggleDone() {
    const next = !doneOpen;
    setDoneOpen(next);
    if (!next || done || demo) return;
    setDoneLoading(true);
    setDoneError(false);
    try {
      const res = await fetch("/api/coaching/focus?status=done", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; items?: FocusDTO[] } | null;
      if (!res.ok || !json || json.ok === false || !Array.isArray(json.items)) throw new Error("bad");
      setDone(json.items);
    } catch {
      setDoneError(true);
    }
    setDoneLoading(false);
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <CardTitle>Your focus</CardTitle>
          {demo && <SampleBadge />}
        </div>
        <CardDescription>What you&apos;re working on. {open.length} open of 20.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 ? (
          <EmptyState
            className="py-6"
            icon={<Target />}
            title="Nothing in focus yet"
            description="Pick one thing from a suggestion or review and it lands here. One habit at a time beats ten good intentions."
          />
        ) : (
          <ul className="space-y-2">
            {open.map((item) => (
              <li
                key={item.id}
                className="space-y-3 rounded-lg border border-border bg-surface-raised p-3"
              >
                <p className="text-sm">{item.text}</p>
                <p className="text-2xs text-muted-foreground">
                  {SOURCE[item.noteKind] ?? "From your coach"} · {shortDate(item.createdAt)}
                </p>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11 lg:h-8"
                    disabled={busy === item.id}
                    onClick={() => move(item, "done")}
                  >
                    {busy === item.id ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                    {busy === item.id ? "Saving" : "Done"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 lg:h-8"
                    disabled={busy === item.id}
                    onClick={() => move(item, "dismissed")}
                  >
                    <X aria-hidden />
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={cn("text-sm", message.error ? "text-warning" : "text-muted-foreground")}
          >
            {message.text}
            {message.undo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 h-11 lg:h-8 print:hidden"
                onClick={() => message.undo && move(message.undo, "open")}
              >
                Undo
              </Button>
            )}
          </p>
        )}

        <div className="space-y-2 print:hidden">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between"
            aria-expanded={doneOpen}
            onClick={toggleDone}
          >
            <span>Done{done ? ` (${done.length})` : ""}</span>
            <ChevronDown className={cn("transition-transform", doneOpen && "rotate-180")} aria-hidden />
          </Button>
          {doneOpen &&
            (doneLoading ? (
              <div aria-busy="true" className="space-y-2">
                <span className="sr-only">Loading</span>
                <Skeleton aria-hidden className="h-10 w-full" />
                <Skeleton aria-hidden className="h-10 w-full" />
              </div>
            ) : doneError ? (
              <p role="alert" className="text-sm text-warning">
                Couldn&apos;t load your finished items.{" "}
                <Button type="button" variant="ghost" size="sm" onClick={() => { setDoneOpen(false); void toggleDone(); }}>
                  Try again
                </Button>
              </p>
            ) : demo || !done || done.length === 0 ? (
              <p className="px-3 text-sm text-muted-foreground">Nothing finished yet.</p>
            ) : (
              <ul className="space-y-2">
                {done.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-muted-foreground"
                  >
                    <div className="min-w-0">
                      <p className="text-sm">{item.text}</p>
                      <p className="text-2xs">Done {shortDate(item.doneAt)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 shrink-0 lg:h-8"
                      disabled={busy === item.id}
                      onClick={() => move(item, "open")}
                    >
                      Reopen
                    </Button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
