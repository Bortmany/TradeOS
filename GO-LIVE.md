# Go-Live checklist — TradeOS

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** (`railway.json` is present and complete). The build switches the database from SQLite to Postgres automatically. Alternative Vercel path is in `docs/DEPLOYMENT.md`.

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL` (on Railway: attach a Postgres plugin and use `${{Postgres.DATABASE_URL}}`).
- [ ] **Strong `AUTH_SECRET`** (≥32 characters). This signs logins, so it must be strong — the app refuses to start in production with a weak/short one. (Without `ENCRYPTION_SECRET` below, it also encrypts users' stored broker keys.)
- [ ] **Set `ENCRYPTION_SECRET` on the FIRST deploy** (generate with `openssl rand -base64 32`). It becomes the dedicated key that encrypts users' stored broker API keys, kept separate from the login secret. **Set it before any user connects a broker — changing it later (or setting it for the first time after launch) invalidates every stored broker key**, and users would have to reconnect their broker accounts. If it is never set, the app falls back to deriving the key from `AUTH_SECRET`, exactly as before.
- [ ] **Set `NEXT_PUBLIC_APP_URL`** to the deployed web address (used for the return link after paying and for report links).
- [ ] **Set `SIGNUP_INVITE_CODES` with at least one invite code (8+ characters, comma-separated for several; `openssl rand -hex 8` makes a good one).** Sign-up is invitation-only until the paywall is live: in production it is CLOSED if this is unset, so nobody could create an account. Share codes only with the people you invite. To rotate or revoke, edit the variable on Railway and redeploy. When you are ready for anyone to sign up, set `SIGNUPS_OPEN=true`. `/api/health` shows the current state as `signups: open | invite | closed`.
- [ ] **Set `TRUST_PROXY=true` and `PROXY_HOPS=1`.** Railway sits in front of the app as one proxy, and without these the login/register rate limits cannot see each visitor's real address, so one attacker could spend everyone's allowance.

## Payments — Paddle (fully built, just needs an account and five variables)

The code is finished and asleep. **Deploy first, sell later** — that order is deliberate, because Paddle will not approve a seller account until it can see a working website with the legal pages on it.

**The real-world sequence:**

1. **Deploy with billing dormant.** Everything works: sign-up, trials, plan gating. Pressing "Upgrade" shows a friendly "checkout isn't switched on yet" notice. Nothing to configure.
2. **Apply for a Paddle account** at <https://paddle.com> using your live URL. Approval is a manual human review (typically a few working days) and they will look at the site.
3. **The pages Paddle checks are already on the site** — make sure they stay linked in the footer: `/terms`, `/privacy`, and `/refunds` (the refund & cancellation policy Paddle requires). Have your own legal review of these done before launch; each carries a "template notice" until you do.
4. **Create the products and prices** in Paddle → Catalog: a **Pro** product with a recurring **$29/month** price, and an **Elite** product with a recurring **$59/month** price. Copy each **price id** (`pri_…`, *not* the product `prd_…`).
   - *Optional, can be done later:* add a **second recurring price on the same product** for paying a year up front — **$290/year** on Pro and **$590/year** on Elite (ten months' money for twelve months' access). Copy those price ids too. Until they are set the yearly option is simply not shown.
5. **Create a notification destination** (Paddle → Developer tools → Notifications) pointed at `https://<your-domain>/api/billing/webhook`, subscribed to: `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`. Copy its **secret key**.
6. **Set the five variables** on the host and redeploy:
   - [ ] `PADDLE_ENV` — `sandbox` while testing, `production` when live. Anything unrecognised reads as sandbox, on purpose.
   - [ ] `PADDLE_API_KEY` — Paddle → Developer tools → Authentication.
   - [ ] `PADDLE_WEBHOOK_SECRET` — from step 5.
   - [ ] `PADDLE_PRICE_ID_PRO`
   - [ ] `PADDLE_PRICE_ID_ELITE`
   - [ ] `PADDLE_PRICE_ID_PRO_ANNUAL` — *optional*, the $290/year price. Leave it unset and no yearly option is offered.
   - [ ] `PADDLE_PRICE_ID_ELITE_ANNUAL` — *optional*, the $590/year price.
   - **Elite price change (Oct 2026):** Elite is now $59/month and $590/year. In Paddle, add **two new prices** on the Elite product (do not edit or delete the old $79 and $790 prices, or existing subscribers' charges change), then set `PADDLE_PRICE_ID_ELITE` and `PADDLE_PRICE_ID_ELITE_ANNUAL` to the new ids and redeploy. Existing Elite subscribers stay on their old price until you move them in Paddle; they keep the Elite plan either way.
7. **Test in the sandbox first** (a separate sandbox account at <https://sandbox-vendors.paddle.com>): run one upgrade end to end with a Paddle test card, confirm the account's plan flips to Pro, then open **Manage subscription** and cancel. Only then swap in the production values.

Notes:
- Until the variables are set, plan gating still works and checkout shows a "not switched on" notice — `/api/health` reports `"billing": "dev-mode"`, and `"configured"` once it is live.
- **Paddle is the merchant of record**: it sells to your customers, handles sales tax/VAT worldwide, and appears on their statement. That is why the terms, privacy and refund pages describe it as the reseller.
- **One thing to re-check on activation day:** hosted-checkout links require an approved live account. If a checkout press returns "checkout isn't ready yet", the account setup is unfinished at Paddle's end, not a bug here. The whole integration is one file — `src/lib/billing/paddle.ts`.

## Optional / not needed now
- Broker connection (TopstepX/ProjectX): users enter their own username + API key in-app; stored encrypted. No env var. The server only calls firms listed in `src/lib/connectors/firms.ts` (see `docs/connectors.md`).
- `AUTO_SYNC_INTERVAL_MIN` (default 30) — in-process auto-sync; no separate cron needed on Railway.
- `LIVE_POLL_INTERVAL_SEC` (default 60, never below 60) — the near-live read of open positions and balance for TopstepX connections (read-only, about 100 broker calls a minute at most). Runs on Railway/VPS/Docker only, not on Vercel.
- **MT5 live link through MetaApi, optional, SHIPS SWITCHED OFF.** Built and tested against recorded test files only; it has never talked to the real MetaApi. Until you do the steps below, no MT5 card shows on the Import page, the connect route answers "not switched on yet", nothing polls and no MetaApi address is reachable. Owner setup, in order:
  1. Sign up at metaapi.cloud and **check the price**: it is charged per connected MT5 account (the free test tier is small, the paid price could not be confirmed when this was built). Each trader allowed 2 accounts, on paid TradeOS plans only, so work out that your plan prices cover it.
  2. Create an API token in the MetaApi web app (Account, API access) and note which region your account uses; TradeOS is built for the **New York** region (`mt-client-api-v1.new-york.agiliumtrade.ai`).
  3. On Railway set `METAAPI_TOKEN` (the token, keep it secret) and `METAAPI_ENABLED=true`, then redeploy. Both are needed; either one missing keeps it off. To switch it off again, remove `METAAPI_ENABLED`.
  4. Test with a **demo** MT5 account, never a funded or personal one: connect it with its investor password (expect success), then try the main password (expect "That is a trading password…" and the account disappearing from your MetaApi dashboard). If a real investor login is wrongly refused, MetaApi's `investorMode` or `tradeAllowed` flag is not what the docs say: stop and tell the developer.
  5. Watch the MetaApi dashboard for leftover accounts the first week. If TradeOS ever cannot delete one it logs `could not remove a bridge account` with the id; remove it by hand at MetaApi. Other log lines to search for, each naming what to remove at MetaApi: `could not confirm whether a bridge account was created` (MetaApi did not answer the create call, so TradeOS does not know the account id; the log names the account, `TradeOS` plus 8 letters/digits, never a password: look for it in your MetaApi dashboard and delete it), `bridge accounts were NOT removed` (this server has no `METAAPI_TOKEN`, ids listed), `MetaApi did not confirm removal; the account was deleted anyway` (a trader deleted their profile while MetaApi was down; ids listed) and `a bridge account could not be removed` (a link that could trade). A trader whose paid plan ends has their bridge accounts removed automatically, and the 30-minute sweep retries any that failed. If you switch the feature off while traders have linked accounts, keep `METAAPI_TOKEN` set so disconnects and account deletions can still remove them from MetaApi.
  6. Privacy page already names MetaApi (as the provider that holds the investor password). Re-check its wording once the price and terms are final.
- AI coaching (`AI_COACHING_ENABLED`, `ANTHROPIC_API_KEY`) — hard-disabled in code (future phase). Nothing to do.
- `PRIVACY_CONTACT_EMAIL` — the contact address shown on the Terms, Privacy and Refunds pages. Optional: leave it unset and the pages show the owner's address (`naeljam@hotmail.com`); set it if you ever want a different mailbox.
- **Phone warnings (Web Push), optional.** Off until you set four variables on Railway: run `npx web-push generate-vapid-keys` on your Mac, then set `VAPID_PUBLIC_KEY` (public key), `VAPID_PRIVATE_KEY` (private key, keep secret), `VAPID_SUBJECT` (`mailto:` plus your email) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the public key again), then redeploy. `/api/health` shows `phoneWarnings: configured`. On iPhone it works only from the Home Screen icon (iOS 16.4+). Test it: Settings, Phone warnings, Enable alerts, Send me a test.
- No email provider is wired.

## Security note
No committed secrets; broker keys are encrypted at rest; webhook signatures are verified. Audit item **B2 is now fixed**: login, register, and the heavy demo-data/import endpoints are rate-limited (`src/lib/rate-limit.ts`). Note: the limiter is in-memory (per process) — correct for the current single-instance deploy; revisit if you scale to multiple instances.

## If you ever scale past ONE instance
Several pieces are deliberately built for the current **single-instance** Railway deploy. They all keep working on one server with zero setup, but each needs attention before running two or more instances:
- **Rate limiter** (`src/lib/rate-limit.ts`) — counts live in that one process's memory, so with N instances every limit is effectively N× looser. The file has a marked "Redis seam": swap the in-memory Map for a Redis store (switched on by `REDIS_URL`) and nothing else changes.
- **Broker auto-sync** (`src/lib/auto-sync.ts`) — runs in-process on a timer. With several instances each would run its own scheduler and sync the same connections repeatedly; move to a single scheduled job (e.g. Vercel-style cron hitting `/api/cron/sync`) instead.
- **Database connection pool** — each instance opens its own Prisma pool. One instance talking straight to Postgres is fine; several instances should go through a pooler (Railway/Supabase pgbouncer, `?pgbouncer=true&connection_limit=1` — see `.env.production.example`) so Postgres does not run out of connections. The background jobs work fine with `connection_limit=1` (their one-copy guard is a lease row, not a held connection); `/api/health` shows `liveReads` and `fillSweep` as `ok`, `failing` or `idle`, so a silently failing job is visible. Run `prisma db push` after this update: it adds the `RunnerLease` table and two columns, nothing is removed.
