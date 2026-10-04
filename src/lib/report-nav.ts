// TradeOS — the small decisions behind Reports navigation (arrows, tabs, date
// picker). Pure and client-safe so they are unit-tested without a browser.
//
// Why this exists. Root cause of the "frozen arrows" bug (reproduced in a
// production build with a headless browser): a loading.tsx file above the page
// (app/(app)/loading.tsx and reports/loading.tsx) plus a report big enough that
// Next streams it in several pieces made the move between two report windows
// never finish. The server answered 200 and the browser read every byte, but
// Next never swapped the page, so the skeleton and the disabled arrows stayed
// for ever. Fixes: Reports (and the app shell) no longer sit under a loading
// file, and the navigator no longer relies on useTransition: it keeps its own
// "where did I leave from" marker, judges "still loading" by the address bar
// alone, and falls back to a plain page load if the address has not changed
// after NAV_STUCK_MS, so the arrows can never stay locked.

/** How long a client navigation may take before we load the address the plain way. */
export const NAV_STUCK_MS = 8_000;

/** The address bar as one string: "/reports?period=day&date=…". */
export function currentHref(pathname: string, search: string): string {
  const s = search.startsWith("?") ? search.slice(1) : search;
  return s ? `${pathname}?${s}` : pathname;
}

export interface NavTarget {
  /** Where we are going. */
  href: string;
  /** The address we left from. */
  from: string;
}

/** Loading = a move was started and the address bar still shows where we left. */
export function isNavPending(target: NavTarget | null, current: string): boolean {
  return target !== null && target.from === current;
}

/** Should a click start a move? Not while one is running, not to the page we are on. */
export function canStartNav(target: NavTarget | null, current: string, href: string): boolean {
  if (isNavPending(target, current)) return false;
  return href !== current;
}

/**
 * Plain /reports (no ?date=) should settle on an address that names its day, by
 * replacing the bare address (no extra Back-button step). A given-but-odd date
 * is left alone: the page snaps it to today as before.
 */
export function needsDateRedirect(date: string | undefined): boolean {
  return date === undefined || date === "";
}
