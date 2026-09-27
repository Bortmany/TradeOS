# TradeOS — conventions and verify recipe

House rules for anyone (human or agent) changing code in this repo. The generic dev crew in the central Agents repo reads this file first on every job. Companion docs: `docs/CONTRACTS.md` (internal data/type contracts — the normalized Trade schema every connector maps into) and `docs/UI_GUIDE.md` (UI conventions).

## Stack

Next.js 15 (App Router) + React 19 + TypeScript, Prisma 5, Tailwind + Radix-style primitives. Before writing anything, read a reference implementation end to end — an existing route handler under `src/app/api/`, its lib module under `src/lib/`, and the component that consumes it — and match their style exactly.

## Core guarantee

TradeOS's core guarantee: FIFO trade pairing and the rule/discipline-score engine are deterministic and correct — proven by the automated suite `npm test` runs (`test/`, vitest). Any future change to FIFO pairing (`src/lib/connectors/topstepx.ts`), the rule engine (`src/lib/rules/engine.ts`), the discipline score (`src/lib/discipline/score.ts`), or the user-scoping in `src/lib/data.ts` must extend that suite in the same change — a guarantee-area diff with no test update is a review-blocking finding, not a nitpick.

## Non-negotiable rules

- **Database portability**: the schema runs on SQLite (dev) AND Postgres (prod). No native enums, no scalar lists, no Postgres-only column types — status/type fields are plain `String` with the allowed values in a comment, exactly as the existing schema does.
- **Deterministic core**: the rule engine, discipline score and analytics are deterministic and explainable. AI is an optional, swappable layer behind the interface in `src/lib/ai/` — never wire AI into core scoring.
- **Validation & auth**: zod on every API input; auth checks the session (jose JWT) before touching data; every query scoped to the signed-in user's data.
- **Secrets**: broker API keys are AES-256-GCM encrypted at rest (see `BrokerConnection`) — never log or return them.
- **Outbound calls only to the firm registry**: the server contacts broker gateways listed in `src/lib/connectors/firms.ts` and nothing else — never a user-supplied URL. Adding a firm is one registry entry (`docs/connectors.md`).
- **Numbers**: follow the existing numeric conventions in the schema and `src/lib/` — don't introduce new float handling.
- Contract changes (the normalized Trade shape, rule-engine inputs/outputs, discipline-score semantics) require updating `docs/CONTRACTS.md` in the same change — silent drift is a review-blocking finding.

## Review priorities (worst first)

1. Real bugs: broken logic, wrong FIFO pairing or score math, race conditions in the auto-sync path.
2. Security: broker keys near a log/response; missing auth or user-scoping; zod gaps; secrets in client components.
3. Portability drift (the SQLite+Postgres rule above).
4. Contract drift vs `docs/CONTRACTS.md`; AI leaking into the deterministic core.
5. Convention drift: UI ignoring `docs/UI_GUIDE.md`, new float money-handling, missing error states.

## Verify recipe (run from the repo root, in order)

1. `npm install` if `node_modules` is missing or `package.json` changed.
2. Dev database is the SQLite one (`npm run db:use-sqlite` if the env isn't already SQLite — never point at a production Postgres URL).
3. `npx prisma generate`, then schema sync per this repo's own scripts (see `package.json` — don't invent commands).
4. `npm run db:seed` if a seed script exists.
5. `npm run lint` if defined.
6. `npm run typecheck` if defined, else `npx tsc --noEmit`.
7. `npm run build`.
8. `npm test` — the vitest core-guarantee suite (`test/`: FIFO pairing, rule engine, discipline score, cross-user isolation). It creates and deletes its own throwaway SQLite database and never touches `prisma/dev.db`.
