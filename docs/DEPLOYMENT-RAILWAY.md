# Deploying TradeOS on Railway (recommended)

Railway runs TradeOS as a **persistent Node server** with Postgres in the same
project. That means no serverless cold starts, no function time limits, and
broker **auto-sync runs in-process** — no cron configuration at all.

Total time: ~20 minutes. Cost: Hobby plan ($5/mo, includes usage credit)
comfortably runs the app + Postgres at launch scale.

---

## 1. Create your Railway account

1. Go to **https://railway.com** → **Login** → **Sign up with GitHub**
   (use the GitHub account that owns `Bortmany/TradeOS`).
2. Pick the **Hobby** plan when prompted.

## 2. Create the project + Postgres

1. Dashboard → **New Project** → **Deploy from GitHub repo** →
   select **Bortmany/TradeOS** (grant repo access if asked). The first build
   will start — it may fail until the database is attached; that's fine.
2. In the project canvas: **+ New** → **Database** → **Add PostgreSQL**.

## 3. Configure the app service

Click the **TradeOS service → Variables** and add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`  ← reference, autocompletes |
| `AUTH_SECRET` | output of `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | your public URL (see step 4 — set after generating the domain, then redeploy) |
| `AUTO_SYNC_INTERVAL_MIN` | `30` (optional — this is the default) |

Stripe later (optional, enables paid checkout): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_PRO`,
`NEXT_PUBLIC_STRIPE_PRICE_ELITE` — see `docs/DEPLOYMENT.md` section C for the
Stripe-side setup (webhook endpoint: `https://<your-domain>/api/billing/webhook`).

> Build & start are already configured in `railway.json` (committed in the
> repo): the build generates the Prisma client, provisions the schema with
> `prisma db push`, and builds Next.js; the healthcheck uses `/api/health`.

## 4. Get a public URL

Service → **Settings → Networking → Generate Domain**. Copy the
`*.up.railway.app` URL into `NEXT_PUBLIC_APP_URL` (step 3) and redeploy
(**Deployments → ⋯ → Redeploy**).

## 5. Verify

1. `https://<your-domain>/api/health` → `{"ok":true,...}`.
2. Register an account, click **Load sample data**, confirm the dashboard.
3. **Deploy logs** should show `[auto-sync] scheduler started — every 30 min`.
4. Connect a TopstepX API key (**Import → Broker API**); trades now sync
   automatically every 30 minutes and on demand.

## 6. Custom domain (optional)

Service → **Settings → Networking → Custom Domain**, add the CNAME Railway
shows you, then update `NEXT_PUBLIC_APP_URL` (and your Stripe webhook URL if
configured) and redeploy.

---

## Notes

- **Auto-sync**: handled by the in-process scheduler
  (`src/instrumentation.ts` → `src/lib/auto-sync.ts`). `CRON_SECRET` and the
  `vercel.json` cron are Vercel-only and unused on Railway. The manual
  fallback (`npx tsx scripts/sync-all.ts`) and the `/api/cron/sync` endpoint
  still work if you ever want an external scheduler.
- **Demo data**: to load the demo dataset into production Postgres, run
  locally with `DATABASE_URL` temporarily set to the **public** Postgres URL
  from Railway (Postgres service → Variables → `DATABASE_PUBLIC_URL`), run
  `npm run db:seed`, then restore your local `DATABASE_URL`. For a clean
  launch, skip this.
- **Local dev**: local Postgres (via `docker-compose.yml`) + `npm run dev` —
  see the root `README.md`. The schema is Postgres everywhere, so nothing
  changes between local dev and the Railway build.
- **Scaling**: Railway supports vertical resize and replicas from the service
  settings; Postgres backups are on the database service page.
