import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { PROP_PRESETS } from "@/lib/prop";
import { PROP_FIRMS, DRAWDOWN_TYPES, type Plan } from "@/lib/types";
import { hasFeature } from "@/lib/billing/plans";
import { apiErrorResponse } from "@/lib/api-error";

// Two ways to create a PropAccount:
//  1. { accountId, preset } — hydrate rule params from a built-in preset.
//  2. { accountId, firm, presetName, accountSize, ... } — explicit custom config.
const presetSchema = z.object({
  accountId: z.string().min(1),
  preset: z.enum(["topstep50k", "apex100k", "tpt50k"]),
});

const customSchema = z.object({
  accountId: z.string().min(1),
  firm: z.enum(PROP_FIRMS),
  presetName: z.string().min(1),
  accountSize: z.coerce.number().positive(),
  profitTarget: z.coerce.number().positive().optional().nullable(),
  maxDailyLoss: z.coerce.number().positive().optional().nullable(),
  maxDrawdown: z.coerce.number().positive().optional().nullable(),
  drawdownType: z.enum(DRAWDOWN_TYPES).default("trailing"),
  minTradingDays: z.coerce.number().int().positive().optional().nullable(),
  consistencyPct: z.coerce.number().positive().max(1).optional().nullable(),
  phase: z.string().optional(),
});

export const POST = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("prop:write", user.id);
  if (limited) return limited;

  // Server-side feature gate: the prop-firm tracker is an Elite feature. The UI
  // hides it on lower plans, but the API must enforce it too — the button being
  // hidden is not a security control.
  if (!hasFeature(user.plan as Plan, user.billingStatus, "propFirmModule")) {
    return NextResponse.json(
      {
        ok: false,
        error: "The prop-firm tracker is available on the Elite plan. Upgrade to use it.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // Resolve the PropAccount payload from either a preset or an explicit config.
    let data: {
      firm: string;
      presetName: string;
      accountSize: number;
      profitTarget: number | null;
      maxDailyLoss: number | null;
      maxDrawdown: number | null;
      drawdownType: string;
      minTradingDays: number | null;
      consistencyPct: number | null;
      phase: string;
    };
    let accountId: string;

    if (typeof body?.preset === "string") {
      const d = presetSchema.parse(body);
      accountId = d.accountId;
      const preset = PROP_PRESETS[d.preset];
      data = {
        firm: preset.firm,
        presetName: preset.presetName,
        accountSize: preset.accountSize,
        profitTarget: preset.profitTarget ?? null,
        maxDailyLoss: preset.maxDailyLoss ?? null,
        maxDrawdown: preset.maxDrawdown ?? null,
        drawdownType: preset.drawdownType,
        minTradingDays: preset.minTradingDays ?? null,
        consistencyPct: preset.consistencyPct ?? null,
        phase: preset.phase,
      };
    } else {
      const d = customSchema.parse(body);
      accountId = d.accountId;
      data = {
        firm: d.firm,
        presetName: d.presetName,
        accountSize: d.accountSize,
        profitTarget: d.profitTarget ?? null,
        maxDailyLoss: d.maxDailyLoss ?? null,
        maxDrawdown: d.maxDrawdown ?? null,
        drawdownType: d.drawdownType,
        minTradingDays: d.minTradingDays ?? null,
        consistencyPct: d.consistencyPct ?? null,
        phase: d.phase ?? "evaluation",
      };
    }

    // Owner check: the trading account must belong to this user.
    const account = await prisma.tradingAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });
    if (!account) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }

    // One PropAccount per TradingAccount (unique constraint on accountId).
    const existing = await prisma.propAccount.findUnique({ where: { accountId } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "This account already has a prop tracker." },
        { status: 409 }
      );
    }

    const created = await prisma.propAccount.create({
      data: {
        userId: user.id,
        accountId,
        firm: data.firm,
        presetName: data.presetName,
        accountSize: data.accountSize,
        profitTarget: data.profitTarget,
        maxDailyLoss: data.maxDailyLoss,
        maxDrawdown: data.maxDrawdown,
        drawdownType: data.drawdownType,
        minTradingDays: data.minTradingDays,
        consistencyPct: data.consistencyPct,
        phase: data.phase,
      },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the prop account fields." });
  }
});
