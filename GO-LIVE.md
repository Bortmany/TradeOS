# Go-Live checklist — TradeOS

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** (`railway.json` is present and complete). The build switches the database from SQLite to Postgres automatically. Alternative Vercel path is in `docs/DEPLOYMENT.md`.

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL` (on Railway: attach a Postgres plugin and use `${{Postgres.DATABASE_URL}}`).
- [ ] **Strong `AUTH_SECRET`** (≥32 characters). This signs logins, so it must be strong — the app refuses to start in production with a weak/short one. (Without `ENCRYPTION_SECRET` below, it also encrypts users' stored broker keys.)
- [ ] **Set `ENCRYPTION_SECRET` on the FIRST deploy** (generate with `openssl rand -base64 32`). It becomes the dedicated key that encrypts users' stored broker API keys, kept separate from the login secret. **Set it before any user connects a broker — changing it later (or setting it for the first time after launch) invalidates every stored broker key**, and users would have to reconnect their broker accounts. If it is never set, the app falls back to deriving the key from `AUTH_SECRET`, exactly as before.
- [ ] **Set `NEXT_PUBLIC_APP_URL`** to the deployed web address (used for Stripe redirects and report links).

## Payments — Stripe (fully built, just needs keys)
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_STRIPE_PRICE_PRO` and `NEXT_PUBLIC_STRIPE_PRICE_ELITE` (two subscription price IDs)
- [ ] Point a Stripe webhook at `/api/billing/webhook`.
- Until these are set, plan gating still works and checkout shows a "not configured" notice.

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
