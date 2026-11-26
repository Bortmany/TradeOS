/**
 * "Colour spreads from the button" theme switch.
 *
 * Uses the browser's View Transitions API: the page is snapshotted, the theme
 * is flipped synchronously by `apply()`, and the NEW look is revealed inside a
 * circle that grows from `origin` until it covers the farthest corner
 * (500 ms, ease-in-out; the old look does not fade). Browsers without
 * `document.startViewTransition`, and devices asking for reduced motion, get
 * an instant switch instead.
 *
 * Pair with the `[data-theme-reveal]` rules in `src/app/globals.css`.
 */

export type Point = { x: number; y: number };

export const REVEAL_DURATION_MS = 500;

/** Centre of an element on screen — the circle's starting point. */
export function centreOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * The start/end `clip-path` values for a circle growing from `origin` until it
 * covers a `width` x `height` viewport. CSS `circle(<percent>)` is measured
 * against sqrt((w² + h²) / 2), so the radius is converted to that scale.
 */
export function revealClipPath(origin: Point, width: number, height: number) {
  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const at = `at ${(x / width) * 100}% ${(y / height) * 100}%`;
  const pct = (radius / (Math.hypot(width, height) / Math.SQRT2)) * 100;
  return [`circle(0% ${at})`, `circle(${pct}% ${at})`] as const;
}

/** Which look ("light" | "dark") a theme choice resolves to right now. */
export function resolveChoice(choice: string, systemIsDark: boolean): "light" | "dark" {
  if (choice === "system") return systemIsDark ? "dark" : "light";
  return choice === "dark" ? "dark" : "light";
}

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void> };
type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

/** True when the switch should be instant (no API, or reduced motion). */
export function prefersInstantSwitch(): boolean {
  const doc = document as DocWithVT;
  return (
    typeof doc.startViewTransition !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

let current: ViewTransitionLike | null = null;

/**
 * Run `apply` (which must change the DOM synchronously) and reveal the result
 * with a circle growing from `origin`. Falls back to a plain `apply()` call.
 */
export function revealTheme(origin: Point, apply: () => void): void {
  if (prefersInstantSwitch()) {
    apply();
    return;
  }
  const root = document.documentElement;
  const [from, to] = revealClipPath(origin, window.innerWidth, window.innerHeight);

  root.dataset.themeReveal = "";
  const t = (document as DocWithVT).startViewTransition!(apply);
  current = t;
  const done = () => {
    if (current === t) delete root.dataset.themeReveal;
  };
  t.finished.then(done, done);
  t.ready.then(
    () => {
      root.animate(
        { clipPath: [from, to] },
        {
          duration: REVEAL_DURATION_MS,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    },
    () => {},
  );
}
