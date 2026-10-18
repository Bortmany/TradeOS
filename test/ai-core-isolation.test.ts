// The deterministic core must never depend on the optional AI layer.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("AI stays out of the scoring core", () => {
  for (const folder of ["rules", "discipline", "analytics"]) {
    it(`src/lib/${folder} never imports src/lib/ai`, () => {
      const list = files(join(process.cwd(), "src", "lib", folder));
      expect(list.length).toBeGreaterThan(0);
      for (const f of list) {
        expect(readFileSync(f, "utf8"), f).not.toMatch(/lib\/ai|from\s+["']\.\.\/ai|from\s+["']@\/lib\/ai/);
      }
    });
  }
});
