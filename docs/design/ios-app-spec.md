# TradeOS — iOS App Design Spec

*A written design document only — no code. A future iOS developer (or a
wrapper project) should be able to build from this. The existing Next.js API
is the backend; nothing here changes it.*

## 1. What the app is and who it's for

TradeOS is the discipline engine for day traders: import your trades (CSV or
the live TopstepX/ProjectX connector), grade every trade against your own
rulebook, and get an explainable 0–100 discipline score across live and
funded/prop accounts. It is not a journal — it's enforcement. The iOS app is
for the trader **away from the desk**: the phone is where you check the score
after the session, feel the sting of a violation alert, and watch your prop
account's drawdown buffer — not where you do heavy CSV mapping or rule
building. Companion first, editor second.

## 2. Navigation model

**Tab bar — 5 tabs:**

| Tab | Existing screen it maps to |
|---|---|
| Score | Dashboard — the discipline score ring front and center |
| Journal | Trade journal (list + trade detail with per-rule pass/fail) |
| Analytics | Session/weekday/symbol performance, equity, drawdown |
| Prop | Prop-firm tracker (buffer remaining, daily loss, targets) |
| More | Accounts, rules (read + toggle), reports, import status, settings |

**Deliberately demoted to More:** the no-code rule builder, CSV column
mapping, and report generation stay web-first — they're dense desktop work.
The app can *view* rules and toggle them on/off, view reports, and trigger a
broker sync, but building rules on a phone is a bad trade.

**Modals:** manual trade entry (sheet), trade detail rule breakdown
(push), broker sync progress (sheet with live status), score explanation
(sheet from tapping the ring).

**Deep links** (`tradeos://`): `score`, `journal/<tradeId>`,
`prop/<accountId>`, `alerts`. Push notifications always deep-link to the
thing that fired them. Widget taps open `score`.

## 3. Screen-by-screen notes

Design language: **score-first terminal.** Dark charcoal surfaces, dense
monospaced numerals, thin rules between rows, restrained color: green only
for pass/profit, red only for fail/loss, one accent for the score ring.
No gradients, no confetti — this app respects the user by being severe.

**Score (home)** — the day's discipline score as a large ring, the number in
mono type at the center. Below it the four blend components (rule adherence,
risk discipline, emotional discipline, consistency) as horizontal bars with
their sub-scores — tap any bar for the plain-English explanation the engine
already produces. Then today's ledger: trades taken, rules broken (each
violation named), P&L. An account switcher at the top (live / prop accounts).
Pull to refresh triggers a broker sync if the TopstepX connector is set up.

**Journal** — reverse-chronological trade list: symbol, direction, R,
compliance score chip (colored by pass rate). Filters: account, date range,
violations-only. Trade detail: entry/exit, FIFO round-trip breakdown, then
the rule evaluation table — every rule, pass/fail, and the reason string.
The schematic trade replay from Phase 3 becomes a swipeable playback view
here — a genuinely good touch interaction.

**Analytics** — the existing buckets as swipeable cards: by session, by
weekday, by time of day, by symbol, by strategy; expectancy, profit factor,
payoff ratio, max drawdown. Equity curve and drawdown charts rendered
natively, scrubbing with a haptic tick per data point.

**Prop** — one card per prop account (Topstep/Apex/TPT presets): trailing
drawdown **buffer remaining** as the hero number, daily loss limit used,
consistency %, profit target progress. This is the screen a funded trader
checks with sweaty hands — big numbers, zero decoration, red only when a
limit is genuinely near.

**More** — accounts list, rulebooks (view rules, toggle active, edit on
web), import (trigger TopstepX sync, see last sync time; CSV import points
to the website), reports (view generated PDFs), plan/billing status
(Starter/Pro/Elite — upgrade happens on the web, see App Store notes),
settings, Face ID toggle, sign out.

## 4. Native affordances

**Face ID / Touch ID lock** — on by default. Trading P&L and prop-account
status are financially sensitive; the app locks on background and requires
biometrics (device passcode fallback) to reopen. A setting can relax it to
"after 5 minutes".

**Widgets:**
- **Today's discipline score (small + medium):** the score ring with the
  number; medium adds the four component bars. Grey placeholder ring with
  "no trades yet" before the first trade of the day.
- **Prop buffer (lock screen rectangular):** drawdown buffer remaining for a
  chosen account — glanceable during the session without unlocking.

**Notifications — the alerts engine is the trigger, nothing else.** The
backend already computes deterministic flags (daily-loss, drawdown,
overtrading, rule violations) during recompute. Each becomes one push:
"Daily loss limit 80% used on Topstep 50K", "3 trades in 10 minutes —
overtrading rule flagged". These arrive after import/sync (scores are
computed from imported fills, not a live feed — never pretend otherwise).
Also: "Sync complete — 12 trades imported, score 74". No streaks, no
marketing, no "come back" nags. Requires a small push-delivery addition on
the server (APNs) — flag for the owner.

**Haptics:** firm thud when the score ring animates in under 50; sharp
double-tap on a rule violation appearing; soft tick on chart scrubbing.
Success is silent — discipline is expected, not celebrated.

**Share sheet:** share a score card or an equity-curve image (rendered with
the TradeOS mark, P&L optionally hidden — traders share scores, not sizes).

## 5. Dark/light mode

**Dark only.** The terminal aesthetic is the brand; a light theme would be a
different product. Declare dark appearance app-wide.

## 6. Data & sync

- Talks to the existing Next.js route handlers (auth, trades, rules,
  accounts, prop, profile). Session token stored in the iOS Keychain.
- Broker credentials (TopstepX API keys) are entered on the web and stay
  AES-256-GCM encrypted on the server; **the app never stores or displays
  them** — it only triggers sync. Read-only guarantee carries over: the app
  never places orders, ever.
- **Offline:** cache the last-computed score, journal, analytics and prop
  buffers with a visible "as of ⟨time⟩" stamp. All numbers are
  server-computed; the app never recomputes scores locally (one
  deterministic engine, one source of truth). Manual trade entries queue and
  submit when back online, then the server recomputes.

## 7. App Store notes

- **Category:** Finance. **Age rating:** 4+ (no real-money trading occurs in
  the app; it analyzes past trades and places no orders — say exactly that
  in the review notes, plus the README's line: educational analytics, not
  financial advice).
- **Privacy questionnaire:** collects email (account) and financial info
  (trade history, P&L, account balances), linked to the user; no tracking,
  no ads, no data sold. Broker credentials are server-side only and never
  touch the device.
- **Subscriptions:** Pro ($29) / Elite ($79) are digital subscriptions —
  inside the app they must go through Apple In-App Purchase or not be
  purchasable in-app at all. Recommended v1: show the user's current plan,
  gate features exactly as the web does, and do not link out to checkout
  (App Review's reader-app rules are strict). IAP is a later decision for
  the owner.
- Account deletion reachable in-app (More → settings) — App Store
  requirement.
