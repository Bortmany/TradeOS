"use client";

// SizeWorking — the working, line by line. Always visible, never behind a tap.
// Used by the /size page and by the size check inside a trade, so the two show
// the same lines from the same maths. Arithmetic only: nothing is sent anywhere.

import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/hint";
import { cn } from "@/lib/utils";
import { sizeWorking, type SizeOk } from "@/lib/sizing";

const EMPTY_TITLES = ["Money at risk", "Risk per contract", "Contracts", "Real risk"];

export function SizeWorking({
  result,
  compact = false,
  className,
}: {
  /** null = nothing to show yet: the four step names with dashes. */
  result: SizeOk | null;
  compact?: boolean;
  className?: string;
}) {
  const steps = result
    ? sizeWorking(result)
    : EMPTY_TITLES.map((title) => ({ title, sum: "—", result: "—", roundedDown: false }));

  return (
    <ol className={cn("space-y-2", className)}>
      {steps.map((s, i) => {
        const closing = i === 3;
        const marker = s.roundedDown ? ", rounded down" : null;
        const at = marker ? s.sum.indexOf(marker) : -1;
        return (
          <li
            key={i}
            className={cn(
              "rounded-lg px-3 py-2",
              closing ? "border border-border bg-surface-raised" : "",
              !compact && "lg:grid lg:grid-cols-[11rem_1fr_auto] lg:items-center lg:gap-4"
            )}
          >
            <div className="flex items-center justify-between gap-3 lg:justify-start">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-2xs tabular"
                >
                  {i + 1}
                </span>
                {s.title === "Real risk" ? (
                  <Hint label="What you would actually lose if the stop is hit, using the size rounded down.">
                    <span tabIndex={0} className="cursor-help text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {s.title}
                    </span>
                  </Hint>
                ) : (
                  <span className="text-sm font-medium">{s.title}</span>
                )}
              </span>
              <span className={cn("text-sm font-semibold tabular", !compact && "lg:hidden")}>{s.result}</span>
            </div>
            <p className={cn("mt-0.5 ps-7 tabular text-muted-foreground", compact ? "text-2xs" : "text-xs lg:mt-0 lg:ps-0")}>
              {at >= 0 ? (
                <>
                  {s.sum.slice(0, at)},{" "}
                  <Hint label="We always round down, so you never risk more than your limit.">
                    <Badge variant="secondary" tabIndex={0} className="cursor-help align-middle normal-case">
                      rounded down
                    </Badge>
                  </Hint>
                  {s.sum.slice(at + marker!.length)}
                </>
              ) : (
                s.sum
              )}
            </p>
            {!compact && (
              <span className="hidden text-end text-sm font-semibold tabular lg:block">{s.result}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
