"use client";

import { useState } from "react";
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
import { parseTags } from "@/lib/utils";

interface Props {
  tradeId: string;
  notes: string | null;
  emotions: string | null;
  strategyTag: string | null;
}

export function TradeEditor({ tradeId, notes, emotions, strategyTag }: Props) {
  const router = useRouter();
  const [notesVal, setNotesVal] = useState(notes ?? "");
  const [emotionsVal, setEmotionsVal] = useState(emotions ?? "");
  const [strategyVal, setStrategyVal] = useState(strategyTag ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesVal,
          emotions: emotionsVal,
          strategyTag: strategyVal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      setSaved(true);
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

  return (
    <div className="space-y-4">
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

      {error && (
        <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

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
    </div>
  );
}
