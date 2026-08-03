import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { BROKERS, ACCOUNT_KINDS, type Plan } from "@/lib/types";
import { withinLimit } from "@/lib/billing/plans";
import { apiErrorResponse } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  broker: z.enum(BROKERS).default("manual"),
  kind: z.enum(ACCOUNT_KINDS).default("live"),
  // A starting balance can't be negative or non-finite (guards against an
  // Infinity value blowing up equity-curve math downstream).
  startingBalance: z.coerce.number().finite().min(0).default(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5b8def"),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  isActive: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().min(1) });

async function auth() {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceUserRateLimit("accounts:write", user.id);
  if (limited) return limited;

  try {
    const d = createSchema.parse(await req.json());

    const currentCount = await prisma.tradingAccount.count({ where: { userId: user.id } });
    if (!withinLimit(user.plan as Plan, user.billingStatus, "maxAccounts", currentCount)) {
      return NextResponse.json(
        {
          ok: false,
          error: "You've reached your plan's account limit. Upgrade to add more accounts.",
        },
        { status: 403 }
      );
    }

    const account = await prisma.tradingAccount.create({
      data: {
        userId: user.id,
        name: d.name,
        broker: d.broker,
        kind: d.kind,
        startingBalance: d.startingBalance,
        color: d.color,
      },
    });

    return NextResponse.json({ ok: true, id: account.id });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the account fields." });
  }
}

export async function PATCH(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceUserRateLimit("accounts:write", user.id);
  if (limited) return limited;

  try {
    const { id, ...updates } = patchSchema.parse(await req.json());

    const existing = await prisma.tradingAccount.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });

    await prisma.tradingAccount.update({ where: { id }, data: updates });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Invalid request." });
  }
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceUserRateLimit("accounts:write", user.id);
  if (limited) return limited;

  try {
    const { id } = deleteSchema.parse(await req.json());

    const existing = await prisma.tradingAccount.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });

    await prisma.tradingAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Invalid request." });
  }
}
