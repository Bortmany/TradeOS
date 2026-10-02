// TradeOS — the fixed plain-English reasons stored on a connection when a live
// read fails. Fixed strings only: the broker's own text is never stored or shown,
// so nothing sensitive can reach a page or a log through them.

export const REJECTED_MESSAGE = "TopstepX rejected this key. Reconnect to resume.";
export const UNREACHABLE_MESSAGE = "Can't reach TopstepX.";
export const REFUSED_MESSAGE = "TopstepX refused that request.";
export const NOT_ALLOWED_MESSAGE =
  "This broker address is no longer allowed; reconnect this account.";
export const DECRYPT_MESSAGE = "Stored credentials could not be read. Reconnect this account.";
