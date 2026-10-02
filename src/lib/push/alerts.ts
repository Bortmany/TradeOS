// TradeOS — phone warnings for alerts. Called once at the end of every alert pass
// (src/lib/alerts/generate.ts). It looks at the user's open, un-dismissed
// auto alerts and announces each (alert, step) exactly once:
//   - a new alert pushes at its step; a step UP pushes once more at the new step;
//   - repeat polls at the same step, and alerts clearing themselves, push nothing;
//   - the step is recorded (PushSent) even when nobody has alerts on, so turning
//     alerts on later never replays warnings that already existed.
// Profit-target alerts are good news, not a limit, so they never push.
// Never throws: a failed push must not stop alert generation.

import { prisma } from "@/lib/db";
import { pushConfig } from "./config";
import { sendToUser } from "./send";

const SKIP_MEASURES = new Set(["profit_target"]);

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function notifyAlertSteps(userId: string): Promise<void> {
  try {
    const open = await prisma.alert.findMany({
      where: { userId, status: "open", dismissedAt: null, meta: { contains: '"auto":true' } },
      select: { id: true, title: true, meta: true },
    });
    const candidates = open
      .map((a) => {
        const meta = parseMeta(a.meta);
        const step = meta.step === 50 || meta.step === 80 || meta.step === 100 ? meta.step : 0;
        return { id: a.id, title: a.title, meta, step };
      })
      .filter((a) => !SKIP_MEASURES.has(String(a.meta.measure)));
    if (!candidates.length) return;

    const already = await prisma.pushSent.findMany({
      where: { userId, alertId: { in: candidates.map((c) => c.id) } },
      select: { alertId: true, step: true },
    });
    const done = new Set(already.map((p) => `${p.alertId}:${p.step}`));
    const live = pushConfig() !== null;

    for (const c of candidates) {
      if (done.has(`${c.id}:${c.step}`)) continue;
      // Claim the step first (the unique key makes this safe if two passes race).
      try {
        await prisma.pushSent.create({ data: { userId, alertId: c.id, step: c.step } });
      } catch {
        continue;
      }
      if (!live) continue;
      const left = typeof c.meta.left === "number" && c.step !== 100 ? c.meta.left : null;
      const body = `${c.title}.${left !== null ? ` $${Math.round(left).toLocaleString("en-US")} left.` : ""}`;
      await sendToUser(userId, {
        title: "TradeOS",
        body,
        url: "/dashboard",
        tag: `alert-${c.id}`,
      });
    }
  } catch {
    // swallowed on purpose
  }
}
