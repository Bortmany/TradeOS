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

## Package D — Seed (`prisma/seed.ts`)
Standalone `tsx` script using `@prisma/client` directly (NOT importing `@/lib/*`
except optionally `../src/lib/rules/recompute` at the very end). Idempotent:
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
