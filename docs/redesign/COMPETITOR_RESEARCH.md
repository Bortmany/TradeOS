# Competitor Research — Synthesis

**Date:** 2026-07-12 · **Purpose:** ground the TradeOS UI/UX redesign in evidence about what works, what's missing, and what to avoid across the 7 main trading-journal competitors.

**How this was researched:** 8 parallel research passes (one per competitor + one market-landscape pass), from public sources only — marketing sites, pricing pages, help centers, Trustpilot/G2 summaries, comparison articles, YouTube listings. Nobody logged into any competitor product. **Method caveat:** direct page fetches were blocked by this environment's network policy, so findings come from search-engine snippets quoting those pages; every claim in the per-competitor reports is cited, and anything uncertain is marked "could not verify" there. Full reports with all sources: [`research/`](research/) — tradezella, tradersync, tradervue, edgewonk, tradesviz, chartlog, stonk-journal, landscape-trends.

---

## 1. The headline finding

**TradeOS's core idea — a per-trade, explainable 0–100 discipline score graded against the trader's own rulebook — is genuinely unclaimed territory.** Every one of the 7 competitors circles it without landing on it:

- **Tradezella**'s Zella Score is an aggregate *results* score (win rate, drawdown, profit factor) — not a per-trade audit against your own written rules.
- **TraderSync** tracks compliance % per rule but never rolls it into one explainable score; its AI is "a good analyst, not a coach."
- **Tradervue** has no rules construct at all — only free-form tags.
- **Edgewonk** is the closest in *positioning* (psychology/discipline-first) but its Tiltmeter is a self-reported mood score, and it has zero prop-firm tooling.
- **TradesViz** fragments "rules" across tags/plans/notes with no unifying score.
- **Chartlog** has a strategy object but no grading, no prop tools.
- **Stonk Journal** is the nearest mechanical competitor (10 rule types, real-time flags, weighted per-trade compliance score — on its free tier) but it's a generic rule library, not the trader's own rulebook, and not wired to prop-firm rules.

**Implication for the redesign:** the discipline score should become the visual anchor of the whole product — dashboard, journal, and landing page — because it's simultaneously the market gap and the thing our current UI treats as just one KPI tile among many.

---

## 2. Feature-gap matrix

✅ = has it · 🟡 = partial/weak · ❌ = absent

| Feature | Tradezella | TraderSync | Tradervue | Edgewonk | TradesViz | Chartlog | Stonk Journal | **TradeOS today** |
|---|---|---|---|---|---|---|---|---|
| Trade journal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Broker auto-sync | ✅ 500+ | ✅ 700+ claimed | ✅ ~80–300 | 🟡 MT4/5 only | ✅ 40+ | 🟡 ~10 | ❌ CSV on paid only | 🟡 connectors + CSV |
| Analytics depth | ✅ 50+ reports | ✅ 40+ metrics | ✅ 100+ reports (deepest) | ✅ 50+ stats | ✅ 500+ charts | 🟡 tiered | ✅ solid free | ✅ |
| Rules / playbook object | ✅ Playbook+Rules | 🟡 Strategy Checker | ❌ tags only | ✅ checklists | 🟡 plans/tags | ✅ Strategy | ✅ 10 rule types | ✅ **deterministic engine** |
| Explainable per-trade discipline score | 🟡 aggregate only | 🟡 per-rule % only | ❌ | 🟡 self-reported mood | ❌ | ❌ | 🟡 generic weighted score | ✅ **0–100, per trade — the differentiator** |
| Backtesting / replay | ✅ full | ✅ full | ❌ | 🟡 what-if on own history | ✅ full | 🟡 what-if | ❌ | 🟡 trade replay in journal |
| Prop-firm tools | ✅ PropFirm Sync (free) | 🟡 basic Evaluator | ❌ | ❌ | ✅ Challenge Mode | ❌ | 🟡 account tagging | ✅ prop tracker |
| AI features | ✅ Zella AI | ✅ Cypher | ❌ | ✅ Edge Finder | ✅ 4 features | ❓ | ✅ Pro coach | ❌ **by design (deterministic, explainable)** |
| Reports / sharing | ✅ | ✅ granular | ✅ public feed | 🟡 mentor link | ✅ public dashboard | ✅ social buttons | ✅ share links | 🟡 PDF reports, no sharing |
| Native mobile app | ✅ new | ✅ since 2017 | ❌ | ❌ | ✅ | ❌ | 🟡 PWA | 🟡 responsive + bottom tabs |
| Community | ✅ Discord 26k | ❌ | ✅ feed+leaderboard | ❌ | 🟡 Discord bot | ❌ | 🟡 public roadmap | ❌ |
| Free tier or no-card trial | ❌ pay first | ✅ 7d no card | ✅ free tier | 🟡 refund only | ✅ free tier | ✅ 7d trial | ✅ free forever | ✅ 14d no card |

**Pricing landscape:** $29–$49/mo is the standard band (Tradezella, TraderSync, Tradervue); TradesViz undercuts at $19.99–$29.99; Edgewonk flat $197/yr; Chartlog $14.99–$39.99; Stonk Journal free/$10. TradeOS's "priced like one good trade a month" framing fits the band. Three tiers with a highlighted "recommended" middle tier is the researched conversion norm (3-tier converts ~1.4× better than 2-tier; a highlighted tier is near-mandatory).

---

## 3. UI/UX patterns — ranked, tagged adopt / adapt / avoid

### Adopt (do this)

1. **Discipline score as the single visual anchor** *(app + landing)* — one prominent, well-explained composite gauge; everything else stays flat/compact. The "lead with the one number that matters" pattern is the strongest-supported 2026 fintech dashboard finding, and the score is our differentiator. A gauge is the *correct* pattern for exactly one composite score — and an anti-pattern everywhere else.
2. **Per-trade "show your work" breakdown** *(app + landing)* — rule-by-rule pass/fail with the score's arithmetic visible (Tradezella publishes Zella Score weights; we should exceed that transparency). This is also the antidote to the documented "AI coach = chatbot wrapper" skepticism: we show the work; they wave at a black box.
3. **Light, high-contrast marketing page decoupled from the dark app** *(landing)* — the "dark for structure/operation, light for reading/converting" split. Linear/Stripe/Vercel all convert on light-adjacent, high-whitespace pages even where their apps are dark. Traders *operate* the app but *read* the landing page.
4. **Monochrome + one accent palette discipline** *(both)* — the shared Stripe/Linear/Vercel principle. Reserve color for the single brand accent plus the non-negotiable green/red P&L semantics; kill decorative multi-hue. Also avoids the now-recognized "glowing dark KPI tile" cliché.
5. **P&L / discipline calendar as a dashboard centerpiece** *(app)* — the month-grid heatmap is the category's most expected component (Tradezella makes it the headline widget). We have `pnl-calendar`; elevate its treatment, and consider coloring by discipline as well as P&L (nobody does that).
6. **Instructive, action-oriented empty states** *(app)* — informational → one clear action → celebratory. Checklist-style first-run empty states are tied to measurably higher activation (~40% vs 25–30% norms). We already render EmptyState everywhere; upgrade them from "tasteful" to "activating" (dashboard empty state = mini onboarding path: import → rulebook → score).
7. **Tabular numerals everywhere financial data appears** *(app)* — already enforced via `.tabular`; keep it, it's a researched authenticity signal only ~16% of web fonts even support. Extend to the landing page's numbers.
8. **Named, marketed methodology for the score** *(landing)* — Edgewonk gives Tiltmeter its own page; Tradezella publishes score weights. Our landing page should have a dedicated "how the score works" section (deterministic, auditable, no AI in the loop) — the methodology *is* the marketing.

### Adapt (do a version of this)

9. **Import status as honest, first-class UI** *(app)* — sync bugs/"zombie trades" are the #1 technical complaint category-wide, and 37% of Tradezella's negative reviews are bugs. Our import page and topbar should surface sync state, partial-import warnings, and per-connector health clearly. (Visual treatment in scope; new sync features out of scope.)
10. **Four-level dark elevation system** *(app)* — dark themes need base → surface → nested → overlay as tokens, not ad-hoc near-blacks. We already have background/surface/raised/overlay; the redesign should make the steps visibly meaningful and consistent.
11. **Per-trade chart as a first-class object** *(app)* — Chartlog's most-praised feature is the trade detail as a charting workspace with entry/exit marked. We have `trade-context-chart` + replay; give the journal detail page that "workspace" feel within existing functionality.
12. **R-multiple / risk-unit display** *(app, light-touch)* — Tradervue's most defensible power feature. Where we already show R or risk, make it prominent; don't build new math this round.

### Avoid (documented failure modes)

13. **Gauge-ifying secondary metrics** — radial gauges beyond the one headline score are called "the worst skeuomorph in IT software" by dashboard critics. One ScoreRing; sparklines/bars/small-multiples for everything else.
14. **Dense-but-dated** — Edgewonk's #1 criticism ("desktop app from 2018", needs a video course to onboard) and Tradervue's ("stuck in 2012, spreadsheet-style"). Density is our deliberate identity; it must read as *modern terminal*, not *old software*. Hierarchy, spacing rhythm, and restraint are what separate the two.
15. **Dashboard overwhelm / widget sprawl** — "more charts = more powerful" is the named dead 2020-era strategy. Anchor + progressive disclosure beats 50 widgets.
16. **Sprawling thin marketing pages** — dozens of near-duplicate `/vs/x` and `/brokers/y` SEO pages (Tradezella, TradesViz, Tradervue all do this) dilute narrative. One tight, confident page.
17. **Decorative gradients/glow as substance** — flagged as a recognizable cliché in 2026 dashboard critique. Motion and gradient budget: one signature moment (hero), not everywhere.

---

## 4. Landing-page playbook (synthesized section order)

What the best pages in and adjacent to the category do, adapted to TradeOS:

1. **Hero** — light, high-whitespace, unapologetically specific copy to an expert audience (Linear pattern). Keep the current sharp positioning ("Not a journal. A discipline system.") but lead with the score: the hero visual should be a real-looking graded trade / score breakdown, not a generic stat grid. One signature motion moment max (Stripe pattern).
2. **Trust bar** — concrete, non-inflated numbers (Topstep pattern: "$1B+ paid out"). For us: brokers normalized, rules evaluated, deterministic engine — specificity over user-count bragging we can't back.
3. **"How the score works"** — the methodology section (deterministic rule engine → per-trade grade → explainable score). This is the differentiator section nobody else can honestly write; the graded-trade card we already have is the right idea, elevated.
4. **Product tour** — 2–3 real app screenshots (dark app on light page creates strong contrast and shows the actual product — the #1 thing skeptical traders want to see before paying; "pay before you see it" is the category's biggest trust complaint).
5. **Feature grid** — current 6 cards are right; tighten copy against the matrix above (lead with what's rare: discipline score, prop tracker, deterministic engine).
6. **Pricing** — 3 tiers, highlighted recommended middle tier, monthly/annual toggle if cheap to add, and **explicit trial + refund terms** (the single most complained-about trust gap at Tradezella/TraderSync: "no refunds," "pay before you see it," auto-charging trials). "14-day free trial, no card" is a genuine weapon — say it louder.
7. **Final CTA** — current "Stop guessing why you're not consistent" is on-strategy; keep the sharp single line.
8. **Footer** — keep the honest disclaimer.

---

## 5. Complaint themes → TradeOS counter-positioning

| What the market hates (documented) | How TradeOS answers it (presentation-level, this redesign) |
|---|---|
| Pricing opacity: no trial, hidden refund terms, auto-charging trials, "all sales final" | Trial + refund terms stated plainly on the pricing section, not buried |
| Broker-sync bugs, zombie trades, P&L that disagrees with the broker | Honest import/sync status UI; "deterministic, auditable" messaging front and center |
| "AI coach" gimmick skepticism — "a chatbot with a trading prompt pasted in front" | "No black box. Every score explainable to the cent." — explainability as the hero claim |
| Dashboard overwhelm | One anchor (score), progressive disclosure, flat compact secondary charts |
| Dated dense UIs (Edgewonk, Tradervue) | Modern terminal: same density, better hierarchy — the "dense AND modern" lane is empty |
| Steep learning curves with weak docs | Activating empty states that teach the import → rulebook → score path in-product |

---

## Appendix — Future feature opportunities (explicitly OUT of scope for this redesign)

The matrix surfaced product gaps worth a future spec via product-manager. **None of these are built in this redesign** — this branch changes presentation only (no `src/lib`, API, or schema changes):

1. **Real-time at-entry rule flagging** (Stonk Journal ships it free) — flag violations while the trade is being logged, not just after.
2. **Prop-firm rulebook presets** — score wired to a specific firm's actual rules (consistency %, trailing drawdown, payout eligibility). Every competitor leaves this open; TradesViz's Challenge Mode is the nearest.
3. **Privacy-aware sharing** — revocable share links, hide-P&L screenshot mode (TradesViz/Stonk Journal patterns); drives word-of-mouth in Discords.
4. **"What-if" retro-analysis** — "what if you'd skipped every trade scoring under 60?" (Edgewonk Backtester pattern; cheap relative to full replay, on-brand for discipline.)
5. **Rule-adherence ↔ performance correlation report** — the delta between rule-following and rule-breaking trades as a headline report (Tradezella/Edgewonk pattern).
6. **Broker-sync breadth + a bulletproof CSV fallback** — table stakes; biggest documented churn driver category-wide.
7. **Native mobile** — TraderSync's decade-old advantage; several rivals still lack it.
