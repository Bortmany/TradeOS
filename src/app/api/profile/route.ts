import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";

const schema = z
  .object({
    displayName: z.string().max(80).optional().nullable(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((d) => d.displayName !== undefined || d.timezone !== undefined, {
    message: "Nothing to update.",
  });

export const PATCH = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("profile:write", user.id);
  if (limited) return limited;

  try {
    const d = schema.parse(await req.json());

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(d.displayName !== undefined ? { displayName: d.displayName || null } : {}),
        ...(d.timezone !== undefined ? { timezone: d.timezone } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? "Please check your profile fields." : err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
