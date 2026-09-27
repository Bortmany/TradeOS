# TradeOS — UI build guide (read before building any page)

Next.js 15 App Router + TypeScript (strict) + Tailwind. Path alias `@/*` → `src/*`.

## Read these for patterns & contracts
- `src/app/(app)/dashboard/page.tsx` — **THE reference** for page structure, data
  usage, and styling. Match its aesthetic and density exactly. Its hierarchy is
  deliberate: the discipline score is the page anchor, everything else is
  secondary — keep that priority on any surface where the score appears.
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

## Theming (dual theme — this is load-bearing)
The app ships **light AND dark**, following the OS by default with a user
override (`next-themes`, class strategy, wired in `src/app/layout.tsx` via
`components/theme-provider.tsx`; the toggle lives in the topbar —
`components/theme-toggle.tsx`).

- All colors are CSS-variable tokens defined twice in `src/app/globals.css`
  (`:root` = light, `.dark` = dark). Styling with tokens means both themes work
  automatically. **Never** use `dark:` variants for colors and never hardcode
  hex — if you feel the need, the missing thing is a token, not a variant.
- Never rename or remove a token: the `@media print` block at the bottom of
  `globals.css` (used by the Reports PDF export) re-values them and must keep
  working. New tokens must be added to light, dark, AND print.
- The marketing page (`src/app/page.tsx`) is pinned LIGHT via a `light` wrapper
  class (globals.css scopes the light tokens with `:root, .light`) — it does not
  follow the user's theme by design. This executes the approved redesign brief
  (`docs/redesign/DESIGN_BRIEF.md`): dark for tools you operate, light for pages
  you read. The landing sections live in `src/components/marketing/` (one file
  per section); the page also loads Inter via `next/font` scoped to its own
  subtree through the `--font-sans` variable — the app keeps the system stack.
- New decorative elements (gradients, textures) get `print:hidden`.

### Token vocabulary
- Surfaces (4 elevation levels): `bg-background` → `bg-surface` →
  `bg-surface-raised` → `bg-surface-overlay`; `bg-card`, `border-border`.
- Text: `text-foreground`, `text-muted-foreground`, `text-primary`.
- P&L semantics (sacred, both themes): `text-profit/loss/warning`,
  `bg-profit-muted/loss-muted/warning-muted`.
- **Score bands** (discipline score everywhere it appears): `text-score-high`
  (≥80), `text-score-mid` (60–79), `text-score-low` (<60), plus `bg-score-*`
  (use `/15` opacity for chip backgrounds). `ScoreRing`/`ScoreMeter` already
  use these.
- Charts: gradient/area fills use `hsl(var(--token))` with
  `var(--chart-area-opacity)` so fills read correctly per theme.

## Available UI primitives (`src/components/ui/`)
`button` (variants: default/secondary/outline/ghost/destructive/link; sizes sm/default/lg/icon; `asChild`),
`card` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter — CardHeader is flex-col by default; add `className="flex-row items-center justify-between"` for a header row; Card carries the dark-mode `card-highlight` hairline automatically),
`badge` (variants default/secondary/outline/profit/loss/warning/info),
`input`, `textarea`, `label`,
`select` (Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator),
`tabs` (Tabs, TabsList, TabsTrigger, TabsContent),
`dialog` (Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose),
`dropdown-menu`, `tooltip` (TooltipProvider, Tooltip, TooltipTrigger, TooltipContent),
`separator`, `skeleton`, `progress` (props `value`, `indicatorClassName`),
`table` (Table, TableHeader, TableBody, TableRow, TableHead, TableCell),
`stat` (Stat: `{label,value,delta?,hint?,accent?}`),
`empty-state` (EmptyState: `{icon?,title,description?,action?,steps?}` — `steps`
is an activation checklist `{label, done?}[]`; use it whenever an empty state
has a natural "do this next" path, e.g. import → rulebook → score).

Shared components:
`components/page-header.tsx` (PageHeader `{title,description?,children?}`),
`components/account-switcher.tsx` (AccountSwitcher `{accounts:[{id,name,kind}]}` — URL-driven `?account=`),
`components/theme-toggle.tsx` (ThemeToggle — already in the topbar; don't add more),
`components/charts/equity-chart.tsx` (EquityChart `{data,height?,startingBalance?}`),
`components/charts/bucket-bar.tsx` (BucketBar `{data,height?,layout?:"horizontal"|"vertical"}`),
`components/charts/score-ring.tsx` (ScoreRing `{score,size?,label?}`, ScoreMeter `{label,score,detail?}`).
Charting lib: `recharts` (client only). `lucide-react` for icons.

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

## Design rules — DO NOT produce generic AI-slop UI
- Dense, modern trading-terminal look in dark; calm, paper-crisp in light —
  same layout, tokens do the theming. Tokens ONLY (never hardcode hex).
- **Score-first hierarchy**: the discipline score is the product's anchor
  metric. It gets the one gauge in the app (`ScoreRing` on the dashboard);
  every other metric is flat — meters, bars, sparklines, never new gauges.
- Financial numbers: `tabular` class + `pnlColor()`. Small labels:
  `text-2xs uppercase tracking-wide text-muted-foreground`.
- Page wrapper: `<div className="container max-w-7xl space-y-6 py-6">`.
- Server components by default; `"use client"` only for interactive pieces.
- Always render an `EmptyState` when a list is empty — with `steps` when
  there's a natural activation path.
- Keep copy sharp and trader-native; avoid emojis except sparingly.
- Restraint over decoration: no glow, no multi-hue gradients, one accent color
  (primary) plus the P&L/score semantics.

## Rules
Strict TS. Do NOT run npm/build. Do NOT edit files outside your assigned list —
other agents build in parallel. When done, reply ONLY with: status line, files
created, any API routes added, assumptions. Under 140 words.
