# Competitor research: Chartlog (chartlog.com)

Research date: 2026-07-12. Compiled entirely from public sources — marketing pages, third-party review sites, and search-engine summaries of those pages. **Direct page fetches were blocked** (chartlog.com, Trustpilot, and every third-party review site returned HTTP 403 to this session's fetch tool), so facts below come from search-engine synthesis of those pages rather than a first-hand read. Everything is sourced; anything I could not corroborate across at least one source is flagged "could not verify."

**Important naming caveat:** there are two visually similar products in play — **chartlog.com** ("#1 Journaling and Analytics Software for Traders," founded 2019, US-equities focus, TradingView-per-trade charts, tiered Lite/Standard/Pro pricing) and **chartlog.ai** ("The AI-Powered Trading Journal," screenshot-based trade capture, an AI coach built on Claude). Search results kept blending the two. I could not confirm whether chartlog.ai is the same company's new AI product line or an unrelated/copycat site. **This report is scoped to chartlog.com** as instructed; where a search result's "AI features" claim clearly traced back to chartlog.ai, I excluded it rather than risk attributing it to the wrong product. TradeOS should treat the chartlog.ai overlap itself as a data point — a rival is already staking out "AI-powered trading journal" branding in this space.

---

## 1. Positioning & pricing

Chartlog positions itself as a clean, analytics-first trade journal for **active US equity/options day and swing traders**, built by traders (founders Adrian Campos and Igor Milivojevic, who reportedly met through the Bear Bull Traders trading community and merged independent efforts into Chartlog in 2019). [Trading-Journals.com review](https://trading-journals.com/reviews/chartlog) [Chartlog homepage](https://www.chartlog.com/)

Three paid tiers, no free-forever tier, but every tier gets a 7-day free trial (no credit card mentioned in one summary, worth re-verifying at signup):

- **Lite — $14.99/mo** (10% off annual): unlimited trade journaling, unlimited automatic account imports, trade journal + interactive/TradingView charts. No strategy/advanced analysis tools.
- **Standard — $29.99/mo** (15% off annual): adds the strategy-tagging system and basic performance-interpretation tools.
- **Pro — $39.99/mo, or ~$19.99/mo billed annually** (20% off annual, annual total reported as $239.88/yr): adds the deepest statistics/reports — breakdowns by day-of-week, strategy-tag combinations, custom report building, and (per one source) up to 15 years of historical data.

Source: [BullishBears Chartlog review](https://bullishbears.com/chartlog-review/), [Trading-Journals.com review](https://trading-journals.com/reviews/chartlog), [Chartlog pricing page](https://www.chartlog.com/pricing/) (page itself returned 403 to direct fetch; figures above are cross-corroborated across two independent review sites).

Target audience: explicitly narrow — active **US equities/options** traders on a short list of retail/prop-adjacent platforms (see broker list below). No mention anywhere in marketing or reviews of futures, forex, or crypto support, and no dedicated prop-firm compliance tooling was found (see section 2). This makes Chartlog's addressable audience noticeably narrower than TradeOS's funded/prop + live day-trader target if TradeOS covers futures/forex prop firms.

---

## 2. Feature inventory (vs. canonical list)

| Feature | Chartlog.com status | Detail |
|---|---|---|
| Trade journal | **Yes** | Core product; unlimited trades, notes, tags. |
| Broker auto-import/sync | **Yes, but narrow** | Automatic sync via login-based connection for a confirmed list of ~10 brokers/platforms: DAS Trader, E*TRADE, Interactive Brokers (TWS), Merrill Edge, Tastytrade, TD Ameritrade, Thinkorswim, TradeStation, TradeZero, Webull. Manual CSV/log-file upload and manual entry are fallbacks for unsupported brokers. Reviewers repeatedly flag this list as thin next to Trademetria (140+) or TraderSync (700+). [Sourceforge](https://sourceforge.net/software/product/Chartlog/), [BullishBears](https://bullishbears.com/chartlog-review/) |
| Analytics | **Yes, tiered** | Lite = basic charts; Standard/Pro unlock deeper stats (win rate by day-of-week, strategy-tag breakdowns, custom reports). Reviewers note **MFE/MAE (max favorable/adverse excursion) and exit-efficiency metrics are NOT available** — a real analytical gap versus category leaders. [Trading-Journals.com](https://trading-journals.com/reviews/chartlog) |
| Playbooks/rules engine | **Yes — "Strategy" system** | Chartlog's most differentiated feature per reviewers: define a strategy as specific market conditions + entry trigger + exit rule, tag every trade to a strategy, and track performance per-strategy over time. Gated behind Standard/Pro. [BullishBears](https://bullishbears.com/chartlog-review/) |
| Backtesting | **Partial — "what-if" strategy replay** | Reviewers describe the ability to modify a strategy definition and see, retroactively, what impact that change would have had on past trades — a strategy-tweak simulator rather than true historical/market backtesting. [Medium review](https://medium.com/@brianomondi579/chartlog-review-04d1cff40344) |
| Prop-firm tools | **Not found / likely absent** | No drawdown-limit tracking, challenge/evaluation compliance, or multi-account prop rules found anywhere in marketing or reviews — unlike dedicated prop journals (TradesViz, TradeZella, JournalPlus) that explicitly market challenge/compliance tracking. Treat as a confirmed gap, not just "could not verify," since multiple comparison searches turned up nothing for Chartlog specifically while surfacing competitors' prop features readily. |
| AI features | **Could not verify for chartlog.com** | Some search results describing an "AI coach" (built on Claude/Anthropic, screenshot capture, discipline-pattern insights) trace to **chartlog.ai**, not chartlog.com — see naming caveat above. No credible source ties AI coaching to chartlog.com's own product pages. |
| Reports/sharing | **Yes** | Custom reports (Pro tier). One-click social sharing of a journal entry (with its TradingView chart) to Twitter/X, Facebook, LinkedIn, Reddit, WhatsApp. [BullishBears](https://bullishbears.com/chartlog-review/) |
| Mobile app | **No native app** | Web-based only; no iOS/Android app found in any review or app-store search. Reviewers contrast this with TraderSync, which does ship native apps. |
| Community | **No** | Explicitly called out by at least one reviewer as lacking social/community features (no leaderboard, no public trader feed) — contrasted with Profit.ly, which has a leaderboard. |
| **Novel/differentiated** | **Per-trade TradingView charting** | Called out repeatedly as best-in-class for the price tier: every imported trade gets a full TradingView chart with entry/exit auto-marked, 100+ indicators, configurable per-trade or globally. This is Chartlog's clearest visual signature. [Trading-Journals.com](https://trading-journals.com/reviews/chartlog) |

---

## 3. Onboarding & first-run

Reconstructed from Chartlog's own course/help pages (titles surfaced via search — page bodies could not be fetched directly) and review summaries:

1. **Signup** — free account creation, upgrade to a paid plan when ready; 7-day trial on any plan. [Chartlog homepage via search](https://www.chartlog.com/)
2. **"Introduction — Let's get started!"** — an onboarding course page exists at chartlog.com/course/introduction/, suggesting a guided first-run flow rather than dropping users straight into an empty dashboard. [Chartlog course index](https://www.chartlog.com/course/introduction/)
3. **"Import your trades"** — a dedicated course page walks through connecting a broker: log in to the broker directly inside Chartlog for automatic sync (sync can lag until the broker releases end-of-day data, "might happen overnight"), or export/upload a log file, or enter trades manually if the broker isn't on the supported list. [Chartlog import course](https://www.chartlog.com/course/import-your-trades/), [Chartlog integrations page](https://www.chartlog.com/integrations/)
4. **First value** — once trades are imported, the reviewed first-value moment is seeing the auto-generated TradingView chart per trade with entry/exit marked, then the dashboard's day-of-week / time-of-day performance breakdown.
5. Chartlog also publishes an "Ultimate guide to Journaling" as top-of-funnel content marketing, reflecting a content-led acquisition strategy layered on top of the product itself. [Trading-Journals.com](https://trading-journals.com/reviews/chartlog)

Could not verify exact screen-by-screen signup flow, whether email verification/2FA is required, or whether the trial requires a card — sources conflict/are silent on the card requirement.

---

## 4. Landing page teardown

Direct fetch of chartlog.com was blocked (403), so this section is reconstructed from page titles, meta descriptions, and third-party quoting of on-page copy — treat structural/ordering claims as lower-confidence than the pricing and feature facts above.

- **Hero headline(s), by page:** the site appears to run multiple headline variants/A-B tests (a `landing-pages/landing-page/?ab_test_id=3` URL exists). Variants surfaced: *"Find your edge with the most advanced trader analytics"*, *"Find your best strategy and win consistently,"* and a homepage meta framing of *"#1 Journaling and Analytics Software for Traders."* The journal product page uses *"a feature packed journal to help you trade smarter"* and *"Import your trades and improve your performance."* [Chartlog homepage](https://www.chartlog.com/), [Chartlog A/B landing page](https://www.chartlog.com/landing-pages/landing-page/?ab_test_id=3), [Chartlog journal product page](https://www.chartlog.com/product/journal/)
- **Copy strategy:** benefit-led and outcome-framed ("find your edge," "win consistently," "improve your performance") rather than feature-led; secondary lines drill into specifics ("gain deeper insights... to see what really works," "analyze your data to find your best strategy").
- **Social proof:** testimonial-style quotes from traders are used on-page (one surfaced quote: "Consistent journaling is one of the most important things to improve your trading. Chartlog is one of the best tools for journaling that every trader needs.") — could not verify whether these are named/attributed traders, video testimonials, or anonymous quote cards, nor whether logos of trading communities/brokers appear as trust badges.
- **Screenshot usage:** based on repeated reviewer commentary about the "stunning," "eye-catching," dashboard, the landing page very likely leads with product screenshots of the dashboard and per-trade TradingView charts as its primary visual proof — this is consistent with a product whose main differentiator (charting) is inherently visual, but could not directly confirm exact placement/cropping.
- **CTA placement:** could not verify exact button copy/placement from the blocked fetch; the existence of a dedicated `/register` app URL (app.chartlog.com/register) and pricing-page-first funnel (Lite/Standard/Pro cards with "start free trial" implied) suggests a fairly standard SaaS pattern of hero CTA → pricing CTA → trial signup.
- **Aesthetic:** marketing site itself is not confirmed dark or light from sources (unlike the in-app UI, which is consistently described as clean/light/minimal — see section 5). Treat marketing-site color theme as **could not verify**.

---

## 5. In-app UI patterns worth noting

All from screenshots described secondhand in reviews, not direct observation — treat as directionally reliable but not pixel-exact.

- **Overall aesthetic:** consistently described across multiple independent reviews as "one of the cleanest analytics platforms on the market," "clean and modern," "stunning and organized," with a "gentle learning curve." This is the opposite end of the density spectrum from TradeOS's dark/dense/terminal-style target aesthetic — Chartlog's whole brand bet is visual simplicity over information density.
- **Dashboard composition:** described as surfacing an at-a-glance view of gains/losses over a selected period, with drill-down ("just a click") into deeper stats. Explicit call-outs for day-of-week and time-of-day performance breakdowns as dashboard-level cuts.
- **Per-trade chart treatment:** the standout pattern — every trade record embeds a full TradingView chart with entry and exit points auto-plotted on it, chart type/timeframe/indicators configurable per-trade or as a global default, 100+ indicators available. This effectively makes the "trade detail" view a first-class charting workspace rather than a data table with a thumbnail.
- **Filtering:** dashboard supports filtering trades (implied by-strategy, by-date, possibly by-symbol) — exact filter UI not confirmed.
- **Navigation model, color semantics (win=green/loss=red conventions), and P&L calendar/heatmap treatment:** **could not verify.** No source described a calendar view specifically for Chartlog (contrast: this is a signature widget for competitors like TradeZella/TraderSync); its absence from every review's feature list is notable but not conclusive proof it doesn't exist.
- **Mobile:** no native app; web-only, so no distinct mobile UI pattern to report.

---

## 6. What users complain about

Direct review-aggregator pages (Trustpilot, G2, Capterra) either don't have a Chartlog listing or were blocked from fetch — **review coverage for this product is genuinely thin**, consistent with Chartlog being a smaller player. No first-hand Reddit threads (r/Daytrading or otherwise) turned up in search. Complaints below are drawn from third-party review-site *summaries*, not verified user-review quotes, and should be treated as the weakest-sourced section of this report:

- **Narrow broker/integration list.** The most consistently repeated criticism: ~10 supported brokers/platforms vs. 140+ (Trademetria) or 700+ (TraderSync). Traders on unsupported brokers are pushed to manual CSV upload or manual entry. [BullishBears](https://bullishbears.com/chartlog-review/), [Trading-Journals.com](https://trading-journals.com/reviews/chartlog)
- **Missing analytics depth.** No MFE/MAE (max favorable/adverse excursion) tracking, no exit-efficiency analysis — cited as a real limitation for traders who rely on those metrics to refine trade management. [Trading-Journals.com](https://trading-journals.com/reviews/chartlog)
- **Support hours.** Live chat only during business hours; no 24/7 support, which is flagged as a pain point for international traders outside US time zones. [Trading-Journals.com](https://trading-journals.com/reviews/chartlog)
- **No mobile app.** Called out as a gap relative to competitors like TraderSync.
- **Asset-class ceiling.** No futures/forex/crypto support — traders who trade those instruments "will exhaust Chartlog's scope immediately" per one review's own phrasing. [BullishBears](https://bullishbears.com/chartlog-review/)
- **No community/social layer.** Noted as a downside for traders who want peer benchmarking or a shared feed (contrasted with Profit.ly's leaderboard).

**Could not verify:** an aggregate Trustpilot/G2/Capterra star rating, review volume, or any direct verbatim complaint quotes — none of those review-platform pages had a confirmed Chartlog listing or were fetchable in this session. If accurate review sentiment matters for a go/no-go decision, this should be re-checked by a session with working direct fetch access to Trustpilot/G2/Capterra.

---

## 7. Verdict

**Three things TradeOS should replicate:**

1. **Make the per-trade chart a first-class object, not an attachment.** Chartlog's single most-praised feature is that every trade opens into a full charting workspace (TradingView, entry/exit auto-marked, configurable indicators) rather than a data row with a static image. TradeOS's discipline-score model already forces a "why" narrative per trade — pairing that explanation with an equally rich, interactive chart view (even if styled dark/terminal rather than light) would combine Chartlog's best UX idea with TradeOS's analytical edge.
2. **A visible, definable "strategy"/rules object that every trade gets tagged against, with per-strategy performance rollups.** This maps almost directly onto TradeOS's rulebook concept — Chartlog validates that traders want to *define* rules once and see aggregated compliance/performance against them, which is TradeOS's core premise. Worth studying their specific fields (market condition, entry trigger, exit rule) as a baseline schema.
3. **Guided first-run via an explicit "introduction" + "import your trades" course-style onboarding**, rather than dropping users into an empty dashboard. Given TradeOS's product depends entirely on data being imported and rules being defined before the score means anything, a similarly explicit onboarding path (not just an empty state) reduces time-to-first-value.

**Three things to avoid:**

1. **Don't ship a narrow, login-based broker integration list as the primary import path without a strong manual/CSV fallback story.** Chartlog's #1 recurring complaint is exactly this — ~10 brokers is a constant source of friction and lost prospects. TradeOS should treat broker coverage (or a bulletproof generic CSV/API import) as a table-stakes investment, not an afterthought.
2. **Don't leave out advanced trade-quality metrics (MFE/MAE, exit efficiency) if the product's promise is "explainable" analysis.** Chartlog's own gap here is called out by reviewers as undermining traders who want deeper trade-management insight — exactly the kind of metric a discipline/grading product should include by default, not treat as a stretch goal.
3. **Don't rely on business-hours-only support if targeting funded/prop and live day traders**, who trade pre-market, at odd hours, and across time zones — this is a specifically cited pain point for a very similar audience.

**One gap TradeOS could own:** **prop-firm compliance and challenge tracking.** Chartlog has no visible drawdown-limit tracking, daily-loss-limit alerts, consistency-rule math, or multi-account challenge/funded management — the exact toolkit that dedicated prop-journal competitors (TradesViz, TradeZella, JournalPlus) build entire product lines around, and that funded/prop traders (TradeOS's stated target) need most. Since TradeOS already grades trades against a rulebook, extending that same rules engine to formal prop-firm evaluation rules (trailing drawdown, daily loss floor, consistency rule, minimum trading days) would be a natural, low-marginal-cost extension that Chartlog does not offer at all — a clear differentiation lane against a competitor whose own marketing doesn't even mention prop firms.

---

## 8. Sources

- https://www.chartlog.com/ (homepage — direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/pricing/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/product/journal/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/product/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/integrations/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/course/introduction/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/course/import-your-trades/ (direct fetch blocked, used via search-engine synthesis)
- https://www.chartlog.com/landing-pages/landing-page/?ab_test_id=3 (direct fetch blocked, used via search-engine synthesis)
- https://app.chartlog.com/register , https://app.chartlog.com/login , https://app.chartlog.com/s/kHhGq (app URLs referenced by search, not fetched)
- https://trading-journals.com/reviews/chartlog (direct fetch blocked, used via search-engine synthesis)
- https://bullishbears.com/chartlog-review/ (direct fetch blocked, used via search-engine synthesis)
- https://rizetrade.com/chartlog-review (direct fetch blocked, used via search-engine synthesis)
- https://daytradereview.com/chartlog-review/ (direct fetch blocked, used via search-engine synthesis)
- https://www.asmarterchoice.org/chartlog-review/ (direct fetch blocked, used via search-engine synthesis)
- https://medium.com/@brianomondi579/chartlog-review-04d1cff40344 (direct fetch blocked, used via search-engine synthesis)
- https://tradingreview.net/chartlog-review/ (referenced via search, not independently fetched)
- https://journalplus.co/compare/journalplus-vs-chartlog/ and https://journalplus.co/alternatives/chartlog/ (competitor comparison pages referencing Chartlog; referenced via search only)
- https://sourceforge.net/software/product/Chartlog/ (direct fetch blocked, used via search-engine synthesis)
- https://slashdot.org/software/p/Chartlog/ (referenced via search, not independently fetched)
- https://www.chartlog.ai/ (referenced for the naming-collision caveat only; explicitly NOT used as a source for chartlog.com's feature claims)
- https://www.trustpilot.com/review/chartlog.com (attempted — no confirmed listing found / fetch blocked)

**Note on methodology:** WebFetch (direct page retrieval) returned HTTP 403 for every URL attempted in this session, including unrelated control URLs (Trustpilot, Wikipedia), indicating a session-level or proxy-level block rather than site-specific bot protection. All findings above are therefore drawn from WebSearch's built-in page-reading/synthesis rather than this agent's own direct reads of the pages — a meaningfully weaker sourcing chain than direct fetch, though each search response did cite its underlying URLs, which are reproduced above. If a follow-up session has working direct fetch, re-verifying the pricing page, the Trustpilot/G2/Capterra listings, and the landing-page screenshots directly would raise confidence on sections 1, 4, and 6 specifically.
