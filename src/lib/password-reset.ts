// TradeOS — "forgot password" tokens.
//
// A reset link carries a random 32-byte token. Only its SHA-256 hash is stored,
// so a database leak can't be turned into working links. A token lives 1 hour
// and works once. Asking for a new link cancels the earlier unused ones.
// Finishing a reset changes the password AND signs the account out everywhere
// (the same sessionsValidAfter switch "log out everywhere" uses).

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isDemoDesk } from "@/lib/demo-desk";
import { appBaseUrl, emailLayout, escapeHtml, isEmailEnabled, sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const RESET_LINK_ERROR =
  "This reset link is invalid or has expired. Please ask for a new one.";

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Make a fresh link token for `userId`; earlier unused ones stop working. Returns the raw token (emailed, never stored). */
export async function createResetToken(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);
  return token;
}

/**
 * The account-dependent half of "forgot password": look the address up, make a
 * token and email the link. The route does NOT wait for this, so the reply takes
 * the same time whether or not the account exists. Never throws.
 */
export async function sendResetEmailIfAccount(email: string): Promise<void> {
  try {
    if (!isEmailEnabled() || isDemoDesk(email)) return;
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    const token = await createResetToken(user.id);
    const link = `${appBaseUrl()}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Reset your TradeOS password",
      html: emailLayout(
        `<h2 style="margin:0 0 12px">Reset your password</h2>` +
          `<p>Someone asked to reset the password for this TradeOS account. ` +
          `If it was you, use the button below. The link works once and expires in 1 hour.</p>` +
          `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Choose a new password</a></p>` +
          `<p style="font-size:12px;color:#666">If it wasn't you, ignore this email. Your password stays the same.</p>`
      ),
    });
  } catch (err) {
    // Never log the email or token.
    logger.error("Reset email work failed", { err: err instanceof Error ? err.message : "unknown" });
  }
}

// Background jobs started by the route; tests await them via settleResetEmails().
const pending = new Set<Promise<void>>();

/** Start the reset work without waiting for it. */
export function queueResetEmail(email: string): void {
  const job = sendResetEmailIfAccount(email).finally(() => pending.delete(job));
  pending.add(job);
}

/** Test helper: wait for all queued reset work to finish. */
export async function settleResetEmails(): Promise<void> {
  await Promise.all([...pending]);
}

class InvalidResetLink extends Error {}

/**
 * Spend a token and set the new password. Returns false (nothing changed) when
 * the link is unknown, expired or already used. The single-use claim and the
 * password change happen in ONE transaction, so two simultaneous tries can't
 * both succeed.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
  now = new Date()
): Promise<boolean> {
  const tokenHash = hashResetToken(token);
  // Hash first (slow on purpose) so every attempt costs about the same.
  const passwordHash = await hashPassword(newPassword);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  if (!row) return false;
  if (isDemoDesk(row.user.email)) return false;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InvalidResetLink();
      await tx.user.update({
        where: { id: row.userId },
        // Signs every existing session out, on every device.
        data: { passwordHash, sessionsValidAfter: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof InvalidResetLink) return false;
    throw err;
  }
}
