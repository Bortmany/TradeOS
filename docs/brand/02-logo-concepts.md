# TradeOS: Logo Concepts (10)

Source of the concepts and prompts: `Agents/logo-concepts.json` (key `tradeos`), unchanged. Foundation for every concept: the existing app icon at `src/app/icon.svg`, a blue three-segment rising zigzag ending in a green dot on a near-black rounded square. The locked palette is background #0a0b0f, surface #111318, electric blue #5593f7 (the only accent), profit green #2dbe7a, loss red #e64c57 (P&L only, never in a logo), amber #f6b128 (mid scores only), off-white #eaedf0. Type is system sans plus monospace with tabular numerals.

Shared rules for all ten: flat, no gradients, no glow, no candlestick clip art, no rocket or arrow-to-the-moon. Blue is the mark; green appears only as one small "graded" dot or cap and never as a fill. Every mark must survive at 16 px (favicon), 32 px (sidebar), and 512 px (app icon).

---

## CONCEPT 1
- **Name:** TradeOS Wordmark
- **Logo type:** Wordmark
- **Concept:** 'TradeOS' in a geometric sans, the 'OS' in a tabular monospace cut.
- **Meaning:** A terminal you operate, not a journal you read.
- **Why it relates to the product:** The product's whole voice is numbers-literate and terminal-like; setting "OS" in monospace says "operating system for your trading" without a symbol.
- **How it fits the existing brand:** Uses only the two typefaces already in the app (system sans + monospace tabular). Pairs with `icon.svg` as-is: icon left, wordmark right, no redraw needed.
- **Visual characteristics:** Semibold geometric sans for "Trade", monospace "OS" at the same cap height, tight tracking, single baseline.
- **Typography direction:** Inter or the system sans for "Trade"; JetBrains Mono or the system monospace for "OS"; weight 600.
- **Color usage:** "Trade" #eaedf0, "OS" #5593f7, background #0a0b0f. On light surfaces (PDF reports) "Trade" flips to #0a0b0f, "OS" stays blue.
- **Icon/symbol description:** None. Text only.
- **Where it works best:** Header, PDF report masthead, email signature, invoices.
- **Potential weaknesses:** No standalone symbol; needs `icon.svg` for the favicon. Mixed-font wordmarks can look accidental if the monospace weight is not matched carefully.
- **Higgsfield prompt:** Wordmark logo reading 'TradeOS' in a clean geometric sans-serif semibold in off-white #eaedf0, the letters 'OS' rendered in a monospace tabular style in electric blue #5593f7, no symbol, dark near-black background #0a0b0f.

## CONCEPT 2
- **Name:** T-Score
- **Logo type:** Lettermark
- **Concept:** A capital T whose crossbar is a progress bar filled to 80 percent.
- **Meaning:** Your score, built into the letter.
- **Why it relates to the product:** The discipline score (0 to 100) is the hero of the product; the letter literally carries a score bar.
- **How it fits the existing brand:** Keeps `icon.svg`'s blue-line-plus-green-dot grammar (blue bar, green dot at the fill end) inside a letter.
- **Visual characteristics:** Heavy T, crossbar as a rounded bar, hard vertical stem, small green dot at the 80 percent point.
- **Typography direction:** Geometric sans for the T stem (600 to 700 weight); wordmark from Concept 1 alongside.
- **Color usage:** Stem #eaedf0, filled bar #5593f7, unfilled bar #23262f, dot #2dbe7a, background #0a0b0f.
- **Icon/symbol description:** A T whose top bar is an 80 percent progress bar with a green dot.
- **Where it works best:** App icon, favicon, social avatar.
- **Potential weaknesses:** At 16 px the fill split disappears and it reads as a plain T. The 80 percent is a fixed number in a product built on changing numbers.
- **Higgsfield prompt:** Lettermark logo: a bold capital letter T in off-white #eaedf0 where the horizontal crossbar is a rounded progress bar filled 80 percent in electric blue #5593f7 with the remaining 20 percent in dark grey #23262f and a green #2dbe7a dot at the fill end, flat, dark background #0a0b0f.

## CONCEPT 3
- **Name:** Zigzag Dot
- **Logo type:** Abstract symbol
- **Concept:** A rising three-segment line ending in a green dot, refined from the current app icon.
- **Meaning:** Fills become a score; the evolution of the existing mark.
- **Why it relates to the product:** Fills come in raw and messy (the zigzag), and end in one graded point (the dot).
- **How it fits the existing brand:** This is `icon.svg` cleaned up: same path shape, same blue line and green dot, retuned to the locked hex values (#5593f7 and #2dbe7a instead of the current #3b82f6 and #22c55e) with rounded joints and no gradient overlay.
- **Visual characteristics:** Three straight segments, rounded joints and caps, stroke weight about one eighth of the mark width, dot slightly larger than the stroke.
- **Typography direction:** Concept 1 wordmark to its right.
- **Color usage:** Line #5593f7, dot #2dbe7a, background #0a0b0f or transparent.
- **Icon/symbol description:** A stepped rising line with a green terminal dot.
- **Where it works best:** App icon, favicon, sidebar, loading state. The lowest-risk choice.
- **Potential weaknesses:** A rising line can read as "line go up", which the brand avoids; the green dot must stay small so the mark is not read as a profit promise.
- **Higgsfield prompt:** Abstract logo symbol: a bold three-segment rising zigzag line with rounded joints in electric blue #5593f7 ending in a solid green #2dbe7a circle, geometric and precise, single mark, dark near-black background #0a0b0f.

## CONCEPT 4
- **Name:** Score Ring
- **Logo type:** Geometric symbol
- **Concept:** A circular gauge ring, 80 percent filled, with a green cap.
- **Meaning:** The discipline score as the brand's face.
- **Why it relates to the product:** The score ring is the top-left anchor of the redesigned dashboard; the logo is the UI element.
- **How it fits the existing brand:** Reuses the blue-plus-green-dot grammar of `icon.svg` bent into the ring already drawn in `components/charts` (score ring).
- **Visual characteristics:** Thick ring, gap at about the 10 o'clock position, rounded green end cap, empty centre.
- **Typography direction:** Concept 1 wordmark; the ring can also frame a monospace number in marketing.
- **Color usage:** Ring #5593f7, remainder #23262f, cap #2dbe7a, background #0a0b0f.
- **Icon/symbol description:** An 80 percent arc gauge with a green cap.
- **Where it works best:** App icon, loading spinner, PDF report header, social avatar.
- **Potential weaknesses:** Ring gauges are common in fitness and finance apps; the 80 percent value is arbitrary. The empty centre wastes favicon pixels.
- **Higgsfield prompt:** Geometric logo: a thick circular gauge ring in electric blue #5593f7 filled 80 percent clockwise from the top with a rounded green #2dbe7a end cap, the remaining arc in dark grey #23262f, empty centre, flat, dark near-black background #0a0b0f.

## CONCEPT 5
- **Name:** Step Cut
- **Logo type:** Negative-space symbol
- **Concept:** A blue rounded square with a rising step line cut out of it.
- **Meaning:** Discipline cuts through the noise.
- **Why it relates to the product:** The rule engine removes what does not belong; the mark shows a line cut out of a solid block.
- **How it fits the existing brand:** Inverts `icon.svg`: the blue becomes the tile, the zigzag becomes the cut-out revealing #0a0b0f. Same shape language, new figure-ground.
- **Visual characteristics:** Solid rounded square, three-step staircase cut, bold silhouette, no dot.
- **Typography direction:** Concept 1 wordmark.
- **Color usage:** Tile #5593f7, cut-out shows the background #0a0b0f. Single color, no green.
- **Icon/symbol description:** Blue tile with a stair-step cut.
- **Where it works best:** App icon and favicon (solid tiles survive small sizes best), stickers, dark and light surfaces alike.
- **Potential weaknesses:** Drops the green dot, so it loses the "graded" cue. Stair steps can look like a bar chart or a signal icon.
- **Higgsfield prompt:** Negative-space logo: a solid rounded square in electric blue #5593f7 with a rising three-step staircase line cut out of it revealing the dark background, bold silhouette, flat, dark near-black background #0a0b0f.

## CONCEPT 6
- **Name:** Ring Lockup
- **Logo type:** Symbol + wordmark
- **Concept:** The score ring left of the TradeOS wordmark.
- **Meaning:** Score first, name second, exactly like the product.
- **Why it relates to the product:** Mirrors the "Score-first" layout rule: the number leads, the name follows.
- **How it fits the existing brand:** The ring replaces the square `icon.svg` tile in the header lockup; the green cap keeps the icon's green dot alive.
- **Visual characteristics:** Small ring at cap height, gap of about one letter width, then the wordmark on the same optical centre.
- **Typography direction:** Concept 1 wordmark (sans "Trade", mono "OS").
- **Color usage:** Ring #5593f7 with #2dbe7a cap, wordmark #eaedf0, "OS" #5593f7, background #0a0b0f.
- **Icon/symbol description:** Concept 4 ring plus Concept 1 wordmark.
- **Where it works best:** Website header, login split-screen, PDF report masthead, ad end cards.
- **Potential weaknesses:** Two accent moments (ring and "OS") in one lockup can compete; horizontal-only, so it needs a stacked variant for square placements.
- **Higgsfield prompt:** Logo lockup: a small thick gauge ring in electric blue #5593f7 filled 80 percent with a green #2dbe7a cap at left, then the word 'TradeOS' in a clean geometric sans-serif semibold in off-white #eaedf0, horizontal, dark near-black background #0a0b0f.

## CONCEPT 7
- **Name:** TO Dial
- **Logo type:** Monogram
- **Concept:** T and O interlocked, the O drawn as a dial with a tick at 80 percent.
- **Meaning:** Two letters, one instrument.
- **Why it relates to the product:** The product is an instrument that measures; the O becomes a dial face with a reading.
- **How it fits the existing brand:** Keeps the tiny blue tick plus green dot from `icon.svg` as the only color inside an otherwise off-white monogram.
- **Visual characteristics:** Geometric T whose stem drops into a thin-ring O; one blue tick and a green dot at the top right of the ring.
- **Typography direction:** Monogram built from the same geometric sans as the wordmark; wordmark below or beside.
- **Color usage:** Letters #eaedf0, tick #5593f7, dot #2dbe7a, background #0a0b0f.
- **Icon/symbol description:** Interlocked T and O with a dial tick.
- **Where it works best:** Premium touchpoints: PDF report cover, watermark, Elite-tier badge.
- **Potential weaknesses:** Thin ring and tiny tick vanish at favicon size; "TO" reads as a word. Most complex mark of the ten.
- **Higgsfield prompt:** Monogram logo: capital letters T and O interlocked as one geometric shape in off-white #eaedf0, the O drawn as a thin dial ring with a single electric blue #5593f7 tick mark and green #2dbe7a dot at the top right, flat, dark near-black background #0a0b0f.

## CONCEPT 8
- **Name:** Checked Candle
- **Logo type:** Industry-inspired symbol
- **Concept:** A single candlestick whose upper wick is a checkmark.
- **Meaning:** A trade graded against the rulebook.
- **Why it relates to the product:** The most literal mark: one trade (the candle) with its grade (the check). It is the Pass chip from the graded-trade card as a symbol.
- **How it fits the existing brand:** Blue body, green check, the same two-color rule as `icon.svg`. Green means "pass", consistent with how the app uses green.
- **Visual characteristics:** One rounded candle body, no lower wick, the upper wick bends into a bold check.
- **Typography direction:** Concept 1 wordmark.
- **Color usage:** Body #5593f7, check #2dbe7a, background #0a0b0f. Never red.
- **Icon/symbol description:** A candlestick topped with a checkmark.
- **Where it works best:** Social ads and the Pass state in-app; instantly understood by traders.
- **Potential weaknesses:** Candlesticks are the most overused symbol in the category; a green check can imply "winning trade" rather than "compliant trade".
- **Higgsfield prompt:** Symbol logo: a single simplified candlestick chart bar in electric blue #5593f7 whose upper wick bends into a bold green #2dbe7a checkmark, flat vector, minimal, dark near-black background #0a0b0f.

## CONCEPT 9
- **Name:** Guardrail
- **Logo type:** Conceptual symbol
- **Concept:** Two parallel rails with a line running safely between them.
- **Meaning:** Rules keep the trade inside the lane.
- **Why it relates to the product:** The prop-firm tracker and the rule engine are guardrails: daily loss limits and drawdown lines above and below, the trader's line inside.
- **How it fits the existing brand:** The inner line is the `icon.svg` zigzag flattened to a gentle rise, still blue, still ending in the green dot; the rails add the "rules" idea.
- **Visual characteristics:** Two grey horizontal bars, one blue line rising gently between them, green dot at the end, wide aspect ratio.
- **Typography direction:** Concept 1 wordmark stacked beneath.
- **Color usage:** Rails #23262f, line #5593f7, dot #2dbe7a, background #0a0b0f.
- **Icon/symbol description:** A blue line held between two rails.
- **Where it works best:** Prop-firm tracker page header, landing-page "guardrails" section, wide banners.
- **Potential weaknesses:** Wide shape does not fit a square app icon without cropping; grey rails vanish on dark backgrounds at small sizes.
- **Higgsfield prompt:** Conceptual logo: two horizontal parallel rounded bars in dark grey #23262f with a gently rising line in electric blue #5593f7 running between them and ending in a green #2dbe7a dot, geometric, flat, dark near-black background #0a0b0f.

## CONCEPT 10
- **Name:** Capped Bar
- **Logo type:** Minimal premium mark
- **Concept:** One vertical blue bar with a green cap.
- **Meaning:** A single graded trade; the smallest mark.
- **Why it relates to the product:** One bar is one trade; the separate green cap is its grade sitting on top. Score-first, reduced to two shapes.
- **How it fits the existing brand:** The final segment of the `icon.svg` zigzag stood upright with its green dot flattened to a cap. Same two colors, fewest possible shapes.
- **Visual characteristics:** Tall rounded bar, a short detached cap above it with a clear gap, lots of empty space.
- **Typography direction:** Concept 1 wordmark; the bar can also stand in as the "I"-like divider in lockups.
- **Color usage:** Bar #5593f7, cap #2dbe7a, background #0a0b0f.
- **Icon/symbol description:** A vertical blue bar with a floating green cap.
- **Where it works best:** Favicon, tab icon, notification badge, cursor and loading states, embroidered merch.
- **Potential weaknesses:** Very abstract; could read as a battery, a lowercase "i", or a single candle. Little to say on its own without the wordmark.
- **Higgsfield prompt:** Minimal premium logo mark: one vertical rounded bar in electric blue #5593f7 with a short separate green #2dbe7a cap segment above it, extreme simplicity, generous empty space, dark near-black background #0a0b0f.

---

## Production note

Image generators, Recraft included, frequently misspell or malform text, and "TradeOS" is a made-up word they have never seen. Treat every generated wordmark as a sketch only. The final wordmark is rebuilt as SVG in code (system sans for "Trade", monospace tabular for "OS", exact hex values above) next to the existing `src/app/icon.svg`, so the mark ships pixel-exact, scales to any size, and never carries a generator's spelling error into the product, the PDF reports, or the ads.

*For educational analytics only. Not financial advice.*
