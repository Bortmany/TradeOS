// Contact-field validation — ported verbatim from scripts/test-contact-validation.ts
// (round-2 checks) into the vitest suite so they keep running under `npm test`.

import { describe, it, expect } from "vitest";
import { isPossibleEmail } from "@/lib/validation";

describe("email shape — accepted", () => {
  it("plain address", () => expect(isPossibleEmail("JohnDoe@gmail.com")).toBe(true));
  it("own domain + subdomain", () =>
    expect(isPossibleEmail("john.doe+desk@mail.tradeos.app")).toBe(true));
  it("surrounding spaces are trimmed", () =>
    expect(isPossibleEmail("  john@example.com  ")).toBe(true));
});

describe("email shape — rejected", () => {
  it("no domain at all", () => expect(isPossibleEmail("johndoe")).toBe(false));
  it("missing dot-ending TLD", () => expect(isPossibleEmail("john@localhost")).toBe(false));
  it("nothing before the @", () => expect(isPossibleEmail("@gmail.com")).toBe(false));
  it("a space inside", () => expect(isPossibleEmail("john doe@gmail.com")).toBe(false));
  it("empty", () => expect(isPossibleEmail("   ")).toBe(false));
  it("absurdly long", () => expect(isPossibleEmail(`${"a".repeat(250)}@gmail.com`)).toBe(false));
});
