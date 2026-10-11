"use client";

// Re-reads a server-rendered page about once a minute while the tab is visible
// (paused while hidden, refreshed the moment it is shown again), so the Prop
// page's live figures move without a reload. Renders nothing.

import * as React from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}
