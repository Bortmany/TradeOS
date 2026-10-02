# Broker connectors — the firm registry

TradeOS talks to brokers and funded-trading firms only through addresses listed
in **`src/lib/connectors/firms.ts`**. Users pick a firm from a dropdown; the
server looks up that firm's gateway URL itself. Nobody can type a URL, so the
server can never be pointed at a private, loopback or link-local address.

## How it works

- `FIRMS` is the typed list. Each entry has an `id` (stored in
  `BrokerConnection.broker`), a display `name`, the `apiBase` gateway origin
  (https only) and a `kind` (`funded-firm` or `personal-broker`).
- `POST /api/connectors` takes `firm` (a registry id, defaults to `topstepx`)
  instead of a `baseUrl`. Unknown ids are rejected by zod.
- Connections created before the registry still carry a stored `baseUrl`. Every
  sync re-checks it with `isAllowedBaseUrl()`: https, hostname on the
  allow-list, no credentials or query string. Anything else fails the sync with
  "This broker address is no longer allowed; reconnect this account to continue
  syncing." and the connection shows a sync error until the user reconnects.

## Read-only, always, and what is called

Every connection is read-only. The connector may call only the paths on
`ALLOWED_PATHS` in `src/lib/connectors/topstepx.ts`: `Auth/loginKey`, `Account/search`
(balance), `Trade/search` (fills), `Position/searchOpen` (open positions) and
`History/retrieveBars` (the latest 1-minute price, only to estimate an open position's
value when the gateway sends none). The HTTP helper refuses any other path and any host
that is not in the registry. There is no function that places, changes or cancels an
order or closes a position, and `test/live-safety.test.ts` proves it. Testers use
recorded fixtures only (`test/fixtures/projectx.ts`): never a funded or personal account.

Two timers read each connection: the 30-minute fill sync (`src/lib/auto-sync.ts`) and the
near-live read of positions and balance every 60 seconds (`src/lib/live/poller.ts`, per
connection switch "Near-live updates", on by default). The 60-second floor is enforced in
code (`LIVE_POLL_INTERVAL_SEC`, anything under 60 becomes 60), the server-wide budget is
about 100 calls a minute with back-off on HTTP 429, a login is reused for a day, and each
timer has its own single-runner lock. See `docs/CONTRACTS.md` (Package J).

## Adding a firm

1. Add one entry to `FIRMS` in `src/lib/connectors/firms.ts`, for example:
   ```ts
   { id: "apex", name: "Apex Trader Funding", apiBase: "https://api.example.com", kind: "funded-firm" }
   ```
   Use a short lowercase `id` with no spaces — it is stored on every connection,
   so never rename an id once users have connected with it.
2. If the firm does not speak the ProjectX gateway API, add an adapter under
   `src/lib/connectors/` and branch on `firm.id` in `src/lib/connectors/sync.ts`
   and `src/app/api/connectors/route.ts`. Its FIFO pairing must be covered by
   `test/` (core guarantee — see `docs/CONVENTIONS.md`).
3. The dropdown in `src/components/import/broker-connect.tsx` reads `FIRMS`
   directly — no UI change needed.
4. Any new gateway path must be added to the connector's `ALLOWED_PATHS` allow-list and
   be a READ. Never add a path that places, changes or cancels an order or closes a
   position; the safety tests fail if one appears.
5. Run `npm test`: `test/connector-firms.test.ts` checks every entry is https
   and on the allow-list.

## MetaTrader 5 is a file import, not a connector

MetaTrader 5 (MT5) is not in `FIRMS` and TradeOS never connects to it. A trader
saves the MT5 "Positions" history table as a comma CSV and uploads it on the Import
page; `src/lib/ingestion/adapters/mt5.ts` reads the file. There is no login, no
outbound call, and nothing that can place, change or cancel an order. A live,
read-only MT5 connector is a later step. See `docs/CONTRACTS.md` (Package C) for
the file format and how each column maps to a trade.
