// TradeOS — the fixed list of push-service hosts.
//
// A push endpoint is typed by the browser, so it is untrusted: the server will
// only ever POST to https addresses on these hosts, never an arbitrary URL.
//   Chrome / Android (Google FCM) ......... fcm.googleapis.com
//   Firefox (Mozilla autopush) ............ *.push.services.mozilla.com
//   Safari / iPhone (Apple web push) ...... web.push.apple.com
//   Edge / Windows (WNS) .................. *.notify.windows.com
// A wildcard means "a subdomain of": the dot is part of the match, so
// "evilnotify.windows.com" is refused.

const EXACT_HOSTS = new Set(["fcm.googleapis.com", "web.push.apple.com"]);
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (EXACT_HOSTS.has(host)) return true;
  return SUFFIX_HOSTS.some((s) => host.endsWith(s) && host.length > s.length);
}
