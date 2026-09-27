import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { loadSampleData } from "@/lib/demo";
import { rateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";

// One-click activation: populate a new user's account with realistic sample
// trades + a starter rulebook so they see the product working immediately.
export const POST = withUser(async (user) => {
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
    // Never echo a raw internal error message to the client.
    return apiErrorResponse(err);
  }
});
