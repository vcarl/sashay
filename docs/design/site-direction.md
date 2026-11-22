# Site direction: "The page is a sash window"

**Concept.** A sash window is a frame holding sliding panes, so the site is one. The hero is
not a picture of the library; it *is* the library: three bold panes in a thick ink frame,
with red stiles you drag, throw, and click, and a `?layout=` readout that changes as you do.
Everything below sits in the same poster grid of ink rules. Print/poster voice, not SaaS:
flat colour blocks, no gradients, no shadows except the slide-over lip, serif display type.

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

All text pairings above pass WCAG AA. Tomato carries only ink text at 15px+ bold.

## Type (all OFL, on Fontsource and Google Fonts)

- **Fraunces** (variable: opsz, wght, SOFT, WONK) for display. Headlines at opsz 144,
  weight 500; the word *sashay* in italic, WONK 1, SOFT 100: the one cute flourish.
- **Instrument Sans** for body and UI, 17px/1.5 desktop, 16px mobile.
- **JetBrains Mono** for code, layout codes, numerals and the spec row.

## Layout

A 1360px `wrap`. Masthead with a 3px ink rule. The hero frame (6px ink border, 18px radius)
holds panes *Hello* (cobalt), *Why* (paper), *Install* (butter), default layout `58`, edges
32px tomato with rotated labels. Under it: the readout strip. Then a six-column poster grid
of cells separated by 3px ink rules (3+3, 2+2+2), a four-up spec row, and the docs sketch.
Below 640px the frame enters compact mode: the first edge becomes a vertical tab strip,
cells stack, the spec row goes 2×2, the docs sidebar becomes a horizontal scroller.

## Motion

- Settle, open, close and fling: `transform`/`width` over 240ms, `cubic-bezier(.2,.8,.2,1)`.
- During a drag: no transitions, geometry tracks the pointer; a butter marker shows the
  snap that will be chosen.
- `prefers-reduced-motion: reduce` sets the duration to 0: everything jumps, nothing slides.
  No autoplay, no scroll-triggered animation anywhere.

## Copy voice

Plain, short, slightly wry; no exclamation marks, no emoji, no "blazing". Headings are
declarative sentences with full stops.

- Hero: **Panes that *sashay*.**
- 01 Snaps to simple fractions.
- 02 Throw it.
- 03 Drawers in the frame.
- 04 Deep stacks fold into a spine.
- 05 The layout is a word.
- Docs: The docs wear the same *frame*.

## Docs (Starlight, re-themed)

Starlight's structure, none of its look: paper page, Fraunces page titles with the symbol
in a butter highlight, an ink sidebar painted like a stile with mint section labels and a
tomato pull-tab on the current page, ink code blocks with the same mint/butter/salmon
tokens, tables ruled in 2px ink. Fonts, colours and rules come from the same custom
properties as the landing page, so the two never drift.
