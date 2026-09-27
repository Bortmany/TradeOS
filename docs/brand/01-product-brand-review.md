# TradeOS: Product and Brand Review

**PRODUCT**
TradeOS is a trading discipline engine for day traders. It imports trades (CSV from Topstep, Apex, Tradovate, NinjaTrader, Rithmic, IBKR, plus a live read-only TopstepX/ProjectX connector), grades each one against the trader's own no-code rulebook, and gives a deterministic, explainable 0 to 100 discipline score per trade and per day with rule-by-rule pass/fail. Also: analytics, a prop-firm tracker with Topstep/Apex/TPT presets and guardrails, trade replay, PDF reports. Plans: Starter free, Pro $29/mo, Elite $79/mo; 14-day trial, no card. Source: `README.md`.

**TARGET CUSTOMER**
Funded (prop) and live futures day traders, mostly men 24 to 45, who blow accounts by breaking rules they already wrote.

**PRIMARY USER**
The individual trader at a home desk, checking the score after the session and before the next. Single-player; no coach or team layer.

**INDUSTRY**
Retail futures trading software: journals, analytics, prop-firm compliance.

**CORE PROBLEM**
Accounts rarely end on a bad setup. They end on a broken rule under pressure: the revenge trade, the extra contracts, the trade after the cutoff. Journals record what happened; nothing measures whether the plan was followed.

**CORE VALUE PROPOSITION**
"Your trading, held to your own rules." TradeOS makes discipline a number that goes up: every trade graded against your rulebook, every rule shown as pass or fail.

**KEY DIFFERENTIATORS**
1. Score-first, not P&L-first: the discipline score is the visual anchor of the product.
2. Deterministic and explainable: no black box, a full audit trail per rule evaluation.
3. Your rules, not ours: a no-code rulebook the trader writes.
4. Prop-firm guardrails with real firm presets and buffer-remaining tracking.
5. Multi-broker normalization into one schema.

**EXISTING BRAND PERSONALITY**
Straightforward, numbers-literate, calm. No hype, no promised returns, no rocket or "get rich" language, never financial advice. Anchors: "The discipline engine for day traders", "Built for funded & live day traders", "Score-first". Every ad ends with "For educational analytics only. Not financial advice." Source: `src/app/page.tsx`, `docs/redesign/DESIGN_BRIEF.md`.

**EXISTING VISUAL IDENTITY**
Dark terminal. Background #0a0b0f, surface #111318, off-white text #eaedf0. Electric blue #5593f7 is the only accent. Profit green #2dbe7a and loss red #e64c57 are reserved strictly for P&L and pass/fail meaning; amber #f6b128 marks mid scores (60 to 79). System sans plus monospace with tabular numerals. App icon: a blue rising zigzag ending in a green dot on a near-black rounded square. Sources: `src/app/icon.svg`, `src/app/globals.css`, `docs/redesign/DESIGN_BRIEF.md`, `public/screenshots/dashboard-dark.png`, `Agents/logo-concepts.json`.

*For educational analytics only. Not financial advice.*
