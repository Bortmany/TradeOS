# TradeOS — who the users are and what they will want (2026-09-07)

The single most important thing this research says: TradeOS's core pitch — "an explainable, deterministic discipline score, not a black-box journal" — is real and defensible against the seven big incumbent journals (TradeZella, TraderSync, Tradervue, Edgewonk, TradesViz, Chartlog, Stonk Journal), but it is **no longer unclaimed** against a newer cluster of niche discipline-specific rivals (Journali, Tradoshi, Rulebook, Consistry, Tradingtick, Temper), at least one of which (Journali) already does **real-time pre-trade rule enforcement** — a materially stronger promise than TradeOS's current after-the-fact grading — and the repo's own July 2026 design brief never updated its "genuinely unclaimed territory" claim after its own September refresh walked that back [S1][S2][S3]. Of the 117 claims gathered across five research rounds: 33 are high confidence (28%, mostly two directly-fetched competitor pages and 30 first-party repo-doc citations), 71 are medium confidence (61%, almost all search-engine-snippet evidence — paraphrased reviews and blog posts, not verbatim user quotes), and 13 are low confidence (11%, thin snippets or the model's own unsourced priors, all flagged as such and never used as fact). In short: this is reasoning built on secondhand market signal, not on a single verified quote from an actual TradeOS user, a churned competitor customer, or FTMO (the largest global prop firm, never independently profiled) — treat the strategic direction as sound and the specific numbers as directional.

## 1. Who this user really is

**Deval, the Evaluation Grinder** — a retail futures trader mid-way through a Topstep or Apex funded-account challenge, trading well for weeks and then self-destructing near the finish line.
- Job: functional — pass the evaluation without breaching a drawdown or consistency rule; emotional — prove to himself he has the discipline his strategy already has the edge for; social — earn the "funded trader" identity he's chased through 2-4 paid attempts [S4].
- Anxieties: that one rule break (oversized re-entry after a loss, no cooldown) undoes weeks of good trading — the single most-cited failure pattern in the research [S5][S6]; that a post-winning-streak overconfidence phase (marginal setups, oversized size, off-hours trades) will catch him precisely when he feels safest [S7].
- Trigger: buys or renews a challenge fee ($100-500) and wants an independent check on his own discipline before the firm's own rules catch him [S8].
- First-session moment that must happen: import his fills (CSV or TopstepX connector) and see a real, populated discipline score with at least one flagged rule violation inside about 5 minutes — products that deliver this "aha" within 5 minutes see ~40% higher 30-day retention than those taking 15+ minutes [S9].
- What makes him come back tomorrow: a pre-market checklist cue and a live "room left before you breach the rule" number, not just a retrospective grade [S10][S6].
- What makes him trust it: read-only, encrypted broker access explicitly stated at connection time (no withdrawal/trade-execution rights) [S11], and a rule-by-rule, dollar-cost breakdown he can audit against his own account, not an opaque AI score [S12].
- What makes him abandon it: paying before he can confirm his broker actually syncs cleanly — the single most-repeated complaint about the market leader [S13]; or a first score delivered in a shaming tone right after he already feels burned by a failed evaluation [S14].

**Farah, the Funded Defender** — already passed an evaluation and funded on Apex or Topstep, now defending the account (and the profit share) from a single bad day.
- Job: functional — never breach the trailing drawdown or the consistency rule (Apex: no single day above ~50% of total profit since last payout as of March 2026; Topstep: end-of-day trailing, non-intraday) [S15][S16]; emotional — feel in control of a rule she experiences as "punishing excellence rather than preventing gambling" [S17]; social — protect a payout she's already anxious the firm might delay or dispute [S18].
- Anxieties: prop-firm dashboards that don't update reliably, so a passed evaluation can't be advanced or a breach happens right after the dashboard failed to show a trade; confusion over trading-day vs. calendar-day counting causing an unexpected failure [S19]; slow or denied payouts blamed on the firm's own platform issues [S20].
- Trigger: gets funded and immediately needs a way to track compliance that doesn't depend solely on the firm's own numbers.
- First-session moment: sees her specific firm's consistency-rule math modeled precisely (not a generic drawdown bar) and a live "how close to breaching" indicator.
- What makes her come back tomorrow: a post-close score/report nudge and a compliance meter that's visibly more trustworthy than the firm's own dashboard.
- What makes her trust it: an independent, non-custodial record she can point to if a payout is ever disputed — a role TradeOS is well positioned for precisely because prop-firm trust problems (payouts, dashboards) are the firm's issue, not TradeOS's, and TradeOS should be careful not to get conflated with them [S20][S21].
- What makes her abandon it: a preset that's shallower than the exact rule variant she's actually on (legacy 30% vs. current 50% Apex consistency math, evaluation-phase exemptions) [S16].

**Marcus, the Serial Restarter** — has failed 2-4 evaluation attempts already, is price-sensitive after sinking real money into challenge fees, and is shopping free or cheap tools before trying again.
- Job: functional — get real rule-adherence feedback without another subscription on top of challenge fees; emotional — stop repeating the mistake without being made to feel worse about failing before; social — none, this is a private, often embarrassed pursuit.
- Anxieties: arrives carrying self-blame from a prior failure, making a shaming first-session tone ("you failed because...") a plausible one-session abandonment trigger even if the data is accurate [S14].
- Trigger: about to buy another challenge and wants to fix the specific bad habit (revenge trading, oversizing) before spending money again.
- First-session moment: a free tier that actually shows a real discipline score, even capped — several free niche rivals (Tradoshi, Rulebook, Stonk Journal) already give this away at $0, while TradeOS's own free Starter tier currently ships with the rule engine turned off [S22][S23].
- What makes him come back tomorrow: seeing the dollar cost of his specific past mistake (revenge trade, oversized re-entry) named and quantified, not folded into a generic "overtrading" bucket [S24].
- What makes him trust it: a calm, diagnostic tone ("here's the pattern") rather than a judgmental one.
- What makes him abandon it: hitting a paywall the moment he wants to see the one thing (a real score) that would prove the product's worth.

## 2. What the market does

| Product | Offers | Price | Onboarding | Phone experience | Users love | Users hate |
|---|---|---|---|---|---|---|
| TradeZella | 500+ broker auto-journal, 300+ reports, AI trade tagging/plans, Prop Firm Sync, replay | $35-99/mo, no annual mentioned as discounted equally | Pay-first, no trial, gamified "trader mode" pick | Announced but unshipped as of 2026 [S25] | Support responsiveness, 4.8/5 Trustpilot [S26] | Historical broker-sync bugs; "pay before you ever see the product" [S13][S27] |
| TraderSync | 700-950+ brokers, Cypher Coach AI, Level II replay | $29.95-79.95/mo | Manual CSV template + column matching for unsupported brokers [S28] | No native mention found | "Spotless," "truly excellent" support; versatile/easy UI [S29] | Serious quant users "don't fully trust the platform's metrics" [S30] |
| Tradervue | Free tier (30 trades/mo cap), Silver/Gold | Free-$49.95/mo | — | No native app | Simple free tier | 2.6/5 Trustpilot; billing/cancellation friction; "many clicks behave like a full page refresh"; support "could be more responsive" [S31][S32] |
| Edgewonk | Tiltmeter (rule-adherence-to-$-cost), Best Exit Analysis, 50+ metrics, checklist-correlation | $197/yr flat, one plan, 14-day refund | Desktop-first | None; desktop-first frustrates mobile users [S33] | Behavioral-pattern depth beyond win-rate/P&L [S34] | Needs "statistically significant" trade volume before insights are useful; single-user, no team features [S35] |
| TradesViz | 600+ stats, prop-firm rule automation (drawdown, consistency, min days), open API | $14.99-22.49/mo | — | — | TopstepX-specific automation depth; open API [S36] | Confusing interface, real learning curve; free tier capped (stocks only, 3,000 executions) [S37] |
| Chartlog | Strategy builder (entry/exit rules per named strategy) | $14.99-39.99/mo, 7-day trial no card | Low-friction | — | "Most affordable journal with real analytics," clean UI [S38] | — |
| Stonk Journal | Free full feature set; Pro ($10/mo) adds AI Coach + CSV import | Free-$10/mo | — | — | "Better than some paid options like TradeZella" [S39] | No spreadsheet upload/broker sync on free tier — fully manual entry [S39] |
| TopstepX (built-in) | Free stats dashboard + Tilt Indicator, included with funded account | Free | Bundled with account | — | ~86% higher pass rate cited for users of the built-in stats [S40] | — |
| Journali (unverified this run) | Pre-trade "TradeCheck," mid-session tilt detection, 10+ firm rulebooks | ~$20/mo, 7-day trial | — | — | Real-time enforcement (per repo-doc secondhand claim, not independently confirmed) [S1][S2] | Unknown — no independent review found |

Where TradeOS is different:
- It is the only product surveyed that pairs a fully deterministic, rule-by-rule explainable 0-100 score (not an AI-commentary layer or a single proprietary meter like Edgewonk's Tiltmeter) with named prop-firm presets and a PWA that actually works on a phone — a real gap since Tradervue, TradeZella and Edgewonk are all criticized for weak or absent mobile experiences [S41][S33][S25].
- Its "not a journal" positioning is contested territory, not blue ocean: TradesViz already automates prop-firm rule configuration in depth, and a cluster of free/cheap niche tools (Rulebook, Tradoshi, Consistry, Journali, Tradingtick, Temper) already market discipline scoring or real-time enforcement specifically to prop-firm traders [S36][S1].
- Its architecture currently grades trades **after** they're logged or imported, while at least one named rival (Journali) is already doing real-time pre-trade blocking against the same category of prop-firm rulebooks TradeOS presets — this is the single most important gap to close or reposition around [S2].

## 3. What users say

*(All quotes below are search-snippet paraphrases of review/blog aggregator text, not verbatim first-person posts — Reddit and Trustpilot pages were blocked to direct fetch in three of five research rounds, so treat these as medium-strength signal, not primary-source quotes.)*

**Theme: broker-sync reliability is the #1 trust issue** — *Evidence strength: medium, but corroborated across three independent modalities.*
- "If your broker sync doesn't work, you're stuck paying for a product you can't fully use" [S13].
- 37% of TradeZella's negative Trustpilot reviews and TraderSync's "sync stuck loading" / "trades show as open" complaints are both cited as the category's leading technical complaint [S42].

**Theme: distrust of AI/black-box scoring** — *Evidence strength: medium.*
- A serious TraderSync user who relies on "strict quantitative telemetry to manage risk" says they don't fully trust the platform's metrics [S30].
- An "AI coach" feature is described as "a chatbot with a trading prompt pasted in front of it... the difference is not obvious from a landing page" [S43].

**Theme: revenge trading / late-stage self-destruction is the feared failure mode** — *Evidence strength: medium, consistent across psychology and market rounds.*
- "Revenge Trading blows funded accounts... tight drawdown + oversized re-entry + no cooldown = blown funded account" [S24].
- "The trader who lasts is the one who shuts it down after the first loss, not the one who tries to win it all back in one stupid trade" [S44].

**Theme: support responsiveness is a named differentiator, not an afterthought** — *Evidence strength: medium.*
- TraderSync's support called "spotless" and "truly excellent" [S29]; Tradervue's support "could be more responsive" is a recurring complaint [S32].

**Theme: prop-firm dashboards and payouts erode trust independent of the journal tool** — *Evidence strength: medium.*
- Dashboards "not updating so a passed evaluation can't be advanced," accounts breached "right after a dashboard failed to display a trade," confusion over calendar-day vs. trading-day counting [S19].
- Topstep payouts called "extremely slow compared to competitors," with "lack of responsibility for system problems" [S20]; Apex "allegedly been struggling with timely payouts," CEO cites new fraud-detection systems "in final touches" [S45].

**Theme: consistency rules are widely resented as arbitrary** — *Evidence strength: medium.*
- Apex's consistency rule "punishes excellence rather than preventing gambling" after hitting the profit target but still being forced to generate more profit [S17]; "too many consistency rules" is cited as a red flag when choosing a firm.

**Theme: pricing/trial friction breeds distrust** — *Evidence strength: medium, reinforced by repo-doc.*
- TradeZella's pay-first gate with no free trial and no clearly published refund policy is called the category's single biggest trust complaint [S27][S46].

## 4. Local facts that change the design

*(Market lens is global/English per the product brief — no GCC-specific research was run this round; that is a scoping choice worth confirming deliberately, not a silent gap.)*

| Fact | Source, date | Design consequence |
|---|---|---|
| 80-95% of prop-firm challenge attempts fail; 60-70% of failures are from hitting a drawdown limit (not expiring or missing profit target); only 1-3% become long-term funded traders; average 2-4 attempts before first funding | damnpropfirms.com, search-snippet, 2026 [S5] | Discipline score and alerts should weight proximity-to-drawdown-limit warnings above profit-target progress — that's where real failure risk concentrates. |
| Apex's consistency rule changed March 1, 2026: new accounts cap any single day's profit at 50% of total (up from a stricter 30% on legacy accounts); no consistency rule applies during evaluation | tradedupe.com, search-snippet, dated 2026-03-01 rule change [S16] | The Apex preset needs a date-aware rule variant tied to account purchase date, and must not enforce consistency checks during evaluation. |
| Topstep's Maximum Loss Limit is an end-of-day trailing drawdown (not intraday), locking once it reaches the starting balance; the Daily Loss Limit auto-liquidates but is not itself a rule violation | tradecovex.com, search-snippet, 2026 [S15] | The Topstep preset must model two distinct breach types and recalculate the trailing floor only at session close, or it will misrepresent risk. |
| TopstepX's own ProjectX Gateway API is a separate, unaffiliated ~$29/mo subscription (Topstep does not endorse third-party tools built on it) | help.topstep.com, search-snippet, 2026 [S47] | The live TopstepX connector's setup flow should state plainly that it needs the trader's own separate API subscription and carries no Topstep endorsement. |
| A retail prop-firm evaluation typically costs $100-500, plus the firm keeps 10-30% of a funded trader's profit share | track360.io, search-snippet, 2026 [S8] | The target user has already sunk real cash; pricing TradeOS itself low relative to the challenge fee (e.g., under $30-50/mo) reads as protecting an existing investment rather than adding a new cost. |
| CFTC consultation (closing Nov 30, 2026) on whether challenge fees are "commodity-pool participation interests" could force US-facing prop firms to register with CFTC/NFA; 80-100 prop firms reportedly collapsed 2024-early 2026 | track360.io / theindustryspread.com, search-snippet, 2026 [S48][S49] | Prop-firm preset library should be built as an easily-updatable configuration, not hardcoded rules, since firm rules and even firm existence are unstable right now. |
| ~78% of prop-firm clients reported male, Gen Z + Millennials are 60%+ of the segment | papertradingjournal.com, search-snippet, 2026 [S50] | Product tone and onboarding copy should target a young, male-skewing, mobile-first audience rather than a generalized "finance app" persona. |

## 5. Feature wishlist, ranked (Kano)

**Must-have (they leave without it)**
1. Reliable broker/CSV import that auto-detects columns and date formats (doesn't force the manual template-filling TraderSync users have to do) — evidence: [S13][S28] (high-confidence fetched page) — persona: Deval, Marcus — built: check (TradeOS has broker CSV + TopstepX connector per product description; auto-detect depth unverified).
2. Live proximity-to-breach guardrails (drawdown, daily loss, consistency rule) shown independently of the prop firm's own dashboard — evidence: [S19][S20][S17] — persona: Farah — built: check (guardrails exist per description; "independent of firm dashboard" framing not confirmed).
3. Prop-firm presets that model the *exact*, date-versioned rule math (Topstep trailing vs. Apex 30%/50% consistency, evaluation-phase exemptions) — evidence: [S15][S16][S2] — persona: Farah, Deval — built: check (Topstep/Apex/TPT presets exist; version-awareness unverified).
4. A free tier that actually shows a real (even capped) discipline score, not a locked rule engine — evidence: [S22][S23] — persona: Marcus — built: no (repo-doc confirms free Starter tier ships with `ruleEngine: false`).
5. A per-trade, dollar-tagged rule-violation breakdown, not just an aggregate number — evidence: [S12][S34] — persona: all — built: likely yes (deterministic sub-scores are core to the product description; UI depth of the breakdown unverified).

**Expected (they assume it)**
1. PDF reports — evidence: category-standard, product description — persona: Farah — built: yes (in product description).
2. Trade replay with minute/second-level scrubbing — evidence: [S36] (TradesViz "by the minutes/seconds" praised) — persona: Deval — built: check (trade replay exists; granularity unverified).
3. Multi-account comparison — evidence: category-standard, product description — persona: Farah — built: yes.
4. Mobile-usable interface (PWA) — evidence: [S25][S33][S31] (competitors' mobile gaps) — persona: all — built: yes, and a genuine differentiator.
5. Light + dark mode on the marketing site at minimum — evidence: repo-doc DESIGN_BRIEF — persona: all — built: yes for landing page; app-side light mode explicitly deferred per repo docs (worth flagging as a possible expectation mismatch with the product description's "light + dark" claim).

**Delighter (they tell a friend)**
1. Real-time or mid-session pre-trade rule enforcement (a warning or soft block before the trade, not just a grade after) — evidence: [S1][S2] — persona: Deval, Farah — built: no (repo-doc confirms TradeOS is post-hoc only today; this is the single biggest named gap vs. Journali/Tradingtick/Temper).
2. Cross-history behavioral pattern detection (day-of-week, post-loss, post-winning-streak patterns) that competitors don't surface — evidence: [S51][S7] — persona: Deval — built: check, likely no (named as a gap even TradeZella's AI doesn't close).
3. A discipline-colored P&L calendar (color by discipline, not just P&L) — evidence: repo-doc, "nobody does this" — persona: all — built: no (proposed in redesign docs only, not shipped).
4. An explicit "independent evidentiary record" framing for payout disputes with a prop firm — evidence: [S20][S21] — persona: Farah — built: check (the data likely exists; the framing/marketing does not).
5. Forgiving streaks with grace days instead of a hard reset — evidence: [S52] — persona: Marcus — built: check (unclear if streaks exist at all in TradeOS today).

## 6. What they will ask to change

1. "Why do I have to pay before I even find out if my broker actually syncs?" — reason: pay-first-no-trial is the single biggest named trust complaint about the market leader [S27][S13] — response: add a demo/sample-data mode, or unlock the rule engine on the free tier, so people see a real graded trade before paying.
2. "Why doesn't it warn me *before* I break the rule — only after?" — reason: Journali already does real-time pre-trade enforcement [S1][S2] — response: roadmap a lightweight pre-trade/near-real-time warning layer alongside the deterministic post-hoc score; be upfront that it's not there yet.
3. "Why can't it pull my Rithmic/Tradovate/NinjaTrader fills automatically like TopstepX does?" — reason: only the TopstepX connector is live-sync; broker-adapter breadth trails TraderSync's 700-950+ brokers [S53][S28] — response: publicize the generic CSV-mapping path today and prioritize the most-requested futures platform for the next live connector.
4. "Why is there no real app, just a website?" — reason: native apps are shipping across the category (TraderSync since 2017, TradeZella new, Tradoshi Android Aug 2026) [S54] — response: the PWA already closes most of the gap — promote "install to home screen" explicitly; track real demand before building native.
5. "Why do I just get a number — where's the breakdown of what actually cost me points?" — reason: Edgewonk's Tiltmeter set the bar for a visible, per-trade, dollar-cost rule breakdown [S34] — response: confirm every score tile expands into a rule-by-rule, dollar-tagged view; this is the core promise, not a nice-to-have.
6. "Why does it treat a normal loss and a revenge trade the same way?" — reason: revenge trading (re-entry within minutes of a stop-out, often oversized) is the single most-cited cause of blown accounts [S24][S3] — response: add a distinct "revenge trade" flag, separate from a generic overtrading bucket.
7. "Why do I still have to check the prop firm's own dashboard to know if I'm about to breach the consistency rule?" — reason: prop-firm dashboards are widely distrusted for lag and display errors [S19] — response: show a live "room left before breach" meter computed from TradeOS's own data, independent of the firm's dashboard.
8. "Why is the free plan basically useless if the score is the whole point?" — reason: TradeOS's free tier hides the rule engine while a free competitor (Tradoshi) ships its score at $0 [S22][S23] — response: give the free tier a capped but real taste of the score (e.g., a limited number of graded trades per month).
9. "Why is there no annual plan / discount?" — reason: every major competitor offers a 25-45% annual discount; TradeOS's billing model has no annual price field yet [S55] — response: add an annual plan with a visible discount — a proven, low-effort conversion lever.
10. "Why do I need to pay for a separate API subscription just to connect my TopstepX account?" — reason: the ProjectX Gateway API is a distinct, unaffiliated ~$29/mo product [S47] — response: state this clearly during connector setup, and clarify TradeOS isn't Topstep-endorsed, so it isn't a surprise mid-signup.
11. "Why does my streak reset the day after I finally get back on track?" — reason: hard-reset streaks are flagged as a near-dark-pattern risk on a discipline product [S52] — response: if streaks ship, include a few forgiving "grace days" rather than a hard reset.
12. "Why is support slow when something looks wrong with my synced trades?" — reason: support speed is a proven differentiator (praised for TraderSync, criticized for Tradervue) [S29][S32] — response: track import-related support response time as its own SLA, not a general queue.
13. "Why does the mobile version feel thinner than the desktop dashboard?" — reason: mobile-first execution is still rare in this category and is one of TradeOS's real advantages if delivered fully [S25][S33] — response: audit that every core flow (import, score detail, alerts) works fully in the PWA, not just a read-only view.

## 7. What the repo already believed vs what we found

**Right:** the dark-app / light-landing design split matches an entrenched, expected convention for professional trading tools (reduced eyestrain over multi-hour sessions) [S56]. Broker-sync reliability as the #1 technical complaint is independently confirmed across three separate research rounds, not just the repo's own prior write-up. The anti-gauge-sprawl design principle and the AI-coach skepticism claim are both corroborated by fresh search-snippet evidence, not just internal opinion.

**Wrong or stale:** the July 2026 DESIGN_BRIEF and COMPETITOR_RESEARCH still describe the discipline score as "genuinely unclaimed territory" — this was already walked back by the repo's own September 2026 refresh and is further undercut by this round's finding that Journali, Tradoshi, Rulebook, Consistry, Tradingtick and Temper all now occupy some version of this niche, with Journali specifically doing real-time pre-trade enforcement TradeOS's architecture doesn't [S1][S2]. The design brief was never revisited after the September refresh — a live contradiction sitting in the docs today.

**Never considered:** FTMO, the largest global prop firm, appears nowhere in the repo's competitor docs or in any of this round's confirmed findings (the FTMO-specific gap-fill sweep failed on an exhausted search budget and returned nothing) — a real hole given the "global" market lens. The repo docs also never discuss the evaluation-fee sunk-cost angle (traders have already paid $100-500 plus a profit share before they ever consider TradeOS) as a pricing anchor. No repo doc or this round's research captured actual TradeOS user churn or cancellation reasons, or any GCC/Arabic-market signal — both remain open, unaddressed gaps rather than settled scoping decisions.

## 8. Sources

| # | Claim (short) | Evidence type | Confidence | Source title | Host | URL / file:line | Date |
|---|---|---|---|---|---|---|---|
| S1 | Journali live pre-trade "TradeCheck," 10+ firm rulebooks | repo-doc | medium | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:30-32 | 2026-09-01 |
| S2 | TradeOS grades post-hoc, not pre-trade; Journali ranked top positioning threat | repo-doc | high / medium | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:64,34 | 2026-09-01 |
| S3 | Loss aversion → frustration → oversized impulsive trade → revenge-trading loop | search-snippet | medium | Loss Aversion in Trading | hoc-trade.com / wallstreetprep.com | https://hoc-trade.com/blogs/trading-psychology/loss-aversion-trading | 2026 |
| S4 | Average 2-4 attempts before first getting funded | search-snippet | medium | Prop Firm Evaluation Pass Rates: Statistics & Reality Check | damnpropfirms.com | https://damnpropfirms.com/trading-guides/prop-firm-evaluation-pass-rates-statistics-reality-check/ | 2026 |
| S5 | 80-95% fail; 60-70% of failures from drawdown; 1-3% become long-term funded | search-snippet | medium | same as S4 | damnpropfirms.com | same | 2026 |
| S6 | Traders "trade well 18 days and self-destruct on day 19"; 10-20% pass rates | search-snippet | medium | Why Traders Fail Prop Firm Challenges | onefunded.com / thinkcapital.com | https://onefunded.com/blog/trading-psychology/why-traders-fail-prop-firm-challenges/ | 2026 |
| S7 | Overconfidence after a winning streak called "most dangerous phase" | search-snippet | medium | The Psychology of Prop Trading | prop.tradovate.com | https://prop.tradovate.com/blogs/psychology-of-prop-trading | 2026 |
| S8 | Evaluation fee $100-500 + 10-30% profit share kept by firm | search-snippet | low | Prop Firm Regulation News Q3 2026 | track360.io | https://track360.io/blog/prop-firm-regulation-news-roundup-q3-2026 | 2026 |
| S9 | Aha-moment within 5 min → 40% higher 30-day retention | search-snippet | medium | Aha moment guide / PLG Onboarding and Activation | appcues.com / productled.com | https://www.appcues.com/blog/aha-moment-guide | 2026 |
| S10 | Pre-defined daily loss limit + mandatory pause as circuit-breaker | search-snippet | medium | Loss Aversion in Trading: Examples, Psychology & Fixes | hoc-trade.com | https://hoc-trade.com/blogs/trading-psychology/loss-aversion-trading | 2026 |
| S11 | Read-only, minimum-necessary API permissions as trust signal | search-snippet | medium | API Key Security: Complete Guide for Crypto Traders | tradelink.pro | https://tradelink.pro/blog/how-to-secure-api-key/ | 2026 |
| S12 | Edgewonk Tiltmeter shows dollar cost of rule-breaking per trade | search-snippet | medium | Edgewonk Review 2026 | tradespad.com | https://tradespad.com/blog/edgewonk-review | 2026 |
| S13 | "If your broker sync doesn't work, you're stuck paying for a product you can't fully use" | search-snippet | medium | TradeZella Review 2026: Worth $59/Month? | traderssecondbrain.com | https://traderssecondbrain.com/guides/tradezella-review | 2026 |
| S14 | Onboarding tone should be diagnostic not shaming for repeat-failure traders | model-prior | low | (no source) | — | — | — |
| S15 | Topstep Maximum Loss Limit is end-of-day trailing, Daily Loss Limit not itself a violation | search-snippet | medium | Topstep Trading Combine Rules 2026 | tradecovex.com | https://tradecovex.com/guides/topstep-combine-rules-2026 | 2026 |
| S16 | Apex consistency rule changed to 50% (from 30% legacy) as of March 1, 2026; no rule during evaluation | search-snippet | medium | Apex Trader Funding Consistency Rule (2026) | tradedupe.com | https://tradedupe.com/apex-consistency-rule | 2026-03-01 |
| S17 | Apex consistency rule "punishes excellence rather than preventing gambling" | search-snippet | medium | Apex Consistency Rule Explained | benzinga.com | https://www.benzinga.com/money/apex-consistency-rule-explained | 2026 |
| S18 | Traders' payout/dispute anxiety strengthens value of an independent discipline record | search-snippet | medium | Topstep Trustpilot reviews (snippet) | trustpilot.com (via snippet) | https://no.trustpilot.com/review/topstep.com | 2026 |
| S19 | Dashboard lag/errors; trading-day vs. calendar-day confusion causing unexpected failures | search-snippet | medium | Prop firm dashboard/trust review snippets | trustpilot.com / propfirmo.com (via snippet) | https://ca.trustpilot.com/review/propfirmo.com | 2026 |
| S20 | Topstep payouts "extremely slow," "lack of responsibility for system problems" | search-snippet | medium | Topstep Trustpilot reviews (snippet) | trustpilot.com (via snippet) | https://no.trustpilot.com/review/topstep.com | 2026 |
| S21 | TradeOS should avoid being conflated with prop firms' own payout/support reputation | search-snippet | medium | The Funded Trader Reviews | trustpilot.com | https://www.trustpilot.com/review/thefundedtraderprogram.com | 2026 |
| S22 | TradeOS free Starter tier ships with `ruleEngine: false` | repo-doc | high | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:20,66 | 2026-09-01 |
| S23 | Tradoshi ships free discipline score ("Oshi score") at $0 | repo-doc | high | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:66 | 2026-09-01 |
| S24 | "Revenge Trading blows funded accounts... tight drawdown + oversized re-entry + no cooldown" | search-snippet | medium | Revenge Trading: How Funded Traders Blow Accounts | damnpropfirms.com | https://damnpropfirms.com/trading-guides/revenge-trading-how-funded-traders-blow-accounts/ | 2026 |
| S25 | TradeZella has no shipped mobile app as of 2026 | search-snippet | medium | TradeZella on X: mobile app plans | x.com | https://x.com/TradeZella/status/1793510435586802083 | 2026 |
| S26 | TradeZella 4.8/5 Trustpilot (988 reviews, July 2026) | search-snippet | medium | TradeZella Review 2026: Worth $59/Month? | traderssecondbrain.com | https://traderssecondbrain.com/guides/tradezella-review | 2026-07 |
| S27 | TradeZella no free trial, no published refund policy, $59/mo called steep | search-snippet | medium | TradeZella Review 2026 | traderssecondbrain.com | https://traderssecondbrain.com/guides/tradezella-review | 2026 |
| S28 | TraderSync manual CSV template + column-matching for unsupported brokers | fetched-page | high | How can I Import a file? - TraderSync | tradersync.com | https://tradersync.com/support/how-can-i-import-a-file/ | 2026 |
| S29 | TraderSync support "spotless," "truly excellent"; "most versatile and easy to use" | search-snippet | medium | TraderSync Review 2026 | stockbrokers.com | https://www.stockbrokers.com/review/tools/tradersync | 2026 |
| S30 | Quant-leaning TraderSync users "don't fully trust the platform's metrics" | search-snippet | medium | In Their Words: Why You Should Use TraderSync | benzinga.com | https://www.benzinga.com/money/tradersync-review | 2026 |
| S31 | Tradervue 2.6/5 Trustpilot; billing/cancellation friction; no AI/replay/backtest | search-snippet | medium | Tradervue Review: Free Plan or Fading Fast? | daytradingtoolkit.com | https://daytradingtoolkit.com/reviews/tradervue-review | 2026 |
| S32 | Tradervue support "could be more responsive" | search-snippet | medium | Tradervue Review | daytradingtoolkit.com | https://daytradingtoolkit.com/reviews/tradervue-review | 2026 |
| S33 | Edgewonk desktop-first design frustrating for mobile-first traders; single-user only | search-snippet | medium | Edgewonk Pricing 2026 | tradingsfx.com | https://tradingsfx.com/blog/edgewonk-pricing | 2026 |
| S34 | Edgewonk pushes users to tag mistakes/score discipline vs. journals that "stop at win rate and P&L" | search-snippet | medium | Edgewonk Review: Is It the Best Option in 2026? | tradespad.com | https://tradespad.com/blog/edgewonk-review | 2026 |
| S35 | Edgewonk needs "statistically significant" trade volume before insights are useful | search-snippet | medium | Edgewonk Review 2026: Pros & Cons | daytradingz.com | https://daytradingz.com/edgewonk-review/ | 2026 |
| S36 | TradesViz automates prop-firm rule config in depth; TopstepX integration page; replay by minutes/seconds | fetched-page / search-snippet | high / medium | The Best Trading Journal for TopStepX | tradesviz.com / saashub.com | https://www.tradesviz.com/brokers/TopStepX | 2026 |
| S37 | TradesViz confusing interface; free tier capped at stocks only, 3,000 executions | search-snippet | medium | TradesViz Review 2026 | traderssecondbrain.com | https://traderssecondbrain.com/guides/tradesviz-review | 2026 |
| S38 | Chartlog "most affordable journal with real analytics," clean UI | search-snippet | medium | Chartlog Review 2026 | bullishbears.com | https://bullishbears.com/chartlog-review/ | 2026 |
| S39 | Stonk Journal "better than some paid options like TradeZella"; fully manual entry, no broker sync free | search-snippet | medium | Stonk Journal reviews | trustpilot.com (via snippet) | https://uk.trustpilot.com/review/stonkjournal.com | 2026 |
| S40 | TopstepX free Tilt Indicator/stats; ~86% higher pass rate cited for its users | search-snippet | medium | TopstepX | help.topstep.com | https://help.topstep.com/en/articles/14434175-topstepx | 2026 |
| S41 | Deterministic score vs. AI-black-box or single-meter approaches is an unmarketed distinct category claim | search-snippet | low | aggregate of reviews searched | multiple | https://www.tradezella.com/blog/trading-discipline | 2026 |
| S42 | Broker sync #1 complaint category-wide (37% of TradeZella negative reviews; TraderSync sync-stuck complaints) | repo-doc | high | TradeOS COMPETITOR_RESEARCH.md / competitor-analysis refresh | repo | docs/redesign/COMPETITOR_RESEARCH.md:63,98; docs/competitor-analysis/report-2026-09-01.md:48-49,72 | 2026-07 / 2026-09-01 |
| S43 | "AI coach" viewed with skepticism — "a chatbot with a trading prompt pasted in front of it" | repo-doc | high | TradeOS landscape-trends.md | repo | docs/redesign/research/landscape-trends.md:69 | 2026-07 |
| S44 | "The trader who lasts is the one who shuts it down after the first loss..." | search-snippet | medium | Why Most Funded Traders Blow Up | smarttraders.substack.com | https://smarttraders.substack.com/p/why-most-funded-traders-blow-up-and | 2026 |
| S45 | Apex Trader Funding "allegedly struggling with timely payouts"; new fraud-detection systems in "final touches" | search-snippet | medium | Apex Trader Funding Review | benzinga.com | https://benzinga.com/money/apex-trader-funding-review | 2026 |
| S46 | Pricing-transparency complaints; pay-before-you-see-it called biggest trust complaint | repo-doc | high | TradeOS DESIGN_BRIEF.md / landscape-trends.md | repo | docs/redesign/DESIGN_BRIEF.md:16; docs/redesign/research/landscape-trends.md:68 | 2026-07-12 |
| S47 | TopstepX ProjectX Gateway API is a separate ~$29/mo subscription, unaffiliated with Topstep endorsement | search-snippet | medium | TopstepX API Access | help.topstep.com | https://help.topstep.com/en/articles/11187768-topstepx-api-access | 2026 |
| S48 | CFTC consultation on prop-firm challenge fees as commodity-pool interests, closing Nov 30 2026 | search-snippet | medium | Prop Firm Regulation News Q3 2026 | track360.io | https://track360.io/blog/prop-firm-regulation-news-roundup-q3-2026 | 2026 |
| S49 | 80-100 prop firms collapsed/shut down 2024-early 2026 | search-snippet | low | How regulators are closing in on retail prop trading in 2026 | theindustryspread.com | https://theindustryspread.com/retail-prop-trading-regulation-2026-my-forex-funds-cftc/ | 2026 |
| S50 | ~78% of prop-firm clients male; Gen Z + Millennials 60%+ of segment | search-snippet | low | Day Trader Demographics & Statistics (2026) | papertradingjournal.com | https://papertradingjournal.com/2026/05/14/day-trader-demographics-and-statistics/ | 2026-05-14 |
| S51 | TradeZella's AI gives per-trade commentary only, no cross-history pattern detection (day-of-week, post-loss) | search-snippet | medium | Best Trading Journal Software (2026) | tradezella.com / traderssecondbrain.com | https://www.tradezella.com/blog/best-trading-journal-software | 2026 |
| S52 | Streaks are "one design decision away from being a dark pattern"; grace days mitigate | search-snippet | medium | Streak Creep: When Gamified Engagement Mechanics Backfire | thedecisionlab.com / thebrink.me | https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification | 2026 |
| S53 | TraderSync claims 700+ (repo-doc cites 950+) supported brokers, widest coverage in category | search-snippet / repo-doc | medium / high | TraderSync Review 2026 / competitor-analysis refresh | traderssecondbrain.com / repo | https://traderssecondbrain.com/guides/tradersync-review ; docs/competitor-analysis/report-2026-09-01.md:67 | 2026 / 2026-09-01 |
| S54 | TradeOS lacks a native mobile app while TraderSync, TradeZella, and now Tradoshi (Android, Aug 27 2026) ship native apps | repo-doc | high | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:68 | 2026-09-01 |
| S55 | TradeOS Pro/Elite pricing has no annual discount field in `plans.ts`, unlike competitors' 25-45% annual discounts | repo-doc | high | TradeOS competitor-analysis report-2026-09-01.md | repo | docs/competitor-analysis/report-2026-09-01.md:13,65 | 2026-09-01 |
| S56 | Dark mode is the entrenched convention for professional trading interfaces (reduced eyestrain, expertise signaling) | repo-doc | high | TradeOS landscape-trends.md | repo | docs/redesign/research/landscape-trends.md:54,56 | 2026-07 |

**Blocked hosts (could not fetch — snippet only):** reddit.com, trustpilot.com, journali.io / www.journali.io, edgewonk.com, tradervue.com (direct fetch), ftmo.com (not reached this round — search budget exhausted before any query executed).
