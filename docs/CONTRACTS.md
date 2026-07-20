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

Session classification (US futures, times in America/New_York):
- `pre` 04:00–09:30, `rth_am` 09:30–12:00, `lunch` 12:00–13:00,
  `rth_pm` 13:00–16:00, `post` 16:00–20:00, `overnight` otherwise.

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
`adapters/{topstepx,tradovate,ninjatrader,rithmic,ibkr,generic}.ts`, `index.ts`.

Adapter interface:
```ts
export interface BrokerAdapter {
  key: Broker; label: string;
  detect(headers: string[]): boolean;           // heuristic header match
  parse(headers: string[], rows: string[][]): { trades: NormalizedTrade[];
    skipped: number; errors: string[] };
}
```
Registry + orchestrator in `index.ts`:
- `ADAPTERS: BrokerAdapter[]`
- `detectAdapter(headers): BrokerAdapter | null`
- `ingestCsv(text: string, brokerKey?: Broker): { broker: Broker;
   trades: NormalizedTrade[]; skipped: number; errors: string[] }`
Validate each row with `NormalizedTradeSchema`. Compute `pnl` when the file
lacks it: long = (exit−entry)×qty×mult − fees; short = (entry−exit)×qty×mult − fees;
use a per-symbol point multiplier table (ES=50, MES=5, NQ=20, MNQ=2, default 1)
in a `symbols.ts` helper; equities default mult 1. `generic` maps common column
names (symbol/ticker, side/direction, qty/quantity/size, entry/exit price, times).

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
- a few open Alerts.
End by calling `recomputeUserCompliance(user.id)` if available (dynamic import,
try/catch) so evaluations + discipline snapshots exist. Log a summary.

DO NOT edit files outside your package. Keep code clean, typed, and commented
sparingly where logic is non-obvious. Do not run `npm`/`prisma` unless verifying
your own file compiles conceptually — the orchestrator handles builds.
