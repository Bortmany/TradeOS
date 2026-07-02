import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z
  .object({
    displayName: z.string().max(80).optional().nullable(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((d) => d.displayName !== undefined || d.timezone !== undefined, {
    message: "Nothing to update.",
  });

export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
}
