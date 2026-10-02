// Recorded-style ProjectX gateway responses and a faked network for the live
// tests. NOTHING here touches a real network, a funded account or a personal
// account: `installFakeGateway` replaces global fetch, records every request,
// and refuses (and logs as a violation) any host not on the firm registry, any
// method but POST and any path not on the connector's allow-list.

import { vi } from "vitest";
import { ALLOWED_HOSTS } from "@/lib/connectors/firms";
import { ALLOWED_PATHS } from "@/lib/connectors/topstepx";

export const FAKE_KEY = "FAKEKEY-do-not-leak-7f3a9c41";
export const FAKE_TOKEN = "FAKETOKEN-session-b81d52e0";

export const MES = "CON.F.US.MES.U25";
export const ES = "CON.F.US.EP.U25";
export const MCL = "CON.F.US.MCL.U25";

export interface FakePosition {
  contractId: string;
  type: 1 | 2; // 1 long, 2 short
  size: number;
  averagePrice: number;
  currentPrice?: number;
}

export interface GatewayState {
  /** broker account id -> open positions */
  positions: Record<string, FakePosition[]>;
  /** contractId -> latest 1-minute bar close (null = no bar) */
  bars: Record<string, number | null>;
  balances: Record<string, number>;
  /** broker account id -> fills the Trade/search call returns (the 30-minute fill sync). */
  fills: Record<string, Record<string, unknown>[]>;
  /** how the network behaves right now */
  mode: "ok" | "network" | "rate-limit" | "reject-login" | "server-error" | "login-401" | "data-401";
  retryAfter?: string;
  /** how many times the NEXT authenticated call answers 401 */
  expireTokenOnce?: boolean;
}

export interface RecordedCall {
  url: string;
  host: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  redirect?: string;
}

export function installFakeGateway(initial: Partial<GatewayState> = {}) {
  const state: GatewayState = {
    positions: {},
    bars: {},
    balances: {},
    fills: {},
    mode: "ok",
    ...initial,
  };
  const calls: RecordedCall[] = [];
  const violations: string[] = [];

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  const fake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url: url.href, host: url.hostname, path: url.pathname, method, body, redirect: init?.redirect });

    if (!ALLOWED_HOSTS.has(url.hostname)) violations.push(`host ${url.hostname}`);
    if (method !== "POST") violations.push(`method ${method}`);
    if (!ALLOWED_PATHS.includes(url.pathname)) violations.push(`path ${url.pathname}`);
    if (violations.length) throw new Error(`fake gateway refused: ${violations.join(", ")}`);

    if (state.mode === "network") throw new TypeError("fetch failed");
    if (state.mode === "rate-limit") {
      return json({}, 429, state.retryAfter ? { "retry-after": state.retryAfter } : {});
    }
    if (state.mode === "server-error") return json({}, 500);

    if (url.pathname === "/api/Auth/loginKey") {
      // A bare 401 on login (NOT the gateway's explicit success:false answer).
      if (state.mode === "login-401") return json({}, 401);
      if (state.mode === "reject-login") {
        return json({ token: null, success: false, errorCode: 3, errorMessage: "Invalid credentials" });
      }
      return json({ token: FAKE_TOKEN, success: true, errorCode: 0, errorMessage: null });
    }

    if (state.mode === "data-401") return json({}, 401); // login worked, every data call is refused
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (state.expireTokenOnce) {
      state.expireTokenOnce = false;
      return json({}, 401);
    }
    if (auth !== `Bearer ${FAKE_TOKEN}`) return json({}, 401);

    if (url.pathname === "/api/Account/search") {
      return json({
        accounts: Object.entries(state.balances).map(([id, balance]) => ({
          id: Number(id),
          name: `Practice ${id}`,
          balance,
          canTrade: true,
        })),
        success: true,
        errorCode: 0,
        errorMessage: null,
      });
    }
    if (url.pathname === "/api/Position/searchOpen") {
      const id = String(body.accountId);
      return json({
        positions: (state.positions[id] ?? []).map((p, i) => ({
          id: 9000 + i,
          accountId: Number(id),
          contractId: p.contractId,
          creationTimestamp: "2026-10-02T14:03:10.4+00:00",
          type: p.type,
          size: p.size,
          averagePrice: p.averagePrice,
          ...(p.currentPrice !== undefined ? { currentPrice: p.currentPrice } : {}),
        })),
        success: true,
        errorCode: 0,
        errorMessage: null,
      });
    }
    if (url.pathname === "/api/History/retrieveBars") {
      const close = state.bars[String(body.contractId)];
      return json({
        bars:
          close == null
            ? []
            : [
                {
                  t: "2026-10-02T14:21:00+00:00",
                  o: close + 0.5,
                  h: close + 1,
                  l: close - 1,
                  c: close,
                  v: 812,
                },
              ],
        success: true,
        errorCode: 0,
        errorMessage: null,
      });
    }
    if (url.pathname === "/api/Trade/search") {
      return json({ trades: state.fills[String(body.accountId)] ?? [], success: true, errorCode: 0, errorMessage: null });
    }
    return json({}, 404);
  });

  vi.stubGlobal("fetch", fake);
  const count = (path: string) => calls.filter((c) => c.path === path).length;
  return { state, calls, violations, count, restore: () => vi.unstubAllGlobals() };
}

/** One half-turn fill as the gateway's Trade/search returns it (side 0 = buy, 1 = sell). */
export function fill(
  id: number,
  contractId: string,
  side: 0 | 1,
  size: number,
  price: number,
  when: Date,
  profitAndLoss: number | null = null,
  accountId = 123
) {
  return {
    id,
    accountId,
    contractId,
    creationTimestamp: when.toISOString(),
    price,
    profitAndLoss,
    fees: 0,
    side,
    size,
    voided: false,
  };
}
