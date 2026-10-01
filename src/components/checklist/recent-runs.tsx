"use client";

// Recent runs — the trader's saved tick-throughs, newest first, exactly as they
// were saved (each run keeps its own copy of the wording).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemoLine, ERROR_BANNER, call } from "@/components/checklist/api";
import { useTimeZone } from "@/components/time-zone-provider";
import { formatDateTime } from "@/lib/utils";
import type { ChecklistRunDTO } from "@/lib/checklist";

export function RecentRuns({
  runs,
  hasMore,
  demo,
  onRunsChange,
}: {
  runs: ChecklistRunDTO[];
  hasMore: boolean;
  demo: boolean;
  /** Called with the new list when the trader shows more or deletes one. */
  onRunsChange: (runs: ChecklistRunDTO[], hasMore: boolean) => void;
}) {
  const router = useRouter();
  const tz = useTimeZone();
  const [open, setOpen] = useState<ChecklistRunDTO | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  async function more() {
    setLoadingMore(true);
    setError(null);
    const res = await call<{ runs: ChecklistRunDTO[]; hasMore: boolean }>(
      `/api/checklists/runs?limit=10&offset=${runs.length}`,
      "GET"
    );
    setLoadingMore(false);
    if (!res.ok) {
      setError("Couldn't load more runs. Try again.");
      return;
    }
    onRunsChange([...runs, ...res.data.runs], res.data.hasMore);
  }

  async function remove() {
    if (!open) return;
    if (demo) {
      setConfirming(false);
      setShowDemo(true);
      return;
    }
    setBusy(true);
    const res = await call(`/api/checklists/runs/${open.id}`, "DELETE");
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError("Couldn't delete that run. Try again.");
      return;
    }
    onRunsChange(
      runs.filter((r) => r.id !== open.id),
      hasMore
    );
    setConfirming(false);
    setOpen(null);
    router.refresh();
  }

  if (runs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No runs yet. Tick your first checklist and it shows up here. Your future self will thank you.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {runs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                setOpen(r);
                setConfirming(false);
                setShowDemo(false);
              }}
              className="flex min-h-[56px] w-full items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-start transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.templateName}</span>
                  <span className="shrink-0 text-sm tabular">
                    {r.checkedCount} of {r.totalCount} ticked
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs tabular text-muted-foreground">{formatDateTime(r.createdAt, tz)}</span>
                  {r.tradeId ? (
                    <Badge variant="secondary">Linked to {r.tradeLabel ?? "a trade"}</Badge>
                  ) : (
                    <Badge variant="outline">Not linked</Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 rtl:rotate-180" />
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}
      {hasMore && (
        <Button type="button" variant="secondary" className="w-full" onClick={more} disabled={loadingMore}>
          {loadingMore ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </>
          ) : (
            "Show more runs"
          )}
        </Button>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !busy && !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.templateName}</DialogTitle>
                <DialogDescription className="tabular">
                  {formatDateTime(open.createdAt, tz)} · {open.checkedCount} of {open.totalCount} ticked
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2">
                {open.answers.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
                  >
                    {a.checked ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/60"
                      />
                    )}
                    <span className={a.checked ? "" : "text-muted-foreground"}>{a.text}</span>
                    {!a.checked && <span className="sr-only">Not ticked</span>}
                  </li>
                ))}
              </ul>
              {open.tradeId && (
                <p className="text-sm">
                  <Link href={`/journal/${open.tradeId}`} className="text-primary underline-offset-4 hover:underline">
                    Linked to {open.tradeLabel ?? "a trade"}
                  </Link>
                </p>
              )}
              {showDemo && <DemoLine />}
              {confirming ? (
                <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-sm">
                    Delete this run? The trade it was linked to stays. This can&apos;t be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        "Delete run"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-loss hover:text-loss"
                    onClick={() => setConfirming(true)}
                  >
                    Delete run
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
