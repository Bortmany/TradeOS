// TradeOS — sending a Web Push to a user's devices.
//
// The only outside calls are to the push services on the fixed host list
// (src/lib/push/hosts.ts); the address is re-checked here right before sending
// even though it was checked when saved. Never logs the endpoint or keys.
// A "gone" reply (404 or 410) deletes that subscription. Nothing here throws:
// a failed push must never stop alert generation.
// Node-safe: no "server-only" import (the seed script calls alert generation).

import { prisma } from "@/lib/db";
import { pushConfig } from "./config";
import { isAllowedPushEndpoint } from "./hosts";

export interface PushPayload {
  title: string;
  body: string;
  /** Same-site path opened on tap. */
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
}

export type SendOutcome = "sent" | "gone" | "failed" | "off" | "refused";

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type WebPushModule = {
  setVapidDetails(subject: string, pub: string, priv: string): void;
  sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    opts?: Record<string, unknown>
  ): Promise<unknown>;
};

async function loadWebPush(): Promise<WebPushModule> {
  const mod = (await import("web-push")) as unknown as { default?: WebPushModule } & WebPushModule;
  return mod.default ?? mod;
}

/** Send one payload to one device. Updates its success/failure stamps. */
export async function sendToSubscription(sub: Sub, payload: PushPayload): Promise<SendOutcome> {
  const cfg = pushConfig();
  if (!cfg) return "off";
  if (!isAllowedPushEndpoint(sub.endpoint)) return "refused";
  try {
    const wp = await loadWebPush();
    wp.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: "high", timeout: 8000 }
    );
    await prisma.pushSubscription
      .update({ where: { id: sub.id }, data: { lastSuccessAt: new Date() } })
      .catch(() => undefined);
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number } | null)?.statusCode;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
      return "gone";
    }
    await prisma.pushSubscription
      .update({ where: { id: sub.id }, data: { lastFailureAt: new Date() } })
      .catch(() => undefined);
    return "failed";
  }
}

/** Send to every device the user turned alerts on for. Returns how many were sent. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfig()) return 0;
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const results = await Promise.all(subs.map((s) => sendToSubscription(s, payload)));
  return results.filter((r) => r === "sent").length;
}
