# Competitor research: TraderSync (tradersync.com)

**Research method note:** Direct fetches of tradersync.com (homepage, /pricing/, /features/) and of several third-party pages (Trustpilot, StockBrokers.com, traderssecondbrain.com, bullishbears.com, even en.wikipedia.org as a control) all returned **HTTP 403 Forbidden** through this session's fetch tool — this looks like a broad fetch-tool block in this session rather than tradersync.com singling us out (a plain Wikipedia fetch failed the same way). As a result, this report is built entirely from **web search result summaries** (Claude's WebSearch tool, which aggregates and quotes indexed pages) rather than direct page reads. Every claim below is sourced to the URL that surfaced it, but note that some of those URLs are third-party review/affiliate sites describing TraderSync rather than TraderSync's own pages verbatim — treat phrasing as paraphrase, not confirmed direct quotation from tradersync.com, unless stated otherwise. Where sources conflicted or a detail could not be pinned down, it is marked "could not verify."

Also important: there is a **separate, similarly-named product, Tradesyncer (tradesyncer.com)**, which is a futures/prop-firm **trade copier**, not a trading journal. Several searches returned mixed results for both names. This report is about **TraderSync** (tradersync.com), the journal. Anywhere Tradesyncer data leaked into results it has been excluded.

---

## 1. Positioning & pricing

TraderSync markets itself as an AI-powered trading journal for stocks, options, futures, forex, and crypto, with a heavy emphasis on broker breadth, AI coaching ("Cypher AI"), and a market-replay/backtesting simulator. ([tradersync.com](https://tradersync.com/), via search summary)

**Plans (monthly / annual, per multiple review sites, cross-checked against 2+ sources):**
- **Pro** — $29.95/mo (~$16.47/mo billed annually, $197.64/yr). 1 account, 5 saved strategies, Market Replay at 1-minute tick precision, Cypher AI with 5 messages/day.
- **Premium** — $49.95/mo (~$24.97/mo billed annually, $299.64/yr). Up to 20 accounts, unlimited strategies, 1-second tick precision replay, 15 AI messages/day.
- **Elite** — $79.95/mo (~$39.97/mo billed annually, $479.64/yr). Up to 50 accounts, 250ms tick precision with Level II data, 60 AI messages/day, all asset classes including options, described by one source as including full API access.

(Sources: [tradersync.com/pricing/](https://tradersync.com/pricing/) via search; [TraderSync Review 2026 — TradersSecondBrain](https://traderssecondbrain.com/guides/tradersync-review); [StockBrokers.com review](https://www.stockbrokers.com/review/tools/tradersync); [TradeZella vs TraderSync comparison](https://www.tradezella.com/vs/tradersync))

One source attributed the Evaluator/prop-firm reporting feature to "Premium tier at $79.95/month" — that figure matches the Elite price, not Premium, so this looks like a source error; **could not verify** which exact tier gates the Evaluator feature.

**Free trial:** 7 days, all plans, full feature access, no credit card required (multiple sources agree; also cited as a differentiator vs. competitors who gate trials behind a card). ([TraderSync mobile app review search summary](https://tradingjournal.com/review/tradersync); [traderssecondbrain.com](https://traderssecondbrain.com/guides/tradersync-review))

**Refund policy:** All sales final, no partial refunds once billed — explicitly stated in TraderSync's own billing policy page. This is flagged repeatedly by reviewers as a pain point. ([tradersync.com/billing-cancellation-and-refund-policy/](https://tradersync.com/billing-cancellation-and-refund-policy/); [Trustpilot summary](https://www.trustpilot.com/review/tradersync.com))

**Target audience:** Messaging centers on active/day traders and scalpers who want precise execution analysis and replay for entries/exits, plus traders on prop-firm funded accounts tracking performance across multiple accounts. Not obviously positioned for casual swing/long-term investors. ([search summary of tradersync.com positioning](https://traderssecondbrain.com/guides/tradersync-review))

---

## 2. Feature inventory (checklist vs. canonical list)

| Canonical feature | Present? | Notes |
|---|---|---|
| **Trade journal** | Yes | Core product — manual entry and auto-imported trades, notes, tags. ([tradersync.com/managing-trades/](https://tradersync.com/managing-trades/)) |
| **Broker auto-import/sync** | Yes, broad | TraderSync's own marketing claims 700+ (some pages/GitHub mirrors say 900+) supported brokers/exchanges, but **not all support true autosync** — many are CSV-import only. Confirmed autosync names surfaced in search: Interactive Brokers, TD Ameritrade, TradeStation, ThinkorSwim, Webull, Robinhood, TastyTrade, NinjaTrader, Tradovate, Rithmic, cTrader, MetaTrader 5, Binance, Coinbase Pro, Kraken, KuCoin, Schwab, Fidelity, FXCM, Alpaca, TC2000, Sierra Chart, DAS Trader. ([tradersync.com/supported-broker/](https://tradersync.com/supported-broker/); [trademetria.com/integrations/tradersync](https://trademetria.com/integrations/tradersync)) The exact "700+ vs 900+" figure could not be verified — different sources/mirrors disagree. |
| **Analytics** | Yes, deep | 40+ performance metrics, 20+ dashboard widgets, customizable layouts. ([tradersync.com/tradersync-dashboards-customize-your-trading-experience/](https://tradersync.com/tradersync-dashboards-customize-your-trading-experience/)) |
| **Playbooks/rules engine** | Partial / disputed | TraderSync has a **"Strategy Checker"**: users define rules (max daily loss, max trades/session, position size limits, time windows), and the system tracks a **compliance percentage** per rule, plus flags which rules are broken most and how that correlates with P&L. However, one review source explicitly states TraderSync has **no structured playbook feature** — "no setup tracking, no templates, and no way to evaluate performance by strategy" — calling this a gap versus TradeZella. Both claims come from search-summarized text, not a direct read of the feature page, so treat the "playbook absence" claim as likely-but-not-fully-verified. (Sources: [search summary re: Strategy Checker](https://tradersync.com/features/); comparison claim via [TradeZella vs TraderSync](https://www.tradezella.com/blog/tradezella-vs-tradersync-here-is-what-you-need-to-know)) |
| **Backtesting** | Yes | Systematic backtesting (define entry/exit criteria via indicators/filters, run against historical data, get P&L/win-rate metrics) **plus** a separate Market Replay Simulator (tick-by-tick, up to 250ms precision on Elite, Level II data, adjustable playback speed, multi-chart). One reviewer called backtesting "systematic rather than visual" as a relative weakness. (Sources: [tradersync.com/market-replay-simulator/](https://tradersync.com/market-replay-simulator/); [tradersync.com/demystifying-backtesting-vs-market-replay-.../](https://tradersync.com/demystifying-backtesting-vs-market-replay-powerful-tools-for-trader-development/)) |
| **Prop-firm tools** | Yes, basic | "Evaluator" reporting via PropReports integration — tracks progress/variance against prop account constraints (daily loss limits, etc.) across funded accounts. Described by one source as "basic prop support," not a first-class dedicated module. ([traderssecondbrain.com prop-firm guide](https://traderssecondbrain.com/guides/best-trading-journal-for-prop-firms)) |
| **AI features** | Yes, headline feature | "Cypher AI" — conversational AI coach, included at every tier with escalating daily message caps (5 / 15 / 60). Learns patterns after ~50-100+ logged trades; identifies behavioral issues (revenge trading, overconfidence after wins, sizing mistakes), flags setups matching historical edge, and (per one source) compares a user's written trading plan against actual behavior to spot gaps. Described by a reviewer as "a good analyst, not a coach" — it doesn't generate structured weekly coaching reports or session-by-session psychology grades. ([tradersync.com/cypher/](https://tradersync.com/cypher/); [traderssecondbrain.com/guides/tradersync-review](https://traderssecondbrain.com/guides/tradersync-review)) |
| **Reports/sharing** | Yes | Per-trade public sharing via a toggle ("Make this trade public") with granular control over which data points are visible (e.g., can hide notes or overall return); also account-wide "share a link of my stats" for mentors/friends. ([tradersync.com/support/how-can-i-share-a-trade/](https://tradersync.com/support/how-can-i-share-a-trade/); [tradersync.com/support/how-can-i-select-what-i-share-of-a-particular-trade/](https://tradersync.com/support/how-can-i-select-what-i-share-of-a-particular-trade/)) |
| **Mobile app** | Yes, mature | iOS and Android apps since 2017 — one reviewer called this "years ahead of competitors." Near-full desktop parity: trade logging with tags/notes, AI coaching, analytics, and Market Replay all available on mobile. ([apps.apple.com/us/app/tradersync/id1177329277](https://apps.apple.com/us/app/tradersync/id1177329277); [traderssecondbrain.com](https://traderssecondbrain.com/guides/tradersync-review)) |
| **Community** | Weak / could not verify | No evidence found of an official TraderSync-run Discord, forum, or in-app social/community feature (distinct from the per-trade public sharing above). Searches for "TraderSync Discord/community" mostly surfaced unrelated generic trading Discords and the separate Tradesyncer product's community page. **Could not verify** any dedicated TraderSync community exists. |
| **Novel/extra** | — | Widest broker coverage claim in the category; Market Replay with Level II data and sub-second tick precision bundled into a journal product is relatively unusual — most competing journals don't include a replay/backtest simulator in the same subscription. ([traderssecondbrain.com](https://traderssecondbrain.com/guides/tradersync-review)) |

---

## 3. Onboarding & first-run

Per review-site descriptions of the flow (not a first-hand signup, since the site could not be fetched directly and TraderSync cannot be logged into per task constraints):

1. **Signup** requires only name and email for the 7-day free trial — explicitly "no credit card needed." ([tradingjournal.com/review/tradersync](https://tradingjournal.com/review/tradersync))
2. **First-run checklist**: new users are given a checklist of tasks to complete while exploring the platform, described as "a helpful, low-pressure way to get familiar with the tools." (Same source)
3. **Getting trades in**: the core first-value action is connecting a broker (autosync where supported) or importing a CSV; TraderSync's support docs walk through "How can I sync my trades?" and "Adding Trades to TraderSync" as the primary early tasks. ([tradersync.com/support/how-can-i-sync-my-trades/](https://tradersync.com/support/how-can-i-sync-my-trades/); [tradersync.com/adding-trades-to-tradersync-2/](https://tradersync.com/adding-trades-to-tradersync-2/))
4. **Learning resources**: a dedicated video-tutorials page and a "Tutorials" blog category, plus live chat support during business hours. ([tradersync.com/video-tutorials/](https://tradersync.com/video-tutorials/); [tradersync.com/category/tutorial/](https://tradersync.com/category/tutorial/))
5. Multiple recent YouTube walkthroughs exist, e.g. "How To Use TraderSync In 2026 (Tutorial)" (uploaded ~Nov 2025) — https://www.youtube.com/watch?v=Q8RNs72nMcI — and "A Quick Tour of TraderSync" — https://www.youtube.com/watch?v=5RsiBeTBSTw — titles/descriptions suggest a guided tour format, but transcripts were not independently reviewed here (search only surfaced titles/upload dates, not transcript content).

**Could not verify:** the exact number of steps in the checklist, whether there's a guided "connect your first broker" wizard versus a plain settings page, or time-to-first-chart/first-metric.

---

## 4. Landing page teardown

**This section is the weakest in the report** — tradersync.com's homepage could not be fetched directly (403 in this session), so nothing below is a first-hand read of section order, exact hero copy, or pixel-level screenshot placement. What follows is reconstructed only from search-engine snippets and third-party paraphrase, which is a poor substitute for an actual teardown.

- The homepage's title tag/meta positions it as: **"Trading Journal for Stocks, Forex, Futures, Crypto & Options"**, and a secondary page is titled **"The #1 AI Trading Journal for Stocks, Crypto, Futures & Forex"** — suggesting the hero messaging leads with asset-class breadth and the "#1 AI" claim rather than a discipline/psychology angle. ([tradersync.com/](https://tradersync.com/); [tradersync.com/trading-journal/](https://tradersync.com/trading-journal/))
- Search summaries reference the platform being "trusted by thousands of traders" across stocks/forex/options/futures/crypto — implying a trust-badge/stat-driven social-proof section exists, but the exact numbers, customer logos, or testimonial authors shown **could not be verified**.
- A separate `/reviews/` page exists on tradersync.com itself, suggesting the marketing site links out to or aggregates testimonials/reviews as its own section/page rather than only embedding them on the homepage. ([tradersync.com/reviews/](https://tradersync.com/reviews/))
- **Could not verify**: exact section order, dark vs. light visual theme of the marketing site (as opposed to the app itself), specific CTA button copy/placement, or whether hero includes a product screenshot/video vs. illustration. Given the constraints, no claims are made here about the actual page layout — flagging this gap rather than guessing.

---

## 5. In-app UI patterns worth noting

Again, no in-app screenshots were directly viewed (no login, and the app's own marketing screenshot pages could not be fetched). Findings are limited to what third-party text described:

- **Dashboard**: customizable with "over 20 widgets" and reported elsewhere as supporting 40+ performance metrics; users can build custom layouts rather than a single fixed dashboard. ([tradersync.com/tradersync-dashboards-customize-your-trading-experience/](https://tradersync.com/tradersync-dashboards-customize-your-trading-experience/))
- **Calendar view**: a Reports → Calendar view exists showing profitable/unprofitable days, with a layout toggle (Month view, etc.) — consistent with the standard P&L-calendar-heatmap pattern common in this product category, though the exact color coding (red/green shading intensity, etc.) **could not be verified** from available sources. ([tradersync.com/support/how-can-i-change-the-calendar-layout/](https://tradersync.com/support/how-can-i-change-the-calendar-layout/))
- **Market Replay charts**: described as supporting multiple simultaneous charts, adjustable playback speed (up to 30x, i.e., 30 minutes of market time per second, for skipping dead time), and a "jump to candle" feature — implies a fairly dense, trader-terminal-like charting surface for this specific module, closer to what TradeOS is going for than the rest of the app likely is. ([tradersync.com/market-replay-simulator/](https://tradersync.com/market-replay-simulator/))
- **Sharing UI**: a granular "data points to share" selection screen (checkboxes for which fields become public) suggests the app's information architecture treats individual trades as objects with many optional visible fields, not just a single share-everything toggle. ([tradersync.com/support/how-can-i-determine-which-metrics-to-share-for-the-trades-details-page/](https://tradersync.com/support/how-can-i-determine-which-metrics-to-share-for-the-trades-details-page/))
- **Color semantics**: **could not verify** — no source described specific green/red/amber conventions, dark-mode vs. light-mode default, or density (compact table vs. card-based) of the in-app trade log.
- One reviewer's overall impression: "looks nice, but it's complex with poor user experience" in places, and the Replay feature was called "so buggy no reasonable developer would have released it" by a dissatisfied user — suggesting visual polish and functional reliability are not always aligned. ([App Store review summary](https://apps.apple.com/us/app/tradersync/id1177329277); [Modest Money complaints piece](https://www.modestmoney.com/tradersync-complaints-and-negative-ratings/))

---

## 6. What users complain about

From Trustpilot aggregation, App Store reviews, and a dedicated complaints round-up (all via search-result summaries, not directly fetched pages):

- **Bugs and data-import/sync issues** are the single largest complaint category — cited as ~36% each of negative reviews on Trustpilot. Sync "can occasionally stop working and can be a pain to reset or troubleshoot." ([Trustpilot summary](https://www.trustpilot.com/review/tradersync.com))
- **No refund policy** — "all sales are final," repeatedly called out as one of the biggest pain points even by otherwise-positive reviewers. ([tradersync.com/billing-cancellation-and-refund-policy/](https://tradersync.com/billing-cancellation-and-refund-policy/); [Trustpilot summary](https://www.trustpilot.com/review/tradersync.com))
- **P&L calculation mismatches** against the actual brokerage — described as unresolved across "numerous support tickets" by at least one reviewer; also currency-base errors affecting commissions/fees/profit on some accounts. ([App Store reviews summary](https://apps.apple.com/us/app/tradersync/id1177329277); [Modest Money complaints piece](https://www.modestmoney.com/tradersync-complaints-and-negative-ratings/))
- **Options gaps** — no support for "rolls" in options strategies, with credits/math misreported as a result. ([App Store reviews summary](https://apps.apple.com/us/app/tradersync/id1177329277))
- **Missing unrealized P/L** — at least one 1-star App Store review cites this as a "crucial missing element." ([App Store reviews summary](https://apps.apple.com/us/app/tradersync/id1177329277))
- **Customer support inconsistency** — this is double-edged in the sources: Trustpilot summary says 75% of *positive* reviews specifically praise support responsiveness (e.g., "sync issue resolved within 24 hours"), while the complaints round-up says some users report "delayed responses, inadequate resolutions... general lack of helpfulness." Likely reads as support quality being inconsistent/variable rather than uniformly good or bad. ([Trustpilot summary](https://www.trustpilot.com/review/tradersync.com); [Modest Money complaints piece](https://www.modestmoney.com/tradersync-complaints-and-negative-ratings/))
- **No structured playbook/strategy templates** flagged as a relative weakness versus competitors (see Section 2). ([TradeZella vs TraderSync comparison](https://www.tradezella.com/blog/tradezella-vs-tradersync-here-is-what-you-need-to-know))
- **Reddit**: despite multiple targeted searches (`site:reddit.com`, "reddit day trading journal experience", "reddit day trading journal recommend"), **no indexed Reddit threads specifically discussing TraderSync surfaced** through WebSearch in this session. This is a real gap in this report — could not verify Reddit-specific sentiment; the complaint picture above rests on Trustpilot/App Store/complaint-aggregator sources only.

**Overall rating context**: Trustpilot shows ~312 reviews, 4.7 TrustScore ("Excellent"), with one source citing 91% five-star ratings — so complaints above are a minority-but-vocal pattern within an overall positive rating, not evidence of broad dissatisfaction. ([Trustpilot](https://www.trustpilot.com/review/tradersync.com))

---

## 7. Verdict

**Three things TradeOS should replicate:**
1. **Frictionless trial** — 7 days, full features, no credit card, name+email only. This removes the single biggest signup-abandonment lever and is explicitly called out by reviewers as a differentiator. TradeOS should match or beat this (e.g., trial that doesn't even require a broker connection to see the discipline-score concept on sample data).
2. **Granular, field-level sharing controls** — letting a user make a trade public but choose exactly which fields (P&L, notes, size) are visible respects the fact that traders are often cagey about their book but still want social proof/community credibility. TradeOS's own reports/sharing feature should default to this same "share what you choose" model rather than all-or-nothing.
3. **Rule compliance as a first-class, ongoing metric** — TraderSync's Strategy Checker tracks a running compliance percentage per user-defined rule and correlates it with P&L over time. That's directionally exactly what TradeOS's discipline score does, and it validates that traders want this; TradeOS should make sure its score is at least as legible (per-rule breakdown, trend over time, correlation to results) as TraderSync's compliance tracking, not just a single opaque number.

**Three things to avoid:**
1. **No refund policy as public-facing hostility** — "all sales final" is a recurring, specifically-named pain point even in positive reviews. TradeOS should have a clear, fair cancellation/refund stance rather than copying this.
2. **Shipping a marquee feature (Replay) that a user called "so buggy no reasonable developer would have released it"** — don't launch a flagship differentiator (in TradeOS's case, likely the discipline score itself or broker sync) before it's reliable; a buggy headline feature does more brand damage than a delayed one.
3. **P&L/currency calculation mismatches vs. the broker of record** — this is repeatedly cited as a trust-breaking bug category. Since TradeOS's entire premise (grading trades against a rulebook) depends on the underlying trade data being trusted as accurate, any daylight between TradeOS's imported numbers and the broker's own statement would be fatal to the product's credibility in a way it wasn't (merely annoying) for a generic journal.

**One gap TradeOS could own:**
TraderSync's rule-tracking (Strategy Checker) reports **compliance percentage per rule** but, per available sources, does not roll this up into a single, explainable, weighted **0–100 discipline score** with a clear breakdown of *why* that number is what it is on a trade-by-trade basis — its AI coach (Cypher) is described by a reviewer as "a good analyst, not a coach," offering pattern call-outs rather than a codified, explainable grade. TradeOS's core premise — one transparent, explainable discipline score derived from the trader's own rulebook, shown per-trade — is a positioning gap none of the sources found TraderSync (or its usual comparison set, TradeZella) fully occupying. This is the sharpest wedge for TradeOS's dense, terminal-style, funded/prop-trader-focused product.

---

## 8. Sources

- https://tradersync.com/ (title/meta only, via search — direct fetch returned 403)
- https://tradersync.com/pricing/ (via search — direct fetch returned 403)
- https://tradersync.com/features/ (via search — direct fetch returned 403)
- https://tradersync.com/trading-journal/
- https://tradersync.com/cypher/
- https://tradersync.com/market-replay-simulator/
- https://tradersync.com/market-replay-simulator/options/
- https://tradersync.com/demystifying-backtesting-vs-market-replay-powerful-tools-for-trader-development/
- https://tradersync.com/trading-simulator/
- https://tradersync.com/supported-broker/
- https://tradersync.com/adding-trades-to-tradersync-2/
- https://tradersync.com/managing-trades/
- https://tradersync.com/support/how-can-i-sync-my-trades/
- https://tradersync.com/support/how-can-i-share-a-trade/
- https://tradersync.com/support/how-can-i-select-what-i-share-of-a-particular-trade/
- https://tradersync.com/support/how-can-i-share-a-link-of-my-stats-with-someone/
- https://tradersync.com/support/how-can-i-make-a-trade-public/
- https://tradersync.com/support/how-can-i-determine-which-metrics-to-share-for-the-trades-details-page/
- https://tradersync.com/support/how-can-i-change-the-calendar-layout/
- https://tradersync.com/support/how-do-i-cancel-my-plan/
- https://tradersync.com/billing-cancellation-and-refund-policy/
- https://tradersync.com/faq/
- https://tradersync.com/reviews/
- https://tradersync.com/about-us/
- https://tradersync.com/video-tutorials/
- https://tradersync.com/category/tutorial/
- https://tradersync.com/tradersync-dashboards-customize-your-trading-experience/
- https://trademetria.com/integrations/tradersync
- https://www.trustpilot.com/review/tradersync.com (via search — direct fetch returned 403)
- https://apps.apple.com/us/app/tradersync/id1177329277
- https://www.stockbrokers.com/review/tools/tradersync (via search — direct fetch returned 403)
- https://traderssecondbrain.com/guides/tradersync-review (via search — direct fetch returned 403)
- https://traderssecondbrain.com/guides/best-trading-journal-for-prop-firms
- https://traderssecondbrain.com/guides/tsb-vs-tradersync
- https://traderssecondbrain.com/guides/tradezella-vs-tradersync
- https://bullishbears.com/tradersync-review/ (via search — direct fetch returned 403)
- https://tradingjournal.com/review/tradersync
- https://www.modestmoney.com/tradersync-complaints-and-negative-ratings/
- https://www.modestmoney.com/tradersync-review/
- https://daytradingz.com/tradersync-review/
- https://daytradereview.com/tradersync-review/
- https://purepowerpicks.com/tradersync-review/
- https://trading-journals.com/reviews/tradersync
- https://tradingjournals.org/tradersync-review/
- https://www.tradezella.com/vs/tradersync
- https://www.tradezella.com/blog/tradezella-vs-tradersync-here-is-what-you-need-to-know
- https://www.youtube.com/watch?v=Q8RNs72nMcI ("How To Use TraderSync In 2026 (Tutorial)")
- https://www.youtube.com/watch?v=5RsiBeTBSTw ("A Quick Tour of TraderSync")
- https://www.youtube.com/watch?v=bf_7VgXF-Ao ("TraderSync Overview and Brief Walkthrough")
- https://www.youtube.com/watch?v=WlTMSLnSmJk / https://www.youtube.com/watch?v=00g1GL3nEcI (review videos, titles/dates only — not transcribed)

**Note on excluded/adjacent sources**: tradesyncer.com and its help-center articles (help.tradesyncer.com) were surfaced repeatedly in searches but describe a **different product** (a futures/prop-firm trade copier) and are excluded from the claims above; a couple of GitHub "gist"/repo pages (e.g., gist.github.com/vujza7/..., github.com/ghffee/tradersync, github.com/gqz3977/tradersync) also appeared in results and read like SEO-mirror content rather than primary sources — they were not used as sole support for any claim above.
