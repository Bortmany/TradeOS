// TradeOS — one saved run: link it to a trade, unlink it, or delete it.
// Linking never happens by itself; the trader taps. A run belongs to at most
// one trade and a trade has at most one run. Only the owner's rows are ever
// touched; someone else's id looks exactly like a missing one.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { runPatchSchema } from "@/lib/checklist";
import { getRun } from "@/lib/checklist/data";
import { refuseDemo } from "@/lib/demo-guard";

type Ctx = { params: Promise<{ id: string }> };

const ALREADY = "This trade already has a checklist. Unlink it first.";

export const PATCH = withUser(async (user, req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const run = await prisma.checklistRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true, tradeId: true },
    });
    if (!run) return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });

    const d = runPatchSchema.parse(await req.json());

    if (d.tradeId === null) {
      await prisma.checklistRun.update({ where: { id }, data: { tradeId: null } });
      return NextResponse.json({ ok: true, run: await getRun(user.id, id) });
    }

    const trade = await prisma.trade.findFirst({
      where: { id: d.tradeId, userId: user.id },
      select: { id: true },
    });
    if (!trade) return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });

    if (run.tradeId && run.tradeId !== d.tradeId) {
      return NextResponse.json(
        { ok: false, error: "This run is already linked to another trade. Unlink it first." },
        { status: 409 }
      );
    }
    const taken = await prisma.checklistRun.findFirst({
      where: { tradeId: d.tradeId, userId: user.id, NOT: { id } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ ok: false, error: ALREADY }, { status: 409 });

    try {
      await prisma.checklistRun.update({ where: { id }, data: { tradeId: d.tradeId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ ok: false, error: ALREADY }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json({ ok: true, run: await getRun(user.id, id) });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the trade you chose." });
  }
});

export const DELETE = withUser(async (user, _req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const run = await prisma.checklistRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!run) return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
    await prisma.checklistRun.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
