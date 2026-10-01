"use client";

// A hover hint (300ms, like the dashboard). Phones have no hover, so anything
// that matters is also written as visible helper text next to the control.
// A disabled button swallows pointer events, so pass `wrap` to give the hint a
// focusable wrapper to hang on.

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({
  label,
  children,
  wrap = false,
}: {
  label: string;
  children: React.ReactElement;
  wrap?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {wrap ? (
            <span
              tabIndex={0}
              className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {children}
            </span>
          ) : (
            children
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
