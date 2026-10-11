# Live connections: what we can connect to, and in what order

Decision date: 2026-09-30. Safety line: TradeOS only ever reads fills, open positions and balances. It never places, changes or cancels an order.

> **Warning:** ProjectX API keys, Tradovate keys and DXtrade passwords can also place orders. None of them offers a read-only key. TradeOS only reads, but the key a trader pastes is not itself restricted. Only the MT5 "investor password" is read-only by the provider's own statement.

> **Big change from the plan:** ProjectX stopped serving every prop firm except Topstep on 28 Feb 2026. The "add more ProjectX firms" idea is dead. TradeOS lists only TopstepX today, so nothing needs removing.

> **Source note:** Rithmic's, Tradovate's own support, DXtrade's and Match-Trader's technical pages could not be opened. Those rows rely on search snippets and third-party write-ups, and none of them is labelled "possible now".

## Priority table

| # | Connector | Label | What the owner must do | Open positions + balance? | Cost | Source |
|---|---|---|---|---|---|---|
| 1 | TopstepX (ProjectX gateway) | **possible now** | Nothing new. Each trader buys API access and pastes their key, as today. | Yes. `Position/searchOpen` gives positions. `Account/search` gives `balance`. | Trader pays $29/month, or $14.50 with code "topstep" | [Positions](https://gateway.docs.projectx.com/docs/api-reference/positions/search-open-positions/), [Accounts](https://gateway.docs.projectx.com/docs/api-reference/account/search-accounts/), [Cost](https://help.topstep.com/en/articles/11187768-topstepx-api-access) |
| 2 | MT5 through MetaApi (cloud bridge) | **needs owner sign-up** | Owner creates a MetaApi account and checks the price. Each trader supplies their MT5 server, login and **investor** (read-only) password, which the prop firm must provide. | Yes. MetaApi documents positions, balance and equity. | Free test tier. Paid price is per connected account and could not be confirmed. Owner checks before building. | [Password field](https://metaapi.cloud/docs/provisioning/api/account/createAccount/), [Positions](https://metaapi.cloud/docs/client/restApi/api/readTradingTerminalState/readPositions/) |
| 3 | Rithmic (R\|Protocol) | **needs owner sign-up** | Owner asks Rithmic for a developer kit, builds against their test system, and passes their "conformance" review before getting live access. Each prop firm may also have to allow it. | Likely yes, but not confirmed from Rithmic's own pages. | Roughly $100 per user plus a $25 connection fee, per secondary sources. Bulenox charges its own $100/month third-party fee. | [Rithmic](https://www.rithmic.com/api-request) (search snippet only), [Ironbeam](https://www.ironbeam.com/rithmic-api-futures-trading/) |
| 4 | Tradovate | **not this round** | Would need approval into the NinjaTrader Ecosystem for OAuth. Traders also need a live account with over $1,000 and a $25/month API plan. Prop and evaluation accounts are reported as not eligible. | Not confirmed for prop accounts | $25/month per trader | [Forum](https://community.tradovate.com/t/third-party-oauth-integration/12456), [Rate limits](https://partner.tradovate.com/overview/core-concepts/rate-limits) |
| 5 | DXtrade | **not this round** | Each prop firm decides whether to open its API. Devexperts will not deal with traders. | Unconfirmed. No provider page found on positions or limits. | Unknown | [DXtrade FAQ](https://dx.trade/traders-faq/) |
| 6 | Match-Trader | **not this round** | Docs are public, but the endpoints, sign-up terms and limits could not be read. Sales contact is required. | Marketing page says yes, unverified | Unknown | [Match-Trader](https://match-trader.com/technology/platform-api/) |
| 7 | Alpha Futures, Bulenox, Tradeify, Lucid, Phidias, TradeDay, TickTickTrader and other former ProjectX firms | **not this round** (gone) | Nothing to do. Do not add them to the firm list. | n/a | n/a | [ProjectX notice](https://www.projectx.com/index.html), [Finance Magnates](https://www.financemagnates.com/forex/prop-firms-report-futures-prop-tech-provider-projectx-to-end-its-third-party-service-offering/) |

### Quotes behind the labels
- **ProjectX shutdown:** "we've made the decision to wind down our ProjectX third-party service offering." Support runs "through February 28, 2026." Bulenox now runs on Rithmic.
- **TopstepX third-party use:** "Some traders connect third-party applications to the ProjectX API. If you do, it's at your own risk."
- **Topstep server rule:** "The use of VPS, VPNs, and remote servers is prohibited by Topstep's Terms of Use." Storing historical data on private servers is listed as permitted. The rule is written about automated trading, but the owner should ask Topstep whether a hosted app that only reads is fine.
- **Topstep live funded accounts:** "Live funded accounts are not allowed to trade through the ProjectX API." This is about trading. Whether reading is allowed on them is not stated.
- **MetaApi password:** "The password can be either investor password for read-only access or master password to enable trading features." The app must ask for the investor password only and refuse anything else.
- **MetaQuotes (maker of MT5):** It publishes no public API for ordinary accounts. Its broker-only API is not licensed to third parties. MetaApi therefore works by logging in like a normal terminal, and MetaQuotes has not blessed that. The source for this is a competitor's blog, so treat it as a risk.

## Rate limits (quoted)
- **ProjectX:** "All other Endpoints: 200 requests / 60 seconds." Over the limit you get "HTTP 429 Too Many Requests." The docs do not say whether the limit is per key or per server address. Login tokens last 24 hours.
- **MetaApi:** 1,000 credits per second, 6,000 per minute, and 5,000 per 10 seconds per account. Ordinary reads cost far less than that.
- **Tradovate:** signed-in callers get 5,000 per hour. Token requests are limited to 5 per hour. Going over triggers penalty waits.
- **Rithmic, DXtrade, Match-Trader:** no limits found.

## Recommended TopstepX poll interval
**Every 60 seconds** for open positions and balance. Keep the 30-minute fill sync as it is.
- One `Account/search` call covers all accounts and returns balances. Add one `Position/searchOpen` call per account.
- A trader with 5 accounts uses about 6 calls a minute. That is 3% of the 200-per-minute limit.
- Because the docs don't say whose quota it is, plan as if every trader shares one server allowance. Cap TradeOS at about 100 calls a minute in total and slow the polling down as more traders connect. On a 429, wait and back off.
- Log in once a day, not on every poll.
- ProjectX also offers a live feed at `https://rtc.topstepx.com/hubs/user`. It is documented but untested here, so it's not part of this round.

## Recommendation: build order
**Build live positions and balance for TopstepX first, polled every 60 seconds. It needs no sign-up and the endpoints are confirmed. Then, once the owner has created a MetaApi account and confirmed its price, add MT5 read-only through the investor password. That is the only route that is read-only by design and covers forex/CFD prop firms. Leave Rithmic for later, and leave Tradovate, DXtrade, Match-Trader and the old ProjectX firms out this round.**

Sources: [ProjectX rate limits](http://gateway.docs.projectx.com/docs/getting-started/rate-limits/), [ProjectX API key page](http://gateway.docs.projectx.com/docs/getting-started/authenticate/authenticate-api-key/), [ProjectX connection URLs](http://gateway.docs.projectx.com/docs/getting-started/connection-urls/), [TradesViz TopstepX import](https://www.tradesviz.com/blog/auto-import-topstepx/), [MetaApi rate limits](https://metaapi.cloud/docs/client/rateLimiting/), [MetaTrader API blog](https://www.metatraderapi.net/blog/how-to-get-mt5-api-key/).
