# TradeOS alignment round: your answers needed (stop before Steps 5 and 6)

1 Oct 2026. Steps 2, 3 and 4 are built and reviewed on branch `align-2026-10`. Live `main` is still untouched. Tests went from 333 to over 700.

Reply "all defaults", or give the letter and your choice.

## E. Live connections spec (Step 5) — `~/claude/Agents/docs/specs/tradeos/2026-10-live-links.md`

Four parts, each usable on its own:
1. **Honest warnings.** Each shows the value and an "as at" time, clears itself, and can be dismissed.
2. **TopstepX open positions and balance**, checked every 60 seconds.
3. **Optional phone push notifications.**
4. **MT5 through MetaApi.** Built, but switched off until you've signed up.

| # | Question | Suggested default |
|---|---|---|
| E1 | TopstepX may not report live profit/loss for an open trade, only its size and entry price. | The builder checks a practice account first. If there's no live price, it estimates from the latest 1-minute price, labelled "estimated". If that also fails, it stops and tells you. |
| E2 | MT5 (MetaApi) cost and who gets it. | Build it switched off. Once you confirm the price, paid plans only, with a cap of 2 MT5 accounts per trader. |
| E3 | Which "trading day" warnings use. Topstep's day starts at 6 PM New York; the app's starts at midnight. | Keep midnight New York, so warnings and the Prop page agree. Add open profit/loss to both the daily loss and the drawdown. Ask Topstep about the exact rule. |

Also in the spec:
- Three futures (MCL, NG, SI) show "not priced" rather than a guessed value.
- The house rules gain one sentence allowing calls to push services and MetaApi.

## F. Pricing spec (Step 6) — `~/claude/Agents/docs/specs/tradeos/2026-10-pricing.md`

Pro stays $29 ($290/yr). Elite goes to $59 ($590/yr). The prop tracker moves into Pro, and free-trial users get it too.

| # | Question | Suggested default |
|---|---|---|
| F1 | Keep Elite visible or hide it? | Keep it visible, listing only real extras: bigger imports, priority support, early AI coaching "when it ships". |
| F2 | Is "priority support" actually true today? | Keep the line; tell us if not and it's removed. |
| F3 | Should free (Starter) users still see the Prop page? | Yes, with an "Upgrade to Pro" prompt instead of a raw error. That error is a gap the spec found in the Step 2 work. |

In Paddle you'll later create 2 new prices, and only for Elite: monthly $59 and yearly $590. Existing Elite subscribers stay Elite.

## G. Two calls the builders made that you may want to change

- G1. **Sign-up "email already has an account" message.** It's friendlier, but a stranger could use it to check who has an account. It's limited to 5 tries per visitor per hour. Default: keep it.
- G2. **Demo button when sign-ups are closed.** The landing page's demo button stays hidden when sign-ups are closed, as today. Default: keep it hidden.

## Your setup list so far (nothing needed until you ship)

1. A Cloudflare R2 bucket plus 5 Railway settings. Screenshots stay off until you do this.
2. A MetaApi account, and checking its price.
3. Push notification keys (one Terminal command).
4. A TopstepX **practice** login for testers.
5. Two new Elite prices in Paddle.
6. Railway: `TRUST_PROXY=true`, `PROXY_HOPS=1`, `CRON_SECRET`.
7. A database backup right before shipping.
