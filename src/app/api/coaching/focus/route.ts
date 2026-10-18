// TradeOS — the trader's focus list. Text is always copied from a saved coach
// note on the server; nothing typed by the user is stored here.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_READ_LIMIT, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import { isDemoDesk } from "@/lib/demo-desk";
import { demoFocus } from "@/lib/ai/demo";
import { FOCUS_PATH_PATTERN, MAX_OPEN_FOCUS, focusFullBody, focusTextFromNote, type NoteKind } from "@/lib/ai/notes";
import { toFocusDTO } from "@/lib/ai/status";

const MAX_CHECKLIST_ITEMS = 20;
const CHECKLIST_TEXT_MAX = 140;

const listSchema = z.object({ status: z.enum(["open", "done", "dismissed", "all"]).default("open") });
const createSchema = z.object({
  noteId: z.string().min(1).max(64),
  path: z.string().max(32).regex(FOCUS_PATH_PATTERN),
  addToChecklist: z.boolean().optional(),
});

export const GET = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("coaching:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    const { status } = listSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (isDemoDesk(user.email)) {
      return NextResponse.json({
        ok: true,
        items: demoFocus().filter((f) => status === "all" || f.status === status),
      });
    }
    const rows = await prisma.coachingFocus.findMany({
      where: { userId: user.id, ...(status === "all" ? {} : { status }) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const items = rows.map(toFocusDTO);
    if (status === "all") items.sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the list settings." });
  }
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("coaching:write", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;
  try {
    const d = createSchema.parse(await req.json());
    const note = await prisma.coachingNote.findFirst({ where: { id: d.noteId, userId: user.id } });
    if (!note) return NextResponse.json({ ok: false, error: "Note not found." }, { status: 404 });

    const kind = note.kind as NoteKind;
    let content: unknown = null;
    try {
      content = JSON.parse(note.content);
    } catch {
      /* falls through to the 400 below */
    }
    const text = focusTextFromNote(content, kind, d.path);
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "That part of the note can't be added to your focus list." },
        { status: 400 }
      );
    }

    // Same note + same spot, any status: hand back the existing item.
    const existing = await prisma.coachingFocus.findFirst({
      where: { userId: user.id, noteId: note.id, text },
    });
    // The path isn't stored, so the copied text identifies the spot within a note.
    if (existing) {
      const checklist = d.addToChecklist ? await addToChecklist(user.id, existing.text) : undefined;
      return NextResponse.json({ ok: true, item: toFocusDTO(existing), ...(checklist ? { checklist } : {}) });
    }

    const open = await prisma.coachingFocus.count({ where: { userId: user.id, status: "open" } });
    if (open >= MAX_OPEN_FOCUS) {
      return NextResponse.json(focusFullBody, { status: 409 });
    }

    const row = await prisma.coachingFocus.create({
      data: { userId: user.id, noteId: note.id, noteKind: kind, text },
    });
    const checklist = d.addToChecklist ? await addToChecklist(user.id, text) : undefined;
    return NextResponse.json(
      { ok: true, item: toFocusDTO(row), ...(checklist ? { checklist } : {}) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the focus item." });
  }
});

type ChecklistResult = { added: true } | { added: false; reason: "full" | "no_template" };

async function addToChecklist(userId: string, text: string): Promise<ChecklistResult> {
  const template = await prisma.checklistTemplate.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { items: { select: { order: true } } },
  });
  if (!template) return { added: false, reason: "no_template" };
  if (template.items.length >= MAX_CHECKLIST_ITEMS) return { added: false, reason: "full" };
  const next = template.items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
  await prisma.checklistItem.create({
    data: { templateId: template.id, text: text.slice(0, CHECKLIST_TEXT_MAX), order: next },
  });
  return { added: true };
}
