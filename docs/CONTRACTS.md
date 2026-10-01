# TradeOS — Module Contracts (authoritative)

All modules import shared types from `@/lib/types` and helpers from `@/lib/utils`.
The Prisma client is at `@/lib/db` (`import { prisma } from "@/lib/db"`).
Path alias `@/*` → `src/*`. Strict TypeScript. Node 22. Next.js 15 App Router.

**Enum-like fields are strings** validated by unions in `types.ts`
(`Side`, `RuleType`, `Severity`, `EvalStatus`, `TradeSource`, `Broker`, etc.).
**Json columns are stored as JSON strings** in the DB (`Rule.config`,
`DisciplineSnapshot.breakdown`, `Alert.meta`) — `JSON.parse`/`JSON.stringify`
at the boundary.

The canonical trade shape passed to pure functions is `TradeRecord` (in
`types.ts`). Open trades have `exitTime === null` / `exitPrice === null` and are
excluded from realized-P&L math. `pnl` is realized, net of fees.
`TradeRecord` (and the normalized import shape) carry an optional
`assetClass?: "futures" | "forex" | "cfd" | null` (`ASSET_CLASSES` in `types.ts`;
stored as the plain-string column `Trade.assetClass`). `null`/absent means
futures, exactly as for every trade saved before forex/CFD support. `data.ts`
(`mapTrade`) and `rules/recompute.ts` copy it across; the rule engine and the
discipline score never read it.

Session classification (US futures, times in America/New_York):
- `pre` 04:00–09:30, `rth_am` 09:30–12:00, `lunch` 12:00–13:00,
  `rth_pm` 13:00–16:00, `post` 16:00–20:00, `overnight` otherwise.

Grading zone vs display zone: grading (rule engine, discipline score, ET day
keys, report windows) is fixed to America/New_York and never reads the user's
setting. `User.timezone` is DISPLAY ONLY: it changes how times are printed, via
`formatDateTime`/`formatDate(value, zone)` in `utils.ts` (zone label after every
time, e.g. "9:45 AM ET"); day-key strings are printed unshifted.

Journal paging and report windows (read-only, per user):
- `getTradesPage(userId, { filter, limit, cursor })` in `data.ts` returns
  `{ rows, nextCursor, total }`, newest first (`entryTime` desc, then `id`
  desc). The cursor is an opaque compound (`entryTime` + `id`) so trades with
  identical times are never skipped or repeated; a malformed cursor throws
  `InvalidCursorError` (route answers 400). Page size is clamped to 1..100.
  Filters (account, symbol, strategy, source, outcome, `fromDay`/`toDay`) run in
  the database; `total` is the count for the filters. Day filters are New York
  calendar days (ET midnight to ET end of day, the `etDayKey` boundary). Served
  to the browser by `GET /api/trades/page` (`USER_READ_LIMIT`, 120/min/user).
- `buildReport(userId, period, accountId?, anchorKey?)` in `reports.ts` covers
  the New York days ending on `anchorKey` (day = 1, week = 7, month = 30); a
  trade is in the window when `etDayKey(entryTime)` is. `resolveReportAnchor`
  turns `?date=` into the anchor (future/malformed → today ET; none → the
  latest ET day with trades via `getLatestTradeDayKey`). Report maths unchanged.

---

## Package A — Analytics (`src/lib/analytics/`)
Pure, deterministic, no DB access. Files: `metrics.ts`, `equity.ts`,
`buckets.ts`, `drawdown.ts`, `index.ts` (barrel).

Exports (exact names):
- `computeMetrics(trades: TradeRecord[]): PerformanceMetrics`
- `buildEquityCurve(trades: TradeRecord[], startingBalance?: number): EquityPoint[]`
- `computeDrawdownSeries(equity: EquityPoint[]): { time: number; drawdown: number }[]`
- `byHourOfDay(trades): BucketPerformance[]` (keys "09:00".."15:00" ET)
- `byWeekday(trades): BucketPerformance[]` (Mon..Fri)
- `bySession(trades): BucketPerformance[]` (labels: Pre, RTH AM, Lunch, RTH PM, Post, Overnight)
- `byStrategy(trades): BucketPerformance[]`
- `bySymbol(trades): BucketPerformance[]`
- `classifySession(entryTime: Date): string`
Only closed trades count toward metrics; `winRate` in 0..1; `profitFactor`
`Infinity` when no losses (guard in UI). Return zeroed metrics for empty input.

## Package B — Rules & Discipline (`src/lib/rules/` + `src/lib/discipline/`)
Files: `rules/config.ts` (zod parse/validate + typed accessors),
`rules/engine.ts`, `rules/recompute.ts`, `discipline/score.ts`, `index.ts`.

Types:
```ts
export interface RuleLike { id: string; name: string; type: RuleType;
  severity: Severity; weight: number; config: unknown /* parsed object */ }
export interface EvalResult { ruleId: string; ruleName: string; status: EvalStatus;
  severity: Severity; explanation: string }
```
Exports:
- `evaluateTrade(trade: TradeRecord, dayTrades: TradeRecord[], rules: RuleLike[],
   ctx?: { hasScreenshot?: boolean }): EvalResult[]`
   (dayTrades = same-account trades on the same ET calendar day, sorted by entryTime)
- `evaluateTrades(trades: TradeRecord[], rules: RuleLike[]): Record<string, EvalResult[]>`
   (keyed by trade.id; groups by account+ET-day internally)
- `computeDisciplineScore(args: { trades: TradeRecord[];
   evaluations: Record<string, EvalResult[]> }): DisciplineScore`
   (deterministic; ruleAdherence = % passing weighted evals; riskDiscipline from
   risk/loss-limit rules + drawdown behavior; emotionalDiscipline from emotions
   tags — revenge/fomo/greedy penalize; consistency from daily-pnl variance &
   win-rate stability. Each 0..100. `overall` = weighted blend. Fill `breakdown`.)
- `recomputeUserCompliance(userId: string): Promise<void>` — loads the user's
   trades + active rulebooks (respecting `RuleBook.scope`), runs `evaluateTrades`,
   upserts `RuleEvaluation` rows (unique [tradeId,ruleId]), updates each trade's
   `complianceScore`/`violationCount`/`isWin`, and upserts `DisciplineSnapshot`
   rows for day/week/month/all periods (`breakdown` JSON-stringified). Uses prisma.

Rule semantics (config shapes are in `types.ts`):
- `time_window`: fail if entryTime ET time outside [start,end].
- `risk_limit`: fail if trade loss (−pnl) exceeds maxLossPerTrade (or maxRiskPct×balance).
- `max_trades`: fail on trades beyond maxPerDay (Nth+ trade of the day).
- `max_contracts`: fail if quantity > maxContracts.
- `max_daily_loss`: fail every trade on a day whose cumulative pnl breached −maxDailyLoss.
- `behavioral` revenge: a losing trade followed by a new entry within withinMinutes → the follow-up fails.
- `behavioral` overtrading: > threshold trades within windowMinutes → the excess fail.
- `indicator`: fail if requireTag not present in trade.tags.
- `setup_validation`: fail if required strategyTag/notes/screenshot missing.
`not_applicable` when a rule can't apply (e.g. open trade for pnl-based rules).
Explanations are human-readable and deterministic, e.g.
`"Entered 09:12 ET — before the 09:30 window opens."`

## Package C — Ingestion (`src/lib/ingestion/`)
Files: `csv.ts` (RFC-4180 parser: `parseCsv(text): { headers: string[]; rows: string[][] }`),
`adapters/{topstepx,tradovate,ninjatrader,rithmic,ibkr,mt5,generic}.ts`, `index.ts`.

Adapter interface:
```ts
export interface BrokerAdapter {
  key: Broker; label: string;
  detect(headers: string[]): boolean;           // heuristic header match
  parse(headers: string[], rows: string[][], options?: { serverTime?: ServerTime }): {
    trades: NormalizedTrade[]; skipped: number; errors: string[];
    refusal?: string;       // whole-file refusal, plain English (nothing imported)
    openSkipped?: number;   // MT5 only
    timesReadAs?: string;   // MT5 only, e.g. "UTC+3"
  };
}
```
The optional third argument is ignored by every adapter except `mt5`.
Registry + orchestrator in `index.ts`:
- `ADAPTERS: BrokerAdapter[]`
- `detectAdapter(headers): BrokerAdapter | null`
- `ingestCsv(text: string, brokerKey?: Broker, options?: { serverTime?: ServerTime }): { broker: Broker;
   trades: NormalizedTrade[]; skipped: number; errors: string[]; refusal?: string;
   openSkipped?: number; timesReadAs?: string }`
Validate each row with `NormalizedTradeSchema`. Every numeric field is `.finite()`
and bounded (`MAX_TRADE_PRICE`/`MAX_TRADE_QUANTITY`/`MAX_TRADE_FEES`/`MAX_TRADE_PNL`
in `src/lib/types.ts`) so an overflow row that computes to `Infinity` is rejected
and reported as a row error, never silently dropped at insert time. Compute `pnl`
when the file lacks it: **futures** (and any symbol the instruments table does
not know) long = (exit−entry)×qty×mult − fees; short = (entry−exit)×qty×mult − fees;
with the futures point multiplier table (ES=50, MES=5, NQ=20, MNQ=2, RTY=50,
M2K=5, YM=5, MYM=0.5, CL=1000, GC=100, MGC=10, default 1 — this default is
right for shares only) now in `src/lib/instruments/futures.ts`; `symbols.ts` is
a one-line re-export. **Forex/CFD** symbols known to `getInstrument` are NOT
priced with that default: `TradeCollector.add` uses `pnlFromPrices` from
`src/lib/instruments/` (USD account, quantity = lots, fees subtracted, rounded
to cents); a row that needs a conversion rate nobody supplied is skipped with
"needs a GBPUSD rate". A P&L already present in the file is always trusted.
In this generic fallback `getInstrument` is called with `{ useAliases: false }`:
only exact table symbols and their broker endings (XAUUSD, XAUUSD.r, EURUSDm)
count, NEVER bare aliases (GOLD, SILVER, WTI, BRENT ...), so a stock ticker such
as GOLD or WTI keeps the shares maths. The MT5 adapter supplies its own P&L and
resolves aliases. Forex quantity here means LOTS: a forex row whose quantity is
1000 or more is read as units (IBKR style, e.g. 20000) and skipped with a plain
message ("EURUSD quantity 20000 looks like units, not lots ..."), never guessed;
the rule applies only when P&L is computed (no P&L column).
`generic` maps common column names (symbol/ticker, side/direction,
qty/quantity/size, entry/exit price, times). `TradeCollector` rows take an
optional `assetClass`, passed into the checked trade shape.

**MetaTrader 5 adapter (`adapters/mt5.ts`, key `mt5`, label "MetaTrader 5")** — a
FILE import of the MT5 "Positions" history table saved as comma CSV (not a live
connector; see `docs/connectors.md`). Columns, in order:
`Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price,
Commission, Swap, Profit`. Detect: has Position, Symbol, Volume, S / L, T / P
(also claims the Deals table and a semicolon file so it can refuse them in plain
English: `refusal`). Time and Price each appear twice; the adapter reads the
open (first) and close (second) by column ORDER, never `headerIndex`. One row =
one round trip (MT5 already matched fills). Mapping: quantity = Volume (lots);
side buy→long, sell→short; `pnlGross` = Profit; `fees` = −(Commission + Swap)
(a swap credit lowers fees; may be below zero); `pnl` = Profit + Commission +
Swap (Profit is trusted: MT5 already converted it to the account currency, so
the import route accepts only a USD target account, else 400 "MT5 import
supports USD accounts for now. This account is set to EUR."); `externalId` =
`mt5:<Position>` (dedupe by the unique [accountId, externalId]); `symbol` =
table symbol from `getInstrument` (broker endings and aliases resolved);
`assetClass` from the table (forex, or cfd for metals/energy/indices);
`source` csv. Comment and account name/number are never read or stored. A row
with no close time is an open position: skipped, counted in `openSkipped`
(no error line). An unknown symbol (BTCUSD ...) skips that row with "symbol X is
not supported yet"; a repeated Position keeps the first and reports the second.
A saved History report (File > Save as report) has title rows above the table
and Orders / Deals / summary sections below, maybe with blank spacer columns.
`ingestCsv` (MT5 chosen, or auto-detect that would otherwise fall to generic,
and only when row 1 is not already an MT5 header) calls `findMt5Table` on the
raw records (`parseCsvRecords`): it scans the first 30 rows for the Positions
header, reads rows until the next blank row or single-cell section title, and
passes `ParseOptions.firstDataRow` so error row numbers are real file rows. A
Deals header or semicolon header found in those rows is refused as before. Other
adapters read files exactly as before.

Times have no zone in the file; `parseMt5Time` parses the `YYYY.MM.DD HH:MM[:SS]`
layout itself (never the machine zone) and converts with the chosen
`ServerTime` (`ServerTimeSchema` in `types.ts`): `ny_close` (default; server =
New York + 7 h year-round, via `etWallToUtc`: `2026.09.14 09:15:00` →
`2026-09-14T06:15:00Z`, `2026.12.10 09:15:00` → `07:15:00Z`), `utc`, or
`offset` (whole hours −12..+14). `timesReadAs` reports the choice.

`POST /api/import` body gains an optional, zod-validated `serverTime`
(`{mode:"ny_close"} | {mode:"utc"} | {mode:"offset",hours}`); its response gains
optional `timesReadAs` and `openSkipped` (MT5 only). A `refusal` is returned as
`400 {ok:false,error}` with nothing saved. Limits unchanged.

## Package F — Instruments (`src/lib/instruments/`)
Forex/CFD symbol table and maths, plus the futures point multipliers. Pure and
deterministic, no DB, no live prices, no outbound calls. Plain JS numbers; money
rounds to cents (`Math.round(n*100)/100`, like `backtest/simulate.ts`), pips to
1 decimal, pip values to 4. Files: `table.ts` (38 rows, each with a source note
and check date; aliases in `INSTRUMENT_ALIASES`, upper-case keys), `maths.ts`,
`futures.ts`, `index.ts` (barrel).

Exports (exact names; the position-size calculator consumes these):
- `getInstrument(symbol): InstrumentRow | null` — copes with broker endings
  (`EURUSD.r`, `EURUSDm`, `.pro`, `#`, trailing `.`) and aliases (`GOLD`, `USOIL`/`WTI`,
  `NAS100`/`USTEC`, `US30`/`DJ30`, `GER40`/`DE40`, `US500`/`SPX500`, `JP225`/`JPN225`).
- `pipSize(symbol)`, `pipValue(symbol, lots, accountCurrency, rate?)`,
  `pnlFromPrices({symbol, side, lots, entryPrice, exitPrice, accountCurrency, rate?})`
  (before fees), `pipsFromPrices(symbol, side, entryPrice, exitPrice)`,
  `neededConversionPair(symbol, accountCurrency)` (`null` = none needed from the caller).
- `pointMultiplier(symbol)`, `rootSymbol(symbol)`, `FUTURES_ROOTS` — futures, values unchanged.
- `InstrumentError` (`code`: `unknown_symbol | bad_input | needs_rate`; `pair` set for `needs_rate`).

Conversion-rate rule (no price feed): quote currency = account currency → none;
account currency is the pair's base (USDJPY, USDCHF, USDCAD in USD) → the trade's own
exit price is the rate (for `pipValue`, which has no price, the caller supplies it);
otherwise (EURGBP, GBPJPY, GER40, UK100, JP225 in USD) the caller must supply the
conversion pair's market price as quoted (GBPUSD 1.30, USDJPY 150.00) or the call is
refused naming the pair ("needs a GBPUSD rate"). A supplied rate always beats the
trade's own price; the code decides multiply or divide. Every number must be finite
and above zero within `MAX_TRADE_PRICE` / `MAX_TRADE_QUANTITY`, and results within
`MAX_TRADE_PNL`, else `InstrumentError`. Golden rule: no table symbol or alias may
equal a futures root (ES, MES, NQ, MNQ, RTY, M2K, YM, MYM, CL, GC, MGC) — tested.
Trade page (`/journal/[id]`): forex/cfd trades show Pips and Lots; the replay's dollar
readout is "—" for them.

## Package E — Backtesting (`src/lib/backtest/`)
Pure, deterministic, no DB access — persistence lives in `/api/backtests*` and
`src/lib/backtest-data.ts` (`server-only`). Files: `candles.ts`, `simulate.ts`,
`replay.ts`, `results.ts`, `time.ts`, `labels.ts`, `index.ts` (barrel).

Storage (both new models cascade from User; see schema):
- `MarketDataset.candles` is a JSON **string**: `{t,o,h,l,c,v?}[]`, `t` unix
  seconds, sorted ascending, deduped, ≤ **25,000** candles per dataset.
- `BacktestRun.config` / `.results` are JSON strings. `kind`: `replay |
  simulation`; `status`: `completed | failed` (a failed run stores
  `{error}` as its results). Config zod schemas (`ReplayConfigSchema`,
  `SimConfigSchema`), `Candle`, and the stored `BacktestResults` shape live in
  `types.ts`. Deleting a dataset leaves its runs intact (`datasetId` SetNull —
  results are self-contained snapshots).

Exports (exact names):
- `parseCandleCsv(text): { candles: Candle[]; skipped: number; errors: string[] }`
  — comma-delimited chart exports (TradingView/NinjaTrader) via the shared
  `parseCsv`. The time column accepts unix seconds/millis, ISO strings with an
  explicit zone, or zone-less date-times — which are interpreted as **ET
  wall-clock** (deterministic; exotic zone-less formats are rejected rather
  than parsed host-timezone-dependently). Timestamps outside ~1990–2099 and
  bars violating `h ≥ max(o,c)` / `l ≤ min(o,c)` are rejected as skipped rows.
- `runSimulation(candles, config: SimConfig, symbol): TradeRecord[]` — walks
  bars chronologically, one open position, strategies
  `opening_range_breakout | ma_cross | prev_day_level`. All simulated trades
  are CLOSED and use constant `userId`/`accountId` `"sim"`, `source "manual"`,
  `$`-per-point via the shared `pointMultiplier(symbol)`.
  **Fill rules (conservative, per bar, in order):** gap-open checks for BOTH
  legs come first — a bar that OPENS through the stop or the target fills at
  its open (the open precedes all intrabar movement) — then the intrabar stop
  leg, then the target leg. On the bar an intrabar entry fills, the gap-open
  branches are skipped entirely (that open happened BEFORE the entry existed);
  only intrabar stop-then-target can exit the entry bar. Slippage
  (`slippageTicks × tickSize`) is adverse on entry fills (stop or market) and
  protective stops; target limit fills take none. Prior-bar ma_cross signals
  act at a bar's OPEN and are processed BEFORE that bar's bracket exits.
  Positions also flatten at `flattenAt` ET (fill at that bar's open) and at
  the day's final bar (last close) if still open there. Time reasoning is ET
  via the shared Intl helpers (`etClock`/`etDayKey`; `etWeekday` and
  `etWallToUtc`/`etDateStartUtc`/`etDateEndUtc` added in `time.ts`).
  `prev_day_level` uses the previous ET trading day PRESENT in the dataset.
  ma_cross signals fire on a bar's close and act at the next bar's open;
  fast ≥ slow throws.
- `runReplay(allTrades, config: ReplayConfig, rules: RuleLike[] | null,
  ruleScope?, ctxByTradeId?): { variantTrades; baselineTrades; exclusions }`
  — baseline = closed trades in account + date window only; the window's
  `from`/`to` are plain `YYYY-MM-DD` strings interpreted as ET midnight → ET
  end-of-day (inclusive), never host/UTC day boundaries; variant adds
  strategy/symbol/session/weekday/side filters (session compares
  `classifySession` KEYS, e.g. `rth_am`); with rules, trades failing ≥ 1 rule
  are excluded (in-memory `evaluateTrades` — NEVER `recomputeUserCompliance`;
  backtests write no RuleEvaluation/DisciplineSnapshot/Trade denorms).
  `ruleScope` mirrors RuleBook scope semantics (`all | strategy | account`).
- `assembleResults({variant, baseline, exclusions, truncated?}): BacktestResults`
  — metrics via `computeMetrics` for variant AND baseline, equity via
  `buildEquityCurve(trades, 0)` (cumulative P&L, comparable curves), buckets
  via `bySession`/`byHourOfDay`/`byWeekday`. **Caps:** equity downsampled to ≤
  2,000 points (final point kept), trade/exclusion samples ≤ 500 rows with
  `tradeCountTotal`/`excludedCountTotal` carrying real totals; drawdown is NOT
  stored — derive at render time via `computeDrawdownSeries`. **Sanitization:**
  non-finite numbers (profitFactor `Infinity`, NaN) become `null`
  (`StoredMetrics`); UI renders a null profitFactor with wins as "∞".
- `sanitizeMetrics`, `downsampleEquity`, `MAX_EQUITY_POINTS`, `MAX_ROW_SAMPLE`,
  `etWeekday`, `hmToMinutes`, and the label maps (`SIM_STRATEGY_LABELS`,
  `SESSION_LABELS`, `BACKTEST_KIND_LABELS`, `WEEKDAY_SHORT` in `labels.ts`,
  client-safe).

Feature gating: `PlanFeatures.backtesting` (free: false, pro/elite: true),
enforced at the `/backtest` page AND both POST routes (`/api/backtests`,
`/api/backtests/datasets`). Caps: 2 MB `csvText`, 25k candles per dataset,
**20 datasets and 200 recorded runs per user** (total storage, not just rate),
run creation 20/10min, dataset upload 10/10min. The profile export includes
dataset METADATA only — candle blobs are excluded by design. Tests:
`scripts/test-backtest.ts` (chained into `npm test`).

## Package D — Seed (`prisma/seed.ts`)
Standalone `tsx` script using `@prisma/client` directly (NOT importing `@/lib/*`
except optional try/catch dynamic imports near the end: `../src/lib/rules/recompute`
and the `../src/lib/backtest/*` engines, which compute the two seeded example runs). Idempotent:
wipe demo user's data then recreate. Create:
- demo user `demo@tradeos.app` / password `demo1234` (bcrypt hash), plan `pro`,
  billingStatus `active`.
- 3 TradingAccounts: "Topstep 50K" (funded), "Apex 100K" (evaluation), "Live IBKR" (live).
- ~250 realistic futures trades across the accounts over the last ~70 days
  (symbols ES/MES/NQ/MNQ), realistic win-rate ~48–55%, R-multiples, fees,
  strategy tags (VWAP Reclaim, ORB, Trend Pullback, Reversal), emotions,
  notes on some, session-clustered entry times during RTH mostly. Deterministic
  (seedable PRNG — DO NOT use Date.now()/Math.random without a fixed seed; use a
  small mulberry32 with a constant seed so results are reproducible).
- 2 RuleBooks with rules covering time_window, max_daily_loss, max_contracts,
  max_trades, behavioral(revenge), setup_validation (config JSON-stringified).
- 1 PropAccount for the Topstep account (Topstep 50K preset:
  profitTarget 3000, maxDailyLoss 1000, maxDrawdown 2000 trailing, consistencyPct 0.5).
- no hand-planted Alerts: the closing recompute runs the real alert generator,
  so demo alerts come from the seeded trades. The tracker's phase matches the
  account's own kind (the account's status is the truth).
End by calling `recomputeUserCompliance(user.id)` if available (dynamic import,
try/catch) so evaluations + discipline snapshots exist. Log a summary.

DO NOT edit files outside your package. Keep code clean, typed, and commented
sparingly where logic is non-obvious. Do not run `npm`/`prisma` unless verifying
your own file compiles conceptually — the orchestrator handles builds.

## Package G — Pre-trade checklist and position size (`src/lib/checklist/`, `src/lib/sizing/`)

Reminders and arithmetic only. **Nothing here reads or changes the rule engine, the discipline score, or any broker; nothing places, changes or cancels an order.** A test greps the code and the score/rule files to keep it that way.

### Tables (additive; plain-String/Boolean/Int, SQLite + Postgres)
- `ChecklistTemplate` — `userId`, `name`, `ruleBookId?` (SetNull), `isActive`, `order`. Max 10 per user.
- `ChecklistItem` — `templateId` (cascade), `text` (max 140), `order`. 1 to 20 per template.
- `ChecklistRun` — `userId`, `templateId?` (SetNull), `templateName`, `answers` (JSON string `[{text, checked}]`, its own copy of the wording), `checkedCount`, `totalCount`, `tradeId?` (**unique**, SetNull: a trade has at most one run; deleting the trade keeps the run), `createdAt` (the saved time). Max 5,000 per user.
- "Ticked before entry" vs "Filled in after entry" is computed: `run.createdAt <= trade.entryTime`. No stored flag.

### Routes (all session-checked, zod on every input, every query filtered by the signed-in user; another user's id answers 404 exactly like a missing one)
| Route | Does | Limiter |
|---|---|---|
| `GET /api/checklists` | list templates | `checklists:read` (`USER_READ_LIMIT`) |
| `POST /api/checklists` | create template (`name`, `ruleBookId?`, `items[]`) | `checklists:write` (`USER_WRITE_LIMIT`) |
| `PATCH/DELETE /api/checklists/[id]` | edit (name, rulebook, on/off, items, `move: up/down`) / delete | `checklists:write` |
| `GET /api/checklists/runs?limit&offset&unlinked=1` | recent runs | `checklists:read` |
| `POST /api/checklists/runs` | save a run (`templateId`, `ticked[]` item ids, optional `tradeId` to link at once); 409 if the trade already has one | `checklists:write` |
| `PATCH/DELETE /api/checklists/runs/[id]` | link (`tradeId`) / unlink (`null`) / delete a run | `checklists:write` |
| `GET /api/checklists/suggestion?tradeId` | `{linked, suggestion, suggestionCount, entryTime, hasTemplates}`; the suggestion is the closest unlinked run saved 0 to 4 hours before the trade's entry; never links by itself | `checklists:read` |

### Sizing (`src/lib/sizing/index.ts`, pure)
`calculatePositionSize({symbol, accountSize, riskPercent, stopDistance, accountCurrency?, dollarsPerPoint?})` returns `{ok:true,...}` or `{ok:false, code, field, message}`; it never throws.
- Money in whole cents, lots in hundredths, contracts integer; integer divide re-checked. **Always rounds down, never up**: if one contract (0.01 lot) already risks more than the limit the size is 0 with the reason.
- Futures use `pointMultiplier` but only for symbols in the futures table (an unknown symbol is refused, never priced at 1; "Other futures" needs the typed `dollarsPerPoint`). Forex/CFD use `pipValue(symbol, 1, "USD")` from `src/lib/instruments`; **USD accounts only**, a non-USD account or a pair needing a conversion price is refused with a plain message.
- Ranges: account $100 to $100,000,000; risk 0.01% to 100% (warning above 5%); stop above zero.
- Golden: MES $50,000 / 1% / 8 pts = 12 contracts, real risk $480.00 (0.96%); EURUSD $10,000 / 1% / 20 pips = 0.50 lots.

## Package H — "Why I entered" and trade screenshots (`src/lib/storage/`, `src/lib/attachments.ts`)

Both are the trader's own record. **Neither changes the rule engine or the discipline score: the only link is that the existing `setup_validation` rule's `requireScreenshot` option reads whether the trade has a screenshot row, and an upload or delete just triggers the normal recompute.** Nothing here touches a broker.

### Columns (additive; SQLite + Postgres)
- `Trade.whyEntered` — `String?`, max 2,000 characters (zod on `POST /api/trades` and `PATCH /api/trades/[id]`; blank saves as null). Not part of the normalized `TradeRecord`; the trade page reads it through `getTradeDetail` (`whyEntered`, `screenshots: {id}[]`). It is included in the profile export with the other trade fields.
- `Attachment.url` now holds the private storage KEY (`<userId>/<uuid>.<png|jpg|webp>`, generated by the server, never from user input). New columns `mimeType String?` and `sizeBytes Int @default(0)`. Ownership is always `trade.userId`.

### Storage (`src/lib/storage/`, one interface: `put(key, bytes, contentType)`, `get(key)`, `delete(key)`)
- Driver is chosen by environment: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` all set gives the S3-compatible driver (Cloudflare R2, private bucket, no public URLs). Otherwise outside production the local-disk driver (`LOCAL_STORAGE_DIR`, default `.storage/screenshots`, outside `public/`). In production with nothing set, `getStorage()` is `null` and the trade page shows "Screenshots aren't switched on yet."
- Every driver refuses a key that is not exactly `<userId>/<uuid>.<ext>`.

### Routes (session-checked; another user's id answers 404 exactly like a missing one)
| Route | Does | Limiter |
|---|---|---|
| `POST /api/trades/[id]/attachments` | multipart field `file`. Type decided from the file's bytes (PNG, JPEG, WebP only); 5 MB max; 5 per trade (409 `trade_full`); 200 pictures and 500 MB per user (429 `quota`); JPEG APP1 (EXIF, XMP) and APP13 (IPTC) removed losslessly, keeping only the orientation flag. Refused on the seeded demo desk (403). Then recomputes the user's compliance. | `attachments:write` (`USER_WRITE_LIMIT`) and `attachments:upload` (20 per 10 minutes) |
| `GET /api/attachments/[id]` | streams the bytes to the owner only; stored image type, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` | `attachments:read` (`USER_READ_LIMIT`) |
| `DELETE /api/attachments/[id]` | removes the stored file, then the row, then recomputes compliance | `attachments:write` |

Errors are `{ ok:false, code, error }` with a plain-English `error`. Deleting a trade, a trading account or the whole user removes their stored files first (`purgeStoredFiles`).

## Package I — First five minutes (demo desk, "not scored yet", import, sample trades)

### Discipline score: the explicit "not scored yet" state (`src/lib/discipline/score.ts`)
`DisciplineScore` gains two fields, display-only:
- `ruleChecks: number` = how many rule evaluations applied to a trade (pass or fail; `not_applicable` does not count).
- `scored: boolean` = `ruleChecks > 0`.

**Every stored number is unchanged.** With no applicable evaluations `ruleAdherence` still reads 100 and `overall` is computed exactly as before (the stored `DisciplineSnapshot` rows are the same); screens must read `scored` and show "Not scored yet" instead of the overall number (dashboard: dashed ring, "Define your rulebook" when the trader has no active rule, "Not scored yet" with a note when rules exist but none has been checked; Rule adherence meter shows "Not scored yet"). Never "0", never "91". `DashboardData.activeRuleCount` tells the two cases apart. The scoring maths stay deterministic and AI-free. Pinned by `test/discipline-score-state.test.ts` (same fixtures, same numbers).

### Demo desk is read-only (`src/lib/demo-desk.ts`, `src/lib/demo-guard.ts`)
- `POST /api/auth/demo` signs in as `demo@tradeos.app`, takes no input, limited per visitor like login (10 per 15 minutes, `demo-login:ip:*`, 429 "Lots of people are looking around right now…").
- Every write route (POST, PUT, PATCH, DELETE) calls `refuseDemo(user)` first and returns `403 { ok:false, code:"demo", error }` ("The demo desk is look-around only. Create a free account to save your own."). Exempt (not user writes): `auth/login`, `auth/register`, `auth/logout`, `auth/demo`, `billing/webhook`. `test/demo-read-only.test.ts` walks every `src/app/api/**/route.ts` and fails when a write handler lacks the guard.

### Sign-up and import
- `POST /api/auth/register` creates the account AND signs the user in. An email that already has an account answers `409 { ok:false, code:"email_taken", error:"That email already has an account. Sign in instead." }` (owner chose clarity over hiding it; the per-visitor sign-up limit stays).
- `POST /api/import` takes either `accountId` or `newAccount: { name, startingBalance }` (exactly one). A new account is created only after the file proved to be a real broker CSV and fits the plan; it is user-scoped and counted against the plan's account limit (`accounts:write`, `USER_WRITE_LIMIT`). A file with no recognisable trade table answers `400 { code:"not_csv" }` and creates NO import record, NO account and NO trades (`IngestResult.notTradeFile`). The response gains `accountId`.
- `Trade.source` gains the value `"sample"` (plain string, no migration) for trades made by "Load sample data". `DELETE /api/demo-data` removes only the signed-in user's `source = "sample"` trades (and their stored screenshots), never imported or hand-entered trades, accounts or rulebooks, then recomputes compliance. Limiter `demo-data:clear` (`USER_WRITE_LIMIT`).
