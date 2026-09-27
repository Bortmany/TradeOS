// Legal-page contact address: the default and the PRIVACY_CONTACT_EMAIL override
// in src/lib/legal-contact.ts.

import { describe, it, expect } from "vitest";

import { DEFAULT_LEGAL_CONTACT_EMAIL, legalContactEmail } from "@/lib/legal-contact";

describe("legalContactEmail — address shown on the legal pages", () => {
  it("falls back to the owner's address when the variable is unset or blank", () => {
    expect(legalContactEmail({})).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "" })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "   " })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(DEFAULT_LEGAL_CONTACT_EMAIL).toBe("naeljam@hotmail.com");
  });

  it("uses the configured address when one is set (trimmed)", () => {
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "legal@example.com" })).toBe("legal@example.com");
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "  legal@example.com  " })).toBe("legal@example.com");
  });

  it("ignores values that are not a plausible email address", () => {
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "not-an-email" })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "two words@example.com" })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(legalContactEmail({ PRIVACY_CONTACT_EMAIL: "@example.com" })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
  });
});
