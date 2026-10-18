"use client";

// Settings "AI coach" card: master switch, tone, focus areas and weekly review.
// Every change saves straight away and rolls back if the save fails.

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

type Tone = "gentle" | "direct";

const FOCUS: { key: string; label: string }[] = [
  { key: "rules", label: "Rule-following" },
  { key: "sizing", label: "Position sizing" },
  { key: "emotions", label: "Emotions" },
  { key: "journaling", label: "Journaling habit" },
  { key: "consistency", label: "Consistency" },
];

const TONES: { key: Tone; label: string; hint: string }[] = [
  { key: "gentle", label: "Gentle", hint: "Warm and encouraging, with small next steps." },
  { key: "direct", label: "Direct", hint: "Short and blunt, straight to what to fix." },
];

export interface AiCoachInitial {
  coachingEnabled: boolean;
  coachingTone: Tone;
  coachingFocusAreas: string[];
  coachingWeekly: boolean;
  coachingWeeklyEmail: boolean;
}

export function AiCoachSettings({
  switchedOn,
  emailConfigured,
  demo,
  initial,
}: {
  switchedOn: boolean;
  emailConfigured: boolean;
  demo: boolean;
  initial: AiCoachInitial;
}) {
  const [values, setValues] = React.useState<AiCoachInitial>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save<K extends keyof AiCoachInitial>(field: K, value: AiCoachInitial[K]) {
    setError(null);
    setNote(null);
    if (demo) {
      setError(DEMO_LINE);
      return;
    }
    const previous = values[field];
    setValues((v) => ({ ...v, [field]: value }));
    setBusy(field);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setValues((v) => ({ ...v, [field]: previous }));
        setError(json.error ?? "Couldn't save that. Please try again.");
        return;
      }
      setNote("Saved");
    } catch {
      setValues((v) => ({ ...v, [field]: previous }));
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function toggleFocus(key: string, checked: boolean) {
    const next = FOCUS.map((f) => f.key).filter((k) =>
      k === key ? checked : values.coachingFocusAreas.includes(k)
    );
    void save("coachingFocusAreas", next);
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>AI coach</CardTitle>
          {!switchedOn && <Badge variant="secondary">Not switched on yet</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Short, plain-English coaching notes based on your numbers.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {!switchedOn && (
          <p className="rounded-md border border-border bg-surface-raised p-3 text-sm text-muted-foreground">
            AI coaching isn&apos;t switched on for this site yet. Your choices here are saved for
            when it is.
          </p>
        )}
        {demo && <p className="text-sm text-muted-foreground">{DEMO_LINE}</p>}

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="coach-enabled-switch" className="text-sm font-medium">
            Turn on the AI coach
          </label>
          <Switch
            id="coach-enabled-switch"
            checked={values.coachingEnabled}
            loading={busy === "coachingEnabled"}
            disabled={demo}
            onCheckedChange={(v) => save("coachingEnabled", v)}
            aria-label="Turn on the AI coach"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tone</legend>
          <div role="radiogroup" aria-label="Coaching tone" className="grid gap-2 sm:grid-cols-2">
            {TONES.map((t) => {
              const selected = values.coachingTone === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={demo || busy === "coachingTone"}
                  onClick={() => !selected && save("coachingTone", t.key)}
                  className={cn(
                    "min-h-11 rounded-md border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "border-primary bg-surface-raised" : "border-border"
                  )}
                >
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-sm text-muted-foreground">{t.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What should it focus on?</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {FOCUS.map((f) => {
              const id = `coach-focus-${f.key}`;
              return (
                <label
                  key={f.key}
                  htmlFor={id}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="h-5 w-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    checked={values.coachingFocusAreas.includes(f.key)}
                    disabled={demo || busy === "coachingFocusAreas"}
                    onChange={(e) => toggleFocus(f.key, e.target.checked)}
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="coach-weekly-switch" className="text-sm">
            Weekly review
          </label>
          <Switch
            id="coach-weekly-switch"
            checked={values.coachingWeekly}
            loading={busy === "coachingWeekly"}
            disabled={demo}
            onCheckedChange={(v) => save("coachingWeekly", v)}
            aria-label="Weekly review"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="coach-weekly-email-switch" className="text-sm">
              Email me the weekly review
            </label>
            <Switch
              id="coach-weekly-email-switch"
              checked={values.coachingWeeklyEmail}
              loading={busy === "coachingWeeklyEmail"}
              disabled={demo || !emailConfigured}
              onCheckedChange={(v) => save("coachingWeeklyEmail", v)}
              aria-label="Email me the weekly review"
            />
          </div>
          {!emailConfigured && (
            <p className="text-sm text-muted-foreground">Email isn&apos;t switched on for this site yet</p>
          )}
        </div>

        <div className="space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What is sent to the AI</p>
          <p>Only summary numbers: score parts, how often each rule was broken, and trade counts.</p>
          <p>Never your name, email, rule names, instruments, prices, notes or screenshots.</p>
          <p>
            <Link href="/privacy" className="underline underline-offset-2">
              Read the full details in our privacy page
            </Link>
          </p>
        </div>

        <div className="min-h-5">
          {note && (
            <p role="status" className="text-sm text-profit">
              {note}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
