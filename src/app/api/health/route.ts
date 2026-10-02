import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBillingConfigured } from "@/lib/billing/paddle";
import { signupMode } from "@/lib/signup-mode";
import { isPushConfigured } from "@/lib/push/config";

export const dynamic = "force-dynamic";

// Lightweight health/readiness probe for uptime monitoring & post-deploy checks.
export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unreachable";
    ok = false;
  }

  // Background jobs: "ok" | "failing" (the last run failed; see the server log) | "idle"
  // (never ran on this database). Informational only: a broker outage must never turn the
  // whole health probe red (the host restarts the app on a failing probe).
  if (checks.database === "ok") {
    try {
      const { runnerHealth } = await import("@/lib/single-runner");
      const { AUTO_SYNC_LOCK_KEY } = await import("@/lib/auto-sync");
      const { LIVE_LOCK_KEY } = await import("@/lib/live/poller");
      for (const [name, key] of [
        ["liveReads", LIVE_LOCK_KEY],
        ["fillSweep", AUTO_SYNC_LOCK_KEY],
      ] as const) {
        const h = await runnerHealth(key);
        checks[name] = !h ? "idle" : h.lastError ? "failing" : "ok";
      }
    } catch {
      /* the probe itself must never fail because of this */
    }
  }

  checks.billing =isBillingConfigured() ? "configured" : "dev-mode";
  checks.aiCoaching = process.env.AI_COACHING_ENABLED === "true" ? "enabled" : "disabled";
  checks.errorTracking = process.env.SENTRY_DSN ? "configured" : "dormant";
  // Phone warnings (Web Push): "configured" once all four VAPID keys are set.
  checks.phoneWarnings = isPushConfigured() ? "configured" : "dormant";
  // Who can create an account right now: "open" | "invite" | "closed".
  checks.signups = signupMode();

  return NextResponse.json(
    { ok, status: ok ? "healthy" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
