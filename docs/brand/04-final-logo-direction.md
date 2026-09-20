# TradeOS: Final Logo Direction

This document takes the owner's three picks from `03-logo-evaluation.md` (Score Ring, Ring Lockup, Zigzag Dot) and turns each into a production-ready direction, then names the final direction and gives the exact recipe for building it in code.

**Naming note, read first.** "TradeOS" is a placeholder and will not be the final product name. Every direction below is designed so the symbol carries the brand on its own; the wordmark is a slot that gets swapped once the name is chosen. Nowhere does the mark encode a letter T, an O, or the word "OS".

Locked palette (unchanged): background #0a0b0f, surface #111318, electric blue #5593f7, profit green #2dbe7a, loss red #e64c57 (never in a logo), amber #f6b128 (never in a logo), off-white #eaedf0, border #23262f. Type: system sans (Inter or the platform sans) plus monospace tabular numerals.

Every Higgsfield prompt below is for Recraft V4.1 vector mode. Recraft misspells and malforms text, so no prompt asks for letters; every wordmark is set in code. Append to each prompt: "flat vector, solid fills, no gradients, no 3D, no shadows, no texture, no mockup, centred, generous negative space."

---

## Pick 1: Concept 4, Score Ring (the final mark)

A thick circular gauge ring filled 80 percent clockwise from 12 o'clock, ending in a rounded green cap, with the remaining 20 percent as a dark grey track. Empty centre.

- **Primary logo.** The ring alone on #0a0b0f. Ring #5593f7, track #23262f, cap #2dbe7a.
  Prompt: Geometric logo symbol: one thick circular gauge ring in electric blue #5593f7, filled 80 percent clockwise starting from the 12 o'clock position, ending with a solid round green #2dbe7a end cap the same thickness as the ring, the remaining 20 percent of the circle drawn as a dark grey #23262f track, empty centre, no text, on a near-black background #0a0b0f, flat vector, solid fills, no gradients, no 3D.
- **Secondary logo.** The ring at left of the placeholder wordmark (see Pick 2 for the lockup rules).
  Prompt: Horizontal logo lockup: a thick circular gauge ring in electric blue #5593f7 filled 80 percent from the top with a round green #2dbe7a end cap and a dark grey #23262f remainder at the left, and an empty rectangular space to its right where a wordmark will be placed later, no letters, near-black background #0a0b0f, flat vector, solid fills, no gradients, no 3D.
- **Icon-only.** The ring on the surface colour #111318 rounded square (app tile) or on transparent (in-app).
  Prompt: App icon: a rounded square tile in very dark grey #111318 containing a thick circular gauge ring in electric blue #5593f7 filled 80 percent from the top with a round green #2dbe7a end cap and a dark grey #23262f remainder, ring occupies 75 percent of the tile width, empty centre, no text, flat vector, solid fills, no gradients, no 3D.
- **Monochrome.** Ring and cap both #eaedf0, track dropped. The silhouette stays the same because the cap is a half-circle of the ring's own thickness.
  Prompt: Single colour logo symbol: a thick 80 percent circular arc in off-white #eaedf0 starting at 12 o'clock and running clockwise, with a rounded end, no track, empty centre, on a near-black background #0a0b0f, flat vector, solid fills, no gradients, no 3D.
- **Light-background.** Ring #5593f7, cap #2dbe7a, track #eaedf0 (reads as a faint remainder on white). Never darken the blue to compensate; the brand blue is the same on every surface.
  Prompt: Geometric logo symbol on white #ffffff: a thick circular gauge ring in electric blue #5593f7 filled 80 percent clockwise from the top with a round green #2dbe7a end cap, the remaining 20 percent drawn in a very pale grey #eaedf0, empty centre, no text, flat vector, solid fills, no gradients, no 3D.
- **Dark-background.** This is the primary; see above. On #111318 surfaces the track stays #23262f.
- **Favicon direction.** At 16 px the track disappears and the ring reads as a "C" opening at 10 o'clock with a green dot. That is acceptable and intended; do not thicken the stroke further or the centre closes. Export from the same SVG; no separate simplified drawing is needed.
  Prompt (for a preview only): Favicon at 16 pixels: a thick blue #5593f7 circular arc covering 80 percent of a circle with a small green #2dbe7a dot at its end, near-black background #0a0b0f, flat vector, solid fills, no gradients, no 3D.
- **App-icon direction.** Tile #111318 with 112 px corner radius at 512 px, ring at 75 percent of the tile width, centred. No inner border, no glow, no gradient (the current `icon.svg` has a faint gradient overlay; it goes).
  Prompt: as Icon-only above.

## Pick 2: Concept 6, Ring Lockup (the ring plus a swappable name)

The lockup is the ring from Pick 1 at cap height, a gap of about one cap height, then the wordmark. The wordmark is always set in code; the current text "TradeOS" is a placeholder.

- **Primary logo.** Ring (blue, green cap, grey track) at left, wordmark #eaedf0 with the last two letters #5593f7 while the placeholder name is in use. When the final name arrives, the blue accent moves to whatever part of the new name the owner chooses, or is dropped so the ring is the only accent (recommended; two accent moments compete).
  Prompt: Horizontal logo lockup on near-black #0a0b0f: a thick circular gauge ring in electric blue #5593f7 filled 80 percent from the top with a round green #2dbe7a end cap at the left, followed by a blank rectangle proportioned for a seven-letter word to its right, no letters, flat vector, solid fills, no gradients, no 3D.
- **Secondary logo.** Stacked: ring centred above the wordmark, ring diameter equal to twice the cap height, gap equal to one cap height. For square placements (social avatars, sponsor grids).
  Prompt: Stacked logo layout on near-black #0a0b0f: a thick blue #5593f7 gauge ring with a green #2dbe7a end cap centred above a blank rectangle where a wordmark will go, no letters, flat vector, solid fills, no gradients, no 3D.
- **Icon-only.** The ring from Pick 1; the lockup has no separate icon.
- **Monochrome.** Ring, cap and wordmark all #eaedf0 on dark, or all #0a0b0f on light.
  Prompt: Single colour horizontal lockup in off-white #eaedf0 on near-black #0a0b0f: an 80 percent circular arc with a rounded end, then a blank rectangle for a wordmark, no letters, flat vector, solid fills, no gradients, no 3D.
- **Light-background.** Ring per Pick 1 light version, wordmark #0a0b0f, blue accent letters stay #5593f7.
  Prompt: Horizontal logo lockup on white #ffffff: a thick blue #5593f7 gauge ring with a green #2dbe7a end cap and pale #eaedf0 remainder at the left, then a blank rectangle for a wordmark, no letters, flat vector, solid fills, no gradients, no 3D.
- **Dark-background.** This is the primary.
- **Favicon direction.** Never the lockup; always the ring.
- **App-icon direction.** Never the lockup; always the ring.

## Pick 3: Concept 3, Zigzag Dot (continuity option)

The current `src/app/icon.svg` cleaned to the locked hexes: a three-segment rising line in #5593f7 with round joints, ending in a #2dbe7a dot, no gradient overlay.

- **Primary logo.** Zigzag and dot on #0a0b0f.
  Prompt: Abstract logo symbol: a bold three-segment rising zigzag line with rounded joints and rounded ends in electric blue #5593f7, ending at the top right in a solid green #2dbe7a circle slightly larger than the line thickness, no text, near-black background #0a0b0f, flat vector, solid fills, no gradients, no 3D.
- **Secondary logo.** Zigzag at left of the wordmark, same spacing rules as Pick 2.
  Prompt: Horizontal logo lockup on near-black #0a0b0f: a bold blue #5593f7 three-segment rising zigzag with a green #2dbe7a end dot at the left, then a blank rectangle for a wordmark, no letters, flat vector, solid fills, no gradients, no 3D.
- **Icon-only.** On the #111318 rounded tile, zigzag spanning 62 percent of the tile width.
  Prompt: App icon: a rounded square tile in very dark grey #111318 containing a bold blue #5593f7 three-segment rising zigzag with rounded joints ending in a solid green #2dbe7a circle, no text, flat vector, solid fills, no gradients, no 3D.
- **Monochrome.** Line and dot in #eaedf0.
  Prompt: Single colour logo symbol in off-white #eaedf0 on near-black #0a0b0f: a bold three-segment rising zigzag with rounded joints ending in a solid circle, no text, flat vector, solid fills, no gradients, no 3D.
- **Light-background.** Line #5593f7, dot #2dbe7a on white; no track or tile.
  Prompt: Abstract logo symbol on white #ffffff: a bold blue #5593f7 three-segment rising zigzag with rounded joints ending in a solid green #2dbe7a circle, no text, flat vector, solid fills, no gradients, no 3D.
- **Dark-background.** This is the primary.
- **Favicon direction.** Keep the dot at least 3 px at 16 px, so its radius is at least 1.4 times the line half-width. If the segments merge at 16 px, use the last two segments only.
- **App-icon direction.** As Icon-only. Keep the line weight at one eighth of the mark width.

Why it stays a fallback: the rising line reads as "line go up", which the brand avoids, and it says "chart" more than "score". It is kept because it is the shipped icon's direct descendant and costs nothing to keep.

---

## Recommended FINAL direction

**Concept 4, Score Ring, as the name-agnostic mark.** The ring alone is the brand symbol; the Ring Lockup (Concept 6) is simply how the ring sits next to whatever the product is finally called. Zigzag Dot is retired to a fallback once the ring ships.

**How the future name slots in.** The lockup SVG has one `<text>` element. Replacing its content is the entire rename: same font, same size, same baseline, same gap from the ring. If the new name is longer than nine letters, keep the font size and widen the viewBox rather than shrinking the type. The blue accent on the last two letters exists only because the placeholder ends in "OS"; for the real name the recommendation is a single off-white wordmark so the ring is the only accent. Favicon, app icon, loading spinner and social avatar never carry a name, so none of them change on rename.

### Claude Code SVG recreation (step by step)

All coordinates are on a 512 by 512 grid, origin top left, y increasing downward.

1. **Canvas.** `viewBox="0 0 512 512"`, transparent background. The mark itself contains no tile; tiles are added at export time.
2. **Ring geometry.** Centre (256, 256). Radius to the stroke centreline 192. Stroke width 56 (so the outer edge is at radius 220 and the inner edge at 164). Butt line caps on the arcs.
3. **Angles.** Zero degrees is 12 o'clock and angles run clockwise. 80 percent of a circle is 288 degrees. The start point at 0 degrees is (256, 64). The end point at 288 degrees is (256 + 192 sin 288, 256 minus 192 cos 288) = (73.4, 196.7), which is just above 9 o'clock, at about the 10 o'clock position.
4. **Blue arc (80 percent).** `M256 64 A192 192 0 1 1 73.4 196.7`, stroke #5593f7, stroke-width 56. The large-arc flag is 1 because 288 degrees is more than 180; the sweep flag is 1 for clockwise.
5. **Track (20 percent).** `M73.4 196.7 A192 192 0 0 1 256 64`, stroke #23262f, stroke-width 56. Draw it before the blue arc so the arc sits on top.
6. **Green cap.** `circle cx="73.4" cy="196.7" r="28"`, fill #2dbe7a. The radius equals half the stroke width so the cap is a perfect round end to the arc. Draw it last.
7. **Monochrome.** Same arc and circle, both #eaedf0, no track. On light surfaces use #0a0b0f for both.
8. **Light background.** Same as the colour mark with the track recoloured to #eaedf0.
9. **Clear space.** Keep a margin of at least 56 px (one stroke width, or about 11 percent of the mark) on every side of the ring's outer edge. Nothing else, including the wordmark, enters that zone. In the lockup the gap between the ring's outer edge and the first letter is one cap height.
10. **Lockup wordmark.** `<text>` in `font-family="Inter, system-ui, sans-serif"`, weight 600, letter-spacing minus 2.5 percent of the font size, fill #eaedf0. The ring is scaled to 0.5 (a 256 px mark) and the type is 160 px so the cap height (about 116 px) matches the ring's visual weight; baseline at y 218 when the ring's centre is at y 160. The "OS" `<tspan>` is #5593f7 only while the placeholder name is in use. Concept 1's monospace "OS" is an optional treatment (JetBrains Mono or `ui-monospace`) and is not used in the shipped file because the placeholder will be swapped anyway. Recraft misspells text, so the wordmark is always set in code, never traced from a render.
11. **App icon tile.** For the 512 icon, wrap the mark in a `rect` 512 by 512, `rx="112"`, fill #111318, and scale the mark to 0.75 about the centre (`transform="translate(64 64) scale(0.75)"`). No inner border, no gradient overlay.
12. **Export sizes and file names.** From `docs/brand/logos/final/`:
    - `favicon-16.png` (16 by 16, from `tradeos-mark.svg`, no tile)
    - `favicon-32.png` (32 by 32, from `tradeos-mark.svg`, no tile)
    - `apple-touch-icon-180.png` (180 by 180, tiled)
    - `icon-192.png` (192 by 192, tiled, PWA)
    - `icon-512.png` (512 by 512, tiled, PWA and store listing)
    - `tradeos-mark.svg`, `tradeos-mark-mono.svg`, `tradeos-mark-light.svg`, `tradeos-lockup.svg` (the four hand-authored sources in this folder)
    - When the name changes, rename the files from `tradeos-` to the new slug in the same commit as the text swap; nothing else changes.
13. **Verify.** `python3 -c "import xml.etree.ElementTree as E; E.parse('docs/brand/logos/final/tradeos-mark.svg')"` for each file, then open each at 16, 32 and 512 px in the browser before replacing `src/app/icon.svg`.

*For educational analytics only. Not financial advice.*
