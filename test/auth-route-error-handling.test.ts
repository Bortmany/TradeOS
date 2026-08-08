// Pentest finding: /api/auth/login (and /api/demo-data) used to echo the raw
// V8 JSON.parse error message ("Unexpected token ... in JSON") on a malformed
// request body, because they didn't route through the shared apiErrorResponse
// helper. Both now do (demo-data's fix is exercised by api-error.test.ts,
// which already pins apiErrorResponse's SyntaxError handling); this test hits
// the actual login route to prove the wiring.

import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/login/route";

function malformedRequest(): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not valid json",
  });
}

describe("POST /api/auth/login — malformed JSON body", () => {
  it("returns a clean generic 400, never the raw V8 parse error", async () => {
    const res = await POST(malformedRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("The request body was not valid JSON.");
    expect(body.error).not.toMatch(/unexpected|token|position|json\.parse/i);
  });
});
