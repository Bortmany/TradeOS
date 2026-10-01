// TradeOS — one checklist: edit (name, rulebook, on/off, questions, order) and delete.
// Runs already saved keep their own copy of the wording, so neither action
// changes history.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { templatePatchSchema } from "@/lib/checklist";
import { getTemplate } from "@/lib/checklist/data";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: Request, { params }: Ctx) => {
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const existing = await prisma.checklistTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Checklist not found." }, { status: 404 });
    }
    const d = templatePatchSchema.parse(await req.json());

    if (d.ruleBookId) {
      const book = await prisma.ruleBook.findFirst({
        where: { id: d.ruleBookId, userId: user.id },
        select: { id: true },
      });
      if (!book) {
        return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });
      }
    }

    if (d.move) {
      // Re-number every list 0..n-1 first so ties never make a move do nothing.
      const all = await prisma.checklistTemplate.findMany({
        where: { userId: user.id },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const from = all.findIndex((t) => t.id === id);
      const to = d.move === "up" ? from - 1 : from + 1;
      if (from >= 0 && to >= 0 && to < all.length) {
        [all[from], all[to]] = [all[to], all[from]];
      }
      await prisma.$transaction(
        all.map((t, i) =>
          prisma.checklistTemplate.update({ where: { id: t.id }, data: { order: i } })
        )
      );
    }

    const data: {
      name?: string;
      ruleBookId?: string | null;
      isActive?: boolean;
    } = {};
    if (d.name !== undefined) data.name = d.name;
    if ("ruleBookId" in d) data.ruleBookId = d.ruleBookId ?? null;
    if (d.isActive !== undefined) data.isActive = d.isActive;

    if (Object.keys(data).length > 0 || d.items) {
      await prisma.$transaction([
        prisma.checklistTemplate.update({ where: { id }, data }),
        ...(d.items
          ? [
              prisma.checklistItem.deleteMany({ where: { templateId: id } }),
              prisma.checklistItem.createMany({
                data: d.items.map((text, i) => ({ templateId: id, text, order: i })),
              }),
            ]
          : []),
      ]);
    }

    return NextResponse.json({ ok: true, template: await getTemplate(user.id, id) });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the checklist name and questions." });
  }
});

export const DELETE = withUser(async (user, _req: Request, { params }: Ctx) => {
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const existing = await prisma.checklistTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Checklist not found." }, { status: 404 });
    }
    await prisma.checklistTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
