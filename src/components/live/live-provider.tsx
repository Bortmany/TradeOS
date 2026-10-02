"use client";

// One poll shared by every live card on the dashboard (alerts, open positions,
// the status chip). Fetches GET /api/alerts about every 60 seconds while the tab
// is visible, pauses while it is hidden, and refreshes the moment the tab is
// shown again. A failed poll keeps the old numbers on screen. A background
// refresh never shows a skeleton.

import * as React from "react";
import type { LiveSnapshot } from "@/lib/alerts/view";
import { diffAlerts } from "@/lib/live/diff";

const POLL_MS = 60_000;
const SLOW_MS = 1_000;
const NOTICE_MS = 5_000;

export interface Notice {
  id: number;
  text: string;
}

export interface LiveContextValue {
  snap: LiveSnapshot;
  /** A refresh has taken longer than a second ("Updating..."). */
  slow: boolean;
  /** The last attempt to reach TradeOS failed; the numbers shown are the last good ones. */
  fetchFailed: boolean;
  /** When the numbers on screen were fetched (ISO). */
  lastGoodAt: string;
  /** The inline outcome line (dismissed / cleared), shown for a few seconds. */
  notice: Notice | null;
  /** Text for the polite screen-reader region. */
  announcement: string;
  refresh: () => Promise<void>;
  /** Drop an alert from the screen after the server accepted the dismissal. */
  removeAlert: (id: string, noticeText: string) => void;
}

const LiveContext = React.createContext<LiveContextValue | null>(null);

export function useLive(): LiveContextValue {
  const v = React.useContext(LiveContext);
  if (!v) throw new Error("useLive must be used inside <LiveProvider>");
  return v;
}

export function LiveProvider({
  initial,
  children,
}: {
  initial: LiveSnapshot;
  children: React.ReactNode;
}) {
  const [snap, setSnap] = React.useState(initial);
  const [slow, setSlow] = React.useState(false);
  const [fetchFailed, setFetchFailed] = React.useState(false);
  const [lastGoodAt, setLastGoodAt] = React.useState(initial.now);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const snapRef = React.useRef(snap);
  const dismissedHere = React.useRef(new Set<string>());
  const noticeSeq = React.useRef(0);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const showNotice = React.useCallback((text: string) => {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const refresh = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error("bad response");
      const next = json as LiveSnapshot & { ok: boolean };
      const changes = diffAlerts(snapRef.current.alerts, next.alerts, dismissedHere.current);
      const fresh: LiveSnapshot = {
        alerts: next.alerts,
        accounts: next.accounts,
        positions: next.positions,
        now: next.now,
      };
      setSnap(fresh);
      setLastGoodAt(next.now);
      setFetchFailed(false);
      if (changes.announcements.length) setAnnouncement(changes.announcements.join(" "));
      if (changes.cleared.length) showNotice(changes.cleared[0]);
    } catch {
      // Keep the old numbers; the chip tells the trader.
      setFetchFailed(true);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      inFlight.current = false;
    }
  }, [showNotice]);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [refresh]);

  const removeAlert = React.useCallback(
    (id: string, noticeText: string) => {
      dismissedHere.current.add(id);
      setSnap((s) => ({ ...s, alerts: s.alerts.filter((a) => a.id !== id) }));
      showNotice(noticeText);
    },
    [showNotice]
  );

  const value = React.useMemo<LiveContextValue>(
    () => ({ snap, slow, fetchFailed, lastGoodAt, notice, announcement, refresh, removeAlert }),
    [snap, slow, fetchFailed, lastGoodAt, notice, announcement, refresh, removeAlert]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
