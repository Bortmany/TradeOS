# Pricing decision (30 Sep 2026)

**Status:** Recommendation for the owner. No price goes live until you set it in the Paddle dashboard. Changing the numbers in the code alone changes nothing customers pay.

## What competitors charge

Checked on each vendor's own page on 30 Sep 2026, except where noted.

| Product | Plans and monthly price | Annual price | Prop-firm tracking | Source |
|---|---|---|---|---|
| Tradezella | Essential $35, Pro $59, Ultra $99 | $26 / $44 / $74 per month, billed yearly | Prop sync in all three paid tiers. The September note is confirmed. | [tradezella.com/pricing](https://www.tradezella.com/pricing) |
| Tradervue | Silver $29.95, Gold $49.95 | Not confirmed (page shows monthly only) | Not confirmed (no mention) | [tradervue.com/site/pricing](https://www.tradervue.com/site/pricing) |
| Edgewonk | One plan, no tiers | $197 a year (a "4 months free" promotion is running) | Supported, in the single plan | [edgewonk.com/pricing](https://edgewonk.com/pricing) |
| TraderSync | Pro $29.95, Premium $49.95, Elite $79.95 | $269.52 / $449.52 / $719.52 | Says it works with 30+ prop firms. Tier split not confirmed. | Vendor page blocked, so prices are from a [third-party review](https://tradingsfx.com/blog/tradersync-pricing). Treat as not confirmed by the vendor. |
| TradesViz | Basic free, Pro $19.99, Platinum $29.99 | $14.99 / $22.49 per month, billed yearly | Not confirmed on the pricing page. They have a separate [prop-firm journal page](https://www.tradesviz.com/prop-firm-journal/). | [tradesviz.com/pricing](https://www.tradesviz.com/pricing/) |
| Journali | Free, Pro $20, Premier $30 | Not confirmed (weekly option: $8 / $10) | Premier only ("30 firms") | [journali.io/pricing](https://journali.io/pricing) |
| Tradoshi | Free, Essential $19.99, Pro $39.99, Premium $49.99 | Pay 8 months, get 12 (page says "4 months free"). A search snippet said 10 of 12, so this is not confirmed. | Pro and up (challenge tracking, multi prop firm) | [tradoshi.com](https://tradoshi.com/en/) |

## What TradeOS charges today

- **Starter:** free.
- **Pro:** $29 a month or $290 a year. No prop tracker.
- **Elite:** $79 a month or $790 a year. Adds the prop tracker.
- The annual price is 10 months for 12 (source: `src/lib/billing/plans.ts`).

## Recommendation

- **(a) Monthly:** Pro stays **$29**. Elite drops from $79 to **$59**.
- **(b) Annual:** Pro **$290**. Elite **$590**. Both keep the "two months free" rule.
- **(c) Prop tracker:** **Move it down to Pro.**

**Why:**
- Tradezella now gives prop sync to everyone from $35. Charging $79 for it puts us well above the market.
- Prop-firm traders are our first audience. Locking our main feature behind the top plan makes the $29 plan look weaker than a $35 rival.
- At $29 we undercut Tradezella Essential and match TraderSync and Tradervue.
- Elite needs a new reason to exist. Good candidates are higher import limits, priority support and the AI coaching once it ships. Until then, consider hiding Elite instead of selling a plan with little extra.

Nobody on a current plan loses anything: Elite subscribers keep every feature, and Pro subscribers gain the prop tracker.
