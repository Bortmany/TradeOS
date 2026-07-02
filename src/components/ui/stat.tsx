import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  hint?: string;
  accent?: "profit" | "loss" | "neutral";
}

const accentMap: Record<NonNullable<StatProps["accent"]>, string> = {
  profit: "text-profit",
  loss: "text-loss",
  neutral: "text-foreground",
};

const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  (
    { label, value, delta, hint, accent = "neutral", className, ...props },
    ref
  ) => (
    <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props}>
      <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "tabular text-2xl font-semibold leading-tight",
          accentMap[accent]
        )}
      >
        {value}
      </span>
      {delta != null && (
        <span className="tabular text-xs text-muted-foreground">{delta}</span>
      )}
      {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
    </div>
  )
);
Stat.displayName = "Stat";

export { Stat };
