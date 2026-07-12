import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateStep {
  label: string;
  done?: boolean;
}

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional activation checklist (e.g. import → rulebook → score) rendered
      between the description and the action. */
  steps?: EmptyStateStep[];
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, steps, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {steps && steps.length > 0 && (
        <ol className="mt-1 flex flex-col items-start gap-1.5 text-left">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs tabular",
                  step.done
                    ? "border-transparent bg-profit-muted text-profit"
                    : "border-border bg-surface"
                )}
              >
                {step.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(step.done && "line-through opacity-70")}>
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
