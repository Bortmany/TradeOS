import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runWeeklyCoaching } from "@/lib/ai/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Weekly coaching review for every eligible trader. Same CRON_SECRET rule as
// /api/cron/sync: required everywhere (503 if unset, 401 if wrong).
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/coaching-weekly
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Backup path: handles a few traders per hit within the 60 s budget; the in-process Monday job is the main path.
  const result = await runWeeklyCoaching({ deadlineMs: 50_000 });
  return NextResponse.json({ ok: true, ...result, time: new Date().toISOString() });
}
