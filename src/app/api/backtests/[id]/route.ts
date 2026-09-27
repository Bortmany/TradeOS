// TradeOS — single backtest-run mutations: rename / edit notes, and delete.
// Ownership-checked; no plan gate so a downgraded user can still manage and
// remove their recorded runs.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const PATCH = withUser(async (
  user,
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const limited = enforceUserRateLimit("backtests:update", user.id);
  if (limited) return limited;

  try {
    const { id } = await params;
    const owned = await prisma.backtestRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Backtest not found." }, { status: 404 });
    }

    const d = patchSchema.parse(await req.json());
    const data: Record<string, string | null> = {};
    if (d.name !== undefined) data.name = d.name;
    if ("notes" in d) data.notes = d.notes ? d.notes : null;

    await prisma.backtestRun.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? "Please check the backtest fields."
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
  const limited = enforceUserRateLimit("backtests:delete", user.id);
  if (limited) return limited;

  try {
    const { id } = await params;
    const owned = await prisma.backtestRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Backtest not found." }, { status: 404 });
    }

    await prisma.backtestRun.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
