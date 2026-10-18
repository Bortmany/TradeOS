import * as React from "react";
import { Clock, Info, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DEMO_LINE } from "./use-coaching";

/** Note-shaped loading placeholder. aria-busy wrapper; bars are aria-hidden. */
export function NoteSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
      <span className="sr-only">Loading</span>
      <Skeleton aria-hidden className="h-4 w-2/5" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            aria-hidden
            className={cn("h-3 w-full", i === lines - 1 && "w-3/5")}
          />
        ))}
      </div>
      <Skeleton aria-hidden className="h-8 w-24" />
    </div>
  );
}

export type CoachNoticeKind =
  | "owner_off"
  | "user_off"
  | "demo"
  | "limit"
  | "global_limit"
  | "unavailable"
  | "no_data";

const COPY: Record<CoachNoticeKind, string> = {
  owner_off: "AI coaching isn't switched on for this site yet.",
  user_off: "You've turned the AI coach off. Switch it back on in Settings.",
  demo: DEMO_LINE,
  limit: "You've reached today's AI coaching limit. It resets within 24 hours.",
  global_limit: "AI coaching is very busy today and has paused until tomorrow.",
  unavailable: "Coaching isn't available right now.",
  no_data: "Add a few more trades and your coach will have something to read.",
};

export function CoachNotice({ kind, message }: { kind: CoachNoticeKind; message?: string }) {
  const isWarn = kind === "unavailable";
  const Icon = kind === "limit" || kind === "global_limit" ? Clock : Info;
  return (
    <p
      role={isWarn ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 text-sm",
        isWarn ? "text-warning" : "text-muted-foreground"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {message ?? COPY[kind]}
        {kind === "user_off" && (
          <>
            {" "}
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <SettingsIcon className="h-3 w-3" aria-hidden />
              Open Settings
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

export function RemainingPill({ used, limit }: { used: number; limit: number }) {
  const left = Math.max(0, limit - used);
  return (
    <span className="text-2xs tabular text-muted-foreground">
      {left} of {limit} notes left today
    </span>
  );
}
