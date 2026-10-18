# AI coaching — UI spec

Companion to the server spec (`docs/specs/ai-coaching.md`, written separately). This file decides only what the screens look like and say. The server contract in the brief is fixed; nothing here changes it.

Golden rules for every surface: the coach is a layer on top. It never touches the discipline score, so no coach element uses `ScoreRing`, score bands or `text-score-*`. No model call happens on page load; pages only show saved notes. Only a button press generates.

## 0. Shared rules (apply to every surface below)

**Tokens and style.** Tokens only, no hex, no `dark:`. Spacing in 4-px multiples (gaps 4/8/12/16/24). Small labels: `text-2xs uppercase tracking-wide text-muted-foreground`. Body `text-sm`; note titles `text-sm font-medium`; card titles via `CardTitle`. Page wrapper `container max-w-7xl space-y-6 py-6`. No emojis. No gauges: the remaining count is text, plus a thin flat `Progress` bar on `/coach` only.

**Colour meaning.** Red/green mean loss/gain here, so the coach never uses `text-profit/loss` or the `profit`/`loss` badges. Priority chips (`Badge`): high = `warning`, medium = `info`, low = `secondary`. Chip text "High", "Medium", "Low", with a screen-reader-only word "priority" after it. "Sample" badge = `Badge variant="outline"` with a tooltip "Canned example for the demo desk".

**Touch targets.** Phone: every tappable control is at least 44px tall. `Button size="lg"` (h-11) for text buttons; icon buttons use `size="icon"` plus `h-11 w-11 sm:h-9 sm:w-9`. Gaps between adjacent buttons at least 8px.

**Button states** (all coach buttons): default and hover come from `Button` variants; pressed = the built-in 1px press; disabled = `disabled:opacity-50`, and a disabled button always has a visible reason line nearby (never silently grey); loading = leading `Loader2` spinner (`animate-spin`) replaces the icon, label swaps to the working label (given per button), `disabled` and `aria-busy="true"`; focus = the built-in ring. Every action ends with a visible outcome line, not just the end of the spinner.

**Thumbs.** `ThumbsUp` and `ThumbsDown` icon buttons, `variant="ghost"`, side by side, `aria-label` "Mark this note helpful" / "Mark this note not helpful", `aria-pressed` true on the chosen one. Tooltip text "Helpful" / "Not helpful" via `Tooltip`, bubble `aria-hidden`. Chosen state: icon `text-primary` with `bg-accent`. Pressing sets it at once (optimistic), then a quiet `role="status"` line "Thanks, noted." for 3 seconds beside the thumbs; on failure it reverts and shows `role="alert"` "Couldn't save that. Please try again." Pressing the already-chosen thumb does nothing. (Open question 2.)

**Delete note.** `Trash2` ghost icon button, `aria-label` "Delete this note", tooltip "Delete this note". Opens a small `Dialog`: title "Delete this note?", body "This can't be undone. Any focus item you made from it stays.", buttons "Cancel" (outline) and "Delete note" (destructive; loading label "Deleting"). Outcome: dialog closes, row leaves the list, a `role="status"` line "Note deleted." shows at the list top for 3 seconds.

**Make this my focus.** `Button variant="outline" size="sm"` with `Target` icon, label "Make this my focus" (day note: "Make this my focus tomorrow"; weekly: "Make this my focus next week"). Loading label "Adding". Success: the button becomes disabled and reads "In your focus" with a `Check` icon, and a `role="status"` line "Added to your focus." (on the dashboard and dialog the line also links "See your focus" to `/coach`). Errors (`role="alert"`): at 20 open, "You already have 20 open focus items. Finish or dismiss one first."; otherwise "Couldn't add that. Please try again." Trade notes never show this button.

**Words for the states** (the same strings everywhere; "where" says how each surface shows them):
- (a) Owner switch off. Dashboard card and Trade card: hidden. Journal button: hidden. `/coach`: empty state, title "AI coaching isn't switched on", description "The site owner hasn't turned it on yet. Your rules and your score work exactly the same without it."
- (b) User turned coach off. Dashboard, Trade, Journal: hidden. `/coach`: empty state, title "Your coach is off", description "Turn it on in Settings whenever you want a second opinion on how you followed your rules.", action `Button` "Open Settings" linking `/settings`. Settings card stays fully usable.
- (c) Daily limit: "You've reached today's AI coaching limit. It resets within 24 hours." Every generate button on the page is disabled and this line (`role="status"`, `text-sm text-muted-foreground`, `Clock` icon) sits directly above or beside them. Saved notes stay readable.
- (d) App-wide limit: "AI coaching is very busy today and has paused until tomorrow." Same treatment as (c).
- (e) Provider down: "Coaching isn't available right now." Buttons stay enabled so a retry works; after a failed press the line shows next to the pressed button (`role="alert"`, `text-sm text-warning`, because it is not the user's loss), with ghost button "Try again" beside it.
- (f) Not enough trades: "Add a few more trades and your coach will have something to read." Shown as an inline `role="status"` line by the pressed button. If the page knows it up front (trade count too low), the generate buttons are disabled and the same line sits above them.
- (g) Demo desk: saved notes are canned samples, each with a "Sample" badge. Pressing ANY write control (generate, thumbs, delete, make focus, Done / Dismiss, switches) shows, inline at that control, "The demo desk is look-around only. Create a free account to save your own." (`role="status"`). No request is sent.
- (h) Loading: skeleton shaped like the note (below).
- (i) Empty before first note: per-surface copy below.
- Cached result: after a press that returns `cached: true`, show under the note `role="status"` "Nothing has changed since this note." and leave the remaining count untouched.
- Count line: "{remaining} of {limit} notes left today" (`text-2xs text-muted-foreground tabular`). At 1 left, use "1 of {limit} notes left today". It updates the moment a press returns.

**Skeleton (note-shaped).** Built from `Skeleton`, wrapper `aria-busy="true"`, each skeleton `aria-hidden`: a 40%-width bar (title), three full-width text bars (last one 60%), then a 96px-wide bar (button). Suggestions skeleton repeats this twice with a 56px chip bar at the right end of the title row. Dark mode comes from the `Skeleton` primitive's tokens; add nothing. Skeleton shows while a press is waiting and while a surface is fetching its saved notes.

**Print.** `print:hidden` on every button, switch, tab strip, thumbs and the whole dashboard card. The `/coach` weekly review text itself may print.

**Reuse.**
- Card chrome and header rows: copy `src/components/checklist/before-you-trade-card.tsx` (header row, `text-sm` subtitle, `text-primary` link at the end).
- Row style inside cards: copy the dashboard violation rows (`rounded-lg border border-border bg-surface-raised px-3 py-2`).
- Status line pattern and inline `role="status"` / `role="alert"`: `src/components/settings/email-warnings.tsx`.
- Week strip look: the week picker in `src/app/(app)/reports/review/page.tsx` (`rounded-lg border border-border bg-surface-raised px-3 py-2`).
- Empty states: `EmptyState` from `src/components/ui/empty-state.tsx`.
- New shared pieces to create (one file each in `src/components/coach/`): `CoachNote` (renders any note kind, props: note, compact), `NoteActions` (thumbs, delete, make focus), `PriorityChip`, `CoachUsageLine`, `CoachStateLine` (maps a reason to the strings above). All surfaces use these so copy and states never drift.

## 1. Navigation

- Sidebar (`src/components/layout/sidebar.tsx`): add `{ href: "/coach", label: "Coach", icon: Sparkles }` directly after Reports in `NAV`. Active styling is the existing one.
- Mobile More sheet (`src/components/layout/mobile-nav.tsx`): add the same item to `MORE_ITEMS` directly after Reports (order becomes Checklist, Position size, Reports, Coach, Accounts, ...), and add `"/coach"` to `MORE_PREFIXES` so More lights up on that page. The five bottom tabs do not change.
- Nav item shows even when (a) or (b), because `/coach` explains those states.

## 2. Dashboard `CoachCard`

Purpose: a quiet second opinion on process, sitting under the score without competing with it.

Position: a full-width `Card` directly after the Discipline Score card, before `BeforeYouTradeCard`. Client component (loads `GET /api/coaching` on mount; no generation). Lighter than the score card: no ring, no big number, no filled button except in the empty state.

**Phone (390px), top to bottom**
1. Header (`CardHeader flex-row items-start justify-between gap-3`): title "Coach"; subtitle "Notes on how you followed your rules. Never part of your score."; at the end a `text-primary` link "Open Coach" (min height 44px via `py-3`). In demo, a "Sample" badge sits under the title.
2. Suggestions, stacked, max 3 shown, then a ghost button "Show all {n}" (collapses back with "Show fewer"). Each is a bordered row: title (`text-sm font-medium`) with the `PriorityChip` at the reading end of that row, body (`text-sm text-muted-foreground`), then a row with "Make this my focus" at the start and the two thumbs at the end. Date line "From Tue 14 Oct" in `text-2xs`.
3. "Repeated mistakes (last 30 days)" block: a full-width ghost row button (44px) with `ChevronDown` (rotates when open), `aria-expanded`, label, and a `Badge variant="outline"` showing the number of clusters. Collapsed by default. Open: one bordered row per cluster: label (`text-sm font-medium`), count `Badge variant="outline"` "x4" with tooltip "Broken 4 times in 30 days", suggestion text, "Make this my focus" (path `items.<i>`). Zero items: the line "No repeated breaches in the last 30 days." in muted text (no empty-state graphic). No clusters note yet: "Not checked yet. Press Find repeated mistakes."
4. Footer area: count line, then two stacked full-width `size="lg"` buttons: "Get fresh suggestions" (loading "Reading your trades") and "Find repeated mistakes" (loading "Looking for patterns"). Both `variant="secondary"` once a note exists; when there are no notes at all, "Get fresh suggestions" is the default filled button (the one primary on this card).
5. State lines from section 0 sit between the notes and the buttons.

**Laptop (1280px+)**: same card, full container width. Suggestions go in a 2-column grid (`lg:grid-cols-2 gap-3`), all shown (no "Show all"). The clusters block spans both columns below them; when open its rows go 2-up as well. Buttons sit in one row at the footer's start (auto width, `size` default), count line at the end of that row, so the footer is a single 36px-tall bar. Extra width is used for the second suggestion column, not for longer lines.

**States**
- (a)/(b): render nothing. The card disappears after the first fetch resolves; while fetching, nothing is reserved (so no skeleton flashes for users who have it off). 
- (h) loading after a press: the list area swaps to the suggestions skeleton; buttons show loading; the other button stays enabled unless the daily limit has been hit.
- (i) empty: `EmptyState className="py-6"` with `Sparkles` icon, title "No coaching notes yet", description "Your coach never sees your charts, only how you followed your rules. Ask for a first read.", no extra action (the footer button is the action).
- (c)/(d)/(e)/(f)/(g): the lines in section 0. In (g) the saved list shows canned sample notes with "Sample" badges.
- Success: new note replaces the list, count line updates, `role="status"` "Fresh suggestions ready." / "Repeated mistakes updated." for 3 seconds. Cached: the "Nothing has changed" line instead.

**Clicks**: "Open Coach" goes to `/coach`; "Make this my focus" see section 0; thumbs see section 0; delete lives on `/coach` only (the dashboard stays read-and-react).

## 3. Journal: "Summarise my day"

Purpose: one-press end-of-day read.

**Header**: in the `PageHeader` children, after the trades `Badge`, add `Button variant="outline"` with `Sparkles` icon, label "Summarise my day", tooltip "Get a coach's read on one trading day". Hidden in (a)/(b). Phone: `h-11`, the header already stacks; the badge and button sit on one row, button flexes to fill (`flex-1`). Laptop: natural width, at the header's end, `h-9`. Disabled with tooltip "Import some trades first" when the journal has no trades.

**Dialog** (`Dialog`, `DialogContent`; on phone it is the existing centred dialog, content scrolls inside with `max-h-[85vh] overflow-y-auto`; laptop `max-w-lg`):
- Title "Summarise my day". Description "Your coach reads one day of trades against your rules."
- Label "Day" over `Input type="date"`, `max` = today (never future), default = date of the latest trade (passed in from the page). Focus ring built in. Error state (typed future date or empty): red-bordered input and `role="alert"` "Pick a day that has already happened." Changing the date loads that day's saved note (a plain GET of saved notes, no model call). If one exists it shows at once and the main button reads "Summarise again"; otherwise "Summarise this day".
- Primary button (`size="lg"`, full width on phone): "Summarise this day" / loading "Reading your day". Count line under it. State lines (c)-(g) appear between the date and the button; (c)/(d) disable the button.
- Result (the day note, in this order): small label row "Day note" + date + "Sample" badge in demo; summary paragraph (`text-sm`); "What worked" label and a plain bullet list; "What cost you" label and a plain bullet list (bullets are neutral `text-foreground`, no green/red); a bordered `bg-surface-raised` box labelled "Focus tomorrow" holding `focusTomorrow` with "Make this my focus tomorrow" under it; then the thumbs row with a small "Written 6:42 pm" at the other end. Empty `wins` or `mistakes` hides that block.
- Skeleton while waiting: summary bars, two short list-bar groups, a box-shaped bar.
- Inline error line (`role="alert"`) under the button for failures (e) and generic "Couldn't read that day. Please try again." Footer: `DialogClose` "Close" (ghost).
- Cached: "Nothing has changed since this note."

Laptop: same dialog; wins and mistakes sit side by side in two columns (`sm:grid-cols-2`) because the dialog is wide enough; phone stacks them.

## 4. Trade page: "Coach's note" card

Position: right column of `src/app/(app)/journal/[id]/page.tsx`, a new `Card` between Rule Evaluations and Journal, so on phone it falls after Rule Evaluations too (the column order is the phone order). Hidden in (a)/(b).

- Header: title "Coach's note", subtitle "About how you followed your rules, not about the market." (this is the process-only disclaimer and it stays visible whether or not a note exists). "Sample" badge at the end in demo.
- Saved note: headline (`text-sm font-medium`), detail (`text-sm text-muted-foreground leading-relaxed`), then thumbs at the start and trash at the end, with the written time. No focus button (trade notes can't be focus).
- No note: button `Button variant="secondary" size="lg"` full width, `Sparkles` icon, "Explain this trade" (loading "Reading this trade"), count line under it. States (c)-(g) as section 0. Since the card is narrow, state lines wrap under the button.
- Skeleton: headline bar plus three detail bars.
- Success: note replaces the button, `role="status"` "Note saved." for 3 seconds. Cached: "Nothing has changed since this note."
- Laptop: the card is one third wide; same layout, no change other than width. Delete is here too.
- (i) Empty is simply the button state; no empty-state graphic, to keep the right column dense.

## 5. `/coach` page

Purpose: one place to read the weekly review, manage focus, and browse history.

Header: `PageHeader title="Coach" description="Notes on how you followed your rules. They never change your score."`, no children. In (a)/(b) the body is just the `EmptyState` from section 0 (inside a `Card` with `CardContent className="p-0"` like the journal page).

**Status strip** (below header, a row: `rounded-lg border border-border bg-surface-raised px-3 py-3`). Contents: `Badge variant="info"` "Coach on" (demo: "Sample notes" outline badge instead); count line "{remaining} of {limit} notes left today" in `text-sm tabular` with a 4px-tall flat `Progress` bar under it (value = used / limit); text "{Plan} plan, {limit} a day" with tooltip "Your plan sets how many notes you can ask for per day." and an info-icon trigger; a `text-primary` link "Coach settings" to `/settings`. A second tooltip on the count: "Asking again when nothing has changed re-uses your saved note and doesn't count." with `cacheHours` filled in: "A repeat press within {cacheHours} hours re-uses..."
Phone: stacked, badge + settings link on row one, count + bar on row two, plan line on row three. Laptop: one horizontal row, count and bar growing to fill the middle, link at the end.

**Page layout**
- Phone: status, This week's review, Your focus, History, one column, 24px between sections.
- Laptop: below the strip, `grid grid-cols-1 gap-6 lg:grid-cols-3`. Left (`lg:col-span-2`, `space-y-6`): This week's review, then History. Right: Your focus, `lg:sticky lg:top-6`, so the to-do list stays visible while the long history scrolls. The extra width is used for a persistent focus column rather than wider text.

**5a. This week's review** (`Card`)
- Header: title "This week's review"; subtitle the week range "Mon 13 Oct to Sun 19 Oct" (`text-sm text-muted-foreground`); end: "Sample" badge in demo.
- With a note: previous-focus verdict callout first, if `previousFocusVerdict` is not null: a bordered box (`rounded-lg border border-border bg-surface-raised p-3`) with a `Target` icon, small label "Last week's focus" and the verdict text. Neutral styling (no green/red). Then summary, "What worked" list, "What cost you" list (same style as the day note), then a box "Focus next week" with "Make this my focus next week". Thumbs and trash at the foot.
- Laptop: wins and mistakes side by side.
- Empty (i): `EmptyState` with `CalendarCheck` icon, title "No review yet", description "Your first review arrives Monday morning once you have a week of trades.", action `Button variant="secondary"` "Review last week now" (loading "Writing your review"). Under it, muted `text-2xs`: "Counts toward today's notes." Once a review exists, the same button appears at the card foot as a ghost "Refresh last week's review" with the same note.
- Not enough trades (f): the line from section 0 under the button. (c)/(d): disabled, line above.
- Skeleton: the weekly shape (callout bar, summary bars, two list groups, focus box).

**5b. Your focus** (`Card`)
- Header: title "Your focus"; subtitle "What you're working on. {n} open of 20."
- Open items, newest first, one bordered row each: the text (`text-sm`), small "From suggestion / day note / weekly review / mistakes" label (`text-2xs`) plus date, then three buttons in a row: "Done" (`Check` icon, `variant="secondary" size="sm"`), "Add to checklist" (`ListPlus`, outline), "Dismiss" (`X`, ghost). On phone the three buttons are `h-11` and wrap onto a second line if needed; on laptop `h-8`. Loading labels "Saving", "Adding", "Dismissing".
- "Done" outcome: the row moves to Done with `role="status"` "Marked as done. Nice work." Dismiss: "Dismissed." with an inline "Undo" text button for 6 seconds (it calls the Reopen action). 
- "Add to checklist" outcomes (`role="status"` under the row): added, "Added to your checklist."; `no_template`, "You don't have a checklist yet." with link "Make one in Checklist" to `/checklist`; `full`, "Your checklist is full. Remove an item first." with the same link.
- Collapsed group "Done ({n})" at the foot: a ghost row button with chevron, `aria-expanded`; open lists done items in muted text with the done date and a ghost "Reopen" button each. Dismissed items are not listed (they show only through Undo).
- Empty (i): `EmptyState className="py-6"` with `Target` icon, title "Nothing in focus yet", description "Pick one thing from a suggestion or review and it lands here. One habit at a time beats ten good intentions."
- Skeleton: three row-shaped bars.

**5c. History** (`Card`)
- Header: title "History"; subtitle "Everything your coach has written, newest first."
- `Tabs`: All / Suggestions / Mistakes / Days / Trades / Weekly (`TabsList` scrolls horizontally on phone, `overflow-x-auto`, each trigger min 44px tall; the kind maps to Suggestions=suggestions, Mistakes=clusters, Days=day, Trades=trade, Weekly=weekly). Changing tabs refetches saved notes (no model call) and shows the list skeleton.
- Rows: a collapsed row is `rounded-lg border border-border bg-surface-raised`, a full-width 56px button with `aria-expanded`: kind label (`text-2xs uppercase tracking-wide`), one-line preview (`truncate text-sm`; suggestions: first title; mistakes: top label; day/weekly: summary; trade: headline), date at the end, `ChevronDown`. "Sample" badge in demo. Expanded: the full note via `CoachNote` (suggestion items each with chip and "Make this my focus"), then thumbs and trash.
- Link: day rows with a trade date show "Open that day in Journal" (text link); trade rows show "Open this trade" to `/journal/<tradeId>`.
- "Load more" at the foot: `Button variant="outline"` full width on phone, centred auto-width on laptop, loading "Loading", hidden when the page returns fewer rows than the limit, and replaced by `text-2xs` "That's everything." when exhausted.
- Empty (i): per tab, `EmptyState className="py-8"`, `History` icon: All "No notes yet", description "Ask for suggestions on the dashboard or summarise a day in the Journal and they'll collect here." Other tabs: "No {suggestions / mistake checks / day notes / trade notes / weekly reviews} yet", description "They show up here after you ask for one."
- Error: `role="alert"` row "Couldn't load your history." with ghost "Try again".

## 6. Settings: "AI coach" card

Position: `src/app/(app)/settings/page.tsx`, after `EmailWarnings`, before Data & privacy, as `lg:col-span-3` (the grid is three columns; a full-width card avoids a hole next to Phone/Email warnings). New client component `src/components/settings/ai-coach.tsx` modelled on `email-warnings.tsx` (same inline status/alert lines, same `Switch` with `loading`).

Header: title "AI coach"; subtitle "A second opinion on how you followed your rules. It never changes your score."; at the end `Badge variant="secondary"` "Not switched on yet" when the owner switch is off. In that state a muted line sits under the master switch: "Your choices are saved, but no coaching happens until the site owner switches AI coaching on." The card stays fully editable in (a).

**Phone**: one column, 24px between groups, each group's label above its control.
**Laptop**: two columns inside the card (`lg:grid-cols-2 gap-x-12`). Left: master switch, Weekly review switch, Email switch. Right: Tone, Focus areas. Beneath both, full width: the "What is sent" explainer. This puts the on/off decisions together and the "what should it say" choices together.

Controls, in order:
1. **Master switch** label "Turn on the AI coach" with description "Adds Coach notes to your dashboard, journal and trade pages." Switch `aria-label` same. Saves via `PATCH /api/profile` `coachingEnabled`. Status: "AI coach is on." / "AI coach is off." (`role="status"`, `text-sm text-profit`, copying the email card, which uses profit for a confirmation). When off, the other controls below stay visible but disabled (`disabled`, `opacity-50`) with muted line "Turn the coach on to change these."
2. **Tone** — segmented control built as two `Button`s in a `role="radiogroup"` row (`rounded-md border border-border p-1`, chosen option `variant="secondary"` with `aria-checked`, other `ghost`), each `h-11` on phone. Options and one-line descriptions shown under the group, swapping with the choice: Gentle, "Encouraging. Names the problem kindly and leads with what went right."; Direct, "Blunt and short. Names the problem first and doesn't soften it." Saves `coachingTone`; status "Tone set to Gentle." / "Tone set to Direct."
3. **Focus areas** — label "What should the coach look at?" five checkboxes (native `input type="checkbox"` styled with tokens, 44px row hit area, label to the end): "Rule-following", "Position sizing", "Emotions", "Journaling habit", "Consistency". Helper `text-2xs`: "Leave all unticked to let the coach look at everything." Saves `coachingFocusAreas` on each tick; status "Focus areas saved." Error "Couldn't save that. Please try again." (`role="alert"`, `text-loss`, copied from the email card).
4. **Weekly review** switch — "Write me a weekly review", description "Arrives Monday morning on your Coach page." Saves `coachingWeekly`. Status "Weekly review is on." / "off."
5. **Email me the weekly review** switch — description "Sends the review to your account email." Disabled when the weekly review is off, or when `emailConfigured` is false, in which case the note reads "Email isn't set up on this site yet, so this can't be turned on." Saves `coachingWeeklyEmail`. Status "Weekly review emails are on." / "off."
6. **What is sent to the AI** — small `bg-surface-raised` box, label "What is sent to the AI", three lines:
   - "Only your discipline numbers: scores, counts and rule outcomes."
   - "Rules go as anonymous labels (Rule 1, Rule 2). No name, email, symbols, account IDs or notes you've written."
   - "Notes it writes are saved here; you can delete any of them." then `text-primary` link "Read the privacy page" to `/privacy`.

Interaction: each switch/segment/checkbox saves on press; the pressed control shows its loading state and ignores presses while saving; the status line appears under that control and clears when the next one is used. Demo desk: any press shows the demo line (section 0) and changes nothing. All `print:hidden`.

## 7. Weekly review email

Built with the existing `emailLayout` from `src/lib/email/index.ts` (same file as `alert-email.ts`, same style: inline styles, 480px column). Email clients cannot use theme tokens, so this is the one place plain inline colours are used, and only the colours `emailLayout` and `alert-email.ts` already use (near-black text `#111`, grey `#666` for small print). It is plain text on white: no images, no coloured chips. Build it as a new function beside `emailNewAlert`.

- **Subject**: "Your TradeOS week in review: 13 Oct to 19 Oct" (under 150 characters).
- **Preheader line** (first small line, grey): "How you followed your rules this week, and one thing to work on."
- **Body, in order**:
  1. `h2` "Your week in review" and a grey date line "Mon 13 Oct to Sun 19 Oct".
  2. Summary paragraph.
  3. If present, a short block "Last week's focus" with the verdict.
  4. "What worked" (bulleted list) — hidden if empty.
  5. "What cost you" (bulleted list) — hidden if empty.
  6. "Focus next week": the focus sentence in bold on its own line.
  7. One button: a link styled as a button (inline padding 12px 24px, dark background, white text) labelled "Open your Coach page" pointing to `{appBaseUrl()}/coach`.
- **Footer** (12px grey): "This is about how you followed your rules, not about the market. You can turn this email off in Settings, under AI coach."
- Everything from the note is passed through `escapeHtml`. The email is only sent when the owner switch, user coach switch, weekly switch and weekly-email switch are all on and email is configured.

## 8. Open decisions and assumptions to confirm

1. The generate response must say why a press failed (limit reached, app-wide pause, provider down, too few trades, demo) as a reason code; the UI maps codes to the section 0 strings. If the contract only returns text, the builder should show that text as is.
2. Whether a second tap on the chosen thumb should clear the vote. Contract only has up/down, so this spec makes it a no-op.
3. Whether hidden states (a)/(b) should still list previously saved notes on `/coach`. This spec shows the empty state only.
4. Dashboard card collapses to nothing for (a)/(b), so users with the coach off see no layout jump but users with it on see the card pop in after load. Alternative: the page loads the card's data on the server and avoids the pop; needs the owner's call only if the pop bothers them.
5. Thumbs and trash on the dashboard: thumbs yes, trash no (kept on `/coach`) to keep the dashboard calm.

## Mobbin references

The Mobbin tool wasn't available in this session, so no real `mobbin_url` could be fetched. I have not invented any. Search these four at build time and paste the URLs here; layout ideas only, TradeOS tokens win:
1. "AI insights / coach card" on a dashboard — look for a compact card with a priority tag, body text and thumbs (informs section 2).
2. "Weekly recap / weekly summary" — a summary with wins and misses and one next-step callout (sections 5a, 7).
3. "Settings with AI preferences" — tone selector plus toggles plus a data-use explainer (section 6).
4. "Empty state with a single generate action" or "Usage limit reached" — for the limit lines (section 0).
