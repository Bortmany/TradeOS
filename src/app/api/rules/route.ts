import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { RULE_TYPES, SEVERITIES, RULE_CONFIG_SCHEMAS, type RuleType, type Plan } from "@/lib/types";
import { effectivePlan, getFeatures, withinLimit } from "@/lib/billing/plans";
import { apiErrorResponse } from "@/lib/api-error";

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
  const limited = enforceUserRateLimit("rules:write", user.id);
  if (limited) return limited;
  try {
    const d = createSchema.parse(await req.json());
    const book = await prisma.ruleBook.findFirst({
      where: { id: d.ruleBookId, userId: user.id },
    });
    if (!book) return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });

    // Server-side cap: the free tier gets a small number of rules IN TOTAL, so
    // this count is over everything the signed-in user owns — scoped through
    // ruleBook.userId, never by rulebook id alone (another person's book must
    // never be able to spend, or be spent by, this person's allowance).
    // Same accepted race as the account limit: worst case one extra row.
    const ownedRules = await prisma.rule.count({ where: { ruleBook: { userId: user.id } } });
    if (!withinLimit(user.plan as Plan, user.billingStatus, "maxRules", ownedRules)) {
      const limit = getFeatures(effectivePlan(user.plan as Plan, user.billingStatus)).maxRules;
      return NextResponse.json(
        {
          ok: false,
          error: `Your plan includes ${limit} rules. Upgrade to Pro for unlimited rules.`,
        },
        { status: 403 }
      );
    }

    const config = serializeConfig(d.type, d.config);
    // Separate, deliberate second count: this one is the new rule's position
    // WITHIN its own book, which is a different question from the plan cap.
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
    return apiErrorResponse(err, { validationMessage: configValidationMessage(err) });
  }
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limited = enforceUserRateLimit("rules:write", user.id);
  if (limited) return limited;
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
    return apiErrorResponse(err, { validationMessage: configValidationMessage(err) });
  }
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limited = enforceUserRateLimit("rules:write", user.id);
  if (limited) return limited;
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
    return apiErrorResponse(err, { validationMessage: configValidationMessage(err) });
  }
}

// Turn a config validation slip into a specific, plain-English hint (used only
// for the ZodError branch inside apiErrorResponse — other errors stay generic).
function configValidationMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return first ? `Invalid config: ${first.message}` : "Please check the rule fields.";
  }
  return "Please check the rule fields.";
}
