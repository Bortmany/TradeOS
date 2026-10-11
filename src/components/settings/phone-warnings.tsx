"use client";

// Settings "Phone warnings" card (live-links UI spec, screen 5): opt in, per device,
// to a push notification when a risk step is crossed. One state is shown at a
// time: checking, off, waiting, on, iPhone-not-installed, blocked, unsupported,
// not switched on by the site owner. The browser permission box only appears
// when the trader presses "Enable alerts", never on page load.

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  Info,
  Loader2,
  Share,
  Smartphone,
  SquarePlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/hint";

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";
const GENERIC_ENABLE_ERROR = "Couldn't turn on alerts. Check your connection and try again.";

type View =
  | "checking"
  | "off"
  | "waiting"
  | "on"
  | "ios_install"
  | "blocked"
  | "unsupported"
  | "not_configured";

type Device = "iphone" | "android" | "laptop";

function detectDevice(): Device {
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOs) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "laptop";
}

function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function keyToBytes(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export function PhoneWarnings({
  configured,
  publicKey,
  demo,
}: {
  configured: boolean;
  publicKey: string | null;
  demo: boolean;
}) {
  const [view, setView] = React.useState<View>("checking");
  const [device, setDevice] = React.useState<Device>("laptop");
  const [error, setError] = React.useState<string | null>(null);
  const [deviceLimit, setDeviceLimit] = React.useState(false);
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [demoLine, setDemoLine] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testNote, setTestNote] = React.useState<null | "sent">(null);
  const [testLimited, setTestLimited] = React.useState(false);
  const [turningOff, setTurningOff] = React.useState(false);
  const [rechecking, setRechecking] = React.useState(false);
  const [stillBlocked, setStillBlocked] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = React.useCallback((text: string) => {
    setOutcome(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOutcome(null), 4000);
  }, []);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const detect = React.useCallback(async (): Promise<View> => {
    if (!configured || !publicKey) return "not_configured";
    const dev = detectDevice();
    setDevice(dev);
    if (dev === "iphone" && !isInstalled()) return "ios_install";
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    try {
      const sub = await currentSubscription();
      if (sub && Notification.permission === "granted") {
        // Quietly tell the server about this device again, so a device it dropped heals.
        void fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        }).catch(() => undefined);
        return "on";
      }
    } catch {
      /* fall through to off */
    }
    return "off";
  }, [configured, publicKey]);

  React.useEffect(() => {
    let alive = true;
    void detect().then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, [detect]);

  async function onEnable() {
    setError(null);
    setDeviceLimit(false);
    if (demo) {
      setDemoLine(true);
      return;
    }
    if (!publicKey) return;
    setView("waiting");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setView("blocked");
        return;
      }
      if (permission !== "granted") {
        setView("off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(publicKey) as unknown as BufferSource,
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        await sub.unsubscribe().catch(() => undefined);
        if (json?.code === "demo") {
          setDemoLine(true);
        } else if (json?.code === "device_limit") {
          setDeviceLimit(true);
          setError(String(json.error));
        } else {
          setError(GENERIC_ENABLE_ERROR);
        }
        setView("off");
        return;
      }
      setView("on");
      flash("Alerts are on for this device.");
    } catch {
      setError(GENERIC_ENABLE_ERROR);
      setView("off");
    }
  }

  async function onTest() {
    setError(null);
    setTestNote(null);
    if (demo) {
      setDemoLine(true);
      return;
    }
    setTesting(true);
    try {
      const sub = await currentSubscription();
      if (!sub) {
        setView("off");
        return;
      }
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setTestNote("sent");
      } else if (json?.code === "demo") {
        setDemoLine(true);
      } else if (json?.code === "test_limit") {
        setTestLimited(true);
      } else if (json?.code === "gone" || json?.code === "unknown_device") {
        setView("off");
        setError("This device stopped accepting alerts. Turn them on again.");
      } else {
        setError("Couldn't send the test. Try again.");
      }
    } catch {
      setError("Couldn't send the test. Try again.");
    } finally {
      setTesting(false);
    }
  }

  async function onTurnOff() {
    setError(null);
    setTestNote(null);
    if (demo) {
      setDemoLine(true);
      return;
    }
    setTurningOff(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        const res = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!res.ok) {
          setError("Couldn't turn off alerts. Check your connection and try again.");
          return;
        }
        await sub.unsubscribe().catch(() => undefined);
      }
      setView("off");
      flash("Alerts are off for this device.");
    } catch {
      setError("Couldn't turn off alerts. Check your connection and try again.");
    } finally {
      setTurningOff(false);
    }
  }

  async function onRecheck() {
    setRechecking(true);
    setStillBlocked(false);
    const v = await detect();
    setRechecking(false);
    if (v === "blocked") setStillBlocked(true);
    else setView(v);
  }

  const badge = (() => {
    switch (view) {
      case "on":
        return { label: "On for this device", variant: "info" as const };
      case "blocked":
        return { label: "Blocked", variant: "warning" as const };
      case "unsupported":
      case "not_configured":
      case "ios_install":
        return { label: "Not available", variant: "outline" as const };
      default:
        return { label: "Off", variant: "outline" as const };
    }
  })();

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Phone warnings</CardTitle>
          {view === "checking" ? (
            <Skeleton className="h-5 w-[72px]" />
          ) : view === "on" ? (
            <Hint label="Alerts are on in this browser or phone. Each device is switched on separately.">
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </Hint>
          ) : (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Get a notification when you cross 50%, 80% or 100% of a limit, even when TradeOS is
          closed. Optional, and set per device: do the same on your other phone or laptop.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {view === "checking" ? (
          <div className="space-y-4" aria-busy="true" aria-label="Checking this device">
            <Skeleton className="h-16 max-w-sm" />
            <Skeleton className="h-11 w-40" />
          </div>
        ) : (
          <>
            <div className="max-w-sm space-y-1.5">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Example</p>
              <div
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3"
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">TradeOS</p>
                    <span className="text-2xs text-muted-foreground">now</span>
                  </div>
                  <p className="text-sm">Topstep 50K: 80% of today&apos;s loss limit used. $180 left.</p>
                </div>
              </div>
            </div>
            <p className="text-2xs text-muted-foreground">
              One notification per warning step: you won&apos;t be pinged again while you stay at the
              same step. We only send your risk warnings, never marketing. Alerts are read-only
              information; TradeOS never places an order.
            </p>

            {view === "not_configured" && (
              <>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Phone warnings aren&apos;t switched on for this site yet.
                </p>
                <DisabledEnable hint="Not switched on yet." />
              </>
            )}

            {view === "unsupported" && (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  This browser can&apos;t receive phone warnings. On iPhone use Safari and add TradeOS
                  to your Home Screen; on other devices try Chrome, Edge or Firefox.
                </p>
                <DisabledEnable hint="This browser doesn't support notifications." />
              </>
            )}

            {view === "ios_install" && (
              <>
                <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-sm font-medium">
                    On iPhone, add TradeOS to your Home Screen first
                  </p>
                  <ol className="space-y-2">
                    <Step n={1} icon={<Share className="h-4 w-4" />}>
                      Tap the Share button at the bottom of Safari (the square with an arrow).
                    </Step>
                    <Step n={2} icon={<SquarePlus className="h-4 w-4" />}>
                      Scroll down and tap Add to Home Screen, then tap Add.
                    </Step>
                    <Step n={3} icon={<Smartphone className="h-4 w-4" />}>
                      Open TradeOS from the new icon on your Home Screen, come back to Settings and
                      tap Enable alerts.
                    </Step>
                  </ol>
                  <p className="text-2xs text-muted-foreground">
                    Needs iOS 16.4 or newer. Check under Settings, General, About.
                  </p>
                </div>
                <DisabledEnable hint="Add TradeOS to your Home Screen first (steps above)." />
              </>
            )}

            {view === "blocked" && (
              <>
                <div className="rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-sm">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    Notifications are blocked for TradeOS on this device.
                  </p>
                  <p className="mt-1 pl-6 text-muted-foreground">
                    {device === "iphone"
                      ? "Open the iPhone Settings app, tap Notifications, find TradeOS and turn on Allow Notifications."
                      : device === "android"
                        ? "Tap the lock icon next to the address, then Permissions, then Notifications, then Allow."
                        : "Click the lock icon in the address bar, find Notifications, and choose Allow."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={onRecheck}
                    disabled={rechecking}
                  >
                    {rechecking && <Loader2 className="animate-spin" />}
                    {rechecking ? "Checking…" : "Check again"}
                  </Button>
                  {stillBlocked && (
                    <p className="text-sm text-muted-foreground" role="status">
                      Still blocked. Change it in your phone or browser settings, then tap Check
                      again.
                    </p>
                  )}
                </div>
              </>
            )}

            {(view === "off" || view === "waiting") && (
              <div className="space-y-1.5">
                {deviceLimit ? (
                  <DisabledEnable hint={error ?? ""} />
                ) : (
                  <Button
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={onEnable}
                    disabled={view === "waiting"}
                  >
                    {view === "waiting" ? <Loader2 className="animate-spin" /> : <Bell />}
                    {view === "waiting" ? "Waiting for your answer…" : "Enable alerts"}
                  </Button>
                )}
                <p className="text-2xs text-muted-foreground">
                  {view === "waiting"
                    ? "Look for the permission box from your phone or browser."
                    : "Your phone or browser will ask permission first."}
                </p>
              </div>
            )}

            {view === "on" && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm">
                  <BellRing className="h-4 w-4 text-info" />
                  Alerts are on for this device.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {testLimited ? (
                    <Hint wrap label="You've sent 5 tests this hour. Try again a bit later.">
                      <Button variant="secondary" size="lg" className="w-full sm:w-auto" disabled>
                        Send me a test
                      </Button>
                    </Hint>
                  ) : (
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full sm:w-auto"
                      onClick={onTest}
                      disabled={testing || turningOff}
                    >
                      {testing && <Loader2 className="animate-spin" />}
                      {testing ? "Sending…" : "Send me a test"}
                    </Button>
                  )}
                  <Hint label="Stop notifications on this device. Your other devices keep theirs.">
                    <Button
                      variant="ghost"
                      size="lg"
                      className="w-full sm:w-auto"
                      onClick={onTurnOff}
                      disabled={turningOff || testing}
                    >
                      {turningOff && <Loader2 className="animate-spin" />}
                      {turningOff ? "Turning off…" : "Turn off"}
                    </Button>
                  </Hint>
                </div>
                {testLimited && (
                  <p className="text-sm text-muted-foreground" role="status">
                    You&apos;ve sent 5 tests this hour. Try again a bit later.
                  </p>
                )}
                {testNote === "sent" && (
                  <div role="status" className="space-y-0.5">
                    <p className="text-sm">Test sent. It should arrive in a few seconds.</p>
                    <p className="text-2xs text-muted-foreground">
                      Nothing arrived? Check Do Not Disturb or Focus mode on your phone.
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && !deviceLimit && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {deviceLimit && error && (
              <p role="alert" className="text-sm text-loss">
                {error}
              </p>
            )}
            {demoLine && (
              <p className="text-sm text-muted-foreground" role="status">
                {DEMO_LINE}{" "}
                <Link href="/register" className="text-primary underline underline-offset-2">
                  Create a free account
                </Link>
              </p>
            )}
            <p aria-live="polite" className="min-h-5 text-sm">
              {outcome && (
                <span className="inline-flex items-center gap-1.5 text-profit">
                  <Check className="h-4 w-4" />
                  {outcome}
                </span>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DisabledEnable({ hint }: { hint: string }) {
  return (
    <Hint wrap label={hint}>
      <Button size="lg" className="w-full sm:w-auto" disabled>
        <Bell />
        Enable alerts
      </Button>
    </Hint>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-2xs">
        {n}
      </span>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="text-sm">{children}</span>
    </li>
  );
}
