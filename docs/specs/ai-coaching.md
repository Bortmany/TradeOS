# AI coaching — build spec (TradeOS)

Status: ready to build. Audience: the builders (who work in parallel from this file without talking to each other) and the owner (plain English first, exact contracts second).

The repo's law (`docs/CONVENTIONS.md`): **the schema must run on SQLite and Postgres, and the scoring core stays deterministic.** AI is an optional layer behind `src/lib/ai/`, never wired into rules, the discipline score or analytics. Everything below obeys that.

Where this spec gives an exact path, method, field name, status code, env var name or default, build it exactly as written. If you find the code contradicting it, stop and tell the lead rather than choosing silently.

---

## 0. Summary

### What the user gets

A process coach built into the journal:

- Four notes on demand: fresh suggestions, repeated-mistake themes, "summarise my day", and "explain this trade".
- A Monday-morning weekly review, shown in the app and emailed when email is switched on.
- A focus list: a suggestion can be turned into something to do. The user marks it done, and the coach follows up next time.
- Thumbs up / thumbs down on every note.
- A Coach page with the history of notes.
- Settings: coach on/off, tone, focus areas, weekly review on/off, weekly email on/off.

Everything stays off until the owner sets `AI_COACHING_ENABLED=true` and `ANTHROPIC_API_KEY`. Scores, rules and analytics never depend on it.

### What already exists (reuse, do not rebuild)

| Piece | Where | What it gives us |
|---|---|---|
| Provider contract | `src/lib/ai/types.ts` | `CoachingProvider` (summarizeTrade, clusterMistakes, summarizeDay, suggestImprovements) and `CoachingContext` |
| Claude provider | `src/lib/ai/anthropic.ts` | process-only system prompt; sends aggregated numbers with rules anonymised as "Rule N" (`buildFacts`); `reserve()` caps backed by `AiUsage`; zod output validation; 20 s timeout; silent fallbacks; `LIMIT_MESSAGE`, `GLOBAL_LIMIT_MESSAGE`, `FALLBACK_MESSAGE` |
| Resolver | `src/lib/ai/index.ts` | `isCoachingEnabled()`, `getCoachingProvider()` |
| Old route | `GET /api/coaching` | returns an old "roadmap" message; this spec replaces it |
| Data | `src/lib/data.ts` | `getTrades(userId, { from, to })` (returns `TradeRecord[]` via `mapTrade`), `getActiveRules(userId)` |
| Engine | `src/lib/rules/engine.ts` | `evaluateTrades` |
| Analytics | `src/lib/analytics` | `computeMetrics` |
| Score | `src/lib/discipline/score.ts` | `computeDisciplineScore` |
| Week helpers | `src/lib/reviews.ts` | `weekKeyOf`, `shiftWeekKey`, `weekKeyToDate`, `weekEndKey`, `isRealDateKey`, `normalizeWeekKey` |
| ET day helpers | `src/lib/backtest/time.ts` | `etDayKey`, `etDateStartUtc`, `etDateEndUtc` |
| Job lock | `src/lib/single-runner.ts` | `withSingleRunner`, `runnerHealth` |
| Email | `src/lib/email` | `sendEmail`, `escapeHtml`, `emailLayout`, `isEmailEnabled`, `appBaseUrl` |
| Push | `src/lib/push/send.ts` | `sendToUser` |
| Rate limits | `src/lib/rate-limit.ts` | `enforceUserRateLimit`, `USER_READ_LIMIT` (120/min), `USER_WRITE_LIMIT` (60/min), `USER_EXTERNAL_LIMIT` (10/min) |
| Demo guard | `src/lib/demo-guard.ts` | `refuseDemo` |
| Auth wrapper | `src/lib/auth.ts` | `withUser` |
| Error helper | `src/lib/api-error.ts` | `apiErrorResponse` |
| Plans | `src/lib/billing/plans.ts` | `effectivePlan` |
| UI primitives | `src/components/ui/` | card, button, badge, dialog, switch, tabs, tooltip, skeleton, empty-state, textarea |

---

## 1. Principles (non-negotiable)

1. **Deterministic core untouched.** Nothing in `src/lib/rules`, `src/lib/discipline` or `src/lib/analytics` imports from `src/lib/ai`. A test enforces it (section 11).
2. **Never call the model on page load.** Every model call is either a user pressing a button or the weekly job. Pages render saved notes from the database.
3. **Only aggregated numbers and fixed labels leave the server.**
   - NEVER sent: names, emails, user ids, account names, symbols, prices, P&L in dollars, custom rule names, journal notes, "why I entered" text, emotion tags as free text, screenshots, weekly-review answers.
   - The only free text ever sent back to the model is the trader's current focus item. That text was WRITTEN BY THE MODEL itself and copied server-side from a stored note. Users cannot type or edit focus text, so it cannot carry a prompt injection typed by a user.
   - Tone and focus areas are sent as fixed enum labels, mapped on the server.
4. **Every input is zod-validated; every query is filtered by the signed-in user.** Another user's trade, note or focus id answers 404, exactly like a missing one.
5. **Honest states everywhere:** owner switch off, user switched it off, daily limit reached, app-wide limit reached, provider unavailable, not enough trades, demo desk (canned sample, no call).
6. **Schema changes are additive only** (deploy uses `prisma db push`): plain `String` / `Boolean` / `Int` / `DateTime`, no enums, no scalar lists, JSON stored as `String`.
7. **Caching.** An identical request (same user, kind, subject, identical facts) within `AI_CACHE_HOURS` (default 24) is served from the saved note, costs nothing and does not count toward any cap.

---

## 2. Phases

| Phase | Contents |
|---|---|
| 1 — Foundation | Schema, provider extensions, service with cache + caps + demo + context builder, update `docs/CONTRACTS.md` and the outbound-call line in `docs/CONVENTIONS.md`, tests |
| 2 — Server routes and screens | Status, notes, feedback, focus, preferences, export, usage routes; weekly job (cron route, in-process scheduler, email, push); dashboard card, journal day summary, trade explain, shared components |
| 3 — Coach page and settings | Coach page, settings card, navigation, privacy page |
| Verification and docs | Review, `npm run verify`, README ("Enabling the env-gated pieces"), GO-LIVE, `.env.example` |

---

## 3. Data model (additive)

Two new tables, nine new columns, nothing removed.

```prisma
model User {  // new columns (5) and relations
  coachingEnabled     Boolean @default(true)
  coachingTone        String  @default("gentle")   // gentle | direct
  coachingFocusAreas  String?                      // JSON string array of fixed keys: rules | sizing | emotions | journaling | consistency
  coachingWeekly      Boolean @default(true)       // generate the Monday weekly review
  coachingWeeklyEmail Boolean @default(true)       // email it (only when email is configured)
  coachingNotes       CoachingNote[]
  coachingFocus       CoachingFocus[]
}

model CoachingNote {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind        String   // suggestions | clusters | day | trade | weekly
  subjectKey  String   // suggestions/clusters: "30d"; day: YYYY-MM-DD (ET); trade: the trade id; weekly: Monday YYYY-MM-DD
  inputHash   String   // sha256 of the exact facts payload sent to the model (the cache key)
  content     String   // JSON string, shape per kind (section 5), zod-validated before saving
  model       String   // model id used, "demo" for samples
  source      String   @default("ai") // ai | demo
  servedCount Int      @default(0)  // times served from cache instead of a new call
  feedback    String?  // up | down
  feedbackAt  DateTime?
  createdAt   DateTime @default(now())
  focus       CoachingFocus[]
  @@index([userId, createdAt])
  @@index([userId, kind, subjectKey, createdAt])
}

model CoachingFocus {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteId    String?
  note      CoachingNote? @relation(fields: [noteId], references: [id], onDelete: SetNull)
  noteKind  String   // copied from the note at creation
  text      String   // copied from the note content, max 600 chars; never user-typed
  status    String   @default("open") // open | done | dismissed
  createdAt DateTime @default(now())
  doneAt    DateTime?
  @@index([userId, status])
}

model AiUsage {  // new columns (4), all additive with defaults
  kind         String  @default("unknown")  // suggestions | clusters | day | trade | weekly
  inputTokens  Int     @default(0)
  outputTokens Int     @default(0)
  ok           Boolean @default(true)
}
```

- Account deletion: notes and focus items go with the user (cascade). `AiUsage` has no relation and is already purged explicitly in `src/app/api/profile/delete/route.ts`.
- Export: `GET /api/profile/export` gains `coachingNotes` (id, kind, subjectKey, content parsed, source, feedback, createdAt; NOT inputHash) and `coachingFocus` arrays.
- The two new tables and five new User columns must be added to the existing schema file only; no second migration mechanism.

---

## 4. Caps and plan gating

### 4.1 Daily caps

New file `src/lib/ai/limits.ts` exports `coachingDailyCapFor(plan, billingStatus): number`.

| Env var | Default | Meaning |
|---|---|---|
| `AI_DAILY_CAP_FREE` | 3 | notes a day on Starter |
| `AI_DAILY_CAP_PRO` | 10 | notes a day on Pro |
| `AI_DAILY_CAP_ELITE` | 25 | notes a day on Elite |
| `AI_DAILY_CAP_PER_USER` | unset | optional hard ceiling for every plan |
| `AI_DAILY_CAP_GLOBAL` | 500 | all users together (unchanged) |
| `AI_CACHE_HOURS` | 24 | how long an identical request is served from the saved note |

Rules:

- Plan used = `effectivePlan(plan, billingStatus)`, so a trialing user gets Pro's cap.
- If `AI_DAILY_CAP_PER_USER` is set, it is a hard ceiling for every plan: result = min(plan cap, ceiling). When the plan variables are unset and only the ceiling is set, every plan gets min(plan default, ceiling). It is no longer a default of 10.
- Billing is dormant: every new account is `trialing`, which `effectivePlan` maps to Pro, so nobody is locked out. A `canceled` or `past_due` account falls to the free cap (3), never zero.
- Weekly-job calls are not charged to the user's daily cap (they are the owner's scheduled spend) but DO count toward the global cap.
- A cache hit costs nothing and is not counted.

### 4.2 Plan table changes (`src/lib/billing/plans.ts`)

- `PlanFeatures.aiCoaching` becomes `true` on all three plans. Coaching is available to everyone once the owner turns the switch on; the plan sets how many calls a day.
- Update the plan bullets:

| Plan | New bullet |
|---|---|
| Starter (`free`) | "AI coach: 3 notes a day" |
| Pro | "AI coach: 10 notes a day" |
| Elite | "AI coach: 25 notes a day" (replaces "Early access to AI coaching when it ships") |

- Remove the "flips on when the AI layer ships" comment on Elite's `aiCoaching`.
- Tests that must follow: `test/plan-gating.test.ts` (its "before" table has `aiCoaching: false`; turning it on loses nothing, but update that table's note and any exact-equality check), `test/landing-signup-cta.test.ts`, `test/wording-guard.test.ts` (the bullets must not trip its "AI-assisted" rule).
- The bullet text is also the source for the pricing page, so check that page and the landing page for any copy that says AI coaching is "coming" or "roadmap" and make it true.

### 4.3 Changes to the existing provider contract

`CoachingContext` gains optional fields (all optional so existing tests keep passing):

| Field | Type | Meaning |
|---|---|---|
| `limits` | `{ dailyCap: number \| null }` | number = that user's cap; `null` = scheduled job, skip the per-user gate; `undefined` = legacy env default so existing tests keep passing |
| `preferences` | `{ tone: "gentle" \| "direct"; focusAreas: FocusArea[] }` | user's fixed-label preferences |
| `previousFocus` | `{ text: string; done: boolean; ageDays: number } \| null` | the coach's own previous focus sentence |
| `kind` | `NoteKind` | which note is being made (for the usage row) |

Other contract changes:

- `reserve(userId, dailyCap?)` honours the cap and now RETURNS `{ gate, usageId }` so the usage row can be updated after the call with kind, tokens and success. When `dailyCap` is `undefined`, it uses the old `AI_DAILY_CAP_PER_USER` (default 10) behaviour so `test/ai-coaching.test.ts` keeps passing. When it is `null`, the per-user check is skipped but the global check still applies.
- `CoachingResult<T>` gains optional `usage?: { inputTokens: number; outputTokens: number; model: string }`, taken from the Anthropic response `usage`.
- The provider gains a fifth method: `summarizeWeek(ctx, weekStart): Promise<CoachingResult<WeeklyCoachingSummary>>` with `WeeklyCoachingSummary = { weekStart: string; summary: string; wins: string[]; mistakes: string[]; focusNextWeek: string; previousFocusVerdict: string | null }`. The null (disabled) provider returns the disabled result for it too.
- Prompt extras added to every task:
  - Tone line from a server-side map: `gentle` → "Tone: warm and encouraging, still honest."; `direct` → "Tone: blunt, concise, no padding."
  - `focusAreas` as their fixed labels.
  - `previousFocus` (text, done, ageDays) with the instruction: "If previousFocus is present, open with one sentence on it (kept or not) and set previousFocusVerdict; else null." (the verdict field applies to the weekly task only).
  - The day and suggestions prompts also receive `previousFocus` and mention it in one line when present.
- Mistake clusters keep `exampleTradeIds: []`. The model never sees trade ids. Keep it simple.
- `MAX_TOKENS` is 500 today; the weekly shape is the largest, so the builder checks that a full weekly answer fits and raises the limit for that task only if needed.

---

## 5. Note content shapes

JSON stored in `CoachingNote.content`, validated by zod in `src/lib/ai/notes.ts` (the same file exports the `NoteKind`, `FocusArea` types and the parse helpers).

| Kind | Shape | Notes |
|---|---|---|
| `suggestions` | `{ items: [{ title, body, priority: "low"\|"medium"\|"high" }] }` | 1 to 5 items |
| `clusters` | `{ items: [{ label, count, suggestion }] }` | 0 to 5 items; 0 is allowed when there are no breaches, and the UI says "No repeated breaches in the last 30 days" |
| `day` | `{ date, summary, wins: string[], mistakes: string[], focusTomorrow }` | `date` is YYYY-MM-DD (ET) |
| `trade` | `{ tradeId, headline, detail }` | |
| `weekly` | `{ weekStart, summary, wins: string[], mistakes: string[], focusNextWeek, previousFocusVerdict: string\|null }` | `weekStart` is the Monday |

The provider returns arrays for suggestions and clusters; the service wraps them as `{ items }` before saving.

**Focus text path** (used by `POST /api/coaching/focus`):

| Path | Note kind | Text taken |
|---|---|---|
| `"focus"` | day | `focusTomorrow` |
| `"focus"` | weekly | `focusNextWeek` |
| `"items.<i>"` | suggestions | `title + " — " + body` (cut to 600 characters) |
| `"items.<i>"` | clusters | `suggestion` |

Trade notes cannot become focus. Any other kind/path pairing is a 400.

---

## 6. Server: service and routes

### 6.1 Service — `src/lib/ai/service.ts`

```
generateCoachingNote(
  user: { id, email, plan, billingStatus },
  req:  { kind, tradeId?, date?, weekStart? },
  opts?: { scheduled?: boolean }          // true only for the weekly job
)
→ { ok: true, note: NoteDTO, cached: boolean, demo?: true, usage: { used, limit } }
| { ok: false, code, error, status }
```

Failure codes:

| code | status | Plain-English message |
|---|---|---|
| `disabled` | 503 | "AI coaching isn't switched on for this site yet." |
| `user_off` | 403 | "You've turned the AI coach off. Switch it back on in Settings." |
| `not_found` | 404 | the trade is not the user's (or does not exist) |
| `no_data` | 422 | "Not enough trades in this period to coach on yet." |
| `limit` | 429 | existing `LIMIT_MESSAGE`; remaining = 0; route adds a `Retry-After` header |
| `global_limit` | 429 | existing `GLOBAL_LIMIT_MESSAGE` |
| `unavailable` | 502 | existing `FALLBACK_MESSAGE` |

Order of work (do not reorder):

1. Owner switch (`isCoachingEnabled()`): off → `disabled`.
2. Demo desk: serve the canned sample from `src/lib/ai/demo.ts` with `source: "demo"`, id `demo-<kind>`, nothing saved, no call, no usage row. (See 6.3 for which routes can reach this.)
3. User preference `coachingEnabled`: off → `user_off`.
4. Build the context (6.2) for the window below. Trade kind: confirm the trade belongs to the user, else `not_found`.
5. No context (no trades) → `no_data`.
6. Facts hash = sha256 of `JSON.stringify({ kind, subjectKey, model, facts: buildFacts(ctx), extras: { tone, focusAreas, previousFocus, trade/day extras } })`, where `model` is `AI_MODEL` or the default model id.
7. Cache lookup: newest note with the same userId + kind + subjectKey + inputHash and `createdAt` within `AI_CACHE_HOURS`. Hit → `servedCount++`, return `cached: true`. No reserve, no `AiUsage` row.
8. Miss: call the provider with `ctx.limits.dailyCap` = the plan cap (or `null` when `opts.scheduled`).
9. Validate the shape with the zod schema from `notes.ts`; save the note; update the `AiUsage` row (kind, tokens, ok); return.

There is no "force" flag. Refresh in the UI calls the same route; if nothing changed the user gets the saved note and the UI says "Nothing has changed since this note."

- `usedToday` = count of `AiUsage` rows for the user in the last 24 h; `limit` = the plan cap.
- Previous focus (for kinds day, suggestions, weekly): the user's newest focus item with status `open`, or `done` within the last 7 days; else `null`.

**Windows** (ET = US Eastern, using the existing helpers):

| Kind | Window |
|---|---|
| suggestions, clusters | last 30 ET days ending today; `subjectKey` "30d" |
| day | that ET day (`etDateStartUtc(date)` .. `etDateEndUtc(date)`); `date` must be a real YYYY-MM-DD (`isRealDateKey`) and not in the future, else 400 from the route; defaults come from the UI |
| trade | the trade must be the user's; window = 30 days ending the trade's ET day; the trade must be present in `ctx.trades` |
| weekly | Monday..Sunday ET of `weekStart`, normalised with `normalizeWeekKey`. On demand, it must not be the current or a future week (the newest allowed is last week). Only the weekly job (`opts.scheduled`) reviews the week that just finished, which is the same "last week"; so in practice both paths use a finished week |

### 6.2 Context builder — `src/lib/ai/context.ts`

`buildCoachingContext(userId, { from, to }): Promise<CoachingContext | null>`:

- trades = `getTrades(userId, { from, to })`
- rules = `getActiveRules(userId)`
- evaluations = `evaluateTrades(trades, rules)`, in memory. NEVER `recomputeUserCompliance` (that writes).
- metrics = `computeMetrics(trades)`
- discipline = `computeDisciplineScore({ trades, evaluations })`
- violations = every failing evaluation as `{ ruleName, explanation, severity }`. These stay on the server; `buildFacts` already reduces them to "Rule N" counts.
- Returns `null` when there are no trades.

### 6.3 Routes

All handlers use `withUser`, zod and user-scoped queries. Every write handler (POST, PATCH, DELETE) calls `refuseDemo(user)` FIRST, before reading or validating the body.

**Demo desk rule (read this twice).** `test/demo-read-only.test.ts` walks every write route, posts `{}` as the demo user and expects `403` with `code: "demo"` and the standard `DEMO_WRITE_LINE`. It also fails if the route file does not contain the text `refuseDemo(`. So:

- `POST /api/coaching/notes` on the demo desk answers the standard 403 demo refusal like every other write route.
- The canned samples are served by the GET routes instead: `GET /api/coaching` returns `latest` filled with samples and `demo: true`; `GET /api/coaching/notes` returns the sample list.
- The UI on the demo desk shows the samples with a "Sample" badge, and the generate buttons show the standard demo line instead of sending a request.
- The demo branch in the service (step 2 above) is used by those GET routes through a small `demoNotes()` helper; no model call, nothing saved.

| Route | Method | Body / query | Answer | Limiter |
|---|---|---|---|---|
| `/api/coaching` | GET | none | `{ ok, switchedOn, userEnabled, demo, plan, limit, usedToday, remaining, cacheHours, emailConfigured, pushConfigured, preferences: { tone, focusAreas, weekly, weeklyEmail }, latest: { suggestions: NoteDTO\|null, clusters: NoteDTO\|null, weekly: NoteDTO\|null }, openFocus: FocusDTO[] }`. Never calls the model. | `coaching:read`, `USER_READ_LIMIT` |
| `/api/coaching/notes` | POST | `{ kind: "suggestions"\|"clusters"\|"day"\|"trade"\|"weekly", tradeId?, date? (YYYY-MM-DD), weekStart? (YYYY-MM-DD) }` | 200 `{ ok:true, note, cached, usage:{used,limit} }` or `{ ok:false, code, error }` with the statuses in 6.1 (400 for bad input) | `coaching:generate`, `USER_EXTERNAL_LIMIT` (10/min) |
| `/api/coaching/notes` | GET | `?kind=&subject=&limit=` (1..50, default 20) `&before=<noteId>` | `{ ok, notes: NoteDTO[], nextCursor: string\|null }`, newest first | `coaching:read` |
| `/api/coaching/notes/[id]` | DELETE | none | `{ ok:true }`; 404 if not the user's | `coaching:write`, `USER_WRITE_LIMIT` |
| `/api/coaching/notes/[id]/feedback` | POST | `{ vote: "up"\|"down"\|null }` | `{ ok:true, feedback }` (`null` clears; `feedbackAt` set/cleared); 404 if not the user's | `coaching:write` |
| `/api/coaching/focus` | GET | `?status=open\|done\|dismissed\|all` (default `open`) | `{ ok, items: FocusDTO[] }` | `coaching:read` |
| `/api/coaching/focus` | POST | `{ noteId, path: "focus" \| "items.<i>", addToChecklist?: boolean }` | 201 `{ ok:true, item: FocusDTO, checklist?: { added: boolean, reason?: "no_template"\|"full" } }`. The same note + path again returns the existing item (200). 409 `code:"focus_full"` at 20 open items. 404 for another user's note. 400 for a trade note or a bad path. | `coaching:write` |
| `/api/coaching/focus/[id]` | PATCH | `{ status: "open"\|"done"\|"dismissed" }` | `{ ok:true, item }` (`doneAt` set when done, cleared otherwise); 404 if not the user's | `coaching:write` |
| `/api/profile` | PATCH (extend) | adds `coachingEnabled?`, `coachingTone?` ("gentle"\|"direct"), `coachingFocusAreas?` (array of the five fixed keys, max 5, deduped), `coachingWeekly?`, `coachingWeeklyEmail?` | `{ ok:true }`; unknown tone or focus area is a 400 | existing |
| `/api/profile/export` | GET (extend) | none | adds `coachingNotes`, `coachingFocus` | existing |
| `/api/cron/coaching-weekly` | GET | `Authorization: Bearer <CRON_SECRET>` | `{ ok, outcome: "ran"\|"skipped"\|"failed", weekStart, eligible, generated, cached, emailed, pushed, failed, stoppedEarly: boolean, time }`; 503 when `CRON_SECRET` is unset (database never touched), 401 on mismatch, constant-time compare | none (secret-protected) |
| `/api/coaching/usage` | GET | `Authorization: Bearer <CRON_SECRET>` (owner-only; no admin role exists) | `{ ok, days: [{ day, calls, failed, users, inputTokens, outputTokens, estimatedCostUsd }] (last 14 days), totals: {..., cacheHits}, pricing: { inputPerMTok, outputPerMTok } }`. Counts only, never content. Same 503 / 401 rules. | none |
| `/api/health` | GET (extend) | none | adds `weeklyCoaching: "ok"\|"failing"\|"idle"` via `runnerHealth(4927003)` in the same loop as `liveReads` / `fillSweep` | none |

Both secret routes copy the `safeEqual` + `CRON_SECRET` pattern from `src/app/api/cron/sync/route.ts` (`export const dynamic = "force-dynamic"`).

Detail for the routes:

- **`cacheHits`** in `usage` totals comes from the sum of `CoachingNote.servedCount` in the window (counts only).
- **`addToChecklist`:** append the focus text (cut to 140 characters) as a new `ChecklistItem` on the user's first active `ChecklistTemplate` (lowest `order`), only when it has fewer than 20 items. If the user has no active template, `{ added:false, reason:"no_template" }`; if full, `{ added:false, reason:"full" }`. No recompute needed (checklists never touch scoring).
- **Cursor paging** for notes: `before=<noteId>` returns notes older than that note (by `createdAt`, then `id`); the id must belong to the user, otherwise 400. `nextCursor` is the last returned id when more exist, else `null`.
- **Status route** (`GET /api/coaching`) when the owner switch is off still answers 200 with `switchedOn:false` so screens can explain. `plan` is the effective plan.
- **Response DTOs:**
  - `NoteDTO = { id, kind, subjectKey, content (parsed object), source, feedback, createdAt (ISO) }`
  - `FocusDTO = { id, text, status, noteId, noteKind, createdAt, doneAt }`
- **Errors** go through `apiErrorResponse`; no raw provider text is ever returned.
- **Cost estimate env:** `AI_PRICE_INPUT_PER_MTOK` (default 3) and `AI_PRICE_OUTPUT_PER_MTOK` (default 15), US dollars per million tokens. The owner should set them to the current price of the model in use.

---

## 7. Weekly coaching review

### 7.1 The job — `src/lib/ai/weekly.ts`

- `export const WEEKLY_COACHING_LOCK_KEY = 4927003` (the existing keys are 4927001 for the fill sweep and 4927002 for live reads).
- `runWeeklyCoaching({ now? })` is wrapped in `withSingleRunner(WEEKLY_COACHING_LOCK_KEY, "weekly-coaching", work, { deadlineMs: 50_000 })`.
- It skips entirely when `isCoachingEnabled()` is false.
- `weekStart` = the Monday of the ET week that has just finished (the previous week relative to `now`).
- **Eligible users:** `coachingEnabled && coachingWeekly`, not the demo desk, no existing `CoachingNote` of kind `weekly` with that `subjectKey`, and at least one trade with `entryTime` inside that week. Oldest-created users first. Stop at the deadline; the next run continues, so it is idempotent.
- **Per user:** call `generateCoachingNote(user, { kind: "weekly", weekStart }, { scheduled: true })`, which sets `limits.dailyCap = null`.
  - On success, if `isEmailEnabled()` and the user's `coachingWeeklyEmail` is on, send `coachingWeeklyEmail(userId, note)`.
  - If push is configured, `sendToUser(userId, { title: "Your weekly coaching review is ready", body: <first 100 characters of the summary>, url: "/coach", tag: "coaching-weekly" })`.
- A `global_limit` answer stops the run (`stoppedEarly: true`).
- Failures are counted, never thrown. Nothing in the job logs note content or email addresses.

### 7.2 The email — `src/lib/email/coaching-email.ts`

- Subject: "Your weekly coaching review".
- `escapeHtml` on every string that goes into the HTML; built with `emailLayout`.
- Contains the summary, wins, mistakes, next week's focus, and (when present) the previous-focus verdict.
- Link: `appBaseUrl() + "/coach"`.
- A line explaining how to turn the email off in Settings.

### 7.3 Scheduling (two ways, both safe to run together because the job is idempotent)

| Way | How |
|---|---|
| (a) Built-in | `startWeeklyCoaching()` in `src/lib/ai/weekly-scheduler.ts`, started from `src/instrumentation.ts` after `startLivePoller()`. A 30-minute `setInterval` (`unref`'d, skipped on Vercel, guarded against hot-reload like `startAutoSync`) that calls `runWeeklyCoaching` only when it is Monday 06:00 ET or later and before Tuesday 00:00 ET. |
| (b) Platform cron | The cron route, for Vercel or an external scheduler, for example Railway cron `0 6 * * 1` (adjust to UTC): `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/coaching-weekly` |

Users without email configured still see the review on the Coach page and the dashboard.

---

## 8. Screens

Phone-first, works on a laptop. The detailed visual spec is `docs/specs/ai-coaching-ui.md`; this section pins behaviour. Follow `docs/UI_GUIDE.md` and the shared design standards (pressed / disabled / loading states on every button, focus and error states on every input, spacing in multiples of 4).

### 8.1 Navigation

"Coach" → `/coach`, lucide `Sparkles` icon, in the sidebar `NAV` after Reports and in the mobile "More" sheet.

### 8.2 Dashboard `CoachCard`

Full width, placed after the Discipline Score card.

- Hidden when the owner switch is off or the user turned the coach off (the Coach page explains those states).
- Otherwise shows: the latest saved suggestions (title, priority chip, body, thumbs, "Make this my focus"); a collapsible "Repeated mistakes (last 30 days)" from the latest clusters note; the remaining count ("7 of 10 notes left today"); buttons "Get fresh suggestions" and "Find repeated mistakes" that call `POST /api/coaching/notes`.
- Empty state before the first note. Skeleton while loading.
- Demo desk: sample notes with a "Sample" badge; the buttons show the demo line.

### 8.3 Journal — summarise my day

A "Summarise my day" button in the page header opens a dialog:

- A date field that defaults to the latest trade day (`getLatestTradeDayKey`) and never allows a future day.
- Sends `POST` kind `day`.
- Shows summary, wins, mistakes, focus for tomorrow, a "Make this my focus tomorrow" button and thumbs.
- Honest error text inline (uses the message from the response).

### 8.4 Trade page (`/journal/[id]`)

A "Coach's note" card in the right column:

- Loads client-side after mount with `GET /api/coaching/notes?kind=trade&subject=<id>&limit=1` (no model call).
- Shows the saved note if one exists; otherwise an "Explain this trade" button that sends `POST` kind `trade`.
- Thumbs on the note.

### 8.5 `/coach` page

| Block | Behaviour |
|---|---|
| Status strip | switched on? notes left today, plan cap, link to Settings |
| This week's review | the latest weekly note. If none: "Your first review arrives Monday morning once you have a week of trades", or the on-demand button "Review last week now" (counts toward the daily cap) |
| Your focus | open items with Done / Dismiss / Add to checklist; done items collapsed |
| History | tabs All / Suggestions / Mistakes / Days / Trades / Weekly, newest first, each item expandable with thumbs and delete; "Load more" uses `before` |

Honest states:

- Owner switch off: "AI coaching isn't switched on for this site yet. Your scores and analytics work without it."
- User off: a link to switch it back on in Settings.
- Demo desk: samples with the "Sample" badge.

### 8.6 Settings — "AI coach" card

- Master switch (`coachingEnabled`).
- Tone: Gentle / Direct.
- Focus areas: five checkboxes (rules, sizing, emotions, journaling, consistency).
- "Weekly review" switch.
- "Email me the weekly review" switch, disabled with a note when email is not configured.
- A short "What is sent to the AI" explainer linking to `/privacy`.
- Saves through `PATCH /api/profile`, with inline saved/error status like `EmailWarnings`.

### 8.7 Privacy page — `src/app/(legal)/privacy/page.tsx`

The existing AI paragraph (around line 167) is replaced honestly. It must say:

- What is sent: summary numbers, "Rule N" labels, trade counts, your chosen tone and focus areas as fixed labels, and the coach's own previous focus sentence.
- What is never sent: the list in principle 3 (names, emails, ids, account names, symbols, prices, dollar P&L, custom rule names, notes, "why I entered" text, emotion text, screenshots, weekly-review answers).
- Coaching notes, your thumbs feedback and focus items are saved in your account until you delete them or your account.
- We keep counts and token totals per request (never content) for cost tracking.
- A weekly review is generated automatically on Mondays unless you turn it off in Settings.
- The demo desk sends nothing to the AI.

Update the "Outbound calls" line in `docs/CONVENTIONS.md` in the same change, because it currently says "aggregated discipline numbers only", and this feature also sends fixed tone/focus labels and the coach's own previous focus sentence.

### 8.8 Accessibility and styling

- Buttons have visible labels. Thumbs are icon buttons with `aria-label` and a tooltip.
- Loading uses the shared `Skeleton` with `aria-busy`.
- Status and errors use `role="status"` / `role="alert"`.
- All colours come from tokens (no hex, no `dark:`). Buttons carry `print:hidden`.
- All user-facing text is plain English; the app is English-only, so no dictionary is needed (Arabic is out of scope, section 9).

---

## 9. Out of scope (deliberately)

- Admin UI (usage is a secret-protected JSON route).
- Chat-style free-form coaching.
- Sending any journal text to the model.
- Editing focus text.
- Multiple providers.
- Per-account coaching filters.
- Coaching inside PDF reports.
- Arabic.

---

## 10. Env vars

All optional; all documented in `.env.example`, the README section "Enabling the env-gated pieces" and GO-LIVE.

| Variable | Default | Purpose |
|---|---|---|
| `AI_COACHING_ENABLED` | off | master switch (must be exactly `true`) |
| `ANTHROPIC_API_KEY` | none | needed together with the switch |
| `AI_MODEL` | `claude-sonnet-5-5` | model id |
| `AI_DAILY_CAP_FREE` | 3 | Starter notes a day |
| `AI_DAILY_CAP_PRO` | 10 | Pro notes a day |
| `AI_DAILY_CAP_ELITE` | 25 | Elite notes a day |
| `AI_DAILY_CAP_PER_USER` | unset | optional hard ceiling for every plan |
| `AI_DAILY_CAP_GLOBAL` | 500 | all users together per day |
| `AI_CACHE_HOURS` | 24 | cache window |
| `AI_PRICE_INPUT_PER_MTOK` | 3 | dollars per million input tokens (cost estimate) |
| `AI_PRICE_OUTPUT_PER_MTOK` | 15 | dollars per million output tokens (cost estimate) |
| `CRON_SECRET` | none | already exists; now also protects the weekly route and the usage route |

Email and push use their existing variables. After deploy, `prisma db push` adds two tables and nine columns and removes nothing.

---

## 11. Tests

Vitest, in `test/`, provider mocked exactly like `test/ai-coaching.test.ts`.

### `test/coaching-service.test.ts`

- Per-plan caps (free 3 / pro 10 / elite 25), env override, and the ceiling.
- A cache hit makes no call, writes no `AiUsage` row, and bumps `servedCount`.
- A changed fact produces a new call.
- `limits.dailyCap = null` skips the user gate but not the global one.
- The prompt payload contains the tone / focus labels and the previous focus text, but NOT a user id, email, symbol, rule name, journal note, whyEntered or emotion string planted in the fixtures.
- `summarizeWeek` shape.
- The `AiUsage` row is updated with kind and tokens.
- Disabled → no call. Demo → sample, no call, nothing saved. `no_data`.

### `test/coaching-routes.test.ts`

- Logged-out 401 on every route.
- Another user's trade → 404 and no call.
- Another user's note feedback / delete / focus → 404.
- Focus text is copied from the note (no free text accepted; bad path 400; trade note 400; 20-item cap 409; `addToChecklist` appends to the first active template and reports `no_template` / `full`).
- GET notes paging and the `subject` filter.
- Profile PATCH rejects an unknown focus area and tone.
- Export contains notes and focus.
- Usage route 503 / 401 / 200, numbers only.
- GET status never calls the provider.

### `test/coaching-weekly.test.ts`

- Cron route: 503 without a secret, 401 with a wrong one, 200 with the right one.
- Generates one note per eligible user for the finished week; skips users with no trades, coaching off, weekly off, already reviewed, or the demo desk.
- A second run generates 0 (idempotent).
- Email sent only when configured and the preference is on (mock `fetch`); push only when configured.
- Not charged to the user's daily cap.
- A `global_limit` stops the run early.

### Guardrail and existing suites

- A core-guarantee-style grep test asserts that no file under `src/lib/rules`, `src/lib/discipline` or `src/lib/analytics` imports `@/lib/ai`.
- Existing suites stay green, in particular `demo-read-only` (every new write route must call `refuseDemo(` and answer the 403 `code:"demo"` line), `plan-gating`, `ai-coaching`, `cross-user-isolation`, `landing-signup-cta`, `wording-guard`.

---

## 12. How we know it works (acceptance)

- With the switch off, every screen says so and no request ever reaches Anthropic (tests prove it).
- With it on, each button produces a note within about 20 seconds or an honest message.
- A second press within 24 hours with no new trades returns the same note instantly, and the remaining count does not drop.
- The Monday review appears on the Coach page (and in the inbox when email is on).
- Thumbs persist across reloads.
- A focus item marked done is mentioned in the next day or weekly note.
- The demo desk shows samples and never spends.
- "Download my data" contains the notes; deleting the account removes them.
- `npm run verify` is green.

---

## 13. Decisions for the owner (defaults chosen, easy to change)

| # | Decision | Default |
|---|---|---|
| 1 | Coaching on the free tier (3 a day) as a taster, or Pro and up only | free tier included; set `AI_DAILY_CAP_FREE=0` for Pro-only |
| 2 | Per-plan daily caps and the global cap | 3 / 10 / 25 and 500 a day |
| 3 | Coaching, the weekly review and its email on by default (opt-out in Settings), or opt-in | on by default |
| 4 | Token prices for the cost estimate | set `AI_PRICE_*` to the real price; also set a spend limit in the Anthropic console |
| 5 | Dashboard card hidden or greyed when the switch is off | hidden |
| 6 | Schedule the weekly job through Railway cron as well as the built-in Monday scheduler | built-in only until you choose |
