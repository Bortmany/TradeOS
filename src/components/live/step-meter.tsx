import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Where the marks sit: the 50% and 80% warning steps and the 100% limit. */
export const STEP_MARKS = [50, 80, 100] as const;

/**
 * A flat bar with thin tick marks at 50%, 80% and 100% of the limit, so the
 * three alert steps can be read straight off the bar. `usedPct` is 0..100
 * (capped). The marks are placed with an inline position (Tailwind has no
 * "four fifths" class, which is why the 80% mark used to be missing).
 */
export function StepMeter({
  usedPct,
  indicatorClassName,
  className,
  label,
}: {
  usedPct: number;
  indicatorClassName?: string;
  className?: string;
  /** Spoken name of the bar, e.g. "Daily loss used". */
  label?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Progress
        value={usedPct}
        className="h-1.5"
        indicatorClassName={indicatorClassName}
        aria-label={label}
      />
      {STEP_MARKS.map((pct) => (
        <span
          key={pct}
          aria-hidden
          data-step-mark={pct}
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ insetInlineStart: pct === 100 ? "calc(100% - 1px)" : `${pct}%` }}
        />
      ))}
    </div>
  );
}

/** Bar colour by share of the limit used: headroom green, then amber at 50%, red at 80%. */
export function usedTone(usedPct: number): { text: string; bar: string } {
  if (usedPct >= 80) return { text: "text-loss", bar: "bg-loss" };
  if (usedPct >= 50) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-profit", bar: "bg-profit" };
}
