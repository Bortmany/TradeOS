# TradeOS Redesign — Design Brief (for owner approval)

**Date:** 2026-07-12 · **Status: awaiting your decision — no app code has been touched yet.**
Grounded in [`COMPETITOR_RESEARCH.md`](COMPETITOR_RESEARCH.md). Before-screenshots of every page: [`screenshots/before/`](screenshots/before/).

---

## 1. Recommended direction: **"Score-First Terminal"** (dark app, light marketing page)

Two moves, both straight from the research:

**Move 1 — The app stays dark, but the discipline score becomes the visual anchor of everything.**
Today the dashboard leads with a Net P&L tile and a big equity curve; the discipline score — the one thing no competitor has — sits in a side card. Research is unambiguous: the winning 2026 fintech dashboard pattern is "lead with the one number that matters," and for TradeOS that number is the score. Every competitor journal leads with P&L; leading with *discipline* is instant, visible differentiation. The dark "trading terminal" identity is confirmed as correct (it's the entrenched convention for trading tools and prosumer software) — so we keep it and refine it rather than replace it: calmer near-black, clearer elevation steps between panels, one blue accent doing all the signal work, green/red reserved strictly for P&L meaning.

**Move 2 — The marketing/landing page flips to light.**
The research found a consistent split among top-tier products: dark for tools you *operate*, light for pages you *read*. Linear, Stripe and Vercel all convert on bright, high-whitespace pages even when their products are dark. Bonus: real screenshots of our dark app sitting on a light page look striking and prove the product is real — and "you pay before you ever see the product" is the single biggest trust complaint against Tradezella. The landing page also gets rebuilt around the score: the hero shows a graded trade with its rule-by-rule pass/fail breakdown (our "show your work" answer to the AI-gimmick skepticism documented across the category), real app screenshots replace the current hardcoded fake blue chart, and the pricing section states the trial and refund terms in plain sight — the exact thing users punish competitors for hiding.

**Runner-up (not recommended): "All-dark evolution."** Same app refinements, landing stays dark and just gets polished. Cheaper, keeps one aesthetic everywhere — but it ignores the strongest conversion finding in the research and keeps us looking like every other dark trading-journal site.

**Explicitly deferred: a light mode for the app itself.** Doable later (the token system supports it) but it doubles the testing surface. Recommended as a separate follow-up project if you ever want it.

## 2. What you'll see change — token (color/style) table

Everything in the app is painted from ~30 named color variables in one file, so these small edits restyle all 13 pages at once. Plain-English description of each proposed change:

| Token | Now (dark) | Proposed | What you'll notice |
|---|---|---|---|
| Background | `224 30% 6%` | `228 18% 5%` | Deeper, calmer near-black — less blue tint, more "pro terminal" |
| Surface / raised / overlay | 8% / 11% / 13% lightness, same hue family | `227 16% 8%` / `226 15% 11%` / `225 15% 14%` | Panels step up from the background more clearly — you can *feel* the layers |
| Card border | `223 18% 17%` | `225 14% 16%` + subtle top-edge highlight on raised cards | Cards look crisper, less "flat gray box" |
| Primary (accent blue) | `215 90% 62%` | `217 91% 65%` | Slightly brighter, more electric blue — the single accent color |
| Profit green | `152 62% 46%` | unchanged | Green/red P&L meaning is sacred — untouched |
| Loss red | `356 75% 60%` | unchanged | " |
| Warning amber | `40 92% 56%` | unchanged | Used for score bands 60–79 |
| Radius | `0.625rem` | `0.75rem` on cards, `0.5rem` on controls | Slightly softer cards, slightly tighter buttons — more modern |
| Type scale | system font, one scale | same font, stronger contrast: bigger page titles, tighter small-caps labels | Clearer hierarchy without more decoration |
| NEW: score band tokens | — | `--score-high/-mid/-low` mapped to profit/warning/loss | Score colors become consistent everywhere the score appears |
| Landing page only | dark tokens | scoped light palette (white background, near-black text, same blue accent) | The marketing site reads like Stripe/Linear; the app stays a terminal |

No token is renamed or removed — only re-valued or added — so the PDF/print report styling cannot break.

## 3. Page-by-page: what changes

*(Before-screenshot named per page; "after" is described since it doesn't exist yet.)*

| Page | Before | What changes |
|---|---|---|
| **Landing** | `landing-desktop.png` | Full rebuild, light theme: score-led hero with the graded-trade card as the hero visual · real app screenshots replace the fake blue bar chart · "How the score works" methodology section · trust bar · pricing with explicit "14-day free trial, no card, cancel anytime" · one restrained motion moment |
| **Login / Register** | `login/register-*.png` | Polish only: new tokens, crisper card, same flow |
| **Dashboard** | `dashboard-desktop.png` | Biggest layout change: discipline score ring + its four sub-scores become the top-left anchor; P&L/win-rate/profit-factor tiles become a compact secondary row; equity curve keeps prominence below; violations list gets deduplicated visual weight; alerts styled by severity |
| **Trade Journal** | `journal-*.png` | Denser, cleaner table: tabular numerals everywhere, per-trade score chip with band color, better filter bar |
| **Journal detail** | `journal-detail-*.png` | "Chart workspace" feel: context chart first-class, rule-by-rule pass/fail breakdown made the star (it's the product's whole point) |
| **Analytics** | `analytics-*.png` | Flat small-multiples; no new gauges (research: gauges beyond the one score are an anti-pattern); consistent chart styling |
| **Rule Engine** | `rules-*.png` | Rulebooks presented as first-class objects with per-rule adherence meters |
| **Accounts** | `accounts-*.png` | Cleaner account cards, clearer live/prop distinction |
| **Prop Firm** | `prop-*.png` | Compliance meters (drawdown, daily loss, targets) with honest status colors — the research says prop compliance UI is a category-winning surface |
| **Reports** | `reports-*.png` | Restyle within existing structure; print/PDF output verified unchanged |
| **Import** | `import-*.png` | Import status as first-class honest UI (sync state, clear errors) — #1 documented complaint category-wide is import trust |
| **Settings / Billing** | `settings-*.png` | New tokens, plan cards match landing pricing style with recommended-tier highlight |
| **Empty states (all pages)** | — | Upgraded from decorative to *activating*: each explains what will appear + one clear next step (import → rulebook → score). Research ties this directly to higher activation |

## 4. What is NOT changing

- No features added or removed — this restyles what exists (feature ideas from the research are parked in the research doc's appendix for future specs).
- No data, database, pricing amounts, or API changes. No login/flow changes.
- Green = profit, red = loss stays absolute. Tabular number alignment stays.
- PDF/report printing keeps working (explicitly re-verified at the end).
- The app stays dark — no theme toggle this round.

## 5. The decision

**Approve "Score-First Terminal" (dark app refined + light landing page)?**
Options: approve as-is · approve but keep the landing dark (runner-up) · request changes.

After approval the build order is: colors/tokens → shared components → navigation → dashboard (the reference page) → remaining pages in three parallel batches → landing page last (so its screenshots show the *new* app) → design-system template published to Claude Design for the final visual check.
