"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// A plain on/off switch built from a button with role="switch" (no library).
// Tokens only. The hit area is 44px tall; the visible track is 44x28.
export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Shows a small spinner in the thumb and ignores presses (a save is in flight). */
  loading?: boolean;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, loading = false, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative -my-2 inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-7 w-11 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-background shadow transition-transform motion-reduce:transition-none",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </span>
      </span>
    </button>
  )
);
Switch.displayName = "Switch";

export { Switch };
