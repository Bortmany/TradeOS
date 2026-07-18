// TradeOS — single trade mutations. Owner-checked PATCH (journal fields) and
// DELETE. Both best-effort recompute compliance afterward so denormalized
// scores/snapshots stay in sync.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";

const patchSchema = z.object({
  notes: z.string().max(5000).optional().nullable(),
  emotions: z.string().max(500).optional().nullable(),
  strategyTag: z.string().max(120).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
});

export const PATCH = withUser(async (
  user,
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const limited = enforceUserRateLimit("trades:update", user.id);
  if (limited) return limited;

  try {
    const { id } = await params;
    const owned = await prisma.trade.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });
    }

    const d = patchSchema.parse(await req.json());
    const data: Record<string, string | null> = {};
    if ("notes" in d) data.notes = d.notes ? d.notes : null;
    if ("emotions" in d) data.emotions = d.emotions ? d.emotions : null;
    if ("strategyTag" in d) data.strategyTag = d.strategyTag ? d.strategyTag : null;
    if ("tags" in d) data.tags = d.tags ? d.tags : null;

    await prisma.trade.update({ where: { id }, data });
    await recomputeCompliance(user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? "Please check the journal fields."
        : err instanceof Error
          ? err.message
          : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});

export const DELETE = withUser(async (
  user,
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const limited = enforceUserRateLimit("trades:delete", user.id);
  if (limited) return limited;

  try {
    const { id } = await params;
    const owned = await prisma.trade.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });
    }

    await prisma.trade.delete({ where: { id } });
    await recomputeCompliance(user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
