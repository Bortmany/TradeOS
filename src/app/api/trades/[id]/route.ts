// TradeOS — single trade mutations. Owner-checked PATCH (journal fields) and
// DELETE. Both best-effort recompute compliance afterward so denormalized
// scores/snapshots stay in sync.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  notes: z.string().max(5000).optional().nullable(),
  emotions: z.string().max(500).optional().nullable(),
  strategyTag: z.string().max(120).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
});

async function recompute(userId: string) {
  try {
    const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
    await recomputeUserCompliance(userId);
  } catch {
    /* best-effort */
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
    await recompute(user.id);

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
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
    await recompute(user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
