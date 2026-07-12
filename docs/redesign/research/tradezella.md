# Tradezella (tradezella.com) — Competitor Research

Research method note: direct page fetches (WebFetch) to tradezella.com, Trustpilot, YouTube, and most third-party review sites were blocked at the network-policy level in this environment (403 on every external host, confirmed via the proxy status endpoint — not specific to Tradezella). All findings below are therefore drawn from search-engine result snippets (Google-style web search) that quote or summarize these pages, rather than from fetching full page text directly. Every claim is still sourced to a specific URL; anything the searches didn't surface clearly enough to state with confidence is marked "could not verify."

## 1. Positioning & pricing

- Tradezella positions itself as "The AI trading journal that knows your trades, builds your game plan, and reviews every session automatically" and elsewhere as the "#1 Trading Journal" / "AI Trading Partner," claiming "Trusted by 100K+ traders" on its homepage copy (older copy on the dedicated journal page says "Trusted by 50,000+ Traders") — [tradezella.com](https://www.tradezella.com/), [Trading Journal page](https://www.tradezella.com/trading-journal).
- Two paid tiers, no free tier:
  - **Essential/Basic**: $29/month, or $24/month billed annually ($288/year) — roughly 17% annual discount. Aimed at beginner traders; supports one trading account, three playbooks, basic data storage/backtesting (longer time periods only, not second-by-second) — [TradeZella Pricing](https://www.tradezella.com/pricing), [SoftwareSuggest pricing](https://www.softwaresuggest.com/tradezella/pricing).
  - **Pro/Premium**: $49/month, or $33.25/month billed annually ($399/year) — roughly 32% annual discount. Adds precision backtesting (second-by-second replay), more accounts/playbooks — [TradeZella Pricing](https://www.tradezella.com/pricing).
- No free trial. Instead, an unpublicized 14-day money-back window: "you pay before you see the product," and the refund policy is not clearly surfaced on the marketing site — flagged repeatedly as the single biggest trust/pricing complaint — [TraderSecondBrain review](https://traderssecondbrain.com/guides/tradezella-review).
- PropFirm Sync (a dashboard that tracks prop-firm evaluation fees, resets, payouts, drawdown and consistency-rule compliance across accounts) is free for all paid users, no extra paywall — [PropFirm Sync](https://www.tradezella.com/prop-firm-sync).
- Target audience: retail day/swing traders, and explicitly prop-firm/funded traders ("the journal built for prop traders") — [Prop Firm Traders solution page](https://www.tradezella.com/solutions/prop-firm-traders), [BullTraders review](https://bulltraders.com/blog/tradezella-review/). Also markets to trading communities/mentors via a "Communities" solution page — [Communities](https://www.tradezella.com/solutions/communities).

## 2. Feature inventory

| Feature | Present? | Notes / source |
|---|---|---|
| Trade journal | Yes | Core product; manual entry, notes, tagging — [Features](https://www.tradezella.com/features) |
| Broker auto-import/sync | Yes | Auto-sync from 500+ brokers (MT4/5, NinjaTrader, ThinkorSwim/Schwab, Interactive Brokers, Bybit, cTrader, DXtrade, TradeLocker, Tradovate, etc.); pulls trades roughly every 3 hours, or manual sync/CSV upload as fallback — [Supported Brokers](https://www.tradezella.com/brokersupport), broker-sync search summary |
| Analytics | Yes | 50+ built-in reports, a Custom Report Builder (Reports → Custom Report Builder), win rate/avg R/etc. breakdowns — feature-search summary |
| Playbooks / rules engine | Yes | "Playbook" strategies with Groups (folders) and Rules inside; each trade is tagged to a playbook and graded on how many of its rules were followed, with a performance comparison between rule-following and rule-breaking trades — [Getting Started with the Playbook](https://intercom.help/tradezella-4066d388d93c/en/articles/7020769-getting-started-with-the-playbook), [Groups and Rules](https://intercom.help/tradezella-4066d388d93c/en/articles/6986848-what-is-groups-and-rules-in-the-playbook) |
| Backtesting | Yes | Dedicated Backtesting module plus a separate "Trade Replay" feature that plays historical charts bar-by-bar (down to the second on Premium), with play/pause, 1x–10x+ speed, arrow-key stepping, a "Go-To" jump, and draggable SL/TP — [Backtesting](https://www.tradezella.com/backtesting), [Trade Replay vs Backtesting](https://help.tradezella.com/en/articles/11787298-what-is-the-trade-replay-feature-in-tradezella-and-how-does-it-compare-to-backtesting) |
| Prop-firm tools | Yes | PropFirm Sync: free, links a bank account to auto-import evaluation fees/resets/payouts, consolidates multiple funded accounts into one dashboard with drawdown status, daily P&L and consistency-rule tracking (e.g., 30/40/50% rules); supports Apex, TopStep, Tradeify, FTMO, Leeloo, MyForexFunds, The5ers — [PropFirm Sync](https://www.tradezella.com/prop-firm-sync) |
| AI features | Yes | "Zella AI" — an AI trading assistant/coach launched 2026 that gives per-trade feedback and pattern analysis; the "Zella Score" (see below) is the older, non-conversational AI-adjacent scoring feature — [Zella AI](https://www.tradezella.com/zella-ai), [What is Zella AI](https://help.tradezella.com/en/articles/11201153-what-is-zella-ai-tradezella-s-ai-trading-assistant) |
| Reports/sharing | Yes | PDF export of notes and of reports (e.g., Reports → Risk Summary → export PDF); CSV export from the Trade Log via Bulk Actions; trades can be shared for feedback with a mentor/friend, with "react live" and "run challenges" social features — feature-search summary |
| Mobile app | Yes (recent) | Native iOS/Android apps; TradeZella announced plans for mobile apps in May 2024 and reviews from 2026 confirm they shipped, though several reviewers describe the mobile experience as less polished than desktop and newer than long-established competitors like TraderSync — [TradeZella on X, May 2024](https://x.com/TradeZella/status/1793510435586802083), [Plancana comparison](https://plancana.com/blog/tools-and-apps/tradezella-alternative-mobile-trading-journal) |
| Community | Yes | Official Discord with 26,000+ members, offering templates, trade recaps, challenges, and real-time support from the TradeZella team during market hours — [Discord access help article](https://help.tradezella.com/en/articles/9100649-how-to-access-tradezella-s-discord-community), [Join Discord](https://discord.com/invite/tradezella) |
| Novel/extra | — | **Zella Score**: a proprietary 0–100 composite "GPA for your trading" combining win rate (capped contribution above 60% win rate), max drawdown, profit factor, and drawdown-recovery ratio into one trending number — the closest direct analogue to TradeOS's own discipline score — [Zella Score intro](https://help.tradezella.com/en/articles/10305642-introducing-the-all-new-zella-score) |

Could not verify: exact number of "50+ reports"; exact current MAU/paying-customer count (100K+ claim is marketing copy, unverified independently).

## 3. Onboarding & first-run

Per Tradezella's own help center and third-party walkthroughs:

1. Sign-up requires immediately choosing a paid plan (Basic or Pro) — no free tier or trial gate before payment — [sign-up guide](https://easytradingforum.com/how-to-sign-up-for-tradezella/).
2. After signup/login, the user lands directly on the **Dashboard** — described as "home base for everything." The left sidebar is split into four top-level sections: **Tracking** (live trades), **Back Testing**, **Mental Mode** (mentor/coaching access), and **University** (learning resources/video guides) — [Getting Started with TradeZella](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella).
3. First-value path is importing trades, via one of two routes:
   - **Broker Sync (automatic)**: Settings → Broker Connections → pick broker from a list (Interactive Brokers, ThinkorSwim, Tradier, Alpaca, Coinbase, Kraken, 15+ others in this particular help article, 500+ broadly) → authorize via API key or OAuth.
   - **File Upload (manual)**: upload a CSV export from any broker not natively supported.
   An "Integration Guide" button appears on-screen with broker-specific import instructions.
4. Once trades land, the user returns to the Dashboard to see stats populate.
5. In-app support is chat-based: an AI assistant first, with an escape hatch ("type 'speak to support'") to reach a human — [Getting Started with TradeZella](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella).
6. Separate beginner walkthroughs exist as YouTube videos ("Beginners Guide To TradeZella," "How To Get Started THE RIGHT WAY With TradeZella") — could not verify their exact on-screen content since direct video fetch was blocked; titles/existence confirmed via search only — [YouTube search result 1](https://www.youtube.com/watch?v=4sTZYYypve8), [YouTube search result 2](https://www.youtube.com/watch?v=glmc6GojPqQ).

Could not verify: whether onboarding includes any explicit "build your first playbook/rulebook" step before or after first trade import — this would be the most relevant comparison point to TradeOS's rulebook-first flow, but it wasn't distinctly surfaced in the sources found.

## 4. Landing page teardown

Direct fetch of tradezella.com was blocked, so this section is reconstructed from search-indexed copy and third-party descriptions rather than a visual crawl — treat structural/ordering claims as lower-confidence.

- **Hero copy strategy**: leads with the AI-agent framing — "The AI trading journal that knows your trades, builds your game plan, and reviews every session automatically while you focus on the next one" — paired with a large trust-signal number ("Trusted by 100K+ traders" / "50,000+ Traders" on a sub-page). This frames the product as an autonomous analyst rather than a passive log — [tradezella.com](https://www.tradezella.com/), [Trading Journal page](https://www.tradezella.com/trading-journal).
- **Social proof**: big user-count claims in the hero; a dedicated "User Stories" section/category on the site with named success stories (e.g., a 15-year-old turning $1k into $15k+) — [User Stories](https://www.tradezella.com/category/user-stories). Independently, third-party aggregation shows a 4.8/5 Trustpilot score across ~860 reviews, the highest in the trading-journal category, which the company likely also surfaces on-page (could not verify placement) — [Trustpilot](https://www.trustpilot.com/review/tradezella.com).
- **Screenshot usage**: feature pages (Backtesting, PropFirm Sync, Zella AI, Trading Journal) are each built as individual dedicated landing pages rather than one long homepage — a "solutions"/"vs competitor" page architecture (e.g., `/vs/tradervue`, `/vs/tradersync`, `/solutions/prop-firm-traders`, `/solutions/communities`) plus per-broker integration pages (e.g., `/integrations/interactive-brokers`) that presumably exist largely for SEO — [vs Tradervue](https://www.tradezella.com/vs/tradervue), [vs TraderSync](https://www.tradezella.com/vs/tradersync). Could not verify exact screenshot placement/count on the homepage itself.
- **CTA placement**: could not verify precise button copy/placement from blocked fetches; pricing page is a separate, simple two-tier comparison page — [Pricing](https://www.tradezella.com/pricing).
- **Light vs dark aesthetic**: the marketing site itself is not confirmed either way from available sources; the in-app product explicitly supports a togglable dark mode (see Section 5) — [Enable Dark Mode](https://intercom.help/tradezella-4066d388d93c/en/articles/8470697-enable-dark-mode). Could not verify the marketing site's default theme.

## 5. In-app UI patterns worth noting (from screenshots/docs/reviews only)

- **Nav model**: left sidebar with four top-level areas — Tracking, Back Testing, Mental Mode, University — suggesting the product treats "journal," "backtest/replay," "coaching," and "learning content" as separate first-class modes rather than one dense unified workspace — [Getting Started with TradeZella](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella).
- **Dashboard composition**: built from configurable "widgets," including an Advanced/Yearly Calendar widget as a headline element — showing total P&L and trading-days count at the top, a weekly P&L breakdown, and a small note-icon indicator on days that have a journal entry — [Dashboard Widgets and Stats](https://help.tradezella.com/en/articles/7118437-understanding-dashboard-widgets-and-stats), [Calendar Widget](https://help.tradezella.com/en/articles/9689020-advanced-calendar-widget-in-tradezella-dashboard). This is effectively a P&L calendar/heatmap treated as the dashboard's centerpiece, similar in spirit to what TradeOS would want for a discipline-score calendar.
- **Density/customization**: dashboard is described by reviewers as "customizable" so traders can surface the widgets that matter to them, rather than a fixed layout — [dashboard widgets summary above].
- **Replay/chart style**: the Trade Replay view is a candlestick chart with a bottom slider/timeline bar, play/pause and variable speed controls (1x–10x+), arrow-key single-candle stepping, a "Go-To" date/session jump, and draggable stop-loss/take-profit lines directly on the chart — a fairly rich charting surface, not just a static screenshot viewer — [Understanding the Backtesting window](https://help.tradezella.com/en/articles/8866881-understanding-the-backtesting-window), [Trade Replay vs Backtesting](https://help.tradezella.com/en/articles/11787298-what-is-the-trade-replay-feature-in-tradezella-and-how-does-it-compare-to-backtesting).
- **Color semantics**: could not verify specific color coding (e.g., green/red P&L conventions, score-band colors) from available sources beyond the general existence of a dark mode toggle — [Enable Dark Mode](https://intercom.help/tradezella-4066d388d93c/en/articles/8470697-enable-dark-mode).
- **Third-party UI verdict**: at least one comparison source rates Tradezella's UI as the best among Tradezella/Tradervue/TraderSync — "a clean, modern layout that's easy to navigate, with key stats like P&L, win rate, average holding time... displayed visually and fully customizable" — versus Tradervue's "spreadsheet-style... outdated" layout — [SuperTrader comparison](https://www.supertrader.me/compare/tradezella-vs-tradervue-vs-tradersync/).
- **PropFirm Sync dashboard**: single consolidated view across multiple funded accounts showing drawdown status, daily P&L, and rule compliance per account — a multi-account rollup pattern TradeOS should note for prop-firm users — [PropFirm Sync](https://www.tradezella.com/prop-firm-sync).

## 6. What users complain about

- **Bugs and broker-sync reliability are the top complaint**: "broker sync failures, trades not appearing, API token expiry (especially with Schwab and Interactive Brokers), and data inconsistencies... 37% of negative Trustpilot reviews cite bugs as their primary complaint" — [TraderSecondBrain review](https://traderssecondbrain.com/guides/tradezella-review), corroborated by [Trustpilot](https://www.trustpilot.com/review/tradezella.com).
- **Fast shipping cuts both ways**: "TradeZella pushes updates frequently... but also means new bugs ship fast, with users reporting that fixes sometimes break other things" — [TraderSecondBrain review](https://traderssecondbrain.com/guides/tradezella-review).
- **Pay-before-you-see-it / opaque refund policy** is called "the single biggest trust issue" — no free trial, and the 14-day refund window is not clearly published on the marketing site — [TraderSecondBrain review](https://traderssecondbrain.com/guides/tradezella-review).
- **Pricing considered high for casual traders**: "$29 basic / $49 pro" is flagged in reviews as steep for someone journaling casually or in low volume — [Trustpilot-derived summary](https://www.trustpilot.com/review/tradezella.com).
- **Mobile app immaturity**: newer and reportedly less polished than long-standing competitors' apps (e.g., TraderSync has had mobile since 2017) — [Plancana comparison](https://plancana.com/blog/tools-and-apps/tradezella-alternative-mobile-trading-journal).
- **Counterpoint — support is a consistent bright spot**: "customer service is amazing," "93% of positive reviews specifically praised customer support," Trustpilot 4.8/5 across ~860 reviews, the highest in the category — [Trustpilot](https://www.trustpilot.com/review/tradezella.com).
- Could not verify: direct Reddit thread quotes. Reddit search (via WebSearch and site: queries) did not surface indexed r/Daytrading or similar threads discussing Tradezella specifically in this session; all complaint sourcing above comes from Trustpilot-derived aggregation and independent review sites rather than Reddit itself.

## 7. Verdict

**3 things TradeOS should replicate:**
1. **Rules as a first-class, inspectable object, not just a tag.** Tradezella's Playbook → Groups → Rules structure, where each trade shows exactly which rules were followed vs. broken and the performance delta between the two, is very close to what TradeOS's rulebook-grading concept needs — make the "why" of a discipline score just as visible and drillable as Tradezella makes rule adherence per playbook ([Groups and Rules](https://intercom.help/tradezella-4066d388d93c/en/articles/6986848-what-is-groups-and-rules-in-the-playbook)).
2. **One composite score, clearly decomposed.** The Zella Score (0–100, weighted from win rate, drawdown, profit factor, and drawdown recovery, explicitly trended over time) validates the "single explainable number" approach TradeOS is taking — the key lesson is that Tradezella publishes exactly which sub-metrics feed the score and how they're weighted/capped, which TradeOS's own "explainable" scoring should match or exceed in transparency ([Zella Score intro](https://help.tradezella.com/en/articles/10305642-introducing-the-all-new-zella-score)).
3. **Prop-firm multi-account rollup as a free, dedicated surface.** PropFirm Sync consolidating drawdown/consistency-rule/payout status across every funded account into one dashboard is a strong pattern for TradeOS's funded/prop-trader target audience — worth a dedicated "accounts" rollup rather than bolting multi-account support onto the single-account journal view ([PropFirm Sync](https://www.tradezella.com/prop-firm-sync)).

**3 things to avoid:**
1. **No trial + opaque refund policy.** This is called out repeatedly as the single biggest trust complaint. TradeOS should make any trial/refund terms explicit and visible pre-payment, not something users discover only after asking.
2. **Shipping speed at the cost of stability**, particularly around broker-sync reliability (expired tokens, missing trades, data inconsistencies cited in ~37% of negative reviews). For a discipline-scoring product, a wrong or missing trade is worse than for a generic journal — it corrupts the very grade the product exists to give. Broker-sync robustness and clear sync-status/error surfacing should be treated as core, not an edge case.
3. **A sprawling landing-page architecture** (dozens of near-duplicate `/vs/competitor` and `/integrations/broker-name` SEO pages) risks diluting a clear product narrative — fine for SEO volume, but TradeOS (positioned as a focused, dense, terminal-style discipline tool) should keep its core narrative tight rather than fragmenting across many thin pages.

**1 gap TradeOS could own:**
Tradezella's Zella Score is a backward-looking performance/consistency composite (win rate, drawdown, profit factor, recovery) — a "how good were your results" score. It is not a per-trade, rulebook-specific discipline audit graded against the trader's *own written rules* at the moment of the trade. TradeOS's premise — grading each individual trade against the trader's personal rulebook, with a dense, explainable 0–100 discipline score per trade (not just an aggregate account score) — is a genuinely different and more actionable claim than anything found in Tradezella's public materials. Owning "discipline, graded trade-by-trade against your own rules, in a terminal-dense UI built for funded/live day traders" is a positioning gap Tradezella does not currently fill.

## 8. Sources

- https://www.tradezella.com/
- https://www.tradezella.com/pricing
- https://www.tradezella.com/features
- https://www.tradezella.com/trading-journal
- https://www.tradezella.com/brokersupport
- https://www.tradezella.com/backtesting
- https://www.tradezella.com/prop-firm-sync
- https://www.tradezella.com/prop-firm-sync/vs-spreadsheets
- https://www.tradezella.com/zella-ai
- https://www.tradezella.com/solutions/prop-firm-traders
- https://www.tradezella.com/solutions/communities
- https://www.tradezella.com/category/user-stories
- https://www.tradezella.com/vs/tradervue
- https://www.tradezella.com/vs/tradersync
- https://www.tradezella.com/blog/tradezella-vs-tradersync-here-is-what-you-need-to-know
- https://www.tradezella.com/blog/tradezella-vs-tradervue
- https://www.tradezella.com/blog/the-only-ai-trading-tool-you-will-ever-need-in-2026
- https://www.tradezella.com/blog/whats-new-december-2024
- https://help.tradezella.com/en/articles/8911582-our-pricing
- https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella
- https://help.tradezella.com/en/articles/7118437-understanding-dashboard-widgets-and-stats
- https://help.tradezella.com/en/articles/9689020-advanced-calendar-widget-in-tradezella-dashboard
- https://help.tradezella.com/en/articles/10305642-introducing-the-all-new-zella-score
- https://help.tradezella.com/en/articles/11201153-what-is-zella-ai-tradezella-s-ai-trading-assistant
- https://help.tradezella.com/en/articles/11787298-what-is-the-trade-replay-feature-in-tradezella-and-how-does-it-compare-to-backtesting
- https://help.tradezella.com/en/articles/8866881-understanding-the-backtesting-window
- https://help.tradezella.com/en/articles/9100649-how-to-access-tradezella-s-discord-community
- https://help.tradezella.com/en/articles/8501084-how-to-cancel-your-subscription
- https://intercom.help/tradezella-4066d388d93c/en/articles/7020769-getting-started-with-the-playbook
- https://intercom.help/tradezella-4066d388d93c/en/articles/6986848-what-is-groups-and-rules-in-the-playbook
- https://intercom.help/tradezella-4066d388d93c/en/articles/8470697-enable-dark-mode
- https://discord.com/invite/tradezella
- https://x.com/TradeZella/status/1793510435586802083
- https://x.com/TradeZella/status/1939695560006807950
- https://www.trustpilot.com/review/tradezella.com
- https://www.stockbrokers.com/review/tools/tradezella
- https://traderssecondbrain.com/guides/tradezella-review
- https://traderssecondbrain.com/guides/tradezella-vs-tradervue
- https://www.softwaresuggest.com/tradezella/pricing
- https://bulltraders.com/blog/tradezella-review/
- https://tradingjournal.com/review/tradezella
- https://plancana.com/blog/tools-and-apps/tradezella-alternative-mobile-trading-journal
- https://www.supertrader.me/compare/tradezella-vs-tradervue-vs-tradersync/
- https://easytradingforum.com/how-to-sign-up-for-tradezella/
- https://www.youtube.com/watch?v=4sTZYYypve8
- https://www.youtube.com/watch?v=glmc6GojPqQ
