# Go-Live checklist — TradeOS

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** (`railway.json` is present and complete). The build switches the database from SQLite to Postgres automatically. Alternative Vercel path is in `docs/DEPLOYMENT.md`.

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL` (on Railway: attach a Postgres plugin and use `${{Postgres.DATABASE_URL}}`).
- [ ] **Strong `AUTH_SECRET`** (≥32 characters). This signs logins, so it must be strong — the app refuses to start in production with a weak/short one. (Without `ENCRYPTION_SECRET` below, it also encrypts users' stored broker keys.)
- [ ] **Set `ENCRYPTION_SECRET` on the FIRST deploy** (generate with `openssl rand -base64 32`). It becomes the dedicated key that encrypts users' stored broker API keys, kept separate from the login secret. **Set it before any user connects a broker — changing it later (or setting it for the first time after launch) invalidates every stored broker key**, and users would have to reconnect their broker accounts. If it is never set, the app falls back to deriving the key from `AUTH_SECRET`, exactly as before.
- [ ] **Set `NEXT_PUBLIC_APP_URL`** to the deployed web address (used for the return link after paying and for report links).

## Payments — Paddle (fully built, just needs an account and five variables)

The code is finished and asleep. **Deploy first, sell later** — that order is deliberate, because Paddle will not approve a seller account until it can see a working website with the legal pages on it.

**The real-world sequence:**

1. **Deploy with billing dormant.** Everything works: sign-up, trials, plan gating. Pressing "Upgrade" shows a friendly "checkout isn't switched on yet" notice. Nothing to configure.
2. **Apply for a Paddle account** at <https://paddle.com> using your live URL. Approval is a manual human review (typically a few working days) and they will look at the site.
3. **The pages Paddle checks are already on the site** — make sure they stay linked in the footer: `/terms`, `/privacy`, and `/refunds` (the refund & cancellation policy Paddle requires). Have your own legal review of these done before launch; each carries a "template notice" until you do.
4. **Create the products and prices** in Paddle → Catalog: a **Pro** product with a recurring **$29/month** price, and an **Elite** product with a recurring **$79/month** price. Copy each **price id** (`pri_…`, *not* the product `prd_…`).
   - *Optional, can be done later:* add a **second recurring price on the same product** for paying a year up front — **$290/year** on Pro and **$790/year** on Elite (ten months' money for twelve months' access). Copy those price ids too. Until they are set the yearly option is simply not shown.
5. **Create a notification destination** (Paddle → Developer tools → Notifications) pointed at `https://<your-domain>/api/billing/webhook`, subscribed to: `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`. Copy its **secret key**.
6. **Set the five variables** on the host and redeploy:
   - [ ] `PADDLE_ENV` — `sandbox` while testing, `production` when live. Anything unrecognised reads as sandbox, on purpose.
   - [ ] `PADDLE_API_KEY` — Paddle → Developer tools → Authentication.
   - [ ] `PADDLE_WEBHOOK_SECRET` — from step 5.
   - [ ] `PADDLE_PRICE_ID_PRO`
   - [ ] `PADDLE_PRICE_ID_ELITE`
   - [ ] `PADDLE_PRICE_ID_PRO_ANNUAL` — *optional*, the $290/year price. Leave it unset and no yearly option is offered.
   - [ ] `PADDLE_PRICE_ID_ELITE_ANNUAL` — *optional*, the $790/year price.
7. **Test in the sandbox first** (a separate sandbox account at <https://sandbox-vendors.paddle.com>): run one upgrade end to end with a Paddle test card, confirm the account's plan flips to Pro, then open **Manage subscription** and cancel. Only then swap in the production values.

Notes:
- Until the variables are set, plan gating still works and checkout shows a "not switched on" notice — `/api/health` reports `"billing": "dev-mode"`, and `"configured"` once it is live.
- **Paddle is the merchant of record**: it sells to your customers, handles sales tax/VAT worldwide, and appears on their statement. That is why the terms, privacy and refund pages describe it as the reseller.
- **One thing to re-check on activation day:** hosted-checkout links require an approved live account. If a checkout press returns "checkout isn't ready yet", the account setup is unfinished at Paddle's end, not a bug here. The whole integration is one file — `src/lib/billing/paddle.ts`.

## Optional / not needed now
- Broker connection (TopstepX/ProjectX): users enter their own username + API key in-app; stored encrypted. No env var.
- `AUTO_SYNC_INTERVAL_MIN` (default 30) — in-process auto-sync; no separate cron needed on Railway.
- AI coaching (`AI_COACHING_ENABLED`, `ANTHROPIC_API_KEY`) — hard-disabled in code (future phase). Nothing to do.
- No email provider is wired.

## Security note
No committed secrets; broker keys are encrypted at rest; webhook signatures are verified. Audit item **B2 is now fixed**: login, register, and the heavy demo-data/import endpoints are rate-limited (`src/lib/rate-limit.ts`). Note: the limiter is in-memory (per process) — correct for the current single-instance deploy; revisit if you scale to multiple instances.

## If you ever scale past ONE instance
Several pieces are deliberately built for the current **single-instance** Railway deploy. They all keep working on one server with zero setup, but each needs attention before running two or more instances:
- **Rate limiter** (`src/lib/rate-limit.ts`) — counts live in that one process's memory, so with N instances every limit is effectively N× looser. The file has a marked "Redis seam": swap the in-memory Map for a Redis store (switched on by `REDIS_URL`) and nothing else changes.
- **Broker auto-sync** (`src/lib/auto-sync.ts`) — runs in-process on a timer. With several instances each would run its own scheduler and sync the same connections repeatedly; move to a single scheduled job (e.g. Vercel-style cron hitting `/api/cron/sync`) instead.
- **Database connection pool** — each instance opens its own Prisma pool. One instance talking straight to Postgres is fine; several instances should go through a pooler (Railway/Supabase pgbouncer, `?pgbouncer=true&connection_limit=1` — see `.env.production.example`) so Postgres doesn't run out of connections.
