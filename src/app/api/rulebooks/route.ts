import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  try {
    const d = createSchema.parse(await req.json());
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
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const d = deleteSchema.parse(await req.json());
    const existing = await prisma.ruleBook.findFirst({ where: { id: d.id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });

    await prisma.ruleBook.delete({ where: { id: d.id } });
    await recompute(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 400 });
  }
}

function errMessage(err: unknown): string {
  if (err instanceof z.ZodError) return "Please check the rulebook fields.";
  return err instanceof Error ? err.message : "Failed.";
}
