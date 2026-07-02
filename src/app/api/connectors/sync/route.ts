import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { syncConnection } from "@/lib/connectors/sync";
import { ConnectorError } from "@/lib/connectors/topstepx";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
    const result = await syncConnection(id, user.id);
    return NextResponse.json({ ok: true, imported: result.imported, skipped: result.skipped });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }
    const message = err instanceof ConnectorError ? err.message : "Sync failed.";
    const status = err instanceof ConnectorError && err.kind === "auth" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
