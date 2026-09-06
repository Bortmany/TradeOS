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
4. Run `npm test`: `test/connector-firms.test.ts` checks every entry is https
   and on the allow-list.
