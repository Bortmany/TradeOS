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
(TopstepX below. The MT5 link through MetaApi has its own section at the end.)

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

## MetaTrader 5: a file import, and a live link that ships SWITCHED OFF

**The file import** always works. A trader saves the MT5 "Positions" history table as
a comma CSV and uploads it on the Import page; `src/lib/ingestion/adapters/mt5.ts`
reads the file. No login, no outbound call. See `docs/CONTRACTS.md` (Package C).

**The live link** (`src/lib/connectors/metaapi.ts`) reads an MT5 account through
MetaApi, a cloud bridge. It is built and tested against recorded fixtures and stays
OFF until the owner signs up with MetaApi (`GO-LIVE.md`). The switch is two settings:
`METAAPI_ENABLED=true` and a `METAAPI_TOKEN`. While off: `POST /api/connectors/mt5`
answers 503, the poller and sweeps load no MT5 row, no MetaApi host is in the host list
and the Import page shows no MT5 card.

- **Not a firm in `FIRMS`.** MT5 never appears in the TopstepX dropdown or that route
  (`firm` accepts only `FIRM_IDS`). It is `MT5_FIRM` (id `mt5`, two hosts) in
  `firms.ts`, part of `activeFirms()`, `allowedHosts()` and `isAllowedBaseUrl()` only
  while the switch is on. `ALLOWED_HOSTS` itself never holds a MetaApi host.
- **Hosts.** `mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai` (create / delete the
  bridge account) and `mt-client-api-v1.new-york.agiliumtrade.ai` (reads; accounts are
  created in the New York region). Redirects are refused; every call checks the host
  first. One exception: deleting a bridge account is also allowed with the token present
  but the flag off, so a switched-off server can still remove a trader's password.
- **Paths (`ALLOWED_ROUTES`, an allow-list keyed by name).** Reads: `account-information`,
  `positions`, `history-deals/time/:from/:to`. Writes, permitted by name and with no effect
  at the broker: create the bridge account (`POST /users/current/accounts`) and delete it.
  MetaApi's trade-placing address, order history and symbol routes are not in the code
  (`test/metaapi.test.ts` proves it).
- **Investor password only.** After creating the bridge account the app reads
  `investorMode` (MetaApi: "investor password was used", cloud-g2 accounts only) and
  `tradeAllowed`. Anything other than `investorMode === true` with trading not allowed is
  refused (a missing flag counts as not read-only), the account is deleted at once
  (3 tries; the id is logged if it still fails) and the trader is told why. The check is
  repeated on every live read; a link whose login can trade is marked rejected.
- **Stored:** the MetaApi account id, the server name and the login number. The investor
  password is NOT stored: it goes in the create call and MetaApi holds it. The MetaApi
  token is an environment setting only. The `apiKeyEnc` column (required) holds an
  encrypted marker, never a credential.
- **Who:** Pro or Elite with an active subscription (a trial or the free plan is refused),
  at most 2 MT5 links per trader, one connect at a time per trader, 5 tries per 15
  minutes. A trader who later drops to a free plan is no longer read.
- **Budget and lease.** Every MetaApi call asks the shared call budget first (about 100 a
  minute, 429 starts the shared back-off, `Retry-After` honoured). A live read is two
  calls (account information, positions), a fill sync is one call per 1,000 deals. The
  poller and sweep run under the same leases as TopstepX. MetaApi's own limits (1,000
  credits a second, about 50 credits a read) are far above this.
- **Fills.** Closed deals become trades (`mapDealsToTrades`): one trade per fully closed
  position, id `mt5:<positionId>` (the same ids as the file import, so the two never
  double up), P&L from the bridge's profit figure (USD accounts only) with forex/CFD
  maths from `src/lib/instruments` as the fallback. See `docs/CONTRACTS.md` (Package J).
- **Removing it.** Disconnecting, and deleting a trader's whole account, delete the
  MetaApi account first; if MetaApi does not confirm, the link (or the deletion) is kept
  and the trader is asked to retry.
