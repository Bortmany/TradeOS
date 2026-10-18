import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { isAllowedTimeZone, TIME_ZONE_ERROR } from "@/lib/utils";
import { refuseDemo } from "@/lib/demo-guard";
import { FOCUS_AREAS, TONES } from "@/lib/ai/types";

const schema = z
  .object({
    displayName: z.string().max(80).optional().nullable(),
    // Display zone only (grading stays on New York time). Must be a real zone:
    // one from the app's label table or a zone name this runtime's Intl lists.
    timezone: z.string().refine(isAllowedTimeZone, { message: TIME_ZONE_ERROR }).optional(),
    // Email copy of each new risk alert (Settings, "Email warnings").
    emailAlerts: z.boolean().optional(),
    // AI coach preferences (Settings, "AI coach"). Fixed labels only, never free text.
    coachingEnabled: z.boolean().optional(),
    coachingTone: z.enum(TONES).optional(),
    coachingFocusAreas: z.array(z.enum(FOCUS_AREAS)).max(5).optional(),
    coachingWeekly: z.boolean().optional(),
    coachingWeeklyEmail: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Nothing to update.",
  });

export const PATCH = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("profile:write", user.id);
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      // A bad zone gets its own plain message (the form shows it under the
      // picker); anything else keeps the generic validation hint.
      const badZone = parsed.error.issues.some((i) => i.path[0] === "timezone");
      if (badZone) {
        return NextResponse.json(
          { ok: false, error: TIME_ZONE_ERROR, field: "timezone" },
          { status: 400 }
        );
      }
      throw parsed.error;
    }
    const d = parsed.data;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(d.displayName !== undefined ? { displayName: d.displayName || null } : {}),
        ...(d.timezone !== undefined ? { timezone: d.timezone } : {}),
        ...(d.emailAlerts !== undefined ? { emailAlerts: d.emailAlerts } : {}),
        ...(d.coachingEnabled !== undefined ? { coachingEnabled: d.coachingEnabled } : {}),
        ...(d.coachingTone !== undefined ? { coachingTone: d.coachingTone } : {}),
        ...(d.coachingFocusAreas !== undefined
          ? {
              coachingFocusAreas: d.coachingFocusAreas.length
                ? JSON.stringify(FOCUS_AREAS.filter((a) => d.coachingFocusAreas!.includes(a)))
                : null,
            }
          : {}),
        ...(d.coachingWeekly !== undefined ? { coachingWeekly: d.coachingWeekly } : {}),
        ...(d.coachingWeeklyEmail !== undefined ? { coachingWeeklyEmail: d.coachingWeeklyEmail } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Route through the shared helper so a raw Prisma/unknown message can never
    // reach the client (and a bad-JSON body returns a clean 400).
    return apiErrorResponse(err, { validationMessage: "Please check your profile fields." });
  }
});
