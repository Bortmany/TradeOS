// TradeOS — emails a user a copy of a newly created risk alert.
// Fire-and-forget: never throws, so alert creation can never fail because of it.

import "server-only";
import { prisma } from "@/lib/db";
import { appBaseUrl, emailLayout, escapeHtml, isEmailEnabled, sendEmail } from "./index";

export async function emailNewAlert(
  userId: string,
  alert: { title: string; message: string }
): Promise<void> {
  try {
    if (!isEmailEnabled()) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailAlerts: true },
    });
    if (!user || !user.emailAlerts) return;
    const link = `${appBaseUrl()}/dashboard`;
    await sendEmail({
      to: user.email,
      subject: `TradeOS warning: ${alert.title}`.slice(0, 150),
      html: emailLayout(
        `<h2 style="margin:0 0 12px">${escapeHtml(alert.title)}</h2>` +
          `<p>${escapeHtml(alert.message)}</p>` +
          `<p><a href="${escapeHtml(link)}">Open TradeOS</a></p>` +
          `<p style="font-size:12px;color:#666">You can turn these emails off in Settings.</p>`
      ),
    });
  } catch {
    // swallowed on purpose
  }
}
