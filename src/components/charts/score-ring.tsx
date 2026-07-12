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
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-3xl font-semibold tabular", textColor)}>{Math.round(clamped)}</span>
        {label && <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

/** Slim horizontal meter for score sub-components. */
export function ScoreMeter({ label, score, detail }: { label: string; score: number; detail?: string }) {
  const color =
    score >= 80 ? "bg-score-high" : score >= 60 ? "bg-score-mid" : "bg-score-low";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-sm font-semibold tabular">{Math.round(score)}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      {detail && <p className="mt-1 text-2xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
