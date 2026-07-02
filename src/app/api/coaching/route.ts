import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCoachingProvider, isCoachingEnabled } from "@/lib/ai";

// AI coaching endpoint — architecture-ready, disabled by default (Phase 4).
// Returns a structured "disabled" response so the UI can invite users to the
// roadmap without any AI dependency existing in the codebase.
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const provider = getCoachingProvider();
  return NextResponse.json({
    ok: true,
    enabled: isCoachingEnabled() && provider.enabled,
    message:
      "AI coaching is on the Elite roadmap. Trade summaries, mistake clustering, and daily journaling will plug in here — with no impact on the deterministic core.",
  });
}
