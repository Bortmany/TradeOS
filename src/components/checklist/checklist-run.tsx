"use client";

// ChecklistRun — the tick-through. One piece used by the dashboard card, the
// /checklist page and the "Fill one in now" dialog on a trade, so a tick looks
// and behaves the same everywhere. Ticking is instant and local; nothing is
// sent until "Save this run". It only reminds: it never blocks a trade and
// never changes the score.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Hint } from "@/components/hint";
import { DemoLine, DoneLine, ERROR_BANNER, call } from "@/components/checklist/api";
import { cn } from "@/lib/utils";
import { timeAgo, type ChecklistRunDTO, type ChecklistTemplateDTO } from "@/lib/checklist";

export interface LastRunInfo {
  checkedCount: number;
  totalCount: number;
  createdAt: string;
}

export interface ChecklistRunProps {
  /** The trader's active checklists. */
  templates: ChecklistTemplateDTO[];
  /** Checklist to pick first (for example the one tied to the account's rulebook). */
  preselectId?: string | null;
  /** True when preselectId was chosen because of the rulebook: shows "Matches your rulebook". */
  matchesRulebook?: boolean;
  /** The most recent saved run of any list, for the "Last run" line. */
  lastRun?: LastRunInfo | null;
  /** When set, saving links the new run to this trade straight away. */
  tradeId?: string | null;
  /** Demo desk: ticking works, saving shows the look-around line and sends nothing. */
  demo?: boolean;
  /** A line above the list (for example the "filling in after entry" note). */
  note?: string;
  /** Button label. Default "Save this run". */
  saveLabel?: string;
  /** Called with the saved run. */
  onSaved?: (run: ChecklistRunDTO) => void;
  className?: string;
}

export function ChecklistRun({
  templates,
  preselectId = null,
  matchesRulebook = false,
  lastRun = null,
  tradeId = null,
  demo = false,
  note,
  saveLabel = "Save this run",
  onSaved,
  className,
}: ChecklistRunProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(preselectId);
  // Ticks are kept per list until saved or cleared, so switching chips loses nothing.
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [localLast, setLocalLast] = useState<LastRunInfo | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const current = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;
  const ticked = useMemo(() => new Set(current ? (ticks[current.id] ?? []) : []), [current, ticks]);
  const total = current?.items.length ?? 0;
  const count = current ? current.items.filter((i) => ticked.has(i.id)).length : 0;
  const last = localLast ?? lastRun;

  if (!current) return null;

  function toggle(itemId: string) {
    if (!current) return;
    setTicks((prev) => {
      const now = new Set(prev[current.id] ?? []);
      if (now.has(itemId)) now.delete(itemId);
      else now.add(itemId);
      return { ...prev, [current.id]: [...now] };
    });
    setError(null);
    setShowDemo(false);
  }

  function later(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  async function save() {
    if (!current || count === 0 || saving) return;
    setError(null);
    setMessage(null);
    if (demo) {
      setShowDemo(true);
      return;
    }
    setSaving(true);
    const res = await call<{ run: ChecklistRunDTO }>("/api/checklists/runs", "POST", {
      templateId: current.id,
      ticked: [...ticked],
      ...(tradeId ? { tradeId } : {}),
    });
    setSaving(false);
    if (!res.ok) {
      setError(
        res.error === "Network error." || res.error === "Request failed."
          ? "Couldn't save this run. Check your connection and try again. Your ticks are still here."
          : `${res.error} Your ticks are still here.`
      );
      return;
    }
    const run = res.data.run;
    setTicks((prev) => ({ ...prev, [current.id]: [] }));
    setLocalLast({ checkedCount: run.checkedCount, totalCount: run.totalCount, createdAt: run.createdAt });
    setMessage(`Run saved: ${run.checkedCount} of ${run.totalCount} ticked.`);
    setJustSaved(true);
    later(() => setJustSaved(false), 2000);
    later(() => setMessage(null), 3000);
    onSaved?.(run);
    router.refresh();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium">{current.name}</p>
          <p
            aria-live="polite"
            className="shrink-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground tabular"
          >
            {count} of {total} ticked
          </p>
        </div>
        <Progress value={total ? (count / total) * 100 : 0} className="h-1.5" />
      </div>

      {templates.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a checklist">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === current.id}
              onClick={() => {
                setSelectedId(t.id);
                setError(null);
                setShowDemo(false);
              }}
              className={cn(
                "h-10 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                t.id === current.id
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-surface-raised text-muted-foreground hover:border-primary/40 active:bg-surface-overlay"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {matchesRulebook && current.id === preselectId && (
        <p className="text-2xs text-muted-foreground">Matches your rulebook</p>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={current.name}>
        {current.items.map((item) => {
          const on = ticked.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(item.id)}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-start text-sm transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className={cn("min-w-0", on && "text-muted-foreground line-through")}>{item.text}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  on ? "bg-primary" : "border-2 border-muted-foreground/60"
                )}
              >
                {on && <Check className="h-4 w-4 text-primary-foreground" />}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}
      {showDemo && <DemoLine />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-2xs text-muted-foreground">
          {last
            ? `Last run: ${last.checkedCount} of ${last.totalCount} ticked, ${timeAgo(last.createdAt)}`
            : "No runs saved yet."}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Hint label="Untick everything">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={count === 0 || saving}
              onClick={() => setTicks((prev) => ({ ...prev, [current.id]: [] }))}
            >
              Start over
            </Button>
          </Hint>
          {count === 0 && !justSaved ? (
            <Hint label="Tick at least one item to save a run." wrap>
              <Button type="button" size="lg" disabled className="w-full sm:w-auto">
                {saveLabel}
              </Button>
            </Hint>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={save}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : justSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                saveLabel
              )}
            </Button>
          )}
        </div>
      </div>

      <DoneLine>{message}</DoneLine>
      <p className="text-2xs text-muted-foreground">
        A checklist only reminds you. It never blocks a trade and never changes your score.
      </p>
    </div>
  );
}
