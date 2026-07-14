import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadSampleData } from "@/lib/demo";
import { rateLimit } from "@/lib/rate-limit";

// One-click activation: populate a new user's account with realistic sample
// trades + a starter rulebook so they see the product working immediately.
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // This does a bulk insert — don't let it be hammered. 5 per user / 10 min.
  const limit = rateLimit(`demo-data:${user.id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Please wait a moment before trying that again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const result = await loadSampleData(user.id);
    if (result.skipped) {
      return NextResponse.json({
        ok: false,
        error: "You already have trades — sample data is only for empty accounts.",
      });
    }
    return NextResponse.json({ ok: true, created: result.created });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load sample data." },
      { status: 500 }
    );
  }
}
