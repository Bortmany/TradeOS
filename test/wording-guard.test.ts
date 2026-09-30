// Wording guard: everywhere a visitor can read about TradeOS, it is described
// as "the trading journal that keeps you honest" — it grades trades against the
// trader's own rules and warns at 50/80/100% of a limit; the trader decides.
// It never claims to enforce anything and never claims AI.
//
// Plain file reads only (no database), so it is cheap. Internal docs under
// docs/ are deliberately not scanned — they are not visitor-facing.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ANCHOR = "the trading journal that keeps you honest";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(relDir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, relDir))) {
    const rel = join(relDir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx?|md|json|webmanifest)$/.test(name)) out.push(rel);
  }
  return out;
}

// Every visitor-facing file, with the text that counts for each.
function visitorFacingTexts(): { file: string; text: string }[] {
  const files = [
    "README.md",
    "public/manifest.webmanifest",
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/lib/billing/plans.ts",
    ...walk("src/components/marketing"),
    ...walk("src/app/(auth)"),
    ...walk("src/app/(legal)"),
  ];
  const texts = files.map((f) => ({ file: relative(ROOT, join(ROOT, f)), text: read(f) }));
  // Only the description of package.json is visitor-facing (script names are not).
  const pkg = JSON.parse(read("package.json")) as { description?: string };
  texts.push({ file: "package.json (description)", text: pkg.description ?? "" });
  return texts;
}

describe("visitor-facing wording", () => {
  it("never says 'enforce' (or enforcement / enforces)", () => {
    const hits = visitorFacingTexts()
      .filter(({ text }) => /enforc/i.test(text))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  it("never claims 'AI-assisted'", () => {
    const hits = visitorFacingTexts()
      .filter(({ text }) => /AI-assisted/i.test(text))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  it("uses the anchor line on the landing page and in the site description", () => {
    expect(read("src/components/marketing/hero.tsx").toLowerCase()).toContain(ANCHOR);
    expect(read("src/app/layout.tsx").toLowerCase()).toContain(ANCHOR);
    expect(read("public/manifest.webmanifest").toLowerCase()).toContain(ANCHOR);
  });
});
