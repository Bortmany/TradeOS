"use client";

// TradeChecklist — the "Pre-trade checklist" section for the trade page.
// Three states: Linked (the run, with an honest "before / after entry" badge),
// Suggestion (a run saved up to 4 hours before entry; one tap to link) and
// None ("Fill one in now" / "Link a saved run"). Everything saves straight
// away, not with "Save journal". Nothing links itself. It only reminds: it
// never blocks a trade and never touches the score.
//
// Mount it inside the Journal card of the trade editor:
//   <TradeChecklist tradeId={trade.id} demo={isDemoDesk(user.email)} />

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Info, Link2, ListChecks, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/hint";
import { ChecklistRun } from "@/components/checklist/checklist-run";
import { DemoLine, DoneLine, ERROR_BANNER, call } from "@/components/checklist/api";
import { useTimeZone } from "@/components/time-zone-provider";
import {
  DEMO_STARTER_TEMPLATE,
  minutesBeforePhrase,
  tickedBeforeEntry,
  timeAgo,
  type ChecklistRunDTO,
  type ChecklistTemplateDTO,
} from "@/lib/checklist";
import { formatTime } from "@/lib/utils";

interface State {
  linked: ChecklistRunDTO | null;
  suggestion: ChecklistRunDTO | null;
  suggestionCount: number;
  entryTime: string;
  hasTemplates: boolean;
}

export function TradeChecklist({ tradeId, demo = false }: { tradeId: string; demo?: boolean }) {
  const tz = useTimeZone();
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await call<State>(`/api/checklists/suggestion?tradeId=${encodeURIComponent(tradeId)}`, "GET");
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setState(res.data);
  }, [tradeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  async function link(run: ChecklistRunDTO) {
    setError(null);
    setShowDemo(false);
    if (demo) {
      setShowDemo(true);
      return false;
    }
    setBusy("link");
    const res = await call(`/api/checklists/runs/${run.id}`, "PATCH", { tradeId });
    setBusy(null);
    if (!res.ok) {
      setError(res.error === "Network error." || res.error === "Request failed." ? "Couldn't link that run. Try again." : res.error);
      return false;
    }
    setMessage("Linked to this trade.");
    await load();
    return true;
  }

  async function unlink() {
    if (!state?.linked) return;
    setError(null);
    setShowDemo(false);
    if (demo) {
      setShowDemo(true);
      return;
    }
    setBusy("unlink");
    const res = await call(`/api/checklists/runs/${state.linked.id}`, "PATCH", { tradeId: null });
    setBusy(null);
    if (!res.ok) {
      setError("Couldn't unlink that run. Try again.");
      return;
    }
    setMessage("Unlinked. The run is still in your history.");
    setHidden(false);
    await load();
  }

  const heading = (
    <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Pre-trade checklist</p>
  );

  if (failed) {
    return (
      <div className="space-y-2">
        {heading}
        <p className="text-sm text-loss">Couldn&apos;t load this. Try again.</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="space-y-2">
        {heading}
        <Skeleton className="shimmer h-24 w-full" />
      </div>
    );
  }

  const { linked, suggestion } = state;

  return (
    <div className="space-y-2">
      {heading}

      {linked ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-raised p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-medium">{linked.templateName}</p>
            {tickedBeforeEntry(linked.createdAt, state.entryTime) ? (
              <Hint label="Ticked before you entered this trade">
                <Badge variant="info" tabIndex={0} className="shrink-0 cursor-help">
                  <Check className="me-1 h-3 w-3" />
                  Ticked before entry
                </Badge>
              </Hint>
            ) : (
              <Hint label="Saved after the trade was entered, so it isn't a true pre-trade check.">
                <Badge variant="warning" tabIndex={0} className="shrink-0 cursor-help">
                  Filled in after entry
                </Badge>
              </Hint>
            )}
          </div>
          <p className="text-2xs tabular text-muted-foreground">
            Ticked {formatTime(linked.createdAt, tz)} · {linked.checkedCount} of {linked.totalCount}
          </p>
          <ul className="space-y-1.5">
            {linked.answers.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {a.checked ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/60"
                  />
                )}
                <span className={a.checked ? "" : "text-muted-foreground"}>{a.text}</span>
                {!a.checked && <span className="sr-only">not ticked</span>}
              </li>
            ))}
          </ul>
          <Hint label="Take this run off the trade. The run itself is kept.">
            <Button type="button" variant="ghost" size="sm" onClick={unlink} disabled={busy !== null}>
              {busy === "unlink" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Unlinking…
                </>
              ) : (
                "Unlink"
              )}
            </Button>
          </Hint>
        </div>
      ) : (
        <>
          {suggestion && !hidden && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/10 p-3">
              <p className="flex items-start gap-2 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  You ticked &apos;{suggestion.templateName}&apos;{" "}
                  {minutesBeforePhrase(suggestion.createdAt, state.entryTime)}. Link it to this trade?
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Hint label="Attach this run to the trade">
                  <Button type="button" size="lg" onClick={() => void link(suggestion)} disabled={busy !== null}>
                    {busy === "link" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Linking…
                      </>
                    ) : (
                      "Link it"
                    )}
                  </Button>
                </Hint>
                <Hint label="Hide this suggestion">
                  <Button type="button" variant="ghost" size="lg" onClick={() => setHidden(true)}>
                    Not this one
                  </Button>
                </Hint>
                {state.suggestionCount > 1 && (
                  <button
                    type="button"
                    onClick={() => setPickOpen(true)}
                    className="rounded-sm px-1 py-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Choose another
                  </button>
                )}
              </div>
            </div>
          )}

          {!state.hasTemplates && !demo ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">You don&apos;t have a checklist yet.</p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/checklist">Make one</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No checklist on this trade.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" size="lg" onClick={() => setFillOpen(true)}>
                  <ListChecks />
                  Fill one in now
                </Button>
                <Button type="button" variant="secondary" size="lg" onClick={() => setPickOpen(true)}>
                  <Link2 />
                  Link a saved run
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}
      {showDemo && <DemoLine />}
      <DoneLine>{message}</DoneLine>
      <p className="text-2xs text-muted-foreground">Saved as soon as you change it.</p>

      <FillDialog
        open={fillOpen}
        onOpenChange={setFillOpen}
        tradeId={tradeId}
        demo={demo}
        onSaved={() => {
          setFillOpen(false);
          setMessage("Linked to this trade.");
          void load();
        }}
      />
      <PickDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        onPick={async (run) => {
          if (await link(run)) setPickOpen(false);
          else if (demo) setPickOpen(false);
        }}
        busy={busy === "link"}
      />
    </div>
  );
}

function FillDialog({
  open,
  onOpenChange,
  tradeId,
  demo,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tradeId: string;
  demo: boolean;
  onSaved: () => void;
}) {
  const [templates, setTemplates] = useState<ChecklistTemplateDTO[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await call<{ templates: ChecklistTemplateDTO[] }>("/api/checklists", "GET");
    if (!res.ok) {
      setFailed(true);
      return;
    }
    const active = res.data.templates.filter((t) => t.isActive);
    setTemplates(active.length === 0 && demo ? [DEMO_STARTER_TEMPLATE] : active);
  }, [demo]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle>Pre-trade checklist</DialogTitle>
          <DialogDescription>
            You&apos;re filling this in after entering, so it will be marked &apos;Filled in after entry&apos;.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <div className="space-y-2">
            <p className="text-sm text-loss">Couldn&apos;t load your checklists.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !templates ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="shimmer h-[52px] w-full" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have a checklist turned on. Make or turn one on under{" "}
            <Link href="/checklist" className="text-primary underline-offset-4 hover:underline">
              Checklist
            </Link>
            .
          </p>
        ) : (
          <ChecklistRun
            templates={templates}
            tradeId={tradeId}
            demo={demo}
            saveLabel="Save and link to this trade"
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickDialog({
  open,
  onOpenChange,
  onPick,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (run: ChecklistRunDTO) => void | Promise<void>;
  busy: boolean;
}) {
  const [runs, setRuns] = useState<ChecklistRunDTO[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await call<{ runs: ChecklistRunDTO[] }>("/api/checklists/runs?unlinked=1&limit=10", "GET");
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setRuns(res.data.runs);
  }, []);

  useEffect(() => {
    if (open) {
      setRuns(null);
      void load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link a saved run</DialogTitle>
          <DialogDescription>Tap a run to attach it to this trade.</DialogDescription>
        </DialogHeader>
        {failed ? (
          <div className="space-y-2">
            <p className="text-sm text-loss">Couldn&apos;t load your runs.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !runs ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="shimmer h-14 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unlinked runs. Next time, tick one from the dashboard before you enter.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onPick(r)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-start transition-colors hover:border-primary/40 active:bg-surface-overlay disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{r.templateName}</span>
                  <span className="shrink-0 text-end text-2xs text-muted-foreground tabular">
                    {r.checkedCount} of {r.totalCount} ticked
                    <br />
                    {timeAgo(r.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
