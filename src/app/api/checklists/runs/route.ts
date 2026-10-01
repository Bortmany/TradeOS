// TradeOS — saved checklist runs: list (recent, or unlinked only) and save one.
// A run keeps its own copy of the wording. It may be linked to one of the
// user's own trades, at most one run per trade. Runs never touch the score.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { MAX_RUNS_PER_USER, buildAnswers, runCreateSchema, runListQuerySchema } from "@/lib/checklist";
import { getRun, listRuns } from "@/lib/checklist/data";

const ALREADY = "This trade already has a checklist. Unlink it first.";

export const GET = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("checklists:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    const url = new URL(req.url);
    const q = runListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const { runs, hasMore } = await listRuns(user.id, {
      limit: q.limit,
      offset: q.offset,
      unlinked: q.unlinked === "1",
    });
    return NextResponse.json({ ok: true, runs, hasMore });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the list settings." });
  }
});

export const POST = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("checklists:write", user.id);
  if (limited) return limited;
  try {
    const d = runCreateSchema.parse(await req.json());

    const template = await prisma.checklistTemplate.findFirst({
      where: { id: d.templateId, userId: user.id },
      include: { items: { orderBy: { order: "asc" }, select: { id: true, text: true } } },
    });
    if (!template) {
      return NextResponse.json({ ok: false, error: "Checklist not found." }, { status: 404 });
    }

    if (d.tradeId) {
      const trade = await prisma.trade.findFirst({
        where: { id: d.tradeId, userId: user.id },
        select: { id: true },
      });
      if (!trade) {
        return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });
      }
      const taken = await prisma.checklistRun.findFirst({
        where: { tradeId: d.tradeId, userId: user.id },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ ok: false, error: ALREADY }, { status: 409 });
      }
    }

    const count = await prisma.checklistRun.count({ where: { userId: user.id } });
    if (count >= MAX_RUNS_PER_USER) {
      return NextResponse.json(
        {
          ok: false,
          error: `You've saved the most runs we keep (${MAX_RUNS_PER_USER.toLocaleString("en-US")}). Delete some old ones under Checklist, Recent runs.`,
        },
        { status: 403 }
      );
    }

    const { answers, checkedCount, totalCount } = buildAnswers(template.items, d.ticked);
    try {
      const run = await prisma.checklistRun.create({
        data: {
          userId: user.id,
          templateId: template.id,
          templateName: template.name,
          answers: JSON.stringify(answers),
          checkedCount,
          totalCount,
          tradeId: d.tradeId ?? null,
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, run: await getRun(user.id, run.id) });
    } catch (err) {
      // Two taps at once on the same trade: the unique link catches the loser.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ ok: false, error: ALREADY }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the ticked items." });
  }
});
