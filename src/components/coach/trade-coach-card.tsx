"use client";

// Trade page "Coach's note": shows the saved note for this trade, or a button
// that asks for one. Process only: how rules were followed, not the market.

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { NoteDTO } from "@/lib/ai/notes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoachNote, SampleBadge } from "./coach-note";
import { CoachNotice, NoteSkeleton, RemainingPill, type CoachNoticeKind } from "./coach-states";
import { coachingErrorText, fetchNotes, generateNote } from "./use-coaching";

export function TradeCoachCard({
  tradeId,
  enabled,
  demo = false,
}: {
  tradeId: string;
  enabled: boolean;
  demo?: boolean;
}) {
  const [note, setNote] = React.useState<NoteDTO | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: CoachNoticeKind; message?: string } | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<{ used: number; limit: number } | null>(null);
  const [deleted, setDeleted] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchNotes({ kind: "trade", subject: tradeId, limit: 1 }).then((n) => {
      if (!live) return;
      setNote(n && n[0] ? n[0] : null);
      setLoading(false);
    });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, tradeId]);

  if (!enabled || hidden) return null;

  function flash(msg: string) {
    setInfo(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setInfo(null), 3000);
  }

  async function explain() {
    setNotice(null);
    setInfo(null);
    setDeleted(false);
    if (demo) {
      setNotice({ kind: "demo" });
      return;
    }
    setBusy(true);
    const r = await generateNote({ kind: "trade", tradeId });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "user_off" || r.code === "disabled") {
        setHidden(true);
        return;
      }
      const k: CoachNoticeKind =
        r.code === "limit" || r.code === "global_limit" || r.code === "no_data" ? r.code : "unavailable";
      setNotice({ kind: k, message: k === "unavailable" ? coachingErrorText(r.code, r.error) : undefined });
      return;
    }
    setNote(r.note);
    if (r.cached) setInfo("Nothing has changed since this note.");
    else {
      setCounts(r.usage);
      flash("Note saved.");
    }
  }

  const atLimit = notice?.kind === "limit" || notice?.kind === "global_limit";

  return (
    <Card className="print:hidden">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Coach&apos;s note</CardTitle>
          <CardDescription>About how you followed your rules, not about the market.</CardDescription>
        </div>
        {note?.source === "demo" && <SampleBadge />}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading || busy ? (
          <NoteSkeleton />
        ) : note ? (
          <CoachNote
            note={note}
            onDelete={() => {
              setNote(null);
              setDeleted(true);
            }}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={atLimit}
            aria-busy={busy}
            onClick={explain}
          >
            <Sparkles aria-hidden />
            Explain this trade
          </Button>
        )}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Reading this trade
          </p>
        )}
        {deleted && (
          <p role="status" className="text-sm text-muted-foreground">
            Note deleted.
          </p>
        )}
        {notice && <CoachNotice kind={notice.kind} message={notice.message} />}
        {notice?.kind === "unavailable" && (
          <Button type="button" variant="ghost" size="sm" onClick={explain}>
            Try again
          </Button>
        )}
        {info && (
          <p role="status" className="text-sm text-muted-foreground">
            {info}
          </p>
        )}
        {counts && !note?.source.startsWith("demo") && <RemainingPill used={counts.used} limit={counts.limit} />}
      </CardContent>
    </Card>
  );
}
