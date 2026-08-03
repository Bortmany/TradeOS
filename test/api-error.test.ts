// The centralized API error responder (src/lib/api-error.ts) is the single
// guard that stops raw Prisma/unknown errors — which can quote internal ids and
// the failing payload — from reaching the client. These tests pin its mapping
// and, most importantly, that it NEVER echoes the raw error message.

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { apiErrorResponse } from "@/lib/api-error";
import { z } from "zod";

async function body(res: Response): Promise<{ ok: boolean; error: string }> {
  return (await res.json()) as { ok: boolean; error: string };
}

describe("apiErrorResponse", () => {
  it("validation (zod) → 400 with the provided hint", async () => {
    const err = new z.ZodError([]);
    const res = apiErrorResponse(err, { validationMessage: "Check the trade fields." });
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Check the trade fields.");
  });

  it("Prisma validation error (e.g. Infinity price) → 400 and never leaks the raw text", async () => {
    const secret = "userId=cluser123 payload={entryPrice: Infinity}";
    const err = new Prisma.PrismaClientValidationError(secret, { clientVersion: "5.0.0" });
    const res = apiErrorResponse(err, { validationMessage: "Please check the trade fields." });
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.error).toBe("Please check the trade fields.");
    expect(b.error).not.toContain("Infinity");
    expect(b.error).not.toContain("userId");
  });

  it("record-not-found race (P2025) → clean 404", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record to delete does not exist.", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    const res = apiErrorResponse(err);
    expect(res.status).toBe(404);
    expect((await body(res)).error).not.toContain("does not exist");
  });

  it("unique constraint (P2002) → 409", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.0.0",
    });
    expect(apiErrorResponse(err).status).toBe(409);
  });

  it("foreign-key constraint (P2003) → 400", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("FK failed on accountId", {
      code: "P2003",
      clientVersion: "5.0.0",
    });
    expect(apiErrorResponse(err).status).toBe(400);
  });

  it("malformed/empty JSON body (SyntaxError) → clean 400, not a 500", async () => {
    // This is what `await req.json()` throws on a bad or empty body.
    const err = new SyntaxError("Unexpected end of JSON input");
    const res = apiErrorResponse(err);
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.error).toBe("The request body was not valid JSON.");
  });

  it("an unexpected error → generic 500, raw message hidden", async () => {
    const res = apiErrorResponse(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error).toBe("Something went wrong. Please try again.");
    expect(b.error).not.toContain("ECONNREFUSED");
  });
});
