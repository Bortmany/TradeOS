# Go-Live checklist — TradeOS

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** (`railway.json` is present and complete). The build switches the database from SQLite to Postgres automatically. Alternative Vercel path is in `docs/DEPLOYMENT.md`.

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL` (on Railway: attach a Postgres plugin and use `${{Postgres.DATABASE_URL}}`).
- [ ] **Strong `AUTH_SECRET`** (≥32 characters). This both signs logins **and** encrypts users' stored broker keys, so it must be strong — the app refuses to start in production with a weak/short one.
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

## Security note (before scaling up)
No committed secrets; broker keys are encrypted at rest; webhook signatures are verified. **Recommended before heavy public traffic:** add rate limiting to the login and demo-data/import endpoints (currently none). See B2 in the central audit.
