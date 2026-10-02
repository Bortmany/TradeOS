// POST /api/push/unsubscribe — turn phone warnings off for THIS device.
//
// Session-checked, demo desk refused, USER_WRITE_LIMIT, zod on the body. Only
// ever deletes the signed-in person's own row for that address; naming someone
// else's (or an unknown) address quietly does nothing. Works even when the owner
// has since removed the VAPID keys, so a trader can always switch off.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { refuseDemo } from "@/lib/demo-guard";
import { apiErrorResponse } from "@/lib/api-error";
import { deviceSchema } from "@/lib/push/validation";

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("push:unsubscribe", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;

  try {
    const { endpoint } = deviceSchema.parse(await req.json());
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "That device is not valid." });
  }
});
