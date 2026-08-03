// TradeOS — one place that turns a thrown error into a safe API response.
//
// Why this exists: several route handlers used to fall back to `err.message`
// in their catch block. For a validation slip (e.g. an Infinity price) Prisma
// throws an error whose message includes internal ids and the failing payload —
// echoing that straight back leaks data the caller should never see. Every
// object route now funnels its catch through here, so the client only ever gets
// a short, plain-English message and the raw error stays on the server.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

interface ApiErrorOptions {
  // Plain-English hint to show when the input failed validation. Defaults to a
  // generic "check your details" so a route can stay terse.
  validationMessage?: string;
}

// Map any thrown value to the repo's standard `{ ok, error }` response shape
// with a sensible status code, never leaking the raw error text.
export function apiErrorResponse(
  err: unknown,
  opts: ApiErrorOptions = {}
): NextResponse {
  const validationMessage =
    opts.validationMessage ?? "Please check the details you entered.";

  // Input validation — safe to surface a plain-English hint.
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: validationMessage },
      { status: 400 }
    );
  }

  // A Prisma *validation* error means the data we tried to write was malformed
  // (a non-finite number, a bad type). Its message can quote the payload, so we
  // replace it with the generic validation hint.
  if (err instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      { ok: false, error: validationMessage },
      { status: 400 }
    );
  }

  // Known Prisma request errors carry a stable code — translate the few that
  // map to a clean client outcome, and never expose the raw message.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025": // the row to update/delete was already gone (e.g. a race)
        return NextResponse.json(
          { ok: false, error: "That item could not be found." },
          { status: 404 }
        );
      case "P2002": // unique constraint — the item already exists
        return NextResponse.json(
          { ok: false, error: "That item already exists." },
          { status: 409 }
        );
      case "P2003": // foreign-key constraint — a referenced item is missing
        return NextResponse.json(
          { ok: false, error: validationMessage },
          { status: 400 }
        );
      default:
        return NextResponse.json(
          { ok: false, error: "Something went wrong. Please try again." },
          { status: 400 }
        );
    }
  }

  // Anything else is unexpected — log it for the server operator, return a
  // generic message. We deliberately do NOT echo err.message to the client.
  console.error("Unhandled API error:", err);
  return NextResponse.json(
    { ok: false, error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}
