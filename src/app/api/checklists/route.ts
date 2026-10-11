// TradeOS — the user's pre-trade checklists: list and create.
// A checklist only reminds. It never blocks a trade and never touches the score.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { MAX_TEMPLATES_PER_USER, templateCreateSchema } from "@/lib/checklist";
import { getTemplate, listTemplates } from "@/lib/checklist/data";
import { refuseDemo } from "@/lib/demo-guard";

export const GET = withUser(async (user) => {
  const limited = enforceUserRateLimit("checklists:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    return NextResponse.json({ ok: true, templates: await listTemplates(user.id) });
  } catch (err) {
    return apiErrorResponse(err);
  }
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const d = templateCreateSchema.parse(await req.json());

    if (d.ruleBookId) {
      const book = await prisma.ruleBook.findFirst({
        where: { id: d.ruleBookId, userId: user.id },
        select: { id: true },
      });
      if (!book) {
        return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });
      }
    }

    const count = await prisma.checklistTemplate.count({ where: { userId: user.id } });
    if (count >= MAX_TEMPLATES_PER_USER) {
      return NextResponse.json(
        {
          ok: false,
          error: `You have ${MAX_TEMPLATES_PER_USER} checklists, the most we keep. Delete one to make another.`,
        },
        { status: 403 }
      );
    }

    const last = await prisma.checklistTemplate.findFirst({
      where: { userId: user.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const created = await prisma.checklistTemplate.create({
      data: {
        userId: user.id,
        name: d.name,
        ruleBookId: d.ruleBookId ?? null,
        isActive: d.isActive ?? true,
        order: (last?.order ?? -1) + 1,
        items: { create: d.items.map((text, i) => ({ text, order: i })) },
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, template: await getTemplate(user.id, created.id) });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the checklist name and questions." });
  }
});
