import { NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  displayName: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, displayName } = schema.parse(body);
    await registerUser(email.toLowerCase().trim(), password, displayName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.errors[0]?.message ?? "Invalid input."
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
