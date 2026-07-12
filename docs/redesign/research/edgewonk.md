# Competitor Research: Edgewonk (edgewonk.com)

Research method: public marketing pages, help-center (Zendesk) articles, third-party review sites, forum threads (Forex Factory, Bear Bull Traders, Trade2Win) and YouTube video listings, gathered via web search summaries (direct WebFetch to edgewonk.com and most third-party review domains returned HTTP 403 in this session — all claims below are backed by the search-result URL cited, and anything not independently confirmed is flagged "could not verify"). All facts are dated to what these sources report "as of 2026" search snapshots.

---

## 1. Positioning & pricing

- **Category positioning**: Edgewonk markets itself as a psychology-first trading journal and "behavioral analytics" tool, not just a P&L tracker — its own copy says it's built by professional traders and is meant to show traders *why* they are losing money, not just that they lost. ([edgewonk.com](https://edgewonk.com/), [tradingjournal.com review](https://tradingjournal.com/review/edgewonk))
- **Target audience**: active/serious traders across forex, futures, stocks, crypto, CFDs and options — repeatedly described as for "process-driven" traders willing to do manual, detailed logging, rather than casual retail users. Some sources single it out as popular with forex traders and funded/prop traders, though it has no prop-firm-specific features (see Section 2). ([bullishbears.com](https://bullishbears.com/edgewonk-review/), [tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/))
- **Pricing model — this is now a subscription, not the old one-time fee**: Sources conflict because Edgewonk changed its model. Older reviews and even Edgewonk's own legacy references describe a one-time lifetime-license fee of **$169** (UK/VAT customers $202.80). Newer 2026-dated sources report Edgewonk has since moved to **flat annual pricing of $197/year** (~$16/month, no tiers), with a **24-month option at $297**, and existing legacy customers grandfathered ("lock in your price for life" messaging survives from the old model). There is no tiered plan structure in either era — one price, all features included. ([edgewonk.com/pricing](https://edgewonk.com/pricing), [bullishbears.com](https://bullishbears.com/edgewonk-review/), [tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/), [traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **Free trial**: Sources conflict here too — some describe a free trial/free account flow ("How can I get my free account?" is an actual help-center article title), others state flatly there is no free trial or demo and you must pay to start. Could not verify which is currently accurate; treat as unresolved. ([edgewonk.zendesk.com](https://edgewonk.zendesk.com/hc/en-us/articles/360013434420-How-can-I-get-my-free-account-))
- **Money-back guarantee**: 14-day, no-questions-asked, 100% refund. Consistently reported across sources. ([bullishbears.com](https://bullishbears.com/edgewonk-review/))
- Overall, reviewers frame Edgewonk as "the cheapest premium trading journal" and its main differentiator vs. subscription rivals (TradeZella, TraderSync) used to be the one-time fee — several 2026 reviews note this pricing-power advantage has now eroded since the move to annual billing. ([tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/), [traderssecondbrain.com/guides/tsb-vs-edgewonk](https://traderssecondbrain.com/guides/tsb-vs-edgewonk))

## 2. Feature inventory (vs. canonical list)

| Feature | Present? | Detail |
|---|---|---|
| **Trade journal** | Yes | Core product; manual entry plus import; supports forex, futures, stocks, crypto, CFDs, options. Setup/Trading Plans let you log an idea before execution, then move it to the Journal (if taken) or "Missed Trades" (if not). ([edgewonk.zendesk.com/Trading-Plans](https://edgewonk.zendesk.com/hc/en-us/articles/7772564128786-Trading-Plans)) |
| **Broker auto-import/sync** | Partial | Full **automatic sync** only for MetaTrader 4/5 (real, demo, or funded accounts). Everything else (60+ named platforms — DAS Trader, Interactive Brokers, NinjaTrader, Rithmic, TradeStation, Tradovate, Thinkorswim, TD Ameritrade, Schwab, Fidelity, E-Trade, Tastytrade, Oanda, Forex.com, cTrader, Bybit, Coinbase, FTMO, Topstep X, Lightspeed, Sterling Pro, Webull, Cobra Trading, Sierra Charts, Jigsaw Trading, Quantower, etc.) is **CSV import**, described by one reviewer as manual: export from broker, reformat columns, import. ([edgewonk.com/import](https://edgewonk.com/import), [edgewonk.com/blog/metatrader-sync-edgewonk](https://edgewonk.com/blog/metatrader-sync-edgewonk), [traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative)) |
| **Analytics** | Yes, extensive | 50+ stats, 17+ charts, custom stats/tags (20 custom tag categories reported), periodic report cards, Year Heatmap (GitHub-style 365-day view), P&L calendar with green/red day coloring. ([tradesviz.com](https://www.tradesviz.com/brokers/Edgewonk), one search snippet re: Year Heatmap) |
| **Playbooks/rules engine** | Yes | "Setup Checklists" — define entry conditions/market context/risk parameters per setup, mark which criteria were met per trade, and a "Checklist Performance" report correlates adherence with results. Plus a general Trading Plans feature. ([edgewonk.com/blog/trading-checklists-update](https://edgewonk.com/blog/trading-checklists-update), [edgewonk.zendesk.com/Trading-Plans](https://edgewonk.zendesk.com/hc/en-us/articles/7772564128786-Trading-Plans)) |
| **Backtesting** | Partial / unusual approach | No market-replay/trade-replay engine and no historical-data backtester. Instead, a "Backtester" tab that **replays "what if" modifications against your own logged trade history** (e.g., "what if I moved stop-loss 5 ticks tighter on all trades" or "what if I skipped trades where Tiltmeter > 7") and shows retroactive P&L impact. Reviewers explicitly note this is not the same as TradeZella/TraderSync's trade replay. ([edgewonk.com/blog/update-backtester-tab](https://edgewonk.com/blog/update-backtester-tab), [traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative)) |
| **Prop-firm tools** | No | Multiple reviewers state plainly Edgewonk predates the prop-firm boom and has **no prop-firm-specific features** (no challenge/rule-compliance tracking, no payout tracking) despite FTMO/Topstep X import support existing. ([fortraders.com](https://www.fortraders.com/blog/tools-funded-trader-using) via search summary) |
| **AI features** | Yes, recently added | "Edge Finder" — launched Jan 6, 2026. Runs automatically every Sunday, statistically analyzes all tracked variables (asset class, time of day, day of week, size, setup, holding duration, market conditions, custom tags, and Tiltmeter emotional data) to surface which combinations are statistically significant (positive or negative), delivered as a weekly email report — not an interactive chat assistant. Reviewers note Edgewonk had *no* AI before this and was behind rivals until Edge Finder shipped. ([edgewonk.com/edge-finder](https://edgewonk.com/edge-finder), [edgewonk.com/blog/edgewonk-edge-finder](https://edgewonk.com/blog/edgewonk-edge-finder)) |
| **Reports/sharing** | Yes, notable | "Mentor Mode" generates a private, read-only shareable link to your journal for a coach/accountability partner — not a public social-share feature. Data export is Excel-only via the Journal tab's export button, and export explicitly does **not** include screenshots/notes. Could not verify PDF export exists. ([search summary re: Mentor Mode], [edgewonk.zendesk.com/Export-journal-data](https://edgewonk.zendesk.com/hc/en-us/articles/14639571465362-Export-journal-data)) |
| **Mobile app** | No native app | No iOS/Android app. Edgewonk 3 (launched Feb 2024) is a responsive web app (edgewonk.app) usable in a mobile browser, but reviewers say the full feature set is desktop-optimized; the older Edgewonk 2 was a **Java desktop application** with no cloud sync at all. ([edgewonk.zendesk.com/Can-I-use-Edgewonk-from-my-phone](https://edgewonk.zendesk.com/hc/en-us/articles/360010149699-Can-I-use-Edgewonk-from-my-phone), [traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative)) |
| **Community** | No official community | No Discord/Slack/forum run by Edgewonk itself — Mentor Mode substitutes for coach-sharing instead of peer community. Discussion instead happens organically on third-party forums (Forex Factory threads, Bear Bull Traders, Trade2Win). A same-named "Edge" Discord exists but is reported as an unrelated community. ([forums.bearbulltraders.com](https://forums.bearbulltraders.com/topic/530-edgewonk-trading-journal/), [forexfactory.com thread 532955](https://www.forexfactory.com/thread/532955-be-profitable-with-edgewonk-your-professional-trading)) |
| **Novel/signature feature — Tiltmeter** | Yes | Their flagship psychology tool: after each trade you log an emotional-state score (patient/impulsive/fearful/overconfident, etc.) plus notes; Edgewonk correlates this against win rate and P&L over time, surfacing when tilt gets costly (after losses, during news events, early mornings) and whether stress helps or hurts. This is the feature most reviewers single out as unique to Edgewonk vs. competitors. ([edgewonk.com/trading-psychology](https://edgewonk.com/trading-psychology), [edgewonk.zendesk.com/The-Tiltmeter](https://edgewonk.zendesk.com/hc/en-us/articles/360010150259-The-Tiltmeter), [edgewonk.com/blog/mastering-trading-discipline-with-edgewonks-tiltmeter](https://edgewonk.com/blog/mastering-trading-discipline-with-edgewonks-tiltmeter)) |
| **Other novel feature — Session reviews** | Yes | Daily/weekly/monthly structured review with report cards, reflection prompts and "lesson" tracking of what happened and what to work on next. (search summary, no single canonical URL beyond edgewonk.com/features) |

## 3. Onboarding & first-run

Could not directly browse the signup flow (edgewonk.com blocked WebFetch in this session), so this is reconstructed from help-center article titles and third-party descriptions:

1. **Signup**: enter email, agree to Terms/Privacy; described elsewhere as "very simple." A separate help article "How can I get my free account?" exists, suggesting some free/trial tier historically. ([edgewonk.zendesk.com](https://edgewonk.zendesk.com/hc/en-us/articles/360013434420-How-can-I-get-my-free-account-))
2. **Login/access**: users go to edgewonk.app (the Edgewonk 3 web app) to log in; confirmation emails can take up to ~5 minutes. (search summary)
3. **First trades in**: either import (MT4/MT5 auto-sync, or CSV from 60+ other platforms) or manual entry. A dedicated YouTube video ("How to add a trade in Edgewonk — Import vs Manual") walks through both paths. ([youtube.com/watch?v=CEfcEUYhvuk](https://www.youtube.com/watch?v=CEfcEUYhvuk))
4. **Guided ramp-up**: Edgewonk offers a structured "Journaling Course" — a multi-video program that walks a new user from initial setup, through entering trades, to using the analytical features (Tiltmeter, checklists, custom stats). There's also a "First Steps in Edgewonk — Get Started" video (published ~March 2024) and an official YouTube channel with short explainer videos per tab/feature. ([edgewonk.com/course](https://edgewonk.com/course), [edgewonk.zendesk.com/Edgewonk-videos-and-course](https://edgewonk.zendesk.com/hc/en-us/articles/11558941403410-Edgewonk-videos-and-course), [youtube.com/watch?v=AJ9u6cJyJ14](https://www.youtube.com/watch?v=AJ9u6cJyJ14))
5. **Reviewer verdict on first-run experience**: multiple 2026 reviews score ease-of-use around 6/10, explicitly citing a dated interface, dense onboarding, and depth of customization that "can overwhelm a new trader" — implying the guided course exists precisely because the raw product isn't self-explanatory. ([tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/), search summary on ease-of-use score)

Net: the onboarding path leans on **education (course + videos) to compensate for a steep/dense first-run UI**, rather than a slick in-product guided setup.

## 4. Landing page teardown

Direct WebFetch of edgewonk.com returned HTTP 403 in this session, so this section is built from third-party descriptions and search snippets rather than a firsthand screenshot-by-screenshot teardown — treat structural claims (exact section order) as **could not fully verify**; treat feature/copy claims (repeated verbatim across multiple independent sources) as reasonably solid.

- **Headline/positioning copy**: framed around being "the first and only trading journal that analyzes why you are losing money" and gives "specific tips on how to become a better trader" — i.e., the hero promise is diagnostic/prescriptive, not just "track your trades." (search summary, echoed by [tradingjournal.com](https://tradingjournal.com/review/edgewonk))
- **Market breadth called out early**: copy explicitly lists supported markets — forex, stocks, futures, crypto, CFDs, options — likely near the top to signal breadth to a mixed-asset audience. ([edgewonk.com](https://edgewonk.com/), multiple review summaries)
- **Named on-page sections we can confirm exist** (from site navigation/URLs discovered): `/features`, `/pricing`, `/trading-psychology` (dedicated psychology/Tiltmeter landing page), `/edge-finder` (dedicated AI feature page), `/import` (supported platforms), `/legacy` (old Edgewonk 2 info), `/course` (journaling course), `/changelog`, `/blog`. The existence of a standalone `/trading-psychology` marketing page indicates psychology/Tiltmeter is treated as a primary pillar of the site's messaging architecture, not a buried feature. ([edgewonk.com/trading-psychology](https://edgewonk.com/trading-psychology), [edgewonk.com/edge-finder](https://edgewonk.com/edge-finder))
- **Social proof**: "10+ years, traders worldwide have relied on Edgewonk" longevity claim used as trust signal; Trustpilot is their most visible third-party proof point (4.7 "Excellent" TrustScore, ~40 reviews, 97% five-star, cited heavily by affiliate review sites, implying Edgewonk or its reviewers surface the Trustpilot badge prominently). ([trustpilot.com/review/edgewonk.com](https://www.trustpilot.com/review/edgewonk.com), [bullishbears.com](https://bullishbears.com/edgewonk-review/))
- **Comparison/battlecard content**: Edgewonk runs its own head-to-head blog posts against competitors — "The Best TraderSync Alternative? Edgewonk vs TraderSync", "The Best Tradezella Alternative? Edgewonk vs Tradezella" — a direct-response tactic aimed at capturing competitor-name search traffic and reassuring switchers. ([edgewonk.com/blog/the-best-tradersync-alternative-edgewonk-vs-tradersync](https://edgewonk.com/blog/the-best-tradersync-alternative-edgewonk-vs-tradersync), [edgewonk.com/blog/the-best-tradezella-alternative-edgewonk-vs-tradezella](https://edgewonk.com/blog/the-best-tradezella-alternative-edgewonk-vs-tradezella))
- **Pricing framed as simplicity**: no-tier, single-price pricing page is itself a landing-page selling point ("no tiers to compare, no upsells") vs. subscription competitors' multi-tier pages. ([edgewonk.com/pricing](https://edgewonk.com/pricing), [bullishbears.com](https://bullishbears.com/edgewonk-review/))
- **Light vs. dark aesthetic**: could not verify directly (site blocked). No source described the marketing site's color theme explicitly; this remains an open question for a follow-up visual check.

## 5. In-app UI patterns worth noting

Reconstructed entirely from feature descriptions / reviews / help articles, since live screenshots could not be fetched in this session:

- **Nav model**: appears to be tab-based — sources reference "the Journal tab," "the Backtester tab," a "Trade Management" section (numbered "6" in one help URL, suggesting a numbered/sequential tab structure), implying a fairly traditional multi-tab desktop-app layout carried over from the Java-era Edgewonk 2 into the Edgewonk 3 web app. ([edgewonk.com/6-trade-management/](https://edgewonk.com/6-trade-management/), [edgewonk.com/blog/update-backtester-tab](https://edgewonk.com/blog/update-backtester-tab))
- **Density**: multiple reviewers explicitly describe the interface as dense/dated — "still feeling like a desktop application from 2018," "navigation is dense, charts are functional but not modern" — consistent with a power-user, spreadsheet-adjacent tool rather than a slick modern SaaS dashboard. ([traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **P&L calendar/heatmap**: two distinct calendar treatments reported — (1) a standard monthly P&L calendar, color-coded green (profit days) / red (loss days) per day; (2) a separate "Year Heatmap," described as a GitHub-contribution-style 365-day-at-a-glance view for spotting seasonal/consistency patterns. Screenshot capture was later added directly onto the calendar and equity-graph components. (search summaries; no single canonical confirming URL beyond feature/blog mentions)
- **Charts**: "17 different charts with customization and flexibility," described elsewhere as "functional but not modern" — implies a large quantity of stat/chart views rather than a small curated dashboard. ([search summary re: 17 charts])
- **Color semantics**: Tiltmeter assigns a numerical emotional-state rating that is visually correlated against performance (implies some color/graph pairing between emotion score and P&L, though the exact color coding used for Tiltmeter itself could not be verified from these sources).
- **Screenshots-in-journal**: Edgewonk supports attaching trade screenshots with defined "screenshot specifications" (help article exists specifically for this), suggesting screenshot-per-trade is a first-class, spec'd workflow rather than an afterthought. ([edgewonk.zendesk.com/Screenshot-specifications](https://edgewonk.zendesk.com/hc/en-us/articles/360013433760-Screenshot-specifications))
- Overall pattern: **power/depth over polish** — this is the single most consistent theme across every independent review touching the UI.

## 6. What users complain about

- **Dated, dense, desktop-feeling UI** even after the Edgewonk 3 relaunch: "the interface still feeling like a desktop application from 2018 … does not match what cloud-based competitors are delivering." ([traderssecondbrain.com/guides/edgewonk-alternative](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **Steep onboarding / overwhelming customization** for new traders — ease-of-use scored ~6/10 by at least one reviewer specifically because of this. ([tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/))
- **No native mobile app** and (for the legacy version) no cloud sync at all — a Java desktop app tied to one machine was a real pain point before Edgewonk 3's web version; even the web version's full feature set is desktop-optimized. ([edgewonk.zendesk.com](https://edgewonk.zendesk.com/hc/en-us/articles/360010149699-Can-I-use-Edgewonk-from-my-phone), [traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **Manual/friction-heavy import for anything outside MT4/MT5** — export-reformat-import CSV workflow for 60+ other platforms, no true one-click sync outside MetaTrader. ([traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **No AI until very recently** — reviewers noted through 2025 that Edgewonk lacked any AI feature while rivals shipped AI insights; Edge Finder (Jan 2026) was a direct catch-up response. ([traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **No trade replay/backtesting engine** — explicitly called out as a gap versus TradeZella and TraderSync, both of which offer market replay. ([traderssecondbrain.com](https://traderssecondbrain.com/guides/edgewonk-alternative))
- **No prop-firm-specific tooling** despite prop-firm platform import support (FTMO, Topstep X) — no challenge-rule tracking, drawdown-limit alerts, or payout tracking. (search summary via fortraders.com/thetrustedprop.com discussion)
- **Pricing model erosion**: several 2026-dated reviews frame the shift from one-time-fee to $197/year subscription as a loss of Edgewonk's main historical differentiator versus subscription competitors. ([tradertrac.com](https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/))
- **Export limitations**: data export (Excel only) explicitly excludes screenshots and notes, limiting how completely a user can extract their own journal data. ([edgewonk.zendesk.com/Export-journal-data](https://edgewonk.zendesk.com/hc/en-us/articles/14639571465362-Export-journal-data))
- **On the positive side for balance** — Trustpilot (4.7/5, ~40 reviews, 97% five-star) shows analytics quality as the #1 praised theme (65%) and support responsiveness also praised; forum sentiment on Forex Factory is broadly positive about the depth of statistics ("not simple statistics-loaded overkill of useless numbers ... tells you where you are leaking money"). This suggests complaints cluster around **UI modernity, mobile access, and pricing model**, not around whether the analytics actually work. ([trustpilot.com/review/edgewonk.com](https://www.trustpilot.com/review/edgewonk.com), [forexfactory.com/thread/532955](https://www.forexfactory.com/thread/532955-be-profitable-with-edgewonk-your-professional-trading))
- Could not verify specific Reddit threads on r/Daytrading or r/Forex directly — web search did not surface indexed Reddit results for "Edgewonk" in this session (searches for `site:reddit.com Edgewonk` and `reddit.com/r/Daytrading Edgewonk` returned no results). Forum sentiment above is drawn from Forex Factory and referenced Bear Bull Traders / Trade2Win threads instead.

## 7. Verdict

**Three things TradeOS should replicate:**

1. **A named, marketed psychology/discipline signal with its own dedicated landing page** — Edgewonk's Tiltmeter isn't just a feature buried in a features list, it gets its own page (`/trading-psychology`) and its own blog content ("Mastering Trading Discipline with Edgewonk's Tiltmeter"). TradeOS's 0-100 discipline score should get the same first-class treatment — a dedicated page that explains the methodology, not just a dashboard widget.
2. **Rules/checklist adherence tied directly to a performance report** — Edgewonk's Setup Checklists + "Checklist Performance" chart is functionally close to what TradeOS's rulebook-grading should do: don't just grade the trade, show the trader which specific rules correlate with their actual edge over time.
3. **Retroactive "what-if" analysis on real trade history** rather than generic market replay — Edgewonk's Backtester tab (test a rule change against your own logged trades) is cheap to build relative to a full replay engine and directly reinforces a discipline-coaching narrative ("what if you'd skipped every trade where your discipline score was under X").

**Three things to avoid:**

1. **Don't let "dense and powerful" become "dated and overwhelming."** Edgewonk's single most repeated criticism across independent reviews is a desktop-2018-feeling UI and an onboarding that overwhelms new users despite needing a whole supplementary video course to compensate. A dark, dense, terminal-style UI is a deliberate TradeOS choice, but density must still resolve into a fast first-value path — not require an external course to become usable.
2. **Don't leave broker sync half-finished.** Edgewonk's automatic sync only really works for MetaTrader; everything else is manual CSV export/reformat/import, and this is called out as friction repeatedly. If TradeOS advertises "auto-import," it should mean it broadly, not just for one platform family.
3. **Don't skip mobile/cloud access.** Edgewonk paid a real reputational cost for years as a single-machine Java desktop app, and even its rebuilt web app is criticized as desktop-optimized with no native mobile app. TradeOS should not repeat a desktop-first, mobile-as-afterthought pattern, especially since funded/prop traders often want to check status away from their trading desk.

**One gap TradeOS could own:**

Edgewonk has **zero prop-firm-specific tooling** — no challenge-rule compliance tracking, no drawdown-limit alerts, no payout/scaling-plan tracking — despite explicitly supporting import from FTMO and Topstep X accounts and being used by funded traders. Given TradeOS's stated target of funded/prop and live day traders, and given Edgewonk is the closest positioning competitor on the discipline/psychology angle, a discipline score that is explicitly wired to a specific prop firm's actual rule set (max daily loss, consistency rule, trailing drawdown) — rather than a generic emotional/behavioral score — is a gap Edgewonk has left completely open.

## 8. Sources

- https://edgewonk.com/pricing
- https://edgewonk.com/
- https://edgewonk.com/features
- https://edgewonk.com/import
- https://edgewonk.com/trading-psychology
- https://edgewonk.com/edge-finder
- https://edgewonk.com/legacy
- https://edgewonk.com/course
- https://edgewonk.com/changelog
- https://edgewonk.com/6-trade-management/
- https://edgewonk.com/blog/mastering-trading-discipline-with-edgewonks-tiltmeter
- https://edgewonk.com/blog/edgewonk-edge-finder
- https://edgewonk.com/blog/update-backtester-tab
- https://edgewonk.com/blog/trading-checklists-update
- https://edgewonk.com/blog/metatrader-sync-edgewonk
- https://edgewonk.com/blog/edgewonk-3-launch
- https://edgewonk.com/blog/the-best-tradersync-alternative-edgewonk-vs-tradersync
- https://edgewonk.com/blog/the-best-tradezella-alternative-edgewonk-vs-tradezella
- https://edgewonk.com/blog/10-reasons-why-edgewonk-is-the-best-forex-trading-journal
- https://edgewonk.zendesk.com/hc/en-us/articles/360010150259-The-Tiltmeter
- https://edgewonk.zendesk.com/hc/en-us/articles/360013434420-How-can-I-get-my-free-account-
- https://edgewonk.zendesk.com/hc/en-us/articles/360010149699-Can-I-use-Edgewonk-from-my-phone
- https://edgewonk.zendesk.com/hc/en-us/articles/7772564128786-Trading-Plans
- https://edgewonk.zendesk.com/hc/en-us/articles/14639571465362-Export-journal-data
- https://edgewonk.zendesk.com/hc/en-us/articles/360013433760-Screenshot-specifications
- https://edgewonk.zendesk.com/hc/en-us/articles/11558941403410-Edgewonk-videos-and-course
- https://www.trustpilot.com/review/edgewonk.com
- https://bullishbears.com/edgewonk-review/
- https://tradingjournal.com/review/edgewonk
- https://tradertrac.com/blog/edgewonk-review-2026-is-the-one-time-fee-still/
- https://www.luxalgo.com/blog/edgewonk-journal-tool-analysis/
- https://traderssecondbrain.com/guides/edgewonk-alternative
- https://traderssecondbrain.com/guides/tsb-vs-edgewonk
- https://www.tradezella.com/vs/edgewonk
- https://www.tradesviz.com/brokers/Edgewonk
- https://www.dumblittleman.com/edgewonk-review/ (referenced via search summary only; direct fetch blocked)
- https://www.forexfactory.com/thread/532955-be-profitable-with-edgewonk-your-professional-trading
- https://www.forexfactory.com/thread/539646-trading-journal-review-edgewonk
- https://forums.bearbulltraders.com/topic/530-edgewonk-trading-journal/
- https://www.trade2win.com/threads/journal-of-a-90-win-rate-trader.240512/page-3
- https://www.youtube.com/watch?v=CEfcEUYhvuk (How to add a trade in Edgewonk — Import vs Manual)
- https://www.youtube.com/watch?v=AJ9u6cJyJ14 (First Steps in Edgewonk - Get Started)
- https://www.youtube.com/watch?v=pvT0j3N30FI (Getting Started With The Edgewonk 2.0 Free Trial)
- https://www.youtube.com/playlist?list=PLMRKLuYXATxYbQfPgE1lmOCnDEAAsNvcV (Journaling Course playlist)

Note on method limitations: direct WebFetch access to edgewonk.com and most third-party review sites (bullishbears.com, luxalgo.com, tradingjournal.com, dumblittleman.com, daytradereview.com, trustpilot.com) returned HTTP 403 in this session, so this report relies on WebSearch result summaries (which quote/paraphrase the source pages) rather than full-page fetches. Where a claim could not be cross-confirmed across at least one source, it is flagged "could not verify" inline above.
