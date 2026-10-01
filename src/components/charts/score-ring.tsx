import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

/** Deterministic SVG radial gauge for the discipline score. */
export function ScoreRing({ score, size = 132, strokeWidth = 10, label, className }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const color =
    clamped >= 80
      ? "hsl(var(--score-high))"
      : clamped >= 60
        ? "hsl(var(--score-mid))"
        : "hsl(var(--score-low))";
  const textColor =
    clamped >= 80 ? "text-score-high" : clamped >= 60 ? "text-score-mid" : "text-score-low";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* The number scales with the ring so a hero-sized gauge reads as the
          page anchor rather than a big circle around small text. */}
      <div className="absolute flex flex-col items-center">
        <span
          className={cn(
            "font-semibold tabular",
            size >= 190 ? "text-6xl" : size >= 160 ? "text-4xl" : "text-3xl",
            textColor
          )}
        >
          {Math.round(clamped)}
        </span>
        {label && <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

/**
 * The quieter, provisional version of the ring for "Not scored yet": a dashed
 * track, no arc and no score colour (a colour would imply a grade). With no rule
 * written yet the whole ring links to the Rule Engine; with rules that nothing
 * has been checked against, it is plain text and not a link.
 */
export function ProvisionalScoreRing({
  size = 132,
  strokeWidth = 10,
  hasRules,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  /** True when the trader has an active rule that no trade has been checked against yet. */
  hasRules: boolean;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const ring = (
    <>
      <svg width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeDasharray="3 9"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex max-w-[70%] flex-col items-center gap-1 text-center">
        {hasRules ? (
          <>
            <span className="text-base font-semibold text-muted-foreground">Not scored yet</span>
            <span className="text-2xs text-muted-foreground">
              None of your trades has been checked against a rule yet.
            </span>
          </>
        ) : (
          <>
            <Target className="h-5 w-5 text-muted-foreground" />
            <span className="text-base font-semibold text-primary group-hover:underline">
              Define your rulebook
            </span>
            <ArrowRight className="h-4 w-4 text-primary" />
          </>
        )}
      </div>
    </>
  );
  const box = cn("relative inline-flex items-center justify-center rounded-full", className);
  if (hasRules) {
    return (
      <div className={box} style={{ width: size, height: size }} role="img" aria-label="Discipline score not scored yet. None of your trades has been checked against a rule yet.">
        {ring}
      </div>
    );
  }
  return (
    <Link
      href="/rules"
      title="Your score starts once at least one of your rules has been checked against a trade."
      aria-label="Discipline score not scored yet. Define your rulebook."
      className={cn(box, "group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80")}
      style={{ width: size, height: size }}
    >
      {ring}
    </Link>
  );
}

/**
 * Slim horizontal meter for score sub-components. `compact` keeps the "why"
 * line to one row (full text on hover) so four meters sit in a tidy scannable
 * strip under the hero ring.
 */
export function ScoreMeter({
  label,
  score,
  detail,
  compact,
  unscored,
}: {
  label: string;
  score: number;
  detail?: string;
  compact?: boolean;
  /** Show "Not scored yet" in place of the number, with an empty bar. */
  unscored?: boolean;
}) {
  const color =
    score >= 80 ? "bg-score-high" : score >= 60 ? "bg-score-mid" : "bg-score-low";
  return (
    <div title={detail}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate", compact ? "text-2xs uppercase tracking-wide text-muted-foreground" : "text-sm")}>
          {label}
        </span>
        {unscored ? (
          <span className="text-sm text-muted-foreground">Not scored yet</span>
        ) : (
          <span className={cn("font-semibold tabular", compact ? "text-base" : "text-sm")}>
            {Math.round(score)}
          </span>
        )}
      </div>
      <div className={cn("w-full overflow-hidden rounded-full bg-muted", compact ? "mt-1 h-1" : "mt-1.5 h-1.5")}>
        {!unscored && (
          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        )}
      </div>
      {detail && (
        <p className={cn("mt-1 text-2xs text-muted-foreground", compact && "truncate")}>{detail}</p>
      )}
    </div>
  );
}
