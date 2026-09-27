import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { effectivePlan, getFeatures, withinLimit } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import { apiErrorResponse } from "@/lib/api-error";

const SCOPES = ["all", "strategy", "account"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  scope: z.enum(SCOPES).optional(),
  scopeValue: z.string().max(200).optional().nullable(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  scope: z.enum(SCOPES).optional(),
  scopeValue: z.string().max(200).optional().nullable(),
});

const deleteSchema = z.object({ id: z.string().min(1) });

async function auth() {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

async function recompute(userId: string) {
  try {
    const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
    await recomputeUserCompliance(userId);
  } catch {
    /* best-effort */
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limited = enforceUserRateLimit("rulebooks:write", user.id);
  if (limited) return limited;
  try {
    const d = createSchema.parse(await req.json());

    // Server-side cap: every plan has the rule engine, but the free tier only
    // gets one rulebook. Counting then creating can in theory race with a second
    // request from the same person, exactly like the existing account limit —
    // the worst case is one extra row, so no transaction is taken for it.
    const bookCount = await prisma.ruleBook.count({ where: { userId: user.id } });
    if (!withinLimit(user.plan as Plan, user.billingStatus, "maxRuleBooks", bookCount)) {
      const limit = getFeatures(effectivePlan(user.plan as Plan, user.billingStatus)).maxRuleBooks;
      return NextResponse.json(
        {
          ok: false,
          error: `Your plan includes ${limit} rulebook${limit === 1 ? "" : "s"}. Upgrade to Pro for unlimited rulebooks.`,
        },
        { status: 403 }
      );
    }

    const book = await prisma.ruleBook.create({
      data: {
        userId: user.id,
        name: d.name,
        description: d.description || null,
        scope: d.scope ?? "all",
        scopeValue: d.scopeValue || null,
      },
    });
    await recompute(user.id);
    return NextResponse.json({ ok: true, id: book.id });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the rulebook fields." });
  }
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limited = enforceUserRateLimit("rulebooks:write", user.id);
  if (limited) return limited;
  try {
    const d = patchSchema.parse(await req.json());
    const existing = await prisma.ruleBook.findFirst({ where: { id: d.id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });

    await prisma.ruleBook.update({
      where: { id: d.id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        ...(d.scope !== undefined ? { scope: d.scope } : {}),
        ...(d.scopeValue !== undefined ? { scopeValue: d.scopeValue || null } : {}),
      },
    });
    await recompute(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the rulebook fields." });
  }
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limited = enforceUserRateLimit("rulebooks:write", user.id);
  if (limited) return limited;
  try {
    const d = deleteSchema.parse(await req.json());
    const existing = await prisma.ruleBook.findFirst({ where: { id: d.id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });

    await prisma.ruleBook.delete({ where: { id: d.id } });
    await recompute(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the rulebook fields." });
  }
}
