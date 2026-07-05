# TradeOS

**The discipline engine for day traders.** Import your trades, grade every one
against your own rulebook, and turn raw fills into a discipline score you can
actually improve — across live and funded/prop accounts.

TradeOS is not a journal. It's an AI-ready trading *discipline enforcement*
system: connectors normalize trades from any broker, a deterministic rule engine
evaluates each trade, and an explainable 0–100 discipline score shows exactly
where consistency breaks down — before it costs a payout.

---

## Quick start (local, zero external accounts)

The app runs fully locally out of the box: **SQLite** for the database and a
**built-in email/password auth** layer. No Supabase or Stripe account needed to
try it.

```bash
# 1. Install
npm install

# 2. Configure env (defaults are already local-friendly)
cp .env.example .env

# 3. Create the database, generate the client, and load demo data
npm run setup        # = prisma generate + db push + seed

# 4. Run
npm run dev          # http://localhost:3000
```

**Demo account:** `demo@tradeos.app` / `demo1234` (250 seeded trades across 3
accounts, 2 rulebooks, a Topstep prop account, and live discipline scoring).

> If `npm install` fails to download the Prisma engine binaries behind a strict
> proxy, the packages still install; re-run `npx prisma generate` once network is
> available, or set `PRISMA_ENGINES_MIRROR`. This only affects restricted
> networks — a normal machine downloads them automatically.

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run setup` | Generate client + push schema + seed demo data |
| `npm run db:seed` | (Re)seed demo data (idempotent) |
| `npm run db:reset` | Wipe + recreate + reseed |
| `npm run typecheck` | `tsc --noEmit` |

---

## Architecture

Modular by design — ingestion, analytics, rules, and UI are cleanly separated,
so each can scale independently and stay unit-testable without a database.

```
src/
  app/
    (auth)/            login & register (split-screen brand layout)
    (app)/             authenticated shell: dashboard, journal, analytics,
                       rules, accounts, prop, reports, import, settings
    api/               route handlers (auth, import, trades, rules, accounts,
                       prop, profile, billing)
    page.tsx           marketing landing + pricing
  components/
    ui/                shadcn-style primitives (design-token driven)
    charts/            equity, bucket bars, drawdown, score ring, calendar
    layout/            sidebar, topbar, mobile nav
  lib/
    types.ts           single source of truth for domain types & unions
    analytics/         pure metrics/equity/bucketing (no DB)
    rules/             rule engine + config validation + recompute
    discipline/        deterministic, explainable discipline score
    ingestion/         RFC-4180 CSV parser + per-broker adapters
    billing/           plans & feature gating (the monetization layer)
    data.ts            server data-access layer
    auth.ts            built-in auth (swappable for Supabase Auth)
prisma/
  schema.prisma        normalized schema (SQLite-portable, Postgres-ready)
  seed.ts              deterministic demo dataset
```

### Core systems
- **Ingestion** — modular `BrokerAdapter`s for TopstepX/ProjectX, Tradovate,
  NinjaTrader, Rithmic, IBKR, plus a generic column-mapper. Everything normalizes
  into one internal `Trade` schema. CSV + manual entry, plus a **live TopstepX
  API connector** (ProjectX Gateway): username + API key → account discovery →
  on-demand sync. Fills are FIFO-paired into round trips (scale-ins, partial
  closes, and reversals handled; fixture-tested), deduped by fill id, and
  credentials are AES-256-GCM encrypted at rest. Read-only — no orders are ever
  placed. Connect it from **Import → Broker API**.
- **Rule engine** — no-code rules (time windows, risk/loss limits, max
  trades/contracts, anti-revenge/overtrading behavioral rules, indicator &
  setup-validation). Every trade gets pass/fail per rule + an auditable
  `RuleEvaluation` row and a 0–100 compliance score. Fully deterministic.
- **Discipline score** — blends rule adherence, risk discipline, emotional
  discipline, and consistency into an explainable overall score with a full
  breakdown. No AI dependency.
- **Analytics** — performance by session, weekday, time of day, symbol, and
  strategy; expectancy, profit factor, payoff ratio, drawdown.
- **Prop-firm tracker** — Topstep/Apex/TPT presets; live buffer-remaining
  tracking for trailing drawdown, daily loss limits, consistency, and profit
  targets.

---

## Monetization (built in from day 1)

Feature gating lives in `src/lib/billing/plans.ts`:

| Plan | Price | For |
| --- | --- | --- |
| **Starter** | Free | Habit-building — 1 account, 30-day history |
| **Pro** | $29/mo | The full rule engine + discipline score + analytics |
| **Elite** | $79/mo | Prop-firm guardrails, reports, priority |

New users get a 14-day full-access trial. Path to $10k MRR ≈ **345 Pro** or
**~130 Elite** subscribers. Stripe is architecture-ready (env-gated) — the app
enforces gating today and lights up checkout when keys are added.

---

## Deploying

- **Railway (recommended):** persistent server + Postgres in one project,
  in-process broker auto-sync, no cron setup — see `docs/DEPLOYMENT-RAILWAY.md`.
- **Vercel + Supabase:** serverless alternative with Vercel Cron for auto-sync —
  see `docs/DEPLOYMENT.md`.

## Swapping in production services

- **Postgres / Supabase:** change the `provider` in `prisma/schema.prisma` to
  `postgresql`, set `DATABASE_URL` to your Supabase connection string, run
  `npm run db:push`. All `Json`-as-string fields are already Postgres-safe.
- **Supabase Auth:** `src/lib/auth.ts` is a thin, swappable layer — keep the
  `getCurrentUser()` contract and replace token issue/verify.
- **Stripe:** set `STRIPE_*` env vars; wire `api/billing/checkout`.
- **AI coaching (Phase 4):** interfaces are stubbed and disabled; no core logic
  depends on AI.

## Roadmap
- **Phase 1 (MVP):** auth, CSV import, journal, analytics, rule engine,
  discipline score, prop tracker, seed data. ✅
- **Phase 2:** alerts engine (deterministic backend flags — daily-loss/drawdown/
  overtrading/violations, wired into recompute ✅), no-code rule builder ✅,
  account comparisons ✅, **live TopstepX/ProjectX API connector** ✅ (verified
  end-to-end against a mock gateway; needs a real API key for live use).
  *Remaining: more live connectors (Tradovate, Rithmic).*
- **Phase 3:** trade replay (schematic playback ✅), reports → PDF (print
  pipeline ✅). *Remaining: screenshot analysis, Monte-Carlo risk-of-ruin.*
- **Phase 4:** Stripe billing (env-gated: checkout, webhook, customer portal ✅),
  AI coaching layer (provider interface + disabled default ✅ — no AI dependency
  in core). *Remaining: real AI provider, native iOS/Android (web is PWA-ready).*

### Enabling the env-gated pieces
- **Stripe:** set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the
  `NEXT_PUBLIC_STRIPE_PRICE_PRO/ELITE` price ids. Checkout, the customer portal,
  and subscription-sync webhooks activate automatically; until then the UI shows
  a graceful "not configured" notice and gating still works.
- **AI coaching:** implement a `CoachingProvider` (see `src/lib/ai/types.ts`),
  register it in `src/lib/ai/index.ts`, and set `AI_COACHING_ENABLED=true`.

*For educational analytics only. Not financial advice.*
