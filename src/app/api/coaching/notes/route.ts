// TradeOS — make a coaching note (POST, button press only) and list saved ones (GET).

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_EXTERNAL_LIMIT, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import { isDemoDesk } from "@/lib/demo-desk";
import { generateCoachingNote } from "@/lib/ai/service";
import { demoNotes } from "@/lib/ai/demo";
import { toNoteDTO } from "@/lib/ai/notes";
import { NOTE_KINDS } from "@/lib/ai/types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const createSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  tradeId: z.string().min(1).max(64).optional(),
  date: z.string().regex(DAY).optional(),
  weekStart: z.string().regex(DAY).optional(),
});

const listSchema = z.object({
  kind: z.enum(NOTE_KINDS).optional(),
  subject: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().min(1).max(64).optional(),
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("coaching:generate", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;
  try {
    const d = createSchema.parse(await req.json());
    const out = await generateCoachingNote(user, d);
    if (!out.ok) {
      return NextResponse.json(
        { ok: false, code: out.code, error: out.error },
        { status: out.status, headers: out.status === 429 ? { "Retry-After": "3600" } : undefined }
      );
    }
    return NextResponse.json({ ok: true, note: out.note, cached: out.cached, usage: out.usage });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the note you asked for." });
  }
});

export const GET = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("coaching:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    const q = listSchema.parse(Object.fromEntries(new URL(req.url).searchParams));

    if (isDemoDesk(user.email)) {
      const notes = demoNotes().filter((n) => (!q.kind || n.kind === q.kind) && (!q.subject || n.subjectKey === q.subject));
      return NextResponse.json({ ok: true, notes: notes.slice(0, q.limit), nextCursor: null });
    }

    let cursor: { createdAt: Date; id: string } | null = null;
    if (q.before) {
      const c = await prisma.coachingNote.findFirst({
        where: { id: q.before, userId: user.id },
        select: { id: true, createdAt: true },
      });
      if (!c) return NextResponse.json({ ok: false, error: "That page marker wasn't found." }, { status: 400 });
      cursor = c;
    }
    const rows = await prisma.coachingNote.findMany({
      where: {
        userId: user.id,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.subject ? { subjectKey: q.subject } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    return NextResponse.json({
      ok: true,
      notes: page.map(toNoteDTO),
      nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
    });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the list settings." });
  }
});
