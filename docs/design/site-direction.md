# Site direction: "The page is a sash window"

**Concept.** A sash window is a frame holding sliding panes, so the site is one. The hero
*is* the library: three bold panes in a thick ink frame, red stiles you drag, throw and
click, and a `?layout=` readout that changes as you do. Everything below sits in the same
poster grid of ink rules. Flat colour, no gradients, serif display type.

## Palette

| Token | Hex | Use | Contrast |
|---|---|---|---|
| paper | `#F6EEDC` | page, panes | ink on paper 15.1 |
| ink | `#1B1A17` | text, rules, code blocks, docs sidebar | paper on ink 15.1 |
| mute | `#5B574D` | secondary text on paper | 6.2 |
| cobalt | `#1F3FCB` | hero pane, one poster cell | paper on cobalt 6.9 |
| tomato | `#E4472C` | edges, numerals, active nav | ink on tomato 4.3 (AA, body); never paper text on tomato (3.5) |
| butter | `#FFC846` | install pane, code readout, focus ring | ink on butter 11.3 |
| mint | `#7FD1B4` | spine cell, docs section labels on ink | ink on mint 9.7, mint on ink 9.7 |

## Type (all OFL, on Fontsource and Google Fonts)

- **Fraunces** (variable) for display, opsz 144, weight 500; *sashay* in italic with
  WONK 1, SOFT 100: the one cute flourish.
- **Instrument Sans** for body and UI, 17px/1.5.
- **JetBrains Mono** for code, layout codes and numerals.

## Layout

1360px wrap. Masthead over a 3px ink rule. Hero frame (6px ink border) with panes *Hello*
(cobalt), *Why* (paper), *Install* (butter), 32px tomato edges with rotated labels, default
layout `58`; readout strip below. Then a six-column poster grid (3+3, 2+2+2) ruled in 3px
ink, a four-up spec row, the docs sketch. Below 640px: compact mode (first edge becomes a
tab strip), cells stack, spec row 2×2, docs sidebar scrolls horizontally.

## Motion

- Settle, open, close, fling: `transform`/`width`, 240ms, `cubic-bezier(.2,.8,.2,1)`.
- During a drag: no transitions; a butter marker shows the snap that will be chosen.
- `prefers-reduced-motion: reduce` sets the duration to 0. No autoplay or scroll animation.

## Copy voice

Plain, short, slightly wry; no exclamation marks, no emoji. Headings are sentences with
full stops.

- Hero: **Panes that *sashay*.**
- 01 Snaps to simple fractions.
- 02 Throw it.
- 03 Drawers in the frame.
- 04 Deep stacks fold into a spine.
- 05 The layout is a word.
- Docs: The docs wear the same *frame*.

## Docs (Starlight, re-themed)

Starlight's structure, none of its look: paper page, Fraunces titles with the symbol in a
butter highlight, an ink sidebar painted like a stile with mint section labels and a tomato
pull-tab on the current page, ink code blocks, tables ruled in 2px ink. Same custom
properties as the landing page, so the two never drift.
