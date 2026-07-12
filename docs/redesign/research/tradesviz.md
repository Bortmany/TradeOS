# Competitor research: TradesViz (tradesviz.com)

Research date: 2026-07-12. Method: public web only — marketing site, pricing page, help center/blog, third-party reviews, Reddit, and YouTube video listings, via search-engine summaries and direct fetch attempts. Direct `WebFetch` requests to tradesviz.com and to most third-party review sites (traderssecondbrain.com, tradertrac.com, bullishbears.com, Trustpilot, crisp.help docs) returned HTTP 403 (bot-blocked), so most findings below come from search-engine result snippets/summaries that quote or paraphrase those pages, with the source URL given. Where a claim could not be corroborated, it is marked "could not verify."

---

## 1. Positioning & pricing

- Three tiers: **Basic (free forever)**, **Pro ($19.99/month)**, **Platinum ($29.99/month)**; annual billing advertised at 25% off (worth ~3 months free). Source: [TradesViz Pricing](https://www.tradesviz.com/pricing/) via search summary, corroborated by [TraderSync vs TradesViz — JournalPlus](https://journalplus.co/compare/tradersync-vs-tradesviz/).
- Free "Basic" tier: **stocks only** (no options/futures/forex/crypto), one trading account, capped at **3,000 executions/month**, and limited charting (2 indicators per chart). To use futures, forex, options or crypto at all requires at least the Pro plan. Source: search summary of [TradesViz Pricing](https://www.tradesviz.com/pricing/).
- A **7-day free trial** is offered on the paid tiers as an alternative/addition to starting on the free Basic plan. Source: same pricing-page summary; one reviewer specifically flagged the trial as "too short." Source: [TradesViz Review — Pros & Cons, daytradingz.com](https://daytradingz.com/tradesviz-review/) (via search summary).
- Target audience, per the platform's own vertical landing pages: it explicitly courts **prop-firm/funded futures traders** (`/prop-firm-journal/`, `/prop-firm-simulator/`), **futures traders** (`/futures/`, `/futures-trade-planner/`), plus dedicated stocks, options, and forex journals — i.e., a multi-asset-class positioning rather than one narrow niche. Sources: [Best Trading Journal for Prop Firm Traders](https://www.tradesviz.com/prop-firm-journal/), [Best Futures Trading Journal](https://www.tradesviz.com/futures/), [Prop Firm Trading Simulator](https://www.tradesviz.com/prop-firm-simulator/) (all via search summaries).
- Homepage tagline captured in search snippets: **"More Than a Journal. It's Your Analytical Edge,"** and copy describing the product as combining "advanced analytics, easy trade journaling, AI insights, trading simulation, and seamless broker integration into one powerful platform designed for serious traders." Source: search summary of [tradesviz.com homepage](https://www.tradesviz.com/).
- Free tier is unusually generous relative to rivals mentioned in comparison pieces (e.g., TraderSync's free tier is described as more limited). Source: [TraderSync vs TradesViz — JournalPlus](https://journalplus.co/compare/tradersync-vs-tradesviz/).

## 2. Feature inventory (vs. canonical list)

| Canonical feature | Present? | Notes / source |
|---|---|---|
| Trade journal | Yes | Core product; manual entry, notes, tags, "Plans." [Getting Started guide](https://tradesviz.crisp.help/en/article/getting-started-with-tradesviz-trading-journal-zvgi7r/) (via search summary). |
| Broker auto-import/sync | Yes | Auto-sync from 40+ (one source says 100+/200+) platforms — Interactive Brokers, TD Ameritrade, TradeStation, Robinhood, MetaTrader 4/5, TradingView, Charles Schwab, Tradovate, Rithmic, NinjaTrader, DAS Trader Pro, plus crypto exchanges (Binance, Coinbase). Auto-sync runs roughly every 24 hours once connected; CSV/manual import also supported. Sources: [Auto-sync guide](https://www.tradesviz.com/blog/auto-import-trades/), [How to auto-sync your trades — Crisp help](https://tradesviz.crisp.help/en/article/how-to-automatically-sync-your-trades-to-tradesviz-11vosgm/), [MT5 auto-import](https://www.tradesviz.com/blog/auto-import-mt5fa/) (all via search summaries). Note: broker-count claims vary by source (15+, 40+, 100+, 200+ all appear across different pages/dates) — treat exact count as unverified marketing language. |
| Analytics | Yes, deep | Advertised "100s of metrics," 500+ charts, scatter plots, heatmaps, distribution charts, custom filter queries (e.g., "all NQ futures trades entered 9:30–10:00am, held under 10 minutes"). Sources: [TradesViz Stocks page](https://www.tradesviz.com/stocks/), [TradesViz vs TraderSync](https://www.tradesviz.com/tradesviz-vs-tradersync/) (via search summaries). |
| Playbooks/rules engine | Partial | No formal named "rules engine," but has "Trade Plans" (customizable templates with text/numeric/categorical/checkbox fields to capture strategy, rules, mental-state goals, and track adherence) plus a tagging system (tag groups, atomic tag naming conventions) used for the same purpose. Sources: [Mastering Your Trading Journal — Notes, Tags, Plans](https://www.tradesviz.com/blog/when-to-use-trades-notes-tags-plans/), [Tags complete guide](https://www.tradesviz.com/blog/tags-complete-guide/) (via search summaries). This is materially weaker than an explicit grading/scoring engine — it's descriptive/organizational, not a scored discipline check. |
| Backtesting | Yes | Full indicator-based backtester (70+ indicators via an "EZstockscreener" query language: MACD, RSI, EMA, SMA, Ichimoku, ATR, CCI, nestable e.g. EMA(RSI(15))), separate dedicated futures/forex/stock/options backtesting engines, across 30,000+ symbols, 1-minute to daily timeframes. Reports win rate, Sharpe/Sortino/Calmar, profit factor, SQN, drawdown, buy-and-hold comparison. Kept conceptually separate from the manual "simulator/replay" tool. Sources: [Backtester blog post](https://www.tradesviz.com/blog/backtester/), [Simulation/Replay/Backtesting guide](https://www.tradesviz.com/blog/all-simulators-guide/) (via search summaries). |
| Prop-firm tools | Yes, prominent | Dedicated "Prop Firm Journal" and "Prop Firm Simulator" products; claims support for 20+ (one source: 34+) prop firms / 60–65+ account configs, including Apex, Topstep, My Funded Futures, Tradeify, FTMO, FundedNext, The5ers, TradeDay, Elite Trader Funding, Earn2Trade, Take Profit Trader, Bulenox, and others. Tracks drawdown limits, daily loss limits, profit targets, consistency rules in real time as trades sync, and offers a "Challenge Mode" to replay historical sessions against a firm's exact rules before paying an evaluation fee. Sources: [Prop Firm Journal](https://www.tradesviz.com/prop-firm-journal/), [Prop Firm Compliance Dashboard blog post](https://www.tradesviz.com/blog/prop-firm-compliance-tracking/) (via search summaries). This is the single most directly comparable feature to TradeOS's target market. |
| AI features | Yes, multiple | (1) **AI Notes** — auto-generates trade summaries combining trade + market data (trend, volatility, candlestick/chart patterns, support/resistance); supports stocks, futures, forex, CFDs across US/IN/AU/CA. (2) **AI Query/Q&A** — plain-English questions like "show me my best trades on Mondays," returns multi-chart visualizations. (3) **AI Daily Insights** — ~10 personalized daily insights from a lookback period (best trading times, holding durations, symbols to focus/avoid). (4) **AI Trade Chat** — open-ended conversational chat about a trader's own data. Sources: [AI Trade Summary](https://www.tradesviz.com/blog/ai-notes/), [AI Daily Insights](https://www.tradesviz.com/blog/ai-daily-trading-insights/), [AI Trade Chat](https://www.tradesviz.com/blog/ai-trade-chat/) (via search summaries). One competitor comparison page (TradesViz's own "vs TraderSync" page, per search summary) contradictorily states TradesViz "does not have AI features" while also describing its "AI Query" and "AI Coach" — likely inconsistent/outdated marketing copy; treat the AI feature list above (sourced from TradesViz's own blog posts) as authoritative. |
| Reports/sharing | Yes | "Public Dashboard" — single shareable link showing PnL curve/equity graph for selected account(s) with granular privacy controls. Individual trades and individual "trading days" can also be shared via a lock-icon toggle (with options to hide notes/tags/PnL). Public galleries exist at tradesviz.com/shared/trades and /shared/days. Sources: [Public Dashboard blog post](https://www.tradesviz.com/blog/public-dashboard/), [Sharing: Trades, Days, Accounts](https://www.tradesviz.com/blog/sharing-trades-days-accounts/) (via search summaries). |
| Mobile app | Yes | Native iOS and Android apps ("TradesViz Trading Journal," App Store id1643338387, requires iOS 15.6+). v2.0 mobile update (per TradesViz's own blog) added a Notes tab, advanced metrics, redesigned UI, light/dark mode, ability to trigger broker sync from the app, and importing from 200+ brokers in-app. Sources: [App Store listing](https://apps.apple.com/us/app/tradesviz-trading-journal/id1643338387), [v2.0 mobile app update](https://www.tradesviz.com/blog/android-ios-app-v2/) (via search summaries). Note: at least one third-party comparison page (JournalPlus, "TradesViz vs TraderSync") states TradesViz is "web-only" with no native app — this directly contradicts TradesViz's own App Store listing and blog posts, so treat the "web-only" claim as a probable error in that third-party source rather than fact. |
| Community | Partial | No dedicated public forum/Discord community *run by* TradesViz was found. Instead there's a **Discord bot integration** — users connect their own Discord account/server to log trades and pull stats via slash-commands (`/tvhelp`) into whatever trading Discord they already belong to. There's also a public "shared trades/days" gallery that functions as light social proof/community browsing. Source: [Journal from your Discord server](https://www.tradesviz.com/blog/connect-discord/) (via search summary). Could not verify any TradesViz-operated Discord server or forum.

**Novel/extra features beyond the canonical list:**
- Trading **simulators**: a separate futures simulator, options-spread execution simulator, and a general "prop firm challenge simulator" for practicing evaluations risk-free before paying a firm's fee. Sources: [Futures Simulator](https://www.tradesviz.com/futures-simulator/), [Options spreads execution simulator](https://www.tradesviz.com/blog/options-execution-simulation/) (via search summaries).
- **PnL Calendar** with monthly/weekly/yearly-heatmap views, color-coded by day, plus a "hide PnL" privacy toggle specifically built for screenshotting to social media/Discord without revealing account size. Source: [PnL Calendar page](https://www.tradesviz.com/pnl-calendar/) (via search summary).
- Very large number of narrow, SEO-targeted landing pages per asset class and per broker/prop-firm ("Best Trading Journal for [Broker X]" — dozens of these seen in search results), suggesting an aggressive programmatic-SEO content strategy.

## 3. Onboarding & first-run

Could not directly fetch the "Getting Started" guide (blocked, 403) or a walkthrough video transcript, so this section is necessarily thin and based on search-result snippets of that guide's title/summary and adjacent docs:

- TradesViz publishes an official "[Getting started with TradesViz trading journal](https://tradesviz.crisp.help/en/article/getting-started-with-tradesviz-trading-journal-zvgi7r/)" help doc and a companion blog post "[A complete guide to getting started with trade journaling on TradesViz v2.0](https://www.tradesviz.com/blog/getting-started-with-tradesviz/)," implying the intended path is: sign up → land on a getting-started doc → import/sync trades from a broker (either CSV upload, an "Add Auto-sync Connection" flow, or an API login-and-sync flow for supported brokers) → land on the dashboard/overview once trades exist. Source: [Everything you need to know about importing/syncing/adding trades](https://www.tradesviz.com/blog/import-complete-guide/) (via search summary).
- They maintain a dedicated "[Video Guides](https://www.tradesviz.com/video-guides/)" library described as "short and intuitive annotated videos" per feature, plus a YouTube playlist ("TradesViz Walkthroughs") with separate videos for Dashboard Walkthrough, Dashboard Overview, Trade Explore Walkthrough, Trade Management, and Trade/Day Plans & Analysis — i.e., onboarding is split into short per-feature videos rather than one linear tour. Source: [TradesViz Video Guides](https://www.tradesviz.com/video-guides/), [YouTube: Dashboard Walkthrough](https://www.youtube.com/watch?v=nJeNwLNB8VA) (titles only; could not verify transcript content).
- At least one reviewer states there is a genuine **learning curve** — "a few days to get completely used to the platform" — and wishes for more guided walkthroughs of the advanced features, suggesting first-run is feature-rich but not especially hand-held. Source: review summary citing [daytradereview.com TradesViz review](https://daytradereview.com/tradesviz-review/) and similar pieces (via search summary).
- Multiple import paths exist from day one: manual CSV/file import, one-click auto-sync connection, API-based login-and-sync for supported brokers, or fully manual trade entry — giving new users a low-friction path to see data even without an integrated broker. Source: [Import complete guide](https://www.tradesviz.com/blog/import-complete-guide/) (via search summary).

## 4. Landing page teardown

Direct fetch of tradesviz.com was blocked (403) for this session, so this section is reconstructed only from page titles, meta descriptions, and copy fragments surfaced in search results — it should be treated as partial, not a full teardown. Confirmed fragments:

- Page `<title>`/meta framing captured by search: **"TradesViz: Feature-filled Free Online Trading Journal For All Markets!"** — leads with "free" and "all markets" (multi-asset breadth) as the headline hook. Source: [tradesviz.com](https://www.tradesviz.com/) (title tag via search index).
- A homepage copy fragment reads: **"More Than a Journal. It's Your Analytical Edge"** combining journaling + analytics + AI + simulation + broker integration into "one powerful platform designed for serious traders" — positions the product as an analytics platform first, journal second, aimed at a "serious"/committed trader rather than a beginner. Source: search summary of tradesviz.com homepage copy.
- The site clearly runs a large programmatic-SEO structure: distinct landing pages per asset class (`/stocks/`, `/futures/`, `/forex/`, `/options/`), per audience (`/prop-firm-journal/`), per tool (`/futures-backtesting-software/`, `/pnl-calendar/`), per competitor (`/tradesviz-vs-tradersync/`, `/tradesviz-vs-tradezella/`), and per broker (`/brokers/[BrokerName]`, e.g., `/brokers/TradingView`, `/brokers/E-Trade`) — dozens of near-identical template pages each optimized for a specific search query. This is a distinct go-to-market pattern (content/SEO-led acquisition) rather than a single polished marketing narrative.
- Dark mode is a toggleable, persisted-per-profile setting applied "for all the dashboard pages — including all charts, tables, and even the interactive chart," via a sun/moon icon top-right — this is confirmed for the in-app dashboard; could not verify whether the public marketing/landing pages themselves default to light or dark (the "UI Improvement: Dark mode" post appears to describe the app, not the marketing site). Source: [Dark mode blog post](https://www.tradesviz.com/blog/darkmode/) (via search summary).
- Could not verify: exact hero screenshot content, section ordering, testimonial/logo placement, or CTA button copy/placement on the homepage — these require a rendered fetch that was not obtainable in this session (403 on all direct tradesviz.com attempts).

## 5. In-app UI patterns worth noting

Reconstructed from official blog/changelog posts describing dashboard features (not from directly viewed screenshots, since site fetch was blocked):

- **Navigation model**: v2.0 (a "Complete Dashboard Revamp") reorganized the app into distinct tabs — an "Overview" tab (with an "All-in-one" type and "multi-table mode" for viewing several stat widgets at once), a "Calendar" tab, a "Trade Explore" tab, and a "Day/Trade Plans" area — i.e., a tabbed, multi-page dashboard rather than a single long-scroll page. Sources: [TradesViz v2.0 revamp](https://www.tradesviz.com/blog/tradesviz-2023-revamp/), [Day Calendar Tab](https://www.tradesviz.com/blog/tab-calendar/), [Trade Explore Tab](https://www.tradesviz.com/blog/tab-explore-trade/) (via search summaries).
- **Dashboard composition/density**: explicitly supports a "multi-table mode" and widgets stacking many metrics/charts simultaneously on one screen (e.g., the AI Query system "generating multi-chart visualizations showing all metrics simultaneously" for a single query) — points to a dense, data-forward layout consistent with a tool built for power users, not a simplified beginner view. Sources: [New Overview Type blog post](https://www.tradesviz.com/blog/new-overview-type-multi/), AI Query summary above.
- **P&L calendar/heatmap**: three view modes — monthly (day-to-day), weekly (detailed), and a yearly heatmap ("big picture"); each day cell is color-coded green (profit)/red (loss) with the dollar amount overlaid; clicking a heatmap cell drills into that day/week. A "hide PnL" toggle blurs dollar figures specifically for shareable screenshots. Source: [PnL Calendar page](https://www.tradesviz.com/pnl-calendar/) (via search summary). This green/red day-cell heatmap is a very standard pattern across journal apps (worth noting since TradeOS should decide whether to match or differentiate).
- **Chart styles**: advertised chart types include scatter plots, distribution charts, "grids," pivot-style tables, and an interactive price chart with dark-mode support; the backtester surfaces standard quant metrics (Sharpe, Sortino, Calmar, SQN, profit factor, drawdown %, equity curve vs. buy-and-hold). Sources: [New chart types blog post](https://www.tradesviz.com/blog/new-chart-types/), [Backtester blog post](https://www.tradesviz.com/blog/backtester/) (via search summaries).
- **Color semantics**: standard green=profit/red=loss convention on the calendar; dark/light mode is a first-class, persisted user preference rather than a fixed brand choice — this differs from TradeOS's fixed "dark, dense, terminal-style" identity and suggests TradesViz optimizes for broad appeal (user choice) rather than a committed aesthetic.
- Could not verify exact typography, information density in pixels, or precise layout grid — no direct screenshot could be examined in this session.

## 6. What users complain about

From review aggregators and comparison sites (search-summarized; original Trustpilot page itself could not be fetched directly, 403):

- **Billing/cancellation friction**: at least one Trustpilot reviewer reported being charged after cancelling by email months earlier, with charges continuing on their card. Source: search summary citing [Trustpilot: tradesviz.com reviews](https://www.trustpilot.com/review/www.tradesviz.com).
- **Data-quality/calculation bug for CFDs**: a reported flaw where MAE/MFE (max adverse/favorable excursion) for CFD accounts was calculated using futures chart data rather than CFD data, producing wrong/meaningless numbers. Source: search summary citing Trustpilot reviews.
- **Duplicate trade entries**: a user reported the software "doubling entries," requiring manual per-trade correction. Source: search summary citing Trustpilot reviews.
- **Free tier is restrictive**: stocks-only, 3,000 executions/month, one account, basic 2-indicator charting — several review sites flag this as a bait given the "free" headline marketing. Source: [TradesViz Pricing](https://www.tradesviz.com/pricing/) summary; [daytradingz.com review](https://daytradingz.com/tradesviz-review/) (via search summary).
- **Learning curve / documentation gaps**: reviewers note it takes "a few days" to get comfortable with the platform and wish for more guides/walkthroughs on advanced features. Source: search summary citing [daytradereview.com](https://daytradereview.com/tradesviz-review/) and similar review roundups.
- **Broker dependency**: users without an API-supporting broker cannot get automatic import and are pushed to manual CSV workflows. Source: search summary of review roundup (daytradingz.com / daytradereview.com cluster).
- **Trial length**: the 7-day trial was called "too short" by at least one reviewer, who speculated (without evidence) that a longer trial might expose issues — this is opinion, not a substantiated claim, but included since it recurs. Source: search summary citing [daytradingz.com](https://daytradingz.com/tradesviz-review/).
- **Comparative gaps vs. rivals**: one review roundup summarized TradesViz as weaker than some competitors on "AI coaching depth, trade replay, [and] broker count," and on "polished UX," and separately noted notes/journaling support is "somewhat lacking compared to other trade journaling software." Source: search summary aggregating multiple review sites (bullishbears.com, traderssecondbrain.com cluster).
- Could not verify: a live, specific Reddit thread quoting TradesViz users. Repeated searches (`site:reddit.com tradesviz`, `"tradesviz" reddit daytrading`, `TradesViz review Reddit trading journal`) returned no results in this session — either sparse Reddit discussion of the brand specifically, or the search tool's Reddit indexing is limited. This is a real gap in this report; treat section 6 as review-site-sourced only, not Reddit-verified.
- Positive counterweight for balance: TradesViz holds an approximate **4.2 TrustScore ("Great") across ~83 reviews** on Trustpilot as of March 2026, with support (specifically the founder, referred to as "PK") repeatedly praised for fast, hands-on responses — so complaints above appear to be a minority pattern, not the dominant sentiment. Source: search summary of [Trustpilot: tradesviz.com](https://www.trustpilot.com/review/www.tradesviz.com).

## 7. Verdict

**Three things TradeOS should replicate:**
1. **Prop-firm-native compliance tracking as a first-class feature, not an afterthought.** TradesViz's real-time drawdown/daily-loss/profit-target tracking against 20-34+ named prop firms' exact rules, plus a "Challenge Mode" to replay historical sessions against those constraints before paying an evaluation fee, is a strong, concrete pattern for TradeOS's funded/prop-trader target audience — it turns compliance into a proactive tool rather than a passive report. Source: [Prop Firm Compliance Dashboard](https://www.tradesviz.com/blog/prop-firm-compliance-tracking/).
2. **Multiple low-friction import paths from day one** (manual CSV, one-click auto-sync, API login-and-sync, manual entry) so a new user can see real data within minutes regardless of which broker they use — this directly serves "first value fast," which matters for adoption before someone will trust a discipline score. Source: [Import complete guide](https://www.tradesviz.com/blog/import-complete-guide/).
3. **A dedicated, privacy-aware sharing/screenshot mode** (hide-PnL toggle on the calendar, granular per-trade/per-day public sharing with notes/tags/PnL individually toggle-able). This is cheap to build, drives organic word-of-mouth (people screenshotting to Discord/social), and respects traders who don't want account size exposed. Sources: [PnL Calendar](https://www.tradesviz.com/pnl-calendar/), [Sharing: Trades, Days, Accounts](https://www.tradesviz.com/blog/sharing-trades-days-accounts/).

**Three things to avoid:**
1. **Don't let "free tier" marketing outrun the actual free tier.** TradesViz leads with "free" in its own page title but the free plan is stocks-only, 3,000 executions/month, one account — several reviewers call this a bait-and-switch feel. If TradeOS advertises a free tier, the limits should be honestly framed up front. Source: [TradesViz Pricing](https://www.tradesviz.com/pricing/) summary; review commentary above.
2. **Don't let data-integrity bugs reach production for the numbers traders trust most** — the reported CFD MAE/MFE miscalculation and duplicate-entry bug are exactly the kind of silent-wrong-number problem that is catastrophic for a tool whose entire value proposition is trustworthy scoring/grading; TradeOS's discipline score has zero credibility if it's ever caught wrong. Source: Trustpilot review summary above.
3. **Don't over-fragment the "rules/discipline" concept into loosely-connected primitives** (TradesViz splits this across "Tags," "Plans," and free-text notes with no unifying score) — one reviewer flagged notes/journaling support as comparatively weak, and it appears the platform never actually scores rule adherence, only lets users manually track and eyeball it. This is a structural feature to avoid copying: TradeOS's whole value proposition (an explainable 0-100 discipline score graded against the trader's own rulebook) is a stronger, more decisive product shape than an a-la-carte tagging system. Sources: [Notes/Tags/Plans blog post](https://www.tradesviz.com/blog/when-to-use-trades-notes-tags-plans/); review summary noting weak notes support.

**One gap TradeOS could own:**
- **An explicit, explainable, per-trade discipline/rule-adherence *score*.** Everything found about TradesViz — Tags, Trade Plans, AI Notes/Insights/Chat, backtesting metrics — is either descriptive (stats about what happened) or organizational (manual tagging/checklisting), but nothing found scores an individual trade against the trader's own predefined rulebook and explains the grade (e.g., "72/100 — entered 4 min before your defined session window, size was 1.5x your max risk rule, but exit matched your stop-loss rule"). TradesViz's AI features narrate and summarize; they do not appear to grade compliance. This is a genuinely open, ownable position for TradeOS's "discipline score" concept, and it maps directly onto the compliance-tracking instinct TradesViz has already proven prop-firm/funded traders want (item 1 above) — just applied to the trader's own rules instead of only the prop firm's rules.

## 8. Sources

- https://www.tradesviz.com/pricing/
- https://www.tradesviz.com/product-faq/category/subscription-pricing/
- https://traderssecondbrain.com/guides/tradesviz-review
- https://www.tradertrac.com/blog/tradesviz-review-2026-powerful-analytics-but-is/
- https://journalplus.co/compare/tradersync-vs-tradesviz/
- https://journalplus.co/compare/tradesviz-vs-tradersync/
- https://www.tradesviz.com/tradier/
- https://bullishbears.com/tradesviz-review/
- https://tickerscribe.com/tradesviz-alternative
- https://www.tradezella.com/vs/tradesviz
- https://www.tradesviz.com/ (homepage; title/meta and copy via search index only)
- https://www.tradesviz.com/blog/auto-import-trades/
- https://tradesviz.crisp.help/en/article/how-to-automatically-sync-your-trades-to-tradesviz-11vosgm/
- https://www.tradesviz.com/blog/auto-import-mt5fa/
- https://www.tradesviz.com/product-faq/category/importing-syncing-trades/
- https://www.tradesviz.com/blog/import-complete-guide/
- https://www.tradesviz.com/blog/importing-trades/
- https://www.tradesviz.com/product-faq/
- https://www.tradesviz.com/glossary/auto-sync/
- https://www.tradesviz.com/how-to-auto-sync-thinkorswim-trades/
- https://www.tradesviz.com/blog/auto-import-metatrader-ftp/
- https://www.trustpilot.com/review/www.tradesviz.com
- https://tradersunion.com/reviews/www-tradesviz-com/
- https://www.tradesviz.com/reviews/
- https://slashdot.org/software/p/TradesViz/
- https://www.tradesviz.com/blog/ai-notes/
- https://www.tradesviz.com/stocks/
- https://www.tradesviz.com/blog/ai-daily-trading-insights/
- https://www.tradesviz.com/blog/ai-trade-chat/
- https://www.tradesviz.com/blog/ai-query-examples/
- https://www.toolmage.com/en/tool/tradesviz/
- https://www.tradesviz.com/blog/artificial-intelligence-query/
- https://www.tradesviz.com/futures/
- https://www.tradesviz.com/prop-firm-journal/
- https://www.tradesviz.com/futures-trade-planner/
- https://www.tradesviz.com/prop-firm-simulator/
- https://www.tradesviz.com/futures-trading-journal/
- https://www.tradesviz.com/blog/prop-firm-compliance-tracking/
- https://www.tradesviz.com/futures-simulator/
- https://www.tradesviz.com/how-to-journal-futures-trades/
- https://www.tradesviz.com/futures-backtesting-software/
- https://tradesviz.crisp.help/en/article/how-to-auto-sync-trades-from-any-futures-prop-apex-etc-firm-via-tradovateninjatrader-or-rithmic-to-tradesviz-trading-journal-vctrgn/
- https://www.tradesviz.com/blog/backtester/
- https://www.tradesviz.com/blog/all-simulators-guide/
- https://tradesviz.crisp.help/en/article/simulation-replay-backtesting-in-tradesviz-a-complete-a-z-guide-to-using-all-the-simulators-to-improve-your-trading-giwx4g/
- https://www.tradesviz.com/stock-backtesting-software/
- https://www.tradesviz.com/forex/
- https://www.tradesviz.com/stock-trading-journal-trade-planner/
- https://www.tradesviz.com/blog/options-execution-simulation/
- https://www.tradesviz.com/forex-backtesting-software/
- https://www.tradesviz.com/blog/android-ios-app-v2/
- https://www.tradesviz.com/blog/android-ios-app/
- https://www.tradesviz.com/blog/tradesviz-mobile-app/
- https://apps.apple.com/us/app/tradesviz-trading-journal/id1643338387
- https://webcatalog.io/en/apps/tradesviz
- https://www.tradesviz.com/faq/
- https://tradesviz.crisp.help/en/article/tradesviz-general-faq-50v4b2/
- https://www.tradesviz.com/blog/when-to-use-trades-notes-tags-plans/
- https://www.tradesviz.com/blog/tags-complete-guide/
- https://tradesviz.crisp.help/en/article/everything-you-need-to-know-about-tags-managing-and-organizing-tags-in-tradesviz-trading-journal-1ndwtgp/
- https://www.tradesviz.com/options/
- https://rizetrade.com/tradesviz-alternative
- https://www.tradesviz.com/how-to-journal-options-trades/
- https://www.tradesviz.com/blog/connect-discord/
- https://www.tradesviz.com/blog/public-dashboard/
- https://www.tradesviz.com/blog/sharing-trades-days-accounts/
- https://www.tradesviz.com/blog/tab-explore-trade/
- https://x.com/tradesviz/status/1897713791355568131
- https://tradesviz.crisp.help/en/article/getting-started-with-tradesviz-trading-journal-zvgi7r/
- https://daytradereview.com/tradesviz-review/
- https://daytradingz.com/tradesviz-review/
- https://optionstradingiq.com/tradeviz-review/
- https://www.g2.com/products/tradesviz/competitors/alternatives
- https://sourceforge.net/software/product/TradesViz/
- https://www.tradesviz.com/blog/darkmode/
- https://www.tradesviz.com/pnl-calendar/
- https://www.tradesviz.com/blog/tradesviz-2023-revamp/
- https://tradesviz.crisp.help/en/article/tradesviz-v20-the-next-generation-of-tradesviz-trade-journaling-complete-dashboard-revamp-omdbja/
- https://www.tradesviz.com/blog/tab-calendar/
- https://www.tradesviz.com/blog/new-overview-type-multi/
- https://www.tradesviz.com/brokers/E-Trade
- https://www.tradesviz.com/brokers/TradingView
- https://www.tradesviz.com/blog/new-chart-types/
- https://www.tradesviz.com/tradesviz-vs-tradezella/
- https://www.tradesviz.com/brokers/APEX%20Prop%20Firm
- https://www.tradesviz.com/video-guides/
- https://www.youtube.com/watch?v=nJeNwLNB8VA (Dashboard Walkthrough)
- https://www.youtube.com/watch?v=87eJ3kSIoAw (Trade Explore Walkthrough)
- https://www.youtube.com/watch?v=AS_1sdjxrAE (Dashboard Overview)
- https://www.youtube.com/watch?v=BiikRXkSg2o (Trade Management Guide)
- https://www.youtube.com/channel/UChqEttkHIpYi_BhozbLLwfQ
- https://www.youtube.com/playlist?list=PL4h5QJbxwScfI9sWRmLtPem8H8jIsb_I4
- https://www.youtube.com/watch?v=DYwBa_FiwEA (third-party review video)
- https://www.youtube.com/watch?v=dtehxkhPOPk (Trade/Day Plans & Analysis)
- https://www.tradesviz.com/blog/getting-started-with-tradesviz/
- https://www.tradesviz.com/tradesviz-vs-tradersync/
- https://thetradeadvice.com/tradersync-vs-tradesviz/
- https://sourceforge.net/software/compare/TraderSync-vs-Tradervue-vs-TradesViz/
- https://sourceforge.net/software/compare/TraderSync-vs-TradesViz/
- https://slashdot.org/software/comparison/TraderSync-vs-TradesViz/
- https://www.tradesviz.com/trading-journal-comparison/
- https://tradingbrokers.com/tradesviz-vs-tradersync/
- https://thetrustedprop.com/blogs/tradersync-vs-tradesviz

**Note on method/limitations**: WebFetch was blocked (HTTP 403) on essentially every direct attempt in this session, including tradesviz.com pages, Trustpilot, and several independent review blogs — likely bot detection at those hosts, not a permissions issue on my end. All findings above therefore rely on WebSearch's indexed snippets/summaries of those same URLs rather than a full rendered read of the pages. This is noted inline wherever it affects confidence. No claim in this report is invented; anything not corroborated by at least one search snippet is explicitly marked "could not verify."
