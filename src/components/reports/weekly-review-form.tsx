"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  weekStart: string; // "YYYY-MM-DD" — the Monday of the week being reviewed
  worked: string;
  costliestRule: string;
  oneChange: string;
  savedAt: string | null; // already formatted for display, or null if never saved
}

const PROMPTS = [
  {
    key: "worked" as const,
    label: "What worked this week?",
    hint: "The setups, times of day or habits you'd happily repeat.",
    placeholder: "e.g. Waiting for the first 15 minutes to settle before my first entry.",
  },
  {
    key: "costliestRule" as const,
    label: "Which rule cost you the most?",
    hint: "The one break you'd undo if you could. Your numbers above are a good clue.",
    placeholder: "e.g. Max contracts — I doubled up chasing back a red morning.",
  },
  {
    key: "oneChange" as const,
    label: "One change for next week?",
    hint: "One only. Small and specific beats a long list.",
    placeholder: "e.g. Stop trading for the day after two losers.",
  },
];

export function WeeklyReviewForm({ weekStart, worked, costliestRule, oneChange, savedAt }: Props) {
  const router = useRouter();
  const [values, setValues] = useState({ worked, costliestRule, oneChange });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, ...values }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save your review.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {PROMPTS.map((p, i) => (
        <div key={p.key} className="space-y-1.5">
          <Label htmlFor={`review-${p.key}`} className="flex items-baseline gap-2">
            <span className="text-2xs tabular text-muted-foreground">{i + 1}</span>
            {p.label}
          </Label>
          <p className="text-2xs text-muted-foreground">{p.hint}</p>
          <Textarea
            id={`review-${p.key}`}
            value={values[p.key]}
            onChange={(e) => set(p.key, e.target.value)}
            placeholder={p.placeholder}
            maxLength={2000}
            className="min-h-[90px]"
          />
        </div>
      ))}

      {error && (
        <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? "Saved" : "Save review"}
        </Button>
        <p className="text-2xs text-muted-foreground">
          {saved
            ? "Saved. It'll be here whenever you come back to this week."
            : savedAt
              ? `Last saved ${savedAt}`
              : "Only you can see this. Save as often as you like."}
        </p>
      </div>
    </div>
  );
}
