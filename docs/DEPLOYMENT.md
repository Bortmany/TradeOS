# Deploying TradeOS (Vercel + Supabase + Paddle)

This is a step-by-step runbook to take TradeOS from local SQLite dev to a live
production deployment on **Vercel**, backed by a **Supabase/Postgres** database
and **Paddle** billing.

> Why the extra step? Prisma does not allow the datasource `provider` to be an
> environment variable — it must be the literal `sqlite` (local) or
> `postgresql` (production). We handle this with `scripts/switch-db.mjs`, which
> rewrites `prisma/schema.prisma`. The Vercel build runs it automatically; you
> only run it by hand if you want to point your *local* machine at Postgres.

**Local dev stays zero-setup.** None of this changes the default
`npm run setup` SQLite workflow — see the root `README.md`.

---

## A. Supabase (Postgres)

1. Create an account at <https://supabase.com> and click **New project**.
2. Pick a name, a strong **database password** (save it), and a region close to
   your users. Wait for provisioning to finish.
3. Open **Project Settings -> Database -> Connection string**. You'll see two
   kinds of URLs:
   - **Pooler / Transaction** (host `...pooler.supabase.com`, port `6543`) —
     use this for the running app. Append `?pgbouncer=true&connection_limit=1`.
     Serverless functions on Vercel require a pooled connection.
   - **Direct** (host `db.[REF].supabase.co`, port `5432`) — use this for
     schema pushes / migrations if the pooler ever refuses a `db push`.
4. Copy the pooler string, insert your database password where it says
   `[PASSWORD]`, and set it as `DATABASE_URL` (locally in `.env`, and later in
   Vercel). See `.env.production.example` for the exact shape.

---

## B. Local -> Postgres switch (optional, for testing against Supabase)

You do **not** need to do this to deploy (Vercel handles it). Do it only if you
want your local machine to talk to Supabase.

```bash
# 1. Flip the Prisma provider to Postgres
node scripts/switch-db.mjs postgres

# 2. Point DATABASE_URL at Supabase in your .env (see section A)

# 3. Create the schema in Supabase
npx prisma db push

# 4. (Optional) load the demo dataset
npm run db:seed
```

**Switch back to local SQLite dev when you're done:**

```bash
node scripts/switch-db.mjs sqlite
# restore DATABASE_URL="file:./dev.db" in .env, then:
npx prisma db push
```

The switch script is idempotent and only edits the `datasource db { ... }`
block — safe to run repeatedly. **Do not commit `schema.prisma` while it's set
to `postgresql`** — keep the committed default as `sqlite` so local dev and CI
stay zero-setup. The Vercel build re-applies the Postgres switch every deploy.

---

## C. Paddle

**Do this after the site is deployed and reachable.** Paddle approves seller
accounts by human review and looks at your live website — including the terms,
privacy and refund pages, which are already built (`/terms`, `/privacy`,
`/refunds`) and linked in the footer. Until the variables below are set, the app
runs with feature gating enforced and checkout shows a "not switched on" notice,
so launching with billing dormant is a supported state, not a broken one.

1. **Apply** at <https://paddle.com> with your live URL, and create a free
   **sandbox** account at <https://sandbox-vendors.paddle.com> to build against
   in the meantime. Everything below can be done in the sandbox first.
2. **Catalog -> Products -> New product**, create two, each with a recurring
   price:
   - **Pro** — **$29 / month**
   - **Elite** — **$79 / month**
3. For each, copy the **price id** (starts with `pri_...`, *not* the product
   `prd_...`) into:
   - `PADDLE_PRICE_ID_PRO`
   - `PADDLE_PRICE_ID_ELITE`
4. **Developer tools -> Authentication -> API keys**: create a server-side key
   and copy it into `PADDLE_API_KEY`. Set `PADDLE_ENV` to `sandbox` while
   testing, `production` when live (any unrecognised value is treated as
   sandbox, deliberately).
5. **Developer tools -> Notifications -> New destination**:
   - Type: **Webhook**, URL: `https://<your-domain>/api/billing/webhook`
   - Subscribe to: `subscription.created`, `subscription.activated`,
     `subscription.updated`, `subscription.canceled`, `transaction.completed`,
     `transaction.payment_failed`
   - Save, then copy the destination's **secret key** (`pdl_ntfset_...`) into
     `PADDLE_WEBHOOK_SECRET`.
6. **Test in the sandbox**: run one upgrade with a Paddle test card, confirm the
   account's `plan` / `billingStatus` flip, then cancel from **Manage
   subscription**. Swap in production values and redeploy only after that works.

**Local webhook testing:** point a tunnel (e.g. `ngrok http 3000`) at your
machine, use the tunnel URL as a sandbox notification destination, and put that
destination's secret in your local `.env` as `PADDLE_WEBHOOK_SECRET`. Signatures
are verified against the raw request body, so the webhook cannot be exercised by
hand-written requests — that is the point of it.

---

## D. Vercel

1. Push this repo to GitHub.
2. At <https://vercel.com> click **Add New -> Project** and **import** the repo.
3. Framework preset auto-detects **Next.js**. Leave the build/install commands
   as-is — `vercel.json` already sets them:
   - Install: `npm install`
   - Build: `node scripts/switch-db.mjs postgres && prisma generate && prisma db push --accept-data-loss && next build`
   The build **switches the schema to Postgres, generates the client, pushes the
   schema to Supabase, then builds Next.js** — so the database schema is
   provisioned on the first deploy automatically.
4. Under **Environment Variables**, add every variable from
   `.env.production.example` (at minimum: `DATABASE_URL`, `AUTH_SECRET`,
   `NEXT_PUBLIC_APP_URL`; plus the `PADDLE_*` vars to enable billing).
   Set them for the **Production** environment.
5. Click **Deploy**.

> **On schema changes / `db push` vs migrations:** `prisma db push` provisions
> and syncs the schema without a migration history — perfect for first deploy
> and early iteration. `--accept-data-loss` lets it apply column changes
> non-interactively. When your data matters and you need reviewable, reversible
> schema changes, graduate to Prisma Migrate (`prisma migrate deploy`) and
> update the build command accordingly.

---

## E. Post-deploy checklist

1. **Health check:** visit `https://<your-domain>/api/health` — it should
   return an OK response.
2. **Seeding:** for a real production launch, **skip the seed** (it creates the
   `demo@tradeos.app` demo account and sample trades). Only run `npm run db:seed`
   against Postgres if you deliberately want demo data (see section B).
3. **Create the first account:** open the app, register a real email/password,
   and confirm you land in the authenticated dashboard.
4. **Paddle sandbox checkout:** with the sandbox variables set, start a
   Pro/Elite checkout and pay with a Paddle test card. Confirm the webhook
   fires and your user's `plan` / `billingStatus` update, then cancel from
   **Manage subscription**. Once that works end to end, swap in the production
   API key, price ids and notification-destination secret, set
   `PADDLE_ENV=production`, and redeploy.

---

## E2. Scheduled broker auto-sync (TopstepX connector)

Connected broker accounts can sync automatically on a schedule:

1. **Set `CRON_SECRET`** in Vercel env vars (`openssl rand -base64 24`).
   The cron endpoint `GET /api/cron/sync` requires it as a Bearer token —
   Vercel Cron sends it automatically once the env var exists.
2. **Schedule:** `vercel.json` already defines a cron hitting
   `/api/cron/sync` every 30 minutes. **Vercel Hobby plans only allow daily
   crons** — either change the schedule to `"0 22 * * *"` (once daily, after
   the futures close) or use a Vercel Pro plan for the 30-minute cadence.
3. **Verify:** after deploy, run
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync`
   — you should get a JSON summary (`connections`, `imported`, `failed`).
   Per-connection failures land in the Import page's Broker API panel as an
   error status with the reason; they never block other connections.
4. **Self-hosted alternative:** on a VPS, schedule
   `npx tsx scripts/sync-all.ts` with system cron instead (see the header of
   that file for a crontab example). Users can always click **Sync now** in
   the app regardless of scheduling.

---

## F. Custom domain & PWA

- **Custom domain:** Vercel project -> **Settings -> Domains -> Add**, then
  follow the DNS instructions. After it's live, update `NEXT_PUBLIC_APP_URL`,
  your Paddle notification destination URL, and redeploy.
- **PWA:** TradeOS is installable — on mobile, open the site and choose
  "Add to Home Screen" to run it as an app. No native build required.
