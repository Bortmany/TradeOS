"use client";

// The trader's display time zone, shared with every client component.
//
// The app layout reads the saved zone (User.timezone) on the server and passes
// it in here, so a client component prints times with exactly the same zone
// the server used — the browser's own zone is never consulted. That keeps the
// server render and the browser render identical (no hydration mismatch).
// Display only: grading never reads this.

import * as React from "react";
import { DEFAULT_TIME_ZONE } from "@/lib/utils";

const TimeZoneContext = React.createContext<string>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}

/** The zone to print times in (already resolved to a safe value by the layout). */
export function useTimeZone(): string {
  return React.useContext(TimeZoneContext);
}
