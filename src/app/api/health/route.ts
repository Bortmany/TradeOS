import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBillingConfigured } from "@/lib/billing/paddle";
import { signupMode } from "@/lib/signup-mode";

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

  checks.billing = isBillingConfigured() ? "configured" : "dev-mode";
  checks.aiCoaching = process.env.AI_COACHING_ENABLED === "true" ? "enabled" : "disabled";
  checks.errorTracking = process.env.SENTRY_DSN ? "configured" : "dormant";
  // Who can create an account right now: "open" | "invite" | "closed".
  checks.signups = signupMode();

  return NextResponse.json(
    { ok, status: ok ? "healthy" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
