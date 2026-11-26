import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersInstantSwitch,
  resolveChoice,
  revealClipPath,
  revealTheme,
} from "@/lib/theme-reveal";

// Minimal stand-ins for the browser globals the helper touches.
function fakeBrowser(opts: { viewTransitions: boolean; reducedMotion: boolean }) {
  const dataset: Record<string, string> = {};
  const animate = vi.fn();
  const start = vi.fn((cb: () => void) => {
    cb();
    return { ready: Promise.resolve(), finished: Promise.resolve() };
  });
  vi.stubGlobal("document", {
    documentElement: { dataset, animate },
    ...(opts.viewTransitions ? { startViewTransition: start } : {}),
  });
  vi.stubGlobal("window", {
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: (q: string) => ({ matches: q.includes("reduce") && opts.reducedMotion }),
  });
  return { dataset, animate, start };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme reveal maths", () => {
  it("grows from the origin until it reaches the farthest corner", () => {
    const [from, to] = revealClipPath({ x: 0, y: 0 }, 300, 400);
    expect(from).toBe("circle(0% at 0% 0%)");
    // From a corner the radius is the full diagonal: 500 / (500/√2) = √2.
    const pct = Number(to.match(/circle\(([\d.]+)%/)![1]);
    expect(pct).toBeCloseTo(Math.SQRT2 * 100, 6);
    expect(to.endsWith("at 0% 0%)")).toBe(true);
  });

  it("uses the farthest corner for an origin near the top right", () => {
    const [, to] = revealClipPath({ x: 1400, y: 30 }, 1440, 900);
    const radius = Math.hypot(1400, 870);
    const pct = Number(to.match(/circle\(([\d.]+)%/)![1]);
    expect(pct).toBeCloseTo((radius / (Math.hypot(1440, 900) / Math.SQRT2)) * 100, 6);
  });

  it("resolves System to the device look", () => {
    expect(resolveChoice("system", true)).toBe("dark");
    expect(resolveChoice("system", false)).toBe("light");
    expect(resolveChoice("dark", false)).toBe("dark");
    expect(resolveChoice("light", true)).toBe("light");
  });
});

describe("theme reveal fallbacks", () => {
  it("switches instantly when the browser has no view transitions", () => {
    const b = fakeBrowser({ viewTransitions: false, reducedMotion: false });
    const apply = vi.fn();
    expect(prefersInstantSwitch()).toBe(true);
    revealTheme({ x: 10, y: 10 }, apply);
    expect(apply).toHaveBeenCalledOnce();
    expect(b.animate).not.toHaveBeenCalled();
  });

  it("switches instantly when the device asks for reduced motion", () => {
    const b = fakeBrowser({ viewTransitions: true, reducedMotion: true });
    const apply = vi.fn();
    revealTheme({ x: 10, y: 10 }, apply);
    expect(apply).toHaveBeenCalledOnce();
    expect(b.start).not.toHaveBeenCalled();
  });

  it("animates the new snapshot and clears its marker when done", async () => {
    const b = fakeBrowser({ viewTransitions: true, reducedMotion: false });
    const apply = vi.fn();
    revealTheme({ x: 1400, y: 30 }, apply);
    expect(apply).toHaveBeenCalledOnce();
    expect("themeReveal" in b.dataset).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.animate).toHaveBeenCalledOnce();
    const [, options] = b.animate.mock.calls[0];
    expect(options).toMatchObject({
      duration: 500,
      easing: "ease-in-out",
      pseudoElement: "::view-transition-new(root)",
    });
    expect("themeReveal" in b.dataset).toBe(false);
  });
});
