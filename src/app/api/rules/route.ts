import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RULE_TYPES, SEVERITIES, RULE_CONFIG_SCHEMAS, type RuleType } from "@/lib/types";

const createSchema = z.object({
  ruleBookId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(RULE_TYPES),
  severity: z.enum(SEVERITIES).default("medium"),
  weight: z.coerce.number().int().min(1).max(100).default(1),
  config: z.unknown(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  type: z.enum(RULE_TYPES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  weight: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  config: z.unknown().optional(),
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

// Validate + serialize config against the schema for `type`. Throws on mismatch.
function serializeConfig(type: RuleType, raw: unknown): string {
  const parsed = RULE_CONFIG_SCHEMAS[type].parse(raw ?? {});
  return JSON.stringify(parsed);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const d = createSchema.parse(await req.json());
    const book = await prisma.ruleBook.findFirst({
      where: { id: d.ruleBookId, userId: user.id },
    });
    if (!book) return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });

    const config = serializeConfig(d.type, d.config);
    const count = await prisma.rule.count({ where: { ruleBookId: d.ruleBookId } });

    const rule = await prisma.rule.create({
      data: {
        ruleBookId: d.ruleBookId,
        name: d.name,
        type: d.type,
        severity: d.severity,
        weight: d.weight,
        config,
        order: count,
      },
    });
    await recompute(user.id);
    return NextResponse.json({ ok: true, id: rule.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const d = patchSchema.parse(await req.json());
    const existing = await prisma.rule.findFirst({
      where: { id: d.id, ruleBook: { userId: user.id } },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Rule not found." }, { status: 404 });

    // Re-validate config against the (possibly new) type when config is present.
    const effectiveType = (d.type ?? existing.type) as RuleType;
    const configUpdate =
      d.config !== undefined ? { config: serializeConfig(effectiveType, d.config) } : {};

    await prisma.rule.update({
      where: { id: d.id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.type !== undefined ? { type: d.type } : {}),
        ...(d.severity !== undefined ? { severity: d.severity } : {}),
        ...(d.weight !== undefined ? { weight: d.weight } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        ...configUpdate,
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
    const existing = await prisma.rule.findFirst({
      where: { id: d.id, ruleBook: { userId: user.id } },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Rule not found." }, { status: 404 });

    await prisma.rule.delete({ where: { id: d.id } });
    await recompute(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 400 });
  }
}

function errMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return first ? `Invalid config: ${first.message}` : "Please check the rule fields.";
  }
  return err instanceof Error ? err.message : "Failed.";
}
