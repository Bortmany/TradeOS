"use client";

// Interactive "grade this trade" demo for the landing hero. Pure client-side —
// no network, no fake charts. The math is deliberately simple and visible:
// the score starts at 100 and every broken rule subtracts its printed weight,
// mirroring how the real (deterministic) discipline score behaves.

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DemoRule {
  id: string;
  label: string;
  weight: number; // points subtracted when the rule is broken (weights sum to 100)
}

const RULES: DemoRule[] = [
  { id: "stop", label: "Stop-loss set before entry", weight: 25 },
  { id: "size", label: "Size within plan limit", weight: 20 },
  { id: "revenge", label: "No revenge entry after a loss", weight: 20 },
  { id: "session", label: "Traded within session hours", weight: 15 },
  { id: "daily-loss", label: "Respected daily loss limit", weight: 15 },
  { id: "journal", label: "Journaled the setup", weight: 5 },
];

// Start with two rules broken (75 — amber band) so the card invites fixing it.
const INITIAL_PASSED: Record<string, boolean> = {
  stop: true,
  size: true,
  revenge: false,
  session: true,
  "daily-loss": true,
  journal: false,
};

function computeScore(passed: Record<string, boolean>): number {
  return RULES.reduce((s, r) => (passed[r.id] ? s : s - r.weight), 100);
}

// Same band thresholds as everywhere the score appears: >=80 / 60-79 / <60.
function bandText(score: number): string {
  if (score >= 80) return "text-score-high";
  if (score >= 60) return "text-score-mid";
  return "text-score-low";
}
function bandBg(score: number): string {
  if (score >= 80) return "bg-score-high";
  if (score >= 60) return "bg-score-mid";
  return "bg-score-low";
}

export function GradeDemo() {
  const [passed, setPassed] = useState(INITIAL_PASSED);
  const score = computeScore(passed);

  // Animate the displayed number toward the real score — skipped entirely
  // when the visitor prefers reduced motion.
  const [display, setDisplay] = useState(score);
  const displayRef = useRef(score);
  useEffect(() => {
    const from = displayRef.current;
    if (from === score) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = score;
      setDisplay(score);
      return;
    }
    const start = performance.now();
    const duration = 350;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      const value = Math.round(from + (score - from) * eased);
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Demo · grade this trade
          </p>
          <p className="mt-1 text-sm font-medium">MNQ short · 3 contracts</p>
          <p className="text-lg font-semibold text-profit tabular">+$240</p>
        </div>
        <div className="text-right">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Discipline score
          </p>
          <p className={cn("text-4xl font-semibold tabular", bandText(display))}>
            {display}
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
            bandBg(score)
          )}
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-5 space-y-2">
        {RULES.map((rule) => {
          const ok = passed[rule.id];
          return (
            <button
              key={rule.id}
              type="button"
              aria-pressed={ok}
              onClick={() =>
                setPassed((prev) => ({ ...prev, [rule.id]: !prev[rule.id] }))
              }
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    ok
                      ? "border-profit bg-profit-muted text-profit"
                      : "border-border bg-surface"
                  )}
                >
                  {ok && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                {rule.label}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {!ok && (
                  <span className="text-2xs font-medium text-loss tabular">
                    −{rule.weight}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-2xs font-semibold uppercase",
                    ok ? "bg-profit-muted text-profit" : "bg-loss-muted text-loss"
                  )}
                >
                  {ok ? "Pass" : "Fail"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-2xs text-muted-foreground">
        Tick what you did. The score starts at 100 and each broken rule subtracts
        its weight — the same deterministic, no-black-box math the app uses. A
        green P&amp;L doesn&apos;t mean a green process.
      </p>
    </div>
  );
}
