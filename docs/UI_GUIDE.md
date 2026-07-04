# TradeOS — UI build guide (read before building any page)

Next.js 15 App Router + TypeScript (strict) + Tailwind. Path alias `@/*` → `src/*`.

## Read these for patterns & contracts
- `src/app/(app)/dashboard/page.tsx` — **THE reference** for page structure, data
  usage, and styling. Match its aesthetic and density exactly.
- `src/lib/data.ts` — server data helpers: `getAccounts(userId)`,
  `getTrades(userId, filter)`, `getDashboardData(userId, accountId?)`,
  `getActiveRules(userId)`, `getOpenAlerts(userId)`, `mapTrade(row)`. `TradeFilter`
  = `{ accountId?, strategyTag?, symbol?, from?, to?, onlyClosed? }`.
- `src/lib/types.ts` — domain types & string unions (Side, RuleType, Severity, etc.).
- `src/lib/utils.ts` — `formatCurrency(v,{compact,sign})`, `formatNumber`,
  `formatPercent`, `formatSignedPercent`, `pnlColor(v)`, `scoreColor(s)`,
  `formatDuration(min)`, `formatDateTime`, `formatDate`, `parseTags`, `dayKey`,
  `clamp`, `cn`.
- `src/lib/billing/plans.ts` — `PLAN_DEFINITIONS`, `TRIAL_DAYS`, `getFeatures`,
  `effectivePlan`, `hasFeature(plan,status,feature)`, `withinLimit(...)`.
- `src/lib/rules/engine.ts` (`RuleLike`, `EvalResult`), `src/lib/rules/config.ts`
  (`parseRuleConfig`, `safeParseRuleConfig`), `src/lib/rules/recompute.ts`
  (`recomputeUserCompliance(userId)`).
- `src/lib/ingestion/index.ts` (`ADAPTERS`, `ingestCsv`), `.../symbols.ts`
  (`pointMultiplier`).

## Auth pattern (every app page)
```ts
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{...}> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  ...
}
```
`searchParams`/`params` are Promises in Next 15 — `await` them. `prisma` from `@/lib/db`.
After any write that affects trades/rules, best-effort recompute:
```ts
try { const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
  await recomputeUserCompliance(user.id); } catch {}
```

## Available UI primitives (`src/components/ui/`)
`button` (variants: default/secondary/outline/ghost/destructive/link; sizes sm/default/lg/icon; `asChild`),
`card` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter — note CardHeader is flex-col by default; add `className="flex-row items-center justify-between"` for a header row),
`badge` (variants default/secondary/outline/profit/loss/warning/info),
`input`, `textarea`, `label`,
`select` (Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator),
`tabs` (Tabs, TabsList, TabsTrigger, TabsContent),
`dialog` (Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose),
`dropdown-menu`, `tooltip` (TooltipProvider, Tooltip, TooltipTrigger, TooltipContent),
`separator`, `skeleton`, `progress` (props `value`, `indicatorClassName`),
`table` (Table, TableHeader, TableBody, TableRow, TableHead, TableCell),
`stat` (Stat: `{label,value,delta?,hint?,accent?}`),
`empty-state` (EmptyState: `{icon?,title,description?,action?}`).

Shared components:
`components/page-header.tsx` (PageHeader `{title,description?,children?}`),
`components/account-switcher.tsx` (AccountSwitcher `{accounts:[{id,name,kind}]}` — URL-driven `?account=`),
`components/charts/equity-chart.tsx` (EquityChart `{data,height?,startingBalance?}`),
`components/charts/bucket-bar.tsx` (BucketBar `{data,height?,layout?:"horizontal"|"vertical"}`),
`components/charts/score-ring.tsx` (ScoreRing `{score,size?,label?}`, ScoreMeter `{label,score,detail?}`).
Charting lib: `recharts` (client only). `lucide-react` for icons.

## Design rules — DO NOT produce generic AI-slop UI
- Dense dark trading-terminal look. Tokens ONLY (never hardcode hex):
  `bg-background/surface/surface-raised/surface-overlay/card`, `border-border`,
  `text-foreground/muted-foreground/primary/profit/loss/warning`,
  `bg-profit-muted/loss-muted/warning-muted`.
- Financial numbers: add the `tabular` class and color with `pnlColor()`.
- Small labels: `text-2xs uppercase tracking-wide text-muted-foreground`.
- Page wrapper: `<div className="container max-w-7xl space-y-6 py-6">`.
- Server components by default; `"use client"` only for interactive pieces.
- Always render a tasteful `EmptyState` when a list is empty.
- Keep copy sharp and trader-native; avoid emojis except sparingly.

## Rules
Strict TS. Do NOT run npm/build. Do NOT edit files outside your assigned list —
other agents build in parallel. When done, reply ONLY with: status line, files
created, any API routes added, assumptions. Under 140 words.
