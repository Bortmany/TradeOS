// TradeOS — owner's AI usage counts for the last 14 days. Counts only, never
// content. Same secret check as /api/cron/sync: CRON_SECRET is required.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/coaching/usage

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function price(name: string, fallback: number): number {
  const n = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const inputPer = price("AI_PRICE_INPUT_PER_MTOK", 3);
  const outputPer = price("AI_PRICE_OUTPUT_PER_MTOK", 15);
  const cost = (i: number, o: number) => round((i * inputPer + o * outputPer) / 1_000_000);

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(todayUtc - 13 * 86_400_000);

  const [rows, served] = await Promise.all([
    prisma.aiUsage.findMany({
      where: { createdAt: { gte: since } },
      select: { userId: true, createdAt: true, inputTokens: true, outputTokens: true, ok: true, scheduled: true },
    }),
    prisma.coachingNote.aggregate({ _sum: { servedCount: true } }),
  ]);

  const acc = new Map<string, { calls: number; failed: number; scheduled: number; users: Set<string>; i: number; o: number }>();
  for (let k = 0; k < 14; k++) {
    acc.set(new Date(since.getTime() + k * 86_400_000).toISOString().slice(0, 10), {
      calls: 0, failed: 0, scheduled: 0, users: new Set(), i: 0, o: 0,
    });
  }
  const allUsers = new Set<string>();
  let calls = 0, failed = 0, inTok = 0, outTok = 0;
  for (const r of rows) {
    const d = acc.get(r.createdAt.toISOString().slice(0, 10));
    if (!d) continue;
    d.calls += 1;
    if (!r.ok) d.failed += 1;
    if (r.scheduled) d.scheduled += 1;
    d.users.add(r.userId);
    d.i += r.inputTokens;
    d.o += r.outputTokens;
    allUsers.add(r.userId);
    calls += 1;
    if (!r.ok) failed += 1;
    inTok += r.inputTokens;
    outTok += r.outputTokens;
  }

  return NextResponse.json({
    ok: true,
    days: [...acc.entries()].map(([day, d]) => ({
      day,
      calls: d.calls,
      failed: d.failed,
      scheduled: d.scheduled,
      users: d.users.size,
      inputTokens: d.i,
      outputTokens: d.o,
      estimatedCostUsd: cost(d.i, d.o),
    })),
    totals: {
      calls,
      failed,
      users: allUsers.size,
      inputTokens: inTok,
      outputTokens: outTok,
      estimatedCostUsd: cost(inTok, outTok),
      cacheHits: served._sum.servedCount ?? 0,
    },
    pricing: { inputPerMTok: inputPer, outputPerMTok: outputPer },
  });
}
