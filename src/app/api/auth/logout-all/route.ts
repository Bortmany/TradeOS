import { NextResponse } from "next/server";
import { withUser, revokeAllSessions, clearSessionCookie } from "@/lib/auth";
import { refuseDemo } from "@/lib/demo-guard";
import { apiErrorResponse } from "@/lib/api-error";

// "Log out everywhere": every session token issued so far (on any device) stops
// working, and this browser's cookie is cleared too.
export const POST = withUser(async (user) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  try {
    await revokeAllSessions(user.id);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
