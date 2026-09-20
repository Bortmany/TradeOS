# TradeOS: Logo Evaluation

Scores all ten concepts from `02-logo-concepts.md` against the ten criteria in the brief. Each criterion is scored 1 (weak) to 5 (strong). The scores are the design team's reading of the concept descriptions and the Higgsfield renders; the final choice below was made by the owner, not by the totals.

Important naming note: "TradeOS" will not be the final product name. Every score for "brand relevance" and "long-term usability" therefore favours marks that work with any name. Wordmark-dependent concepts are penalised for that reason, not because the type treatment is poor.

## Scoring table

| # | Concept | Brand relevance | Memorability | Simplicity | Scalability | Distinctiveness | SaaS suitability | Favicon | App icon | Advertisement | Long-term usability | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | TradeOS Wordmark | 4 | 2 | 4 | 3 | 2 | 4 | 1 | 2 | 3 | 2 | 27 |
| 2 | T-Score | 4 | 3 | 3 | 2 | 3 | 4 | 2 | 4 | 3 | 2 | 30 |
| 3 | Zigzag Dot | 4 | 3 | 4 | 4 | 3 | 4 | 4 | 5 | 3 | 4 | 38 |
| 4 | Score Ring | 5 | 4 | 5 | 5 | 3 | 5 | 4 | 5 | 4 | 5 | 45 |
| 5 | Step Cut | 3 | 3 | 4 | 5 | 3 | 4 | 5 | 4 | 3 | 3 | 37 |
| 6 | Ring Lockup | 5 | 4 | 4 | 3 | 3 | 5 | 2 | 3 | 5 | 4 | 38 |
| 7 | TO Dial | 3 | 3 | 2 | 2 | 4 | 3 | 1 | 2 | 3 | 1 | 24 |
| 8 | Checked Candle | 4 | 3 | 3 | 3 | 2 | 3 | 3 | 3 | 4 | 2 | 30 |
| 9 | Guardrail | 4 | 2 | 3 | 2 | 3 | 3 | 1 | 2 | 4 | 3 | 27 |
| 10 | Capped Bar | 3 | 2 | 5 | 5 | 2 | 4 | 4 | 3 | 2 | 3 | 33 |

Criteria in plain words: brand relevance (does it say "graded discipline score", not "line go up"), memorability (would you recognise it a week later), simplicity (how few shapes), scalability (16 px to a billboard without redrawing), distinctiveness (does it stand apart from other trading apps), SaaS suitability (does it sit well in a header, sidebar and pricing page), favicon (16 px in a browser tab), app icon (512 px rounded square), advertisement (does it carry an ad end card), long-term usability (does it survive a rename and five years of product change).

## Tradeoffs

The Score Ring (4) leads because it is the one mark that is already a piece of the product: the dashboard's score ring is the first thing a user sees, so the logo and the UI reinforce each other for free. Its weaknesses are real but manageable. Ring gauges are common in fitness and finance apps, so distinctiveness is only a 3, and the empty centre wastes favicon pixels; the fix is to keep the stroke thick (about 11 percent of the mark width) so the ring still reads as a solid shape at 16 px. The Zigzag Dot (3) is the safe, low-risk evolution of the icon that already ships, and it scores highest as an app icon, but the rising line pulls toward the "profit promise" reading the brand explicitly avoids, and it says less about the score idea. The Ring Lockup (6) is not a separate mark so much as the ring plus a name; it scores well for headers and ads and poorly for favicons because it is the ring's horizontal form. The Step Cut (5) is the strongest pure favicon but drops the green "graded" cue, and the Capped Bar (10) is the simplest shape but too abstract to say anything alone. The T-Score (2) and TO Dial (7) are tied to the letter T, which is exactly the wrong bet when the name is about to change; the Checked Candle (8) and Guardrail (9) lean on category clip art or wide shapes that fight the square icon. In short: the ring says the right thing, scales best, and is the only choice that stays true after a rename.

## Selected for refinement

These three were the owner's selections, made after viewing the ten Higgsfield renders in the gallery. They happen to be the top three by total as well (the Step Cut, at 37, sits one point behind the Ring Lockup and Zigzag Dot), but the totals did not decide it; the owner's picks are the ones that go to refinement.

1. **Concept 4, Score Ring.** The primary candidate. It carries the product's core idea (a graded score) in one shape, uses the locked blue-plus-green grammar, and needs no letter or name to work. Because it is name-agnostic it remains valid whatever the product is finally called.
2. **Concept 6, Ring Lockup.** The horizontal form of the ring for headers, the login screen, PDF mastheads and ad end cards. It is refined as the ring's lockup, not as a separate symbol. The word next to the ring is a placeholder that will be swapped for the final name.
3. **Concept 3, Zigzag Dot.** Kept as the continuity option: it is the cleaned-up version of the current `src/app/icon.svg`, so the product can keep its existing icon language if the ring is ever judged too generic. It also gives a clear fallback for loading states and the sidebar.

Not carried forward: 1, 2, 7 (all letter or name dependent), 5, 8, 9, 10 (weaker on either meaning or shape).

*For educational analytics only. Not financial advice.*
