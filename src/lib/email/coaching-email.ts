// TradeOS — emails a trader their weekly coaching review.
// Never throws and never logs the body. True only when Resend accepted it.

import "server-only";
import { prisma } from "@/lib/db";
import type { NoteDTO } from "@/lib/ai/notes";
import { appBaseUrl, emailLayout, escapeHtml, isEmailEnabled, sendEmail } from "./index";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function list(items: string[]): string {
  return `<ul style="margin:0 0 16px;padding-left:20px">${items
    .map((i) => `<li style="margin-bottom:4px">${escapeHtml(i)}</li>`)
    .join("")}</ul>`;
}

export async function sendCoachingWeeklyEmail(userId: string, note: NoteDTO): Promise<boolean> {
  try {
    if (!isEmailEnabled()) return false;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, coachingWeeklyEmail: true },
    });
    if (!user || !user.coachingWeeklyEmail) return false;

    const c = note.content as Record<string, unknown>;
    const weekStart = typeof c.weekStart === "string" ? c.weekStart : note.subjectKey;
    const end = new Date(`${weekStart}T12:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const range =
      dayLabel(weekStart) && `${dayLabel(weekStart)} to ${dayLabel(end.toISOString().slice(0, 10))}`;

    const wins = strings(c.wins);
    const mistakes = strings(c.mistakes);
    const verdict = typeof c.previousFocusVerdict === "string" ? c.previousFocusVerdict : "";
    const summary = typeof c.summary === "string" ? c.summary : "";
    const focus = typeof c.focusNextWeek === "string" ? c.focusNextWeek : "";
    const link = `${appBaseUrl()}/coach`;
    const h3 = (t: string) => `<h3 style="margin:16px 0 8px;font-size:15px">${t}</h3>`;

    const html = emailLayout(
      `<p style="margin:0 0 8px;font-size:12px;color:#666">How you followed your rules this week, and one thing to work on.</p>` +
        `<h2 style="margin:0 0 4px">Your week in review</h2>` +
        (range ? `<p style="margin:0 0 16px;font-size:13px;color:#666">${escapeHtml(range)}</p>` : "") +
        `<p>${escapeHtml(summary)}</p>` +
        (verdict ? h3("Last week's focus") + `<p style="margin:0 0 16px">${escapeHtml(verdict)}</p>` : "") +
        (wins.length ? h3("What worked") + list(wins) : "") +
        (mistakes.length ? h3("What cost you") + list(mistakes) : "") +
        h3("Focus next week") +
        `<p style="margin:0 0 20px"><strong>${escapeHtml(focus)}</strong></p>` +
        `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Open your Coach page</a></p>` +
        `<p style="font-size:12px;color:#666">You can turn this email off in Settings → AI coach.</p>`
    );
    return await sendEmail({ to: user.email, subject: "Your weekly coaching review", html });
  } catch {
    return false;
  }
}
