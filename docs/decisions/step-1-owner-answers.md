# TradeOS alignment round: your answers needed (Step 1 stop)

30 Sep 2026. Nothing is built yet. Live `main` is untouched. The "before" snapshot is saved as tag `before-align-2026-10`.

Reply with the letter and your choice, or just "all defaults".

## A. Pricing (full page: `pricing.md`)
**Recommended:** Pro stays $29 ($290/yr). Elite goes from $79 to $59 ($590/yr). The prop tracker moves down to Pro, because Tradezella now includes prop sync in every paid plan from $35. Elite then needs a new reason to exist, or it gets hidden for now.
**Your call:** accept / other prices / keep as is. No price changes for anyone until you set it in Paddle.

## B. Live connections (full page: `live-connections.md`)
**Recommended order:**
1. TopstepX open positions and balance, checked every 60 seconds. No sign-up needed.
2. MT5 through MetaApi, read-only investor password. Needs you to create a MetaApi account and check its price.
3. Rithmic later, since it needs a vendor review.
4. Tradovate, DXtrade and Match-Trader are not this round.

**News:** the "other ProjectX prop firms" are gone. ProjectX shut them off in Feb 2026, so plan item Builder H is dropped.
**Heads-up:** a TopstepX API key can also place orders. TradeOS never does, but the key itself isn't limited. Topstep's rules ban "remote servers" for trading. It's worth asking Topstep whether a read-only hosted journal is fine.
**Your call:** accept the order? Will you sign up for MetaApi?

## C. Screenshots and warnings (full page: `screenshot-storage-and-alerts.md`)
**Recommended:** a private Cloudflare R2 bucket for screenshots (the first 10 GB are free), and phone push notifications for warnings. Email comes later, once the shared email setup exists.
**Note:** R2 needs one sentence added to the app's house rules. Today the rules say the app talks only to broker gateways. A Railway volume avoids that, but it's pricier and makes every deploy briefly offline.
**Your call:** R2 or Railway volume? Push yes/no? Your setup steps are listed in the page.

## D. The three build specs (in `~/claude/Agents/docs/specs/tradeos/`)
Go / changes on each. Their open questions have suggested defaults, and you can override any of them.

**1. `2026-10-quick-wins.md`** (wording, time zone, phone)
- Journal loads 50 trades at a time on laptop and 25 on phone.
- Date filters use New York days, labelled "ET".
- Import is also in the phone "More" menu.
- Asia/Muscat gets added to the time-zone list. It's missing today.

**2. `2026-10-forex-cfd-maths.md`**
- MT5 imports are for dollar accounts only. Other currencies get a clear message.
- MT5 file times are assumed to be New York close, with a dropdown to change it.
- Crypto and unknown rows are skipped and named.
- Found while speccing: today a forex trade would be priced like a $1-per-point future. A 50-pip EURUSD win that should show $500 would show about half a cent. This build fixes that.

**3. `2026-10-before-and-during-a-trade.md`** (checklist, size calculator, "why I entered", screenshots, first five minutes)
- Hidden location data is stripped from photos.
- These features are on every plan, capped at 200 pictures / 500 MB per trader.
- Forex sizing is for dollar accounts only this round.

**Already defaulted (from the September specs):**
- The time-zone setting changes only what's displayed. Grading stays on New York time.
- The account's own status is the one truth.
- The dead "View all" alerts link is removed.
- The demo button signs in read-only.
- The score reads "not scored yet" until you have a rule.
- The sample trades stay, with a line explaining them.
