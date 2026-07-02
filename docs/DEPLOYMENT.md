# Deploying TradeOS (Vercel + Supabase + Stripe)

This is a step-by-step runbook to take TradeOS from local SQLite dev to a live
production deployment on **Vercel**, backed by a **Supabase/Postgres** database
and **Stripe** billing.

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

## C. Stripe

1. Create/sign in at <https://dashboard.stripe.com>. Start in **Test mode**
   (toggle top-right) until you're ready for real charges.
2. **Products -> Add product**, create two:
   - **Pro** — recurring, **$29 / month**
   - **Elite** — recurring, **$79 / month**
3. For each product, copy the **Price ID** (starts with `price_...`, *not* the
   product `prod_...`) into:
   - `NEXT_PUBLIC_STRIPE_PRICE_PRO`
   - `NEXT_PUBLIC_STRIPE_PRICE_ELITE`
4. **Developers -> API keys**: copy the **Secret key** into `STRIPE_SECRET_KEY`.
5. **Developers -> Webhooks -> Add endpoint**:
   - Endpoint URL: `https://<your-domain>/api/billing/webhook`
   - Select these events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Save, then copy the **Signing secret** (`whsec_...`) into
     `STRIPE_WEBHOOK_SECRET`.

**Local webhook testing** with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

This prints a temporary `whsec_...` — put it in your local `.env` as
`STRIPE_WEBHOOK_SECRET` while testing. Until Stripe keys are set the app runs
with feature gating still enforced and checkout shows a "not configured" notice.

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
   `NEXT_PUBLIC_APP_URL`; plus the `STRIPE_*` / price vars to enable billing).
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
4. **Stripe test checkout:** in Stripe **Test mode**, start a Pro/Elite checkout
   and use card `4242 4242 4242 4242` (any future expiry / any CVC). Confirm the
   webhook fires and your user's `plan` / `billingStatus` update. Then switch
   Stripe to **Live mode**, swap in live keys + a live webhook, and redeploy.

---

## F. Custom domain & PWA

- **Custom domain:** Vercel project -> **Settings -> Domains -> Add**, then
  follow the DNS instructions. After it's live, update `NEXT_PUBLIC_APP_URL`,
  your Stripe webhook endpoint URL, and redeploy.
- **PWA:** TradeOS is installable — on mobile, open the site and choose
  "Add to Home Screen" to run it as an app. No native build required.
