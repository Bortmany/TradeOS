import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * A flat bar with two thin tick marks at 50% and 80% of the limit, so the three
 * alert steps can be read straight off the bar. `usedPct` is 0..100 (capped).
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
      <span aria-hidden className="absolute inset-y-0 start-1/2 w-px bg-foreground/40" />
      <span aria-hidden className="absolute inset-y-0 start-4/5 w-px bg-foreground/40" />
    </div>
  );
}

/** Bar colour by share of the limit used: headroom green, then amber at 50%, red at 80%. */
export function usedTone(usedPct: number): { text: string; bar: string } {
  if (usedPct >= 80) return { text: "text-loss", bar: "bg-loss" };
  if (usedPct >= 50) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-profit", bar: "bg-profit" };
}
