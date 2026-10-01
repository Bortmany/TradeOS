"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { TradeChecklist } from "@/components/checklist/trade-checklist";
import { DemoLine } from "@/components/checklist/api";
import { SizeCheck } from "@/components/sizing/size-check";
import { ScreenshotPicker } from "@/components/journal/screenshot-picker";
import { cn, parseTags } from "@/lib/utils";

const WHY_MAX = 2000;

interface Props {
  tradeId: string;
  notes: string | null;
  emotions: string | null;
  strategyTag: string | null;
  whyEntered: string | null;
  /** For the size check and the picture descriptions. */
  symbol: string;
  side: string;
  startingBalance: number | null;
  accountCurrency: string;
  quantity: number;
  isOpen: boolean;
  /** The seeded demo desk is look-around only: nothing saves. */
  demo: boolean;
  screenshotIds: string[];
  screenshotsEnabled: boolean;
}

export function TradeEditor({
  tradeId,
  notes,
  emotions,
  strategyTag,
  whyEntered,
  symbol,
  side,
  startingBalance,
  accountCurrency,
  quantity,
  isOpen,
  demo,
  screenshotIds,
  screenshotsEnabled,
}: Props) {
  const router = useRouter();
  const [whyVal, setWhyVal] = useState(whyEntered ?? "");
  const whyRef = useRef<HTMLTextAreaElement>(null);
  const [showDemo, setShowDemo] = useState(false);
  // What was last saved, so "Unsaved changes" only appears when something differs.
  const [base, setBase] = useState({
    why: whyEntered ?? "",
    notes: notes ?? "",
    emotions: emotions ?? "",
    strategy: strategyTag ?? "",
  });
  const [notesVal, setNotesVal] = useState(notes ?? "");
  const [emotionsVal, setEmotionsVal] = useState(emotions ?? "");
  const [strategyVal, setStrategyVal] = useState(strategyTag ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The "Why I entered" box starts three lines tall and grows to about eight.
  useEffect(() => {
    const el = whyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [whyVal]);

  async function save() {
    if (demo) {
      setShowDemo(true);
      return;
    }
    setShowDemo(false);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whyEntered: whyVal,
          notes: notesVal,
          emotions: emotionsVal,
          strategyTag: strategyVal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      setSaved(true);
      setBase({ why: whyVal, notes: notesVal, emotions: emotionsVal, strategy: strategyVal });
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed.");
      router.push("/journal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
  }

  const emotionTags = parseTags(emotionsVal);
  const dirty =
    whyVal !== base.why ||
    notesVal !== base.notes ||
    emotionsVal !== base.emotions ||
    strategyVal !== base.strategy;
  const stripVisible = dirty || saved;
  const atWhyLimit = whyVal.length >= WHY_MAX;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="whyEntered" className="text-sm font-medium text-foreground">
          Why I entered
        </Label>
        <p id="whyEntered-help" className="text-xs text-muted-foreground">
          One or two lines: what did you see, and what was your plan?
        </p>
        <Textarea
          id="whyEntered"
          ref={whyRef}
          value={whyVal}
          maxLength={WHY_MAX}
          onChange={(e) => setWhyVal(e.target.value.slice(0, WHY_MAX))}
          aria-describedby="whyEntered-help whyEntered-count"
          placeholder="e.g. Broke above the opening range on rising volume. Plan: stop under the range low, target 2R."
          className="min-h-[96px] resize-none text-base md:text-sm"
        />
        <p
          id="whyEntered-count"
          className={cn(
            "text-end text-2xs tabular",
            whyVal.length >= 1800 ? "text-warning" : "text-muted-foreground"
          )}
        >
          {atWhyLimit && <span className="me-2">That&apos;s the 2,000-character limit.</span>}
          {whyVal.length.toLocaleString("en-US")} / 2,000
        </p>
      </div>

      <TradeChecklist tradeId={tradeId} demo={demo} />

      <SizeCheck
        symbol={symbol}
        startingBalance={startingBalance}
        accountCurrency={accountCurrency}
        tradedQuantity={quantity}
        isOpen={isOpen}
      />

      <div className="space-y-1.5">
        <Label
          htmlFor="strategyTag"
          className="text-2xs uppercase tracking-wide text-muted-foreground"
        >
          Strategy tag
        </Label>
        <Input
          id="strategyTag"
          value={strategyVal}
          onChange={(e) => setStrategyVal(e.target.value)}
          placeholder="e.g. vwap_reclaim"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="emotions"
          className="text-2xs uppercase tracking-wide text-muted-foreground"
        >
          Emotions
        </Label>
        <Input
          id="emotions"
          value={emotionsVal}
          onChange={(e) => setEmotionsVal(e.target.value)}
          placeholder="Comma-separated e.g. confident, fomo"
        />
        {emotionTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {emotionTags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="notes"
          className="text-2xs uppercase tracking-wide text-muted-foreground"
        >
          Notes
        </Label>
        <Textarea
          id="notes"
          value={notesVal}
          onChange={(e) => setNotesVal(e.target.value)}
          placeholder="What was the thesis? How did you manage it? What would you repeat or avoid?"
          className="min-h-[120px]"
        />
      </div>

      <ScreenshotPicker
        tradeId={tradeId}
        label={`${symbol} ${side}`}
        initialIds={screenshotIds}
        enabled={screenshotsEnabled}
        demo={demo}
      />

      {error && (
        <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}
      {showDemo && <DemoLine />}

      <div className="flex items-center justify-between gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? "Saved" : "Save journal"}
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-loss hover:bg-loss-muted hover:text-loss">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this trade?</DialogTitle>
              <DialogDescription>
                This permanently removes the trade and its rule evaluations, and recomputes your
                compliance. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="destructive" onClick={remove} disabled={deleting}>
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete trade
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Phone only: a Save strip just above the bottom bar while there are unsaved changes. */}
      {stripVisible && (
        <>
          <div className="h-14 md:hidden" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between border-t border-border bg-surface/95 px-4 py-2 md:hidden">
            <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {saved && !dirty ? "Saved" : "Unsaved changes"}
            </p>
            <Button onClick={save} disabled={saving} className="h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save journal
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
