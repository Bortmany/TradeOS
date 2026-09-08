# TradeOS — user-testing report (2026-09-07)

**Verdict: Not ready** — six separate problems were found by one tester and then proved again by a second, independent tester. All six are serious (P1), and at least three of them sit right on the main path a customer walks every day: importing trades, reading the times on those trades, and pulling a report. The rule we apply is mechanical: three or more confirmed serious bugs on the core path means "Not ready". There were no catastrophic (P0) bugs, and nothing was lost or corrupted — the app is close, not broken.

A first-time user today **can** sign up, add a trading account, drop in a broker CSV, watch every trade get graded against a rule they wrote themselves, and see a discipline score that shows its own working — that whole loop works on a desktop and every number in it adds up. What they **cannot** do is trust the clock (every trade time is shown four hours out, and the timezone setting in Settings does nothing), reach a report of the history they just imported (the reports page is stuck on today with no way to move the date), or reliably press the Import button on a phone (it is drawn underneath the bottom menu bar, so the tap lands on "Journal" instead and the chosen file is lost).

The single most important thing to change: **show trade times in the trader's own timezone.** [Certain] It is one formatting fix, it appears on the journal, the trade page and the reports, and it is the difference between a trader believing the app's verdict on their trading and quietly going back to checking their broker instead.

**First impression: 74/100.** Both testers understood what TradeOS is within five to six seconds from the landing page alone, and both said they would keep going — the pitch and the product screenshots are genuinely strong; points come off for the "Explore the demo desk" button that turns out to be a login form, and for the reports page looking empty on first open.

**Core loop: 58/100.** The import-grade-score loop works end to end on a desktop and the arithmetic cross-foots everywhere we checked, but the wrong clock, the unreachable reports and the phone Import button that cannot be pressed all sit inside that loop.

## What we tested

| Who | Language | Desktop | Phone | Scenarios (passed / failed / blocked) |
|---|---|---|---|---|
| Demo trader — a funded futures trader on a Topstep 50K account who has blown two evaluations by overtrading, with 250 trades and 3 accounts already in the app | English | Yes | Yes | 2 / 4 / 2 |
| New trader — a brand-new day trader with a TopstepX CSV file on their desktop and no account yet | English | Yes | Yes | 3 / 4 / 1 |

Tested on a fresh local copy with demo data only. No real order, payment or message was sent.

## First impressions (blind)

- **Demo trader, English** — Understood the product in about **6 seconds**; would continue: **yes**. Quote: *"The trade page telling me 'Trade #7 of the day — over the 5-per-day limit' is worth the $29 on its own — but if the prop cockpit can't agree with my accounts page on whether I'm funded or in an eval, I'm not trusting its drawdown number when it actually matters."* Confusions: the "Explore the demo desk" button just drops you on a sign-in form with a password to retype by hand; the Prop Firm page shows only one of three accounts and calls a funded account an evaluation; a dashboard warning says you are $150 from your daily loss limit while the prop page says you have not lost a cent today; the reports page opens on a two-day window with nothing in it; the sidebar keeps nagging a paying customer to upgrade; there is no "Forgot password" link; the marketing site is dark and the app is light, so it feels like two different products. Delights: the trade page grading every fill rule by rule in plain English; the prop cockpit speaking a prop trader's own language (drawdown buffer in dollars, consistency cap, minimum trading days); the import page promising "nothing uploads until you hit Import" and "no orders are ever placed"; a proper bottom tab bar on the phone; being correctly bounced to the login page when signed out. Phone vs desktop: the phone is genuinely built for a phone — no sideways scrolling anywhere, big tab targets, readable cards — but the journal is one endless 15,000-pixel scroll and two whole pages (Reports, Accounts) have no link on the phone at all.

- **New trader, English** — Understood the product in about **5 seconds**; would continue: **yes**. Quote: *"It nailed my Topstep CSV in one click and told me my win rate is 66.7% — but the button I had to press was hiding under the menu bar and the reports page swears I have no trades."* Confusions: "Explore the demo desk" is the second-biggest button on the homepage and it is a sign-in wall; the one action the empty dashboard tells you to take (Import your trades) is blocked until you go to a different page and create a trading account; the reports page shows nothing after a successful import and gives no way to move the date; on the phone the landing page's Features / Discipline / Pricing links are hidden with no menu button; the marketing site is dark and the app is light; the discipline score said 91 before a single rule had been written. Delights: the CSV format was detected automatically with no format picker ("TOPSTEPX — imported 12, skipped 0, warnings 0"); every part of the score shows its own arithmetic; "Read locally in your browser — nothing uploads until you hit Import" next to the file picker; the broker panel saying "sync only… no orders are ever placed"; the on-brand 404 page ("The chart you were looking for isn't here"); empty states that teach the three-step loop instead of just saying "no data". Phone vs desktop: the same journey completes on both, but the phone loses the Import button under the tab bar, hides the pricing links, and buries Reports and Settings behind an avatar menu.

## Findings, most serious first

### P0

None.

### P1

**1. Every trade time is shown four hours out, and the timezone setting does nothing** (demo trader and new trader, desktop and phone, English, [Certain])

What happened. Settings offers a timezone and it is set to America/New York. Open any trade. The Trade Facts panel says the trade was entered at 7:53 PM. The rule verdict on the very same screen says "Entered 15:53 ET — after the 11:30 window closes." The new trader hit the same thing from the other end: a fill that the CSV file records as 09:45 in New York shows up in the journal as 1:45 PM. Changing the timezone in Settings to Tokyo and back changed nothing at all — the times were letter-for-letter identical.

Expected. Times shown in the trader's own session timezone, so the journal reads 3:53 PM and agrees with the rule card's "15:53 ET" and with the Analytics chart, which is already labelled "ET hour of entry".

Seen. Raw universal time everywhere — the journal list, the trade page, the reports and the best/worst trade panels — four hours ahead of the trader, and the app contradicting itself on a single screen.

Evidence: screenshots/demo-trader-en-repro/042-desktop-repro-tos-dt-01-02-trade-detail-full.png and screenshots/new-trader-en-repro/015-desktop-repro-nt-03-fail-attempt2-09-45-et-fill-shows-as-9-45-am.png

Confirmed by an independent re-test: **yes** (twice, by both testers, on desktop and phone).

Fix brief. Every trade timestamp is being printed as the raw stored instant instead of being converted to the user's saved timezone. The correct value is already known — the rule engine and the Analytics hour chart both use it — so the fix is to run the journal list, the trade detail Trade Facts panel, and the reports (best/worst trades and daily breakdown) through the same profile-timezone formatter, and to show the zone next to the time so a trader can see which clock they are reading. Worth checking at the same time whether this is also the cause of the hydration warnings noted below, since those are the classic symptom of a date being formatted one way on the server and another way in the browser.

---

**2. The Reports page is stuck on today, so imported history can never be reported on** (new trader and demo trader, desktop and phone, English, [Certain])

What happened. The new trader imported twelve June trades, saw all twelve appear in the journal, then opened Reports. Daily showed Sep 7–8, Weekly showed Sep 1–8, Monthly showed Aug 9 – Sep 8, and each one said "No trades in this window — try a wider window or import more trades." Monthly is already the widest option and there is no control to move it: the only buttons on the page are Export PDF and the three period tabs. Typing a date into the web address is ignored. The demo trader, with 250 trades, hit the same wall from the other direction — Reports opened on an empty two-day window with an "Import trades" button, which reads as "your import failed"; clicking Monthly by hand then revealed a genuinely excellent report.

Expected. Arrows or a date picker to move the period, and a page that opens on the most recent period that actually has trades.

Seen. A paid reporting feature that cannot be aimed at the trader's own history, and an empty state that gives advice the page has no way to follow.

Evidence: screenshots/new-trader-en-repro/028-desktop-repro-nt-02-06-monthly-no-date-control.png and screenshots/demo-trader-en/027-desktop-blind-desktop-24-reports.png

Confirmed by an independent re-test: **yes** (re-tested on desktop and phone; the re-tester also confirmed in the code that the three tabs are fixed windows anchored to "now" with no date setting at all).

Fix brief. Add a period anchor to the reports page — accept a date in the web address, and put previous/next arrows plus a date picker next to the "Aug 9 – Sep 8" label. Separately, open the page on the most recent period that contains trades rather than on today, and when a window really is empty for an account that already has trades, offer "show my last trading day" instead of an "Import trades" button.

---

**3. On a phone, the Import button is drawn underneath the bottom menu bar** (new trader, phone, English, [Certain])

What happened. On a 390-wide phone, pick a CSV on the import page and scroll to the blue Import button. The button ends up half-hidden behind the fixed bottom menu bar; only about six pixels of it are actually exposed. Tapping where the button looks like it is opens the **Journal** page instead — and coming back with the Back button shows the chosen file has been cleared, so the trader has to pick it again.

Expected. The Import button sits clear of the bottom bar and the tap starts the import.

Seen. The single most important button in the product is untappable at the exact scroll position the page lands on after choosing a file.

Evidence: screenshots/new-trader-en-repro/033-phone-repro-nt-01-04-button-in-view.png

Confirmed by an independent re-test: **yes** (reproduced twice; the re-tester found that scrolling roughly 250 more pixels does free the button, so a workaround exists — but nothing on screen suggests it, and the wrong tap silently discards the file).

Fix brief. Add bottom padding to the import page equal to the height of the fixed bottom bar plus the phone's own safe-area inset, or turn the Import action into a sticky bar that always draws above the menu bar. Worth auditing every other page for the same collision while in there.

---

**4. On a phone, Reports and Accounts cannot be reached at all** (demo trader, phone, English, [Certain])

What happened. On a phone the bottom bar offers Home, Journal, Stats, Rules and Prop. The avatar menu offers the user's name, plan, Settings, Billing and Sign out. Walking every page and listing every link on it turns up no link to Reports and no link to Accounts anywhere. Both pages work perfectly when the web address is typed by hand — the monthly report in particular reads beautifully on a phone.

Expected. Every destination in the desktop sidebar is reachable from the phone too, through a "More" tab, an overflow sheet, or entries in the avatar menu.

Seen. Two complete features orphaned on the phone, so a trader reasonably concludes the app does not have reports.

Evidence: screenshots/demo-trader-en-repro/017-phone-repro-tos-dt-04-02-avatar-menu-open.png

Confirmed by an independent re-test: **yes** (reproduced twice; the re-tester also hunted for a back way in through the dashboard account chip, Settings, Rules and Import, and found none).

Fix brief. Add a "More" entry to the phone bottom bar, or add Accounts and Reports to the avatar menu next to Settings and Billing. Both pages already render correctly at phone width, so this is navigation only.

---

**5. The Prop Firm page calls a funded account an evaluation** (demo trader, desktop and phone, English, [Certain])

What happened. The Prop Firm page shows one card: "Topstep 50K · TOPSTEP · $50K · EVALUATION" with a blue "PASSED" badge. The Accounts page calls the same account "TOPSTEPX · Funded". The header on any trade in that account says "Topstep 50K · funded". Three screens, two answers — and even the broker name is spelled two different ways.

Expected. One account, one status, one broker name, everywhere.

Seen. The page a prop trader opens five times a day disagrees with the rest of the app about which programme they are even in.

Evidence: screenshots/demo-trader-en-repro/036-desktop-repro-tos-dt-02-10-prop.png

Confirmed by an independent re-test: **yes** (twice on desktop, once on phone, with no errors of any kind in the browser — so this is the content, not a display glitch).

Fix brief. The account's own status and the prop tracker's phase are two separate stored values with nothing keeping them in step, and the sample data itself contains the contradiction. Pick one as the single source of truth — either derive the prop card's phase from the account, or move the phase forward automatically when an evaluation passes — and use one broker label on all three screens. If the tracker genuinely needs its own separate notion of progress, give it a clearly different name ("Eval progress") so it can never be read as the account's status.

---

**6. Dashboard alerts contradict the Prop page, and contradict each other** (demo trader, desktop and phone, English, [Certain])

What happened. The dashboard's Open Alerts panel says all three of these at once: "You are within $150 of your $1,000 daily loss limit"; "profit target reached — net $4,465 meets the $3,000 target"; and "profit target in sight — you are 68% of the way to the $3,000 target". The Prop page, meanwhile, says the full $1,000 daily buffer is untouched today and the profit target is at 148.8%.

Expected. Alerts built from the same live numbers the prop cockpit shows, with an alert disappearing once the situation it describes is over, and never two live alerts about one target.

Seen. The exact figure that decides whether a trader keeps trading today has two different answers on two screens, and one of them argues with itself.

Evidence: screenshots/demo-trader-en-repro/028-desktop-repro-tos-dt-03-01-dashboard-full.png

Confirmed by an independent re-test: **yes** (reproduced on desktop and phone). The re-tester traced it: the contradictory alerts are fixed rows written by the sample-data script, and the alert refresher only ever clears alerts it generated itself, so the planted ones stay "open" forever. There is also no way for the user to dismiss them — the "View all" link goes to the Prop page, and the alerts page itself returns a not-found error.

Fix brief. Generate every alert from the same daily profit-and-loss and target calculations the Prop page uses, mark an alert resolved once its condition no longer holds, allow only one live alert per account and per measure, and stamp each alert with the value and time it was worked out. Also fix the sample data so it does not ship contradictions, and either build the alerts page or point "View all" somewhere that exists.

### P2

**7. The Rule Engine page looks like it has not saved your change** (demo trader, desktop, English, [Likely] — **seen once, not reproduced**)

What happened. Change a rule's threshold from 5 to 4 and press Save. The first tester saw the rule row, its pass/fail counts and the overall adherence stay on the old numbers until the page was reloaded, and reported it three times.

Expected. The row and the totals update in place after a save.

Seen. On the independent re-test this did **not** happen: four attempts all updated correctly in place. What the re-tester found instead is that saving a rule re-grades all 250 trades and takes five to six seconds, during which the dialog stays open with only a small spinner on the Save button and the dimmed page behind it necessarily still shows the old numbers — and the original tester's own screenshot shows that spinner still running.

Evidence: screenshots/demo-trader-en-repro/005-desktop-repro-tos-dt-05-11-4s-after-save-threshold-4-no-reload.png

Confirmed by an independent re-test: **no (seen once)**.

Fix brief. The saving itself is correct. What is missing is honest feedback for a five-to-six-second wait: replace the bare spinner with a message such as "Re-grading your 250 trades…", and keep the page's numbers visibly greyed or marked as updating until the new ones arrive, so nobody presses Save a second time.

---

**8. Feeding it a file that is not a spreadsheet reports a green "Import complete"** (both roles, desktop, English, [Certain])

What happened. On the import page, choose an ordinary text file (the picker accepts it — it does not filter to CSV files) and press Import. The result is a green tick reading "Import complete — imported 0, skipped 0, warnings 0".

Expected. A plain error: "This file doesn't look like a broker CSV — we couldn't find any trade rows."

Seen. A success message indistinguishable from a genuinely empty file, so the user closes the tab and only later wonders where their trades went.

Evidence: screenshots/demo-trader-en/086-desktop-edge-import-dupe-bad-import-bad-txt-result.png

Confirmed by an independent re-test: **not re-tested** (found identically by both testers).

Fix brief. When nothing recognisable as a header row is found, or the parse produces zero rows, show an error rather than the success card — name the problem and link to a sample CSV. Also restrict the file picker to CSV files.

---

**9. The Prop tracker only watches one of three accounts, with no way to add the others** (demo trader, desktop and phone, English, [Certain])

What happened. Accounts lists Topstep 50K (funded), Apex 100K (evaluation) and Live IBKR (live). The Prop page — which describes itself as the live compliance cockpit for evaluation and funded accounts — shows a card for Topstep only, with no button anywhere to add the others. The dashboard nonetheless raises alerts about the two missing accounts.

Expected. Every evaluation or funded account tracked, or an obvious way to add one.

Seen. The evaluation account a trader is most likely to blow is silently absent from the page whose whole job is stopping them blowing it.

Evidence: screenshots/demo-trader-en/067-desktop-core-prop-accounts-reports-prop-firm.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Either create a tracker automatically for every account marked evaluation or funded, or add an "Add prop tracker" button on the Prop page that lists the untracked accounts with the firm presets ready to pick. The two testers disagreed about the status counters — see "Where testers disagreed" below.

---

**10. A trading account can never be renamed or deleted** (demo trader, desktop and phone, English, [Certain])

What happened. The Accounts page has an "Add account" button and nothing else — the cards are not clickable, there is no menu on them, and there is no account detail page. The tester had to delete a test account through the browser's developer console, using an instruction the app itself already supports but does not expose.

Expected. Anything you can create, you can rename or remove.

Seen. A typo in an account name is permanent, and it pollutes the combined profit-and-loss figures and every account picker from then on.

Evidence: not copied — see the run files under ut/runs/tradeos/demo-trader-en/.

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Add a small menu to each account card with Edit and Delete, wiring them to the update and delete handlers that already exist on the server. The delete should require typing the account name and should say how many trades will go with it.

---

**11. A paying Pro customer is nagged to buy things they already have** (demo trader, desktop, English, [Likely])

What happened. The account is on the Pro plan. Every page carries a sidebar card reading "Upgrade your edge — unlock unlimited rules & prop tracking". The billing page shows Pro already includes unlimited rules, while listing the prop-firm tracker as an Elite feature — and the prop tracker works perfectly for this Pro user with no paywall.

Expected. An upsell that only offers what the plan actually lacks, and a feature sold as Elite that is either genuinely Elite-only or moved into the Pro column.

Seen. A customer paying $29 a month is sold features they are already using, and the pricing table does not match what the software does.

Evidence: screenshots/demo-trader-en/075-desktop-core-settings-billing-theme-billing.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Decide the feature-per-plan table once, enforce it in the app, and make the sidebar card aware of the current plan — hidden when there is nothing to sell, and naming the genuinely missing feature when there is.

---

**12. A React "hydration" warning fires on several pages** (both roles, desktop and phone, English, [Certain])

What happened. Loading the reports, settings, billing, rules, accounts, prop and analytics pages records an internal React error number 418 in the browser console — the page the server sent does not match what the browser then draws.

Expected. No page errors.

Seen. Nothing visibly breaks today, but React throws away the server's version of the page and redraws it, which is the classic cause of a value flashing wrong for a moment.

Evidence: screenshots/demo-trader-en/075-desktop-core-settings-billing-theme-billing.png

Confirmed by an independent re-test: **not re-tested** (recorded independently by both testers on overlapping sets of pages).

Fix brief. Reproduce in development mode to get the readable version of the message. The likeliest cause is a date or a money figure being formatted on the server in one timezone or locale and re-formatted in the browser in another — the same root cause as finding 1 — with the theme class applied before the page settles as a second candidate.

---

**13. The Trade Journal stops at the newest 150 of 250 trades with no way to page back** (demo trader, desktop and phone, English, [Certain])

What happened. The journal header says 250 trades. The bottom of the list says "Showing latest 150 of 250 trades. Narrow with filters to see more." There is no "Load more", no page control and no date filter — the filters offered are account, symbol, strategy, outcome and source. Meanwhile the billing page sells Pro on "unlimited history".

Expected. Paging, or a date range filter, so the oldest trades can be reached directly.

Seen. A hundred trades reachable only by guessing a symbol or strategy filter that happens to contain them.

Evidence: screenshots/demo-trader-en/096-phone-phone-core-journal.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Add "Load older trades" paging or a date range filter, and render the phone list in chunks — 150 cards in one page is a fifteen-thousand-pixel scroll that the tester gave up on after ten seconds.

---

**14. There is no "Forgot password" link anywhere** (both roles, desktop and phone, English, [Certain])

What happened. The sign-in page offers Email, Password, Sign in, and a "Start free" link. That is all. After ten wrong passwords the account is rate-limited, still with no way back in.

Expected. A "Forgot password?" link beside the password field.

Seen. A trader who forgets their password has no route back to their own trading history.

Evidence: screenshots/demo-trader-en/007-phone-blind-phone-05-login-page.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Ship password reset by email before launch. If email is not wired up yet, at minimum link to a support address so the sign-in page is not a dead end.

---

**15. The "installable app" is only half built** (both roles, desktop and phone, English, [Likely])

What happened. The app describes itself to the browser as installable — the description file is served correctly and names the app, the start page and the theme colour. But nothing registers the background helper that browsers require before offering "Install", and the only icon supplied is a single vector image with no standard-size versions and no iPhone home-screen icon.

Expected. For a product this phone-focused: a background helper so the browser offers to install it and the app shell survives a dropped connection, plus proper icons at the two standard sizes and an iPhone icon.

Seen. Description file only. The install prompt never appears, and an iPhone home-screen shortcut gets a generic icon.

Evidence: screenshots/new-trader-en/120-desktop-pwa-fail-manifest-is-present-and-describes-an-installable-app.png

Confirmed by an independent re-test: **not re-tested** (found identically by both testers).

Fix brief. Add a minimal background helper that caches the app shell and goes to the network first for data, register it when the app loads, and add the two standard icon sizes plus an iPhone icon to the public folder and to the description file.

---

**16. Entering the wrong broker keys fails completely silently** (new trader, desktop, English, [Certain])

What happened. On the import page's broker panel, type any username and key and press "Find accounts". The server rejects them. The page shows nothing at all — no message, no highlight — the button simply returns to normal. The tester watched the whole page text every four-tenths of a second for six seconds and found no error text anywhere.

Expected. "We couldn't sign in to TopstepX — check your username and API key."

Seen. Nothing happens, so the user presses the button four more times and gives up on the feature.

Evidence: not copied — see the run files under ut/runs/tradeos/new-trader-en/.

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Show the connector's rejection as a message under the API key field, translating a rejected-credentials response into plain English. Note this is only about the missing message — a genuinely successful broker connection could not be tested here because it needs real keys.

---

**17. A rule with an impossible value is rejected without saying so** (new trader, desktop, English, [Certain])

What happened. In the add-rule dialog, set a maximum-contracts rule to minus five and press "Add rule". The dialog just sits there. No message appears anywhere on the page, no rule is created, and nothing tells the user which field is wrong.

Expected. An inline message such as "must be 1 or more", or a button that is disabled until the form is valid.

Seen. Silence, which reads as a broken rule engine.

Evidence: screenshots/new-trader-en/109-desktop-edge2-fail-rejecting-an-impossible-rule-tells-the-user-why.png

Confirmed by an independent re-test: **not re-tested**. Note the demo trader saw the *edit* dialog handle a negative number correctly ("Value must be greater than or equal to 1"), so the gap appears to be in the *add* dialog specifically.

Fix brief. Add the same inline validation to the add-rule dialog that the edit dialog already has — sensible minimum and maximum per rule type, weight between 1 and 100 — and always show the server's reason if a save is refused.

---

**18. Signing up with an email that already exists dumps you on the sign-in page with no explanation** (new trader, desktop, English, [Certain])

What happened. Fill in the sign-up form with an email that already has an account. The sign-up is refused and the app jumps straight to the sign-in page showing only "Welcome back" — nothing about why.

Expected. Stay on the sign-up page with "That email already has an account — sign in instead."

Seen. The form appears to have vanished, and the user cannot tell whether an account was created.

Evidence: not copied — see the run files under ut/runs/tradeos/new-trader-en/.

Confirmed by an independent re-test: **not re-tested**. (A too-short password is handled well, so the pattern already exists in the codebase.)

Fix brief. Keep the user on the sign-up page and show the reason the server gave. If a jump to sign-in is deliberate, carry the message across so the sign-in page can explain itself.

---

**19. A brand-new trader with no rules is told their discipline score is 91** (new trader, desktop and phone, English, [Certain])

What happened. Register, import a CSV, write no rules at all, and the dashboard shows 91 out of 100, with "Rule adherence 100 — no applicable rule evaluations — nothing to violate." Writing a single rule dropped the same trades to 79.

Expected. A score that is withheld or clearly marked provisional until at least one rule exists.

Seen. Full marks for having set nothing up, which flatters the user and removes their reason to write the rules the product is built around.

Evidence: screenshots/new-trader-en/027-phone-blind-payoff-phone-27-dashboard-with-data.png

Confirmed by an independent re-test: **not re-tested**. The two testers disagreed on how serious this is — see below.

Fix brief. When no rules apply, show the rule-adherence part of the score as "not scored yet", grey the ring or label it provisional, and put a "Define your rulebook" prompt in the number's place linking straight to the Rule Engine.

---

**20. "Explore the demo desk" is a sign-in wall** (both roles, desktop and phone, English, [Certain])

What happened. The second-biggest button on the homepage goes straight to the sign-in page, where a small grey box prints a demo email and password to be typed in by hand — on a phone keyboard.

Expected. One tap into a demo desk, or a button honestly labelled "Sign in to the demo".

Seen. A promise of a look inside that turns into homework. Both testers independently called this the moment they would have bounced.

Evidence: screenshots/new-trader-en/003-phone-blind-explore-phone-03-demo-desk.png

Confirmed by an independent re-test: **not re-tested** (found by all four passes).

Fix brief. Turn the credentials box into a "Sign in to the demo desk" button that fills and submits the form itself, or point the homepage button at a read-only demo session so nobody types anything.

---

**21. The phone landing page has no menu, so the pricing is effectively hidden** (new trader, phone, English, [Certain])

What happened. On a phone the landing page header shows only "Sign in" and "Start free". The Features, Discipline and Pricing links exist in the page but are invisible, and there is no menu button of any kind. The page is roughly 5,900 pixels tall.

Expected. A menu button, or a compact "Pricing" link next to "Sign in".

Seen. A shopper who wants the price before signing up has to thumb through five screens to find it.

Evidence: screenshots/new-trader-en/001-phone-blind-first-visit-phone-01-landing-top.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Add a menu button to the marketing header at phone widths, exposing the Features / Discipline / Pricing links that already exist.

---

**22. You cannot import until you detour to another page and create an account** (new trader, desktop and phone, English, [Certain])

What happened. The empty dashboard's main call to action is "Import your trades". Pressing it lands on a page that says "Add an account first" and offers no file picker at all. Getting a CSV in takes four pages: dashboard, import, accounts, back to import.

Expected. Pick the file straight away and name the trading account as part of the import, or have a default account waiting.

Seen. The first two minutes of the product are admin instead of the thing the homepage promised.

Evidence: screenshots/new-trader-en/007-phone-blind-import-phone-07-import-page.png

Confirmed by an independent re-test: **not re-tested** (found by both the blind and the scripted pass).

Fix brief. Show the file picker on the import page regardless, with a small inline "target account" creator (name plus starting balance) beside it — or create a default account at sign-up and let the user rename it later.

---

**23. The demo password printed on the sign-in page did not work** (demo trader, desktop, English, [Likely])

What happened. The sign-in page prints a demo account and password. Typed exactly as shown, they were refused with "Invalid email or password." The password that did work was the one supplied to the tester by the test harness.

Expected. Credentials the product prints on its own sign-in page sign you in.

Seen. A rejection at the exact moment a curious visitor is trying the product for the first time. Important caveat: the test harness may have reset the demo account's password while setting up, so this must be checked against a clean copy before it is treated as a code fix. That is why it is listed in the owner-setup section too.

Evidence: screenshots/demo-trader-en/007-phone-blind-phone-05-login-page.png

Confirmed by an independent re-test: **not re-tested**.

Fix brief. Have the setup script and the hint printed on the sign-in page read the demo password from a single place, so they cannot drift apart. Better still, replace the printed credentials with a button that signs the visitor in — which also fixes finding 20.

### P3

**24. Recent Violations repeats the same line five times with no trade attached** (demo trader, both devices, English, [Certain]). The dashboard's Recent Violations card shows six rows, five of them identical: "Documented setup — Setup incomplete — missing notes." No symbol, no date, no profit or loss, and the rows do not link to the offending trade. Expected: each row names its trade and links to it, or identical ones collapse into a count. Evidence: screenshots/demo-trader-en/047-desktop-core-login-dashboard-journal-dashboard.png. Confirmed by an independent re-test: not re-tested. Fix brief: show the trade's symbol, local time and net result on each row, link it to the trade page, and group repeats of one rule with a count.

**25. Weekday labels overlap on the profit-by-weekday charts** (demo trader, both devices, English, [Certain]). The axis reads "Monday TuesdayWednesdayThursday Friday" — the middle three run together. Same on the dashboard and the analytics page. Evidence: screenshots/demo-trader-en/045-desktop-blind-desktop4-44-analytics.png. Confirmed by an independent re-test: not re-tested. Fix brief: use three-letter day names, or rotate or skip labels, once the space per label drops below about sixty pixels.

**26. A rule threshold of 999999 is accepted and quietly improves the score** (demo trader, desktop, English, [Certain]). Setting a max-trades-per-day rule to minus five is correctly refused; setting it to 999999 is accepted with no warning, that rule then passes on every trade, and overall adherence rises from 72% to 75%. Evidence: not copied — see the run files. Confirmed by an independent re-test: not re-tested. Fix brief: add sensible upper limits per rule type, and warn in the dialog when a threshold makes a rule impossible to fail — a discipline score should not be gameable in ten seconds.

**27. Signing up does not sign you in** (demo trader, desktop, English, [Certain]). Completing the sign-up form lands you on the sign-in page with no "account created" message, which looks exactly like a failed sign-up. The same details then work fine. Evidence: not copied — see the run files. Confirmed by an independent re-test: not re-tested. Fix brief: sign the new user in and take them to the dashboard; if a separate sign-in is deliberate, say so on the sign-in page.

**28. Phone journal filter buttons all shorten to "All…"** (demo trader, phone, English, [Certain]). Three of the five filter buttons read only "All…", so there is no way to tell the symbol, outcome and source filters apart without opening each one — and those filters are currently the only route to older trades. Evidence: screenshots/demo-trader-en/096-phone-phone-core-journal.png. Confirmed by an independent re-test: not re-tested. Fix brief: label the phone buttons "Symbol", "Outcome" and "Source", showing the chosen value once one is picked.

**29. "Max drawdown 22.3%" is a percentage of something the user will not guess** (new trader, both devices, English, [Likely]). On a $50,000 account the dashboard shows "-$204.04 / 22.3%". The percentage is the loss measured against the peak running profit, not against the account. To a prop trader trained on account drawdown percentages, 22.3% looks like a breach. Evidence: screenshots/new-trader-en/087-desktop-core-rule-score-dashboard-with-rule.png. Confirmed by an independent re-test: not re-tested. Fix brief: label it "22.3% of peak profit", or measure it against the account balance instead — a hover explanation like the score pillars already have would fit the product's no-black-box promise.

**30. Legal links in the phone footer are 16 pixels tall** (new trader, phone, English, [Certain]). Terms, Privacy and Refunds are each about 16 pixels high, well under the 44 pixels a thumb needs; the bottom tab bar itself is fine. Evidence: not copied — see the run files. Confirmed by an independent re-test: not re-tested. Fix brief: pad the footer links to a 44-pixel target on small screens.

**31. The dark marketing site hands off to a light app** (new trader, both devices, English, [Certain]). Every marketing screenshot is dark; the sign-in, sign-up and whole app are light by default, and the theme switch only appears after signing in. Both testers had a moment of "did I land on a different site?" Evidence: screenshots/new-trader-en/003-phone-blind-explore-phone-03-demo-desk.png. Confirmed by an independent re-test: not re-tested. Note the landing page being pinned dark is deliberate. Fix brief: either default the app to dark to match the marketing, or follow the device's own light/dark setting, so the handoff is continuous.

**32. The sign-in page publicly prints working demo credentials** (new trader, both devices, English, [Certain]). The demo email and password are printed on the public sign-in page, and that account holds 250 trades and three accounts including a funded Topstep account that anyone can then edit. Evidence: screenshots/demo-trader-en/007-phone-blind-phone-05-login-page.png. Confirmed by an independent re-test: not re-tested. This is an owner decision rather than a bug — see the owner-setup section.

## Owner setup needed before launch (not code bugs)

- **Payment keys (Paddle).** Pressing Upgrade on the billing page today shows "Checkout isn't switched on yet. Add the PADDLE_* keys to enable upgrades." Working exactly as documented — but nobody can pay until the account exists and the keys are set.
- **Broker connection keys (TopstepX).** The broker sync panel is built and correctly labelled "sync only… no orders are ever placed", but it cannot be exercised at all without real API keys, so a genuine successful connection remains untested.
- **Scheduled sync secret.** The background sync route returns a "service unavailable" response until the scheduling secret is set.
- **Decide what the demo account is.** The sign-in page prints a demo email and password in public, and that demo desk is fully editable by anyone who reads them. Decide before launch whether the demo desk becomes read-only, resets itself nightly, or is replaced by a one-click demo session — and whether the printed credentials stay at all.
- **Make the printed demo password and the setup script agree.** The password shown on the sign-in page was refused in testing (finding 23). This needs one check against a clean copy of the data before it is treated as a code fix; if the two really have drifted, have both read the same single value.
- **Password reset needs an email service.** Finding 14 cannot be finished without one — decide the provider, or ship a support-address link as a stopgap.

## Things that looked wrong but are not bugs

- **The upgrade button doing nothing** is the payment switch being off by design; the app says so in plain English.
- **AI coaching being absent** is switched off deliberately.
- **The broker connection failing** in this environment is a sandbox limitation, not a fault — no real keys existed. (The *missing error message* when keys are wrong is a genuine finding, number 16.)
- **The landing page being dark while the app is light** is partly deliberate — the landing page is pinned dark on purpose. Only the jarring handoff is worth changing (finding 31).
- **Analytics charts appearing empty** in full-page screenshots is a quirk of how the charts animate into view; they draw correctly once scrolled to. Worth knowing only if a PDF export ever screenshots a page.
- **"Export PDF" appearing to do nothing** is the automated browser ignoring the print dialog. The print layout itself was checked separately and is excellent.
- **A new account arriving with twelve sample trades** is by design. Nothing on the dashboard tells the user those trades are not theirs, which is worth a line of copy.
- **The schematic price chart on the trade replay** is honestly labelled "SCHEMATIC — NO LIVE MARKET DATA". That is a good provenance badge, not a shortcoming.

## What worked well

- **The numbers cross-foot everywhere we checked.** 250 trades, 126 wins and 124 losses giving 50.4%; the five per-rule pass counts adding to exactly the dashboard's 1,087 of 1,500 checks; profit by strategy and profit by symbol each summing to precisely the same +$6,327.29; the prop cockpit's used buffer plus remaining buffer equalling the limit. Nothing had to be taken on trust.
- **The trade page is the product.** Every fill is graded rule by rule with the reason in plain English — "Trade #7 of the day — over the 5-per-day limit", "Waited 159 min after the prior loss — outside the 5-min revenge window" — with a compliance score attached. Both testers named it the best screen in the app.
- **Importing is honest and safe.** The format is detected with no format picker, the page promises "nothing uploads until you hit Import", every price and result survives the round trip exactly, re-importing the same file skips all the duplicates instead of doubling them up, and double-clicking Import creates nothing extra.
- **The rule engine is real arithmetic, and it re-grades.** One "max 2 contracts" rule flagged exactly the four trades over that size and moved the score from 91 to 79, with the working shown.
- **Account separation is airtight.** A freshly registered trader gets a branded not-found page on another user's trade address, and attempts to change or delete another user's trade or account behind the scenes are all refused.
- **Sign-in lockout works, and works politely.** Ten wrong passwords produce "Too many attempts. Please wait a few minutes and try again", and the block is tied to the network address rather than the account — so one tester's lockout test did not lock anyone else out.
- **The printed monthly report is genuinely excellent** — navigation and sidebar stripped away, with performance, rule compliance, an emotional summary, key mistakes, best and worst trades and a full daily breakdown on one clean page.
- **Careful, trustworthy touches throughout**: "SCHEMATIC — NO LIVE MARKET DATA" on the replay chart, "For educational analytics only. Not financial advice." in the footer, one-click export of everything as a file, a theme choice that survives a reload, and empty states that teach the next step instead of saying "no data".

## What we could not test, and why

- **A real broker sync (TopstepX).** Needs real API keys, which were deliberately not entered. Marked blocked, not failed.
- **Paying for anything.** The payment provider is switched off by design, and no money control was pressed on a demo account.
- **What "Export PDF" actually produces.** The button triggers the browser's own print dialog, which the automated browser ignores. The print layout was verified separately instead and looks right.
- **Edge cases and account-separation checks repeated on the phone.** The testing tools cap how many screenshots each run may take, and the budget was spent on the phone's main journey. The checks are enforced by the server and were proved on desktop; none of the edge cases depend on screen size.
- **Whether the printed demo password is genuinely the seeded one.** The test setup sets its own password for the demo account, so it is impossible to tell from here whether the printed hint is stale or the setup overrode it. Needs one check against a clean copy.
- **Screenshots for a few late scripts** (broker connect, duplicate-email sign-up, silent rule rejection, theme, phone edge cases). The screenshot cap was reached; those findings rest on the recorded run files instead.

## Phone verdict

The phone build is genuinely built for a phone, and that is worth saying first: nothing scrolls sideways on any page we checked, the bottom tab bar has proper thumb-sized targets, the trade cards show score, violations and strategy without any pinching, sheets and forms fit with the keyboard up, and the monthly report reads beautifully at phone width. Then three things spoil it. The Import button — the single action the whole product exists for — is drawn underneath the bottom menu bar, so a new trader's first tap opens the Journal and silently discards the file they had just chosen. Two complete features, Reports and Accounts, have no link anywhere in the phone interface, so the only way in is to type the address by hand. And the journal renders 150 trades as one continuous fifteen-thousand-pixel scroll with no paging, which one tester abandoned after ten seconds. Fix those three and the phone experience goes from frustrating to good; none of them is a redesign.

## Where testers disagreed

- **Does the Rule Engine page go stale after a save?** The first tester reported it three times and was certain. The independent re-test could not reproduce it in four attempts — the page updated in place every time — and found that the first tester's own screenshot shows the save still in progress with the spinner running. Both views are recorded; the report keeps it as P2 "seen once, not reproduced", with a real but smaller residual issue: a five-to-six-second save with no explanation.
- **Are the Prop page's status counters wrong?** The blind tester read "on track 0 / at risk 0 / breached 0 / passed 1" as counters that do not add up to the cards shown. The named demo trader explicitly disagreed, arguing the counters are consistent with the single passed card and that the real bug is the two missing accounts. The report follows the second reading, and both are recorded.
- **How serious is a discipline score of 91 before any rules exist?** The blind pass called it P3 and arguably by design. The scripted pass called it P2 and a genuine product gap, because it removes the new user's reason to write rules. The report keeps P2 and shows both.
- **How serious are the prop and alert contradictions?** The tester who re-ran them argued for downgrading both to P2, on the grounds that the authoritative Prop page is correct and no journey is blocked. The classification pass held both at P1, because these are the exact figures the product exists to be trusted on. The report keeps P1 and records the dissent.
- **The hidden phone landing menu and the upsell shown to a paying customer** were each rated P2 by one tester and P3 by the other. The report takes the higher rating in both cases.

## Numbers

P0 0 · P1 6 · P2 17 · P3 9 · owner-setup 2 · scenarios run 16 (passed 5, failed 8, blocked 3) · screenshots 40 in docs/user-testing/screenshots/. Build tested: commit 0906e3d of /home/user/TradeOS.
