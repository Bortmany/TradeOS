// Shared contact-field validation — used by BOTH the forms (client) and the API
// routes (server), so what the browser refuses the server refuses too.
//
// Deliberately shape-only: we never keep a list of allowed email providers
// (traders use their own domains), we only insist an address could actually
// exist — something before the @, a domain, and a dot-ending suffix.
//
// This module must stay free of server-only imports so client components can
// use it; the routes wrap it in zod (see src/app/api/auth/*).

/** name@domain.tld — no spaces, no @ in the parts, at least one dot in the domain. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Example values shown as greyed-out placeholders. TradeOS is international. */
export const NAME_EXAMPLE = "John Doe";
export const EMAIL_EXAMPLE = "JohnDoe@gmail.com";

/** The one plain-English email message, shown on the field in every form. */
export const EMAIL_ERROR = `Please enter a real email address, like ${EMAIL_EXAMPLE}.`;

/**
 * True when the text could be a real email address. Trims first, caps the
 * length at the 254-character limit real addresses have.
 */
export function isPossibleEmail(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 254) return false;
  return EMAIL_SHAPE.test(v);
}

/** Plain-English message shown when a trade's exit is before its entry. */
export const TRADE_TIME_ORDER_ERROR = "Exit time can't be before entry time.";

/**
 * True when a trade's exit time doesn't come before its entry time. An open
 * trade (no exit yet) always passes. Shared by the manual trade-create route
 * and the CSV import path so both reject the same impossible trade.
 */
export function isValidTradeTimeOrder(
  entryTime: Date,
  exitTime: Date | null | undefined
): boolean {
  if (exitTime == null) return true;
  return exitTime >= entryTime;
}
