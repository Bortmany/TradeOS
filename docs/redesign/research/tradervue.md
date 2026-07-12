# Competitor research: Tradervue (tradervue.com)

Research method note: Tradervue's own domain (tradervue.com, app.tradervue.com, help.tradervue.com)
and several third-party review sites (Trustpilot, G2) returned HTTP 403 to this session's fetch
tools and could not be fetched directly — the environment's outbound web-fetch tool was blocked
across the board during this research session (confirmed by testing it against an unrelated,
uncontroversial URL, which also 403'd). All findings below are therefore drawn from Google-style
web search result snippets (via the WebSearch tool) covering Tradervue's marketing pages, help
center articles, and third-party reviews/comparisons, not from directly rendered pages or
screenshots. Anywhere a claim rests on a secondary source paraphrasing or quoting Tradervue's own
site, that source is cited. Anything that could not be corroborated is marked "could not verify."

---

## 1. Positioning & pricing

- **Plans (three tiers):** Free, Silver ($29.95/month), Gold ($49.95/month). Annual billing is
  available at a discount: Silver ≈ $323.46/year (~10% off), Gold ≈ $479.52/year (~20% off), per
  the StockBrokers.com review. [StockBrokers.com](https://www.stockbrokers.com/review/tools/tradervue)
- **Free tier:** Journal + basic analytics for stocks and ETFs only, capped at 30 imported
  "logical" trades per month (Tradervue groups individual executions into a trade, so many
  executions can still count as one trade against the quota). Options, futures, and forex require
  a paid plan. Reviewers describe the free tier as a genuine, non-bait offering — real import,
  a working P&L calendar, basic analytics — but impractical for anyone trading more than
  occasionally (e.g., a 5-trade-a-day day trader burns the monthly quota in about a week).
  [Tradervue quota help page via search](https://app.tradervue.com/help/quota),
  [traderssecondbrain.com Tradervue review](https://traderssecondbrain.com/guides/tradervue-review)
- **Silver ($29.95/mo):** Removes the trade-count cap; unlocks the broader reporting/analytics
  suite (100+ reports across categories).
- **Gold ($49.95/mo):** Adds exit analysis, advanced filters, and additional reports for
  liquidity, risk tracking, and commissions & fees. [StockBrokers.com](https://www.stockbrokers.com/review/tools/tradervue)
- **Trial:** A 7-day trial is offered for Silver and Gold; the card on file is charged
  automatically at the end of the trial unless the user downgrades to Free. [WebSearch synthesis of stockbrokers.com/traderssecondbrain.com]
- **Target audience:** Positioned toward active US equity and options day traders and swing
  traders — "an equities trade journal ... used by traders who want to better understand their
  performance." Multiple funded-account/prop evaluation programs (TopstepTrader, FTMO, Apex are
  named in secondary sources) reportedly accept Tradervue as an acceptable journal-of-record for
  evaluations, though Tradervue itself has no dedicated prop-firm rule tracking (see Section 2).
  Reviewers characterize it as a "quantitative workspace with institutional-grade analytics and
  dense data tables built for quants and professional desks," explicitly contrasted with more
  visual/gamified competitors like TradeZella. It's described as a poor fit for ultra-high-frequency
  quant/systematic traders (1,000+ trades/day) because the manual tagging workflow doesn't scale.
  [tradezella.com/vs/tradervue](https://www.tradezella.com/vs/tradervue),
  [brokerchampion.com](https://brokerchampion.com/tradervue)
- **Company background:** Tradervue launched in 2011 (founded by Greg Reinacker, who reportedly
  built it to journal his own trading) and was acquired in March 2021 by SureSwift Capital, a
  SaaS "buy and hold" investment firm — this was SureSwift's first acquisition in the trading
  vertical. This ownership/maturity context (a 15-year-old product under a portfolio-holding
  company, not a venture-funded startup shipping fast) is repeatedly cited by reviewers as the
  explanation for its slow feature pace. [Crunchbase](https://www.crunchbase.com/acquisition/sureswift-capital-acquires-tradervue--036faba3),
  [SureSwift Capital blog](https://www.sureswiftcapital.com/blog/tradervue-acquisition),
  [SureSwift portfolio page](https://www.sureswiftcapital.com/portfolio/tradervue)

## 2. Feature inventory (checklist vs. canonical list)

| Feature | Status | Notes / source |
|---|---|---|
| Trade journal | **Yes** | Core product since 2011; notes, tags, and a single built-in note template per trade (reviewers note this is more limited than competitors that allow multiple custom note templates/folders). [tradezella.com/blog/tradezella-vs-tradervue](https://www.tradezella.com/blog/tradezella-vs-tradervue) |
| Broker auto-import/sync | **Yes** | Two import paths: "Broker Sync" (direct API-based automatic pull) and "Standard Import" (manual CSV/Excel upload from a broker export). Marketing claims vary by source between "80+ brokers," "200+ brokers," and a "307+ brokers supported" template-page claim — could not verify the exact current count; treat as "80–300+" depending on source/date. Named integrations include DAS Trader Pro, E*TRADE, Interactive Brokers, Lightspeed, Robinhood, Sterling Trader Pro, TD Ameritrade, Thinkorswim, TradeStation, and TradeZero. [Tradervue platforms page via search](https://www.tradervue.com/site/platforms/), [help.tradervue.com import methods](https://help.tradervue.com/article/4626-broker-sync-vs-standar-import), [tradervue.com/trading-journal-template](https://www.tradervue.com/trading-journal-template) |
| Analytics / reports | **Yes — strongest feature** | 100+ reports across categories: days/times, price/volume, instrument, market behavior, win/loss/expectation, and liquidity. Available on both Silver and Gold, with Gold adding exit analysis, more advanced filters, and liquidity/risk/commission reports. Calendar P&L view color-codes days green/red/blue(flat)/gray(no trades), switchable between aggregate and per-trade-average P&L, and can display in $, ticks, or R-multiples. [help.tradervue.com calendar P&L](https://help.tradervue.com/article/2836-calendar-p-l), [tradervue.com/help/reports/reports_overview](https://www.tradervue.com/help/reports/reports_overview) |
| Playbooks / rules engine | **Partial / weak** | No dedicated "playbook" object comparable to competitors (e.g., TradeZella's playbooks). Tradervue instead relies on free-form tags (setup, market condition, emotional state, conviction, etc.) applied per trade, which traders can use to approximate rule-following analysis, but there is no explicit rulebook/grading construct. Could not verify any structured "did you follow your rules" scoring feature. |
| Backtesting / trade replay | **No** | Reviewers are consistent and explicit: "trade replay or backtesting are not available on any Tradervue plan," and this is repeatedly named as a key gap versus TradeZella (which has a dedicated backtesting/replay feature). [traderssecondbrain.com](https://traderssecondbrain.com/guides/tradervue-alternative), [tradezella.com/vs/tradervue](https://www.tradezella.com/vs/tradervue) |
| Prop-firm tools | **No dedicated support** | No built-in tracking of prop-firm-specific rules that matter operationally (max drawdown, daily loss limit, consistency rule), despite prop firms (FTMO, FundedNext, FundingPips, TopStep, Apex) being named as heavily used by its audience. Some funded-evaluation programs reportedly accept Tradervue exports as journal-of-record, but that is different from Tradervue enforcing/tracking the firm's rules itself. [traderssecondbrain.com](https://traderssecondbrain.com/guides/tradervue-alternative) |
| AI features | **None** | Multiple 2026 reviews state Tradervue has "zero AI capabilities — no trade analysis AI, no behavioral detection, no pattern recognition, no coaching, no automated insights," contrasted explicitly with TradeZella's "four agents" (Market Sentiment Briefing, Auto-Tagger, Session Review, Automated Backtesting). [traderssecondbrain.com](https://traderssecondbrain.com/guides/tradervue-alternative), [tradezella.com/vs/tradervue](https://www.tradezella.com/vs/tradervue) |
| Reports / sharing | **Yes — genuine differentiator** | A public social/sharing layer: any trade can be marked "shared" to a public feed with entry/exit chart, notes, and comments from other users; by default P&L and volume are hidden from shared trades (opt-in to reveal them). Trades with no notes are excluded from the public shared-trades listing. There's also a leaderboard (most-shared users, top symbols traded), public user profiles, and private share links to send a single trade or a full journal to a mentor/group without making it public. Embeddable "shared trade" widgets for personal websites are also supported. [tradervue.com/site/sharing-trades](https://www.tradervue.com/site/sharing-trades), [help.tradervue.com share-trades-on-your-site](https://help.tradervue.com/article/3451-share-trades-on-your-site) |
| Mobile app | **No native app** | Tradervue has no published iOS/Android app; it is web-only, and reviewers describe the site as merely "responsive" rather than optimized for a mobile journaling workflow. Contrasted with TraderSync (native apps since 2017) and TradeZella (also has a native app). [WebSearch synthesis], [journalplus.co best trading journal apps](https://journalplus.co/best/trading-journal-app/) |
| Community | **Yes** | The public shared-trades feed, leaderboard, and public profiles function as a lightweight community layer (see "Reports/sharing" above) — described by one source as "not a chat room or Discord server ... structured trade sharing with real data attached." |
| Novel/other | — | (a) R-multiple display mode across reports/calendar, letting a trader see performance in risk units rather than raw dollars. (b) Embeddable shared-trade widget for a trader's own blog/site. (c) Very deep, "quant-desk"-style report taxonomy (100+ discrete reports) that goes well beyond typical win-rate/P&L summaries — this depth of built-in analytics is repeatedly cited as the product's core strength even by reviewers who otherwise criticize it. |

## 3. Onboarding & first-run

Based on Tradervue's help-center "Getting Started" article/video and third-party walkthroughs
(a full transcript could not be retrieved; this is reconstructed from search-result summaries):

1. **Sign up** at app.tradervue.com/signup (plan selectable at signup, including Free with no
   card required for the free tier; Silver/Gold start a 7-day trial that auto-charges).
   [app.tradervue.com/signup](https://app.tradervue.com/signup?plan=0)
2. **Import Trades** — from the left-hand nav, the user picks their broker/platform from a list
   and follows broker-specific instructions shown on the right side of the page. Two paths:
   "Broker Sync" (automated, API-based recurring pull) or "Standard Import" (manual CSV/Excel
   export-then-upload). Not every broker supports Broker Sync. [help.tradervue.com getting-started](https://help.tradervue.com/article/2839-getting-started), [help.tradervue.com broker-sync-vs-standard-import](https://help.tradervue.com/article/4626-broker-sync-vs-standar-import)
3. **Add notes and tags** to imported trades (setup, market condition, emotional state, etc.).
4. **Review the Dashboard** — customizable widgets showing cumulative P&L, trade counts, and win
   rate over rolling 30/60/90-day windows.
5. **Explore Journal and Reports views** — Journal shows individual trades with auto-generated
   entry/exit charts (from TradingView-style charts, sparing users from manually screenshotting
   charts); Reports surfaces the 100+ report library (gross daily P&L, total gains/losses, volume,
   win %, profit factor, etc.).
6. If the broker isn't in the supported list, a generic/manual entry path exists as a fallback.
   [help.tradervue.com supported-brokers-and-platforms](https://help.tradervue.com/article/3414-supported-brokers-and-platforms)

The official "Getting Started with Tradervue" video (published to YouTube Dec 29, 2022,
https://www.youtube.com/watch?v=K-CgdMWJTgM, mirrored at
https://app.tradervue.com/help/video/gettingstarted) reportedly walks through exactly this
import → tag → Dashboard/Journal/Reports sequence. A full transcript could not be retrieved in
this session — could not verify the exact spoken content, only the topic sequence as described
in search snippets and the help article it accompanies.

## 4. Landing page teardown

This session's fetch tool could not render tradervue.com directly (403), so this section is
reconstructed entirely from how third-party reviews and comparison pages describe and quote the
marketing site. Treat section ordering as approximate, not a verified pixel-by-pixel teardown.

- **Overall aesthetic:** Light, conventional SaaS marketing site — not a dark/dense terminal
  aesthetic. Reviewers repeatedly describe the *in-app* experience (not just the marketing site)
  as visually dated ("clean in the way early-2010s web apps were clean," "stuck in 2012," "no
  dark mode, no modern design language"). [tradingtoolshub.com](https://tradingtoolshub.com/review/tradervue/), [traderssecondbrain.com/tradervue-alternative](https://traderssecondbrain.com/guides/tradervue-alternative)
- **Hero copy strategy:** Positions Tradervue functionally rather than emotionally — page title/
  meta framing is literally "Trading Journal for Stocks, Options, Futures & Forex," i.e., leading
  with asset-class breadth and the "journal" category name rather than an aspirational tagline.
  [tradervue.com homepage title via search](https://www.tradervue.com/)
- **Screenshot usage:** Marketing pages built around specific integrations (e.g., dedicated
  landing pages per broker: "Interactive Brokers Trading Journal," "E*TRADE Trading Journal,"
  "TradeStation Trading Journal") suggest a programmatic-SEO strategy — many near-duplicate
  landing pages targeting "[Broker name] + trading journal" search queries, each presumably
  showing the import flow for that specific broker. [tradervue.com/site/platforms/interactive-trading-journal](https://www.tradervue.com/site/platforms/interactive-trading-journal), [tradervue.com/site/platforms/e-trade-trading-journal](https://www.tradervue.com/site/platforms/e-trade-trading-journal), [tradervue.com/site/platforms/tradestation-trading-journal](https://www.tradervue.com/site/platforms/tradestation-trading-journal)
- **Social proof:** A dedicated "Free Trading Journal Template" page claims "307+ brokers
  supported" as a headline trust signal. [tradervue.com/trading-journal-template](https://www.tradervue.com/trading-journal-template) Beyond broker-count claims, could not verify presence/absence of customer logos, testimonial quotes, or user-count stats on the homepage itself — not retrievable in this session.
  Separately, the product does have real third-party review coverage (StockBrokers.com,
  BullishBears, Warrior Trading, The Stock Dork, TrendSpider) functioning as de facto earned
  social proof/backlinks even if not embedded on-page.
  [stockbrokers.com](https://www.stockbrokers.com/review/tools/tradervue), [bullishbears.com](https://bullishbears.com/tradervue-review/), [warriortrading.com](https://www.warriortrading.com/tradervue-trading-journal-review/)
- **Dedicated sharing/community landing page:** "Social Trading App and Platform. Network with
  Top Traders." at tradervue.com/site/sharing-trades — a separate marketing page built entirely
  around the public trade-sharing/community feature, suggesting this is treated as a distinct
  differentiator worth its own funnel page rather than a buried in-app feature.
  [tradervue.com/site/sharing-trades](https://www.tradervue.com/site/sharing-trades)
- **CTA placement:** Could not verify exact CTA button copy/placement from the rendered page.
  The signup URL structure (app.tradervue.com/signup?plan=0) indicates the marketing site links
  directly into a plan-preselected signup flow rather than a generic "Sign up" that asks plan
  later.

## 5. In-app UI patterns worth noting (from reviews/screenshots described secondhand)

Note: no direct screenshots were viewable in this session; everything below is as *described* by
third-party reviewers, not independently observed.

- **Nav model:** Left-hand sidebar navigation (a "left corner of the dashboard" Import Trades
  link is explicitly mentioned), with top-level sections including Dashboard, Journal, Calendar,
  Reports, and Import.
- **Dashboard composition:** Customizable widget-based dashboard — cumulative P&L, trade counts,
  win rate, over selectable 30/60/90-day rolling windows. Reviewers repeatedly describe it as
  dense/cluttered: "the dashboard trying to show everything at once, which can be disorienting for
  new users." [WebSearch synthesis, multiple review sites]
  Contrast: reviewers characterize this as "spreadsheet-style ... functional and data-rich" versus
  competitors' more visual/card-based dashboards. [tradezella.com/blog/tradezella-vs-tradervue](https://www.tradezella.com/blog/tradezella-vs-tradervue)
- **Density:** Consistently described as dense/data-heavy, oriented at "quants and professional
  desks" rather than casual users — the opposite pole from competitors built for "visual learners."
  This is one of the few points where Tradervue's density is described as an intentional strength
  rather than just dated-ness — it maps reasonably well to TradeOS's own dense/terminal target
  aesthetic, even though the visual execution (light theme, no dark mode, "2013"-era chart
  rendering) is not something to copy.
- **P&L calendar/heatmap:** Month-grid calendar, one cell per trading day, color-coded green
  (profit) / red (loss) / blue (flat) / gray (no trades). Clicking a day drills into that day's
  trades in Journal view. Toggle between aggregate P&L and per-trade average P&L; unit toggle
  between $, ticks, and R-multiples. [help.tradervue.com calendar-p-l](https://help.tradervue.com/article/2836-calendar-p-l)
- **Trade/chart view:** Auto-generated entry/exit charts per trade (reviewers reference
  TradingView-style rendering) so the user doesn't need to manually screenshot charts at trade
  time — charts show entry/exit markers directly.
- **Color semantics:** Standard green=profit/red=loss/blue=flat/gray=no-activity, applied
  consistently across the calendar and (per reviewer description) reports.
- **Visual polish:** The most consistent secondhand criticism across independent reviews is dated
  visual design — no dark mode, older-style chart rendering, layout compared unfavorably to
  "journals built in 2022–2024." This is a explicit gap TradeOS's dark/dense terminal aesthetic
  can differentiate against, since Tradervue is dense-but-not-modern, whereas TradeOS could be
  dense-and-modern (dark terminal chic rather than "spreadsheet from 2013").

## 6. What users complain about

- **Billing / cancellation friction:** Trustpilot shows a low TrustScore (reported as 2.6/5,
  "Poor," based on only ~9 reviews as of March 2026 per search-result summaries — a very small
  sample, so treat the rating itself as low-confidence/noisy, but the complaint *pattern* is
  consistent across sources). The recurring complaint is billing/cancellation issues: users report
  difficulty canceling subscriptions and being charged unexpectedly (consistent with the 7-day
  trial that auto-charges unless the user proactively downgrades to Free).
  [trustpilot.com/review/tradervue.com](https://www.trustpilot.com/review/tradervue.com)
  (Note: this session's fetch tool returned 403 on the Trustpilot page directly; the rating and
  complaint themes above come from third-party sources' paraphrase/citation of Trustpilot, not
  from viewing Trustpilot directly — treat with appropriate caution given the very small review
  count.)
- **No AI / hasn't kept pace:** Consistent theme across multiple 2026 comparison/review articles:
  "zero AI capabilities," "development has slowed," "lacks the AI, replay, and backtesting
  features that define modern journals" — this reads at least partly as competitor-comparison
  marketing copy (several sources are TradeZella's own comparison pages or affiliate review sites
  with alternative-product monetization), so some of this framing should be read with a grain of
  salt for bias, even though the underlying factual claim (no AI features, no backtesting) is
  corroborated across independent sources. [tradezella.com/vs/tradervue](https://www.tradezella.com/vs/tradervue), [traderssecondbrain.com/tradervue-alternative](https://traderssecondbrain.com/guides/tradervue-alternative)
- **Outdated interface:** "Stuck in 2012," "no dark mode," "clean in the way early-2010s web apps
  were clean" — recurring language across independent reviews (tradingtoolshub.com,
  traderssecondbrain.com) describing the UI as functional but visually and UX-wise behind modern
  trading-journal competitors.
- **No mobile app:** Called out repeatedly as a gap versus TraderSync and TradeZella, both of
  which have native mobile apps.
- **Free-tier trade-count limit frustrating for active traders:** The 30-trades/month cap is
  characterized as fine for casual/swing traders but "annoying fast" for anyone trading daily,
  effectively forcing active day traders onto a paid plan almost immediately.
- **Customer support responsiveness:** Cited (via the Trustpilot-derived complaint summary) as a
  secondary complaint, though could not verify with a first-hand quote/source beyond the
  secondary summary already cited above.
- **Note-taking is rigid:** One built-in note template per trade, versus competitors offering
  multiple custom templates/folders/tags for notes — called out specifically in the
  TradeZella-vs-Tradervue comparison. [tradezella.com/blog/tradezella-vs-tradervue](https://www.tradezella.com/blog/tradezella-vs-tradervue)

Could not verify: no direct Reddit thread URLs surfaced in this session despite multiple targeted
queries (e.g., `site:reddit.com Tradervue`, `Tradervue reddit daytrading worth it`) — WebSearch
returned no indexed Reddit results for these queries. This is a real gap in this report; r/Daytrading
sentiment specifically could not be sourced and should not be assumed to match the Trustpilot/
review-site pattern above.

## 7. Verdict

**Three things TradeOS should replicate:**

1. **A genuinely deep, named report taxonomy, not just a dashboard.** Tradervue's single biggest
   consistently-praised asset — even from reviewers who otherwise pan it — is the sheer breadth of
   analytical cuts (100+ reports: days/times, price/volume, instrument, market behavior,
   win/loss/expectation, liquidity). TradeOS's discipline score should be backed by an equally
   deep, explorable set of standard cuts (by rule violated, by setup, by time of day, by
   session), not just a single top-line number — depth of analytics is what makes an active
   trader feel a tool is "for them."
2. **R-multiple / risk-unit display as a first-class toggle**, not an afterthought — Tradervue
   lets users flip the P&L calendar and reports between $, ticks, and R-multiples. For a
   discipline-scoring product this maps even more directly: showing scores/P&L in risk units
   reinforces the "did you follow your risk rules" framing TradeOS is built around.
3. **Treat trade-sharing/community as a real, separate funnel, if built at all** — Tradervue gave
   its social/sharing feature its own dedicated marketing landing page and default-private P&L
   (opt-in reveal), which is a sensible privacy default worth copying if TradeOS ever adds any
   social/leaderboard feature: default to hiding P&L/account size, let users opt in to reveal.

**Three things to avoid:**

1. **Don't let density become dated.** Tradervue's density is functional but its execution reads
   as "spreadsheet from 2013" — no dark mode, old-style charts, cluttered dashboard that "shows
   everything at once." TradeOS's dark/dense terminal aesthetic needs to hit "intentionally dense
   and modern" (think trading-terminal chic), not merely "unstyled and busy."
2. **Don't let the free tier become a source of billing-trust complaints.** The recurring
   Trustpilot complaint pattern is auto-charging after a trial and difficulty canceling. Any
   trial-to-paid TradeOS offers should default to requiring an explicit upgrade action rather than
   silent auto-charge, and cancellation should be self-serve and frictionless.
3. **Don't skip mobile.** Being web-only with only "responsive" (not app-optimized) mobile access
   is called out repeatedly as a gap next to competitors with native apps — worth at least a
   mobile-optimized web view for reviewing trades/scores on the go, even if a native app isn't
   in scope initially.

**One gap TradeOS could own:**

Tradervue has no rules engine / playbook construct and no prop-firm rule tracking at all — it
offers free-form tags but nothing that scores a trade against the trader's own stated rules, and
nothing that tracks prop-firm-specific constraints (max drawdown, daily loss limit, consistency
rule) despite prop-firm traders clearly being part of its audience (funded-evaluation programs
reportedly accept it as a journal-of-record). TradeOS's core premise — importing trades and
grading each one against the trader's own rulebook into an explainable 0–100 discipline score —
is a gap Tradervue has left completely open, and is exactly the axis (discipline/rule-adherence
scoring, not just P&L analytics) none of the reviewed competitor commentary claims Tradervue
covers.

## 8. Sources

- https://www.stockbrokers.com/review/tools/tradervue
- https://traderssecondbrain.com/guides/tradervue-review
- https://tradingtoolshub.com/review/tradervue/
- https://tradingtoolshub.com/review/tradervue-analytics/
- https://bullishbears.com/tradervue-review/
- https://www.tradervue.com/blog/best-trading-journal
- https://www.tradervue.com/trading-journal-template
- https://trading-journals.com/reviews/tradervue
- https://journalplus.co/compare/tradervue-vs-tradezella/
- https://www.warriortrading.com/tradervue-trading-journal-review/
- https://brokerchampion.com/tradervue
- https://www.tradervue.com/site/platforms/tradestation-trading-journal
- https://www.tradervue.com/site/platforms/interactive-trading-journal
- https://www.tradervue.com/site/platforms/e-trade-trading-journal
- https://help.tradervue.com/article/2839-getting-started
- https://www.tradervue.com/site/platforms/
- https://app.tradervue.com/help/video/gettingstarted
- https://www.tradervue.com/help/brokers
- https://app.tradervue.com/signup?plan=0
- https://help.tradervue.com/article/3414-supported-brokers-and-platforms
- https://help.tradervue.com/article/4626-broker-sync-vs-standar-import
- https://www.youtube.com/watch?v=K-CgdMWJTgM
- https://trademetria.com/integrations/tradervue
- https://www.trustpilot.com/review/tradervue.com
- https://tradingjournal.com/review/tradervue
- https://traderssecondbrain.com/guides/tradezella-vs-tradervue
- https://www.thestockdork.com/tradervue-review/
- https://tradingjournal.com/blog/tradervue-vs-tradersync
- https://tradingjournals.org/tradervue-review/
- https://webcatalog.io/en/apps/tradervue
- https://insiderapps.com/app/tradervue
- https://traderssecondbrain.com/guides/tradervue-alternative
- https://journalplus.co/best/trading-journal-app/
- https://www.tradezella.com/vs/tradervue
- https://lunefi.com/blog/best-tradervue-alternatives-2026-top-7-trading-journals
- https://tradingsfx.com/blog/tradervue-alternatives
- https://www.tradezella.com/blog/best-trading-trackers
- https://www.tradesviz.com/pnl-calendar/
- https://www.tradervue.com/help/reports/reports_overview
- https://help.tradervue.com/article/2836-calendar-p-l
- https://www.tradervue.com/pnl-calendar
- https://help.tradervue.com/article/3483-view-cumulative-p-l-chart
- https://app.tradervue.com/help/reports_dt
- https://help.tradervue.com/article/3465-export-calendar-p-l
- https://www.tradervue.com/site/sharing-trades
- https://help.tradervue.com/article/3451-share-trades-on-your-site
- https://blog.tradervue.com/tag/share-trade/
- https://blog.tradervue.com/tag/public-profile/
- https://blog.tradervue.com/tag/share/
- https://www.crunchbase.com/acquisition/sureswift-capital-acquires-tradervue--036faba3
- https://www.sureswiftcapital.com/portfolio/tradervue
- https://www.sureswiftcapital.com/blog/tradervue-acquisition
- https://trendspider.com/learning-center/tradervue/
- https://www.tradezella.com/blog/tradezella-vs-tradervue
- https://sourceforge.net/software/compare/TradeZella-vs-Tradervue/
- https://masterytraderacademy.com/tradezella-tradervue-trading-journals/
- https://www.financialtechwiz.com/post/tradezella-vs-tradervue/
- https://traderinsight.pro/blog/tradervue-vs-tradezella-vs-traderinsightpro-2026
- https://purepowerpicks.com/tradervue-review/
- https://app.tradervue.com/help/quota
- https://app.tradervue.com/help/faq
- https://www.softwaresuggest.com/tradervue
- https://www.sureswiftcapital.com/blog/build-trading-habits-with-tradervue
- https://www.youtube.com/watch?v=Zu76fXk9vaw
- https://www.youtube.com/watch?v=tJFXR6M0Eyk
- https://www.quantvue.io/
- https://midhudsonnews.com/2026/03/10/digital-tools-that-are-reshaping-independent-stock-trading-in-2026/
