# Enyo vs sashay: an HCI comparison

How the webOS layouts solved the sliding-panes problem, measured against sashay `build/1.0`.

**Method.** I ran Enyo 1.0 (`SlidingPane`/`SlidingView`, the TouchPad era) and Enyo 2.5.1 (`Panels` +
`CollapsingArranger`, `Slideable`) unpatched from their original source, in headless Chromium. Drags,
throws, reversals, resizes and keyboard input were scripted with Playwright, and the release
curves were sampled every ~33ms. The constants come from their source. Enyo 2.7's drag code is
identical to 2.5.1. Sashay's behaviour comes from `engine.ts`, `controller.ts`, `window.ts`, the CSS
and the tests.

**Limits.** Mouse input only. Neither side was tested with real touch or a real screen reader.
WebOS's hardware back gesture could not be exercised.

## Verdict

Enyo got the *gesture surface* right: you could grab a pane anywhere, the axis locked
on the first 4px, inner scrollers claimed their own axis, and ends had friction. Its *release
logic* was crude: it committed on the direction of the last mousemove, with no velocity, no distance
threshold and a fixed-duration animation. Two of its three implementations also had reversal bugs. It had no
keyboard or ARIA at all, and deep stacks were simply buried at x=0.

Sashay is ahead on release logic, layout model, deep stacks and accessibility. It is behind on the
gesture surface: the hit area, feedback at the ends, and grabbing a pane mid-animation.

## Side by side

| | Enyo 1 SlidingPane | Enyo 2 Panels | sashay |
|---|---|---|---|
| Grab target | anywhere (`dragAnywhere`), or a 40px invisible edge nub | anywhere | the 12px edge only (44px with a drawer) and open drawer bodies |
| Start threshold | 4px euclidean; the 4px is swallowed (the pane trails the finger) | same | 4px **horizontal only**; caught up (the pane jumps to the finger) |
| Axis decision | the scroller claims its axis at dragstart | `event.horizontal` at dragstart, then locked | none in JS; `touch-action` CSS |
| Release | direction of the last move | sign of the last mousemove; a pause keeps the original target | nearest snap; a throw carries 1–2 snaps (0.45 / 1.4 px/ms over 90ms) |
| Small nudge (20px) | commits a whole pane | commits a whole pane | returns to the nearest snap |
| Reverse before release | **bug:** reversals under ~15px are ignored | works | works (velocity goes negative) |
| Pause, then release | commits | commits | nearest snap (v=0) |
| Past the ends | linear ¼ friction; a dismissible pane follows 1:1 and hides past 100px | hard stop | hard clamp |
| Release animation | 700ms cubicOut, fixed | 350ms cubicOut, fixed | 240ms `cubic-bezier(.2,.8,.2,1)`, fixed |
| Grab mid-animation | stops it and continues from the current position | continues, but a reversal skips a pane (2→0) | **jumps to the destination** (see below) |
| Crossing panes in one drag | hand-off view to view | chained transitions; the leftover fraction is dropped (FIXME) | one divider; donors shrink outermost-first |
| Squeeze | none; panes slide over with a 20px shadow | none; covered panes pile at x0 (+peek) | slide-over; the covered part is `inert` |
| Fill during drag | last pane refit on finish | **285px gap** mid-drag unless `realtimeFit` | `hold` keeps widths growing; no gap |
| Deep stacks | buried at x0 | buried at x0 | spine with a tab per folded pane |
| Narrow | ≤500px: full-width views, swipe-back only, forward only in code | ≤800px: full width, swipe both ways | <640px: tab strip, sheets; halves possible down to ~440px |
| Keyboard / ARIA | none | none | separators, arrows, valuenow/valuetext, inert, roving spine tabs |

## What Enyo got right that sashay lacks

### 1. A hit area bigger than the visual (high value, cheap)
Enyo 1's `edgeDragging` mode drew a thin visual edge but put a **40px invisible nub** across it
(`SlidingView.css:12-21`). Sashay's grab target *is* the visual edge: 12px. That is under WCAG
2.5.8's 24px minimum, and hard to hit on touch.

**Proposal:** give the edge a ≥24px (ideally 40px) hit area with a pseudo-element or negative
margins, and leave the visual width alone. This is the single cheapest improvement in this report.

### 2. Friction past the ends (high value, small)
Enyo 1 and `Slideable` move at a **constant ¼ ratio** past a limit (`(dx - ldx)/4`, commented
"based on HI request"), then animate back. Enyo 2 Panels dropped it, and in testing the hard stop felt dead:
the drag simply stops answering, and you can't tell "end of range" from "broken". Sashay clamps
hard (`engine.ts:132`), so it shares Enyo 2's problem.

**Proposal:** when the raw target leaves [0,1], render `bound + (raw - bound)/4` and settle as
today. That is a few lines in `drag()`'s caller. Linear ¼ is good enough, and the rubber band doesn't
need to be progressive.

### 3. Grabbing mid-animation continues from what you see (correctness)
Enyo stops the animator and continues from the *current* position. Sashay's release slide is a
CSS transition, and `onPointerDown` takes `start = effective()`, which is the **committed target**
(`controller.ts:708`). On the first 4px of movement, `data-dragging` turns transitions off, so
the panes **jump to their destination** under the finger. I confirmed this by reading the code, not
by experiment.

**Proposal:** on pointerdown during a transition, read the current transform (`getComputedStyle`
once per gesture, which the "no per-move reads" rule allows) and start from there. Add a browser
test that grabs a pane 100ms into a slide. Avoid Enyo 2's mistake here: a reversal should go back
*one* step, not to the origin of a multi-step jump.

### 4. Euclidean click threshold (bug)
Enyo uses `dx²+dy² ≥ 16`. Sashay only checks `|dx| < 4` (`controller.ts:719`). The edge has
`touch-action: none`, so a **vertical swipe on an edge counts as a click and toggles the pane**.
That is easy to trigger by accident on touch, when you meant to scroll.

**Proposal:** latch `moved` on euclidean distance. If the motion went vertical, don't toggle on
release. One line, plus a test.

### 5. Dragging from the pane body, with an axis lock (taste call for Carl)
This is what made webOS panes feel physical: you grab the page, not the seam. Enyo's version of
it is sound:
- The axis is decided once, from the first 4px.
- Inner scrollers claim their own axis first.
- Horizontal drags bubble up to the panes.

It also had costs:
- Mouse drags selected text.
- Every horizontal scroller and slider inside a pane competes with it.
- In a dense workspace, a body drag is ambiguous: which divider should move?

Enyo 1 answered that last question by moving the first pane, from the left, that could still move.

Sashay's edge-only model is the right default for **workspaces**. For **navigation stacks**,
especially on phones, swipe-back on the pane body is the platform idiom that users expect. That is a
narrower feature: on a compact frame, a horizontal body swipe closes the newest pane.
**This changes the API's feel, so it is your call.**

## Where sashay is already better (keep as-is)

- **Velocity-aware release.** Enyo computed flicks (`drag.js:313-344`, min 0.1 px/ms) and
  then **ignored them** in every pane component. A 20px nudge committed a whole pane, and a throw
  did the same as a slow drag. Sashay's nearest-snap plus 1–2-snap throw is better.
  Enyo's commit-on-direction suited one-pane-per-index paging. It doesn't fit continuous fractions.
- **Reversal and pause semantics.** Sashay's 90ms velocity window handles "never mind" and
  "hold, then let go" correctly. Enyo 1 ignored small reversals, and Enyo 2 committed after a pause.
- **No gap while dragging.** Enyo 2's default left 285px of empty container mid-drag. Sashay's `hold`
  logic covers this.
- **No lost threshold.** Enyo swallowed the first 4px permanently, so the pane trailed the
  finger. Sashay catches up.
- **Deep stacks.** Enyo buried earlier panes at x=0. The spine is a real improvement on webOS.
- **Accessibility.** Enyo had none.
- **Duration.** 240ms against 700ms and 350ms. All three use a fixed duration whatever the
  remaining distance. Ease-out hides that well enough, so it is not worth changing.

## Smaller notes

- **The slide-over shadow.** Enyo drew a 20px shadow on each view's left edge, so the stacking
  order read at a glance. Check that sashay's covered panes read as *under* rather than *cut off*.
- **Dismissible.** Enyo 1 let the last pane follow 1:1 past the end, then hide when released more than
  100px out. Sashay's close-below-`minWidth` covers the same intent with friction applied, so there is
  no need for a mode.
- **Fixed constants.** Enyo hard-coded 4px, ¼ and 100px. Sashay's are comparable. The fling
  thresholds still carry a "tune by feel; trackpads and touch differ" note, so retune them once real
  touch testing happens.

## Inconsistencies found in sashay along the way

- `window.ts:9-10` says compact shows one pane at a time. At frames between 440 and 640px, halves still
  show (grid order 2).
- `docs/api.md` says `onClose` fires on "dragging below minWidth". It also fires on throw and arrow-key
  closes, but not for `close()` or a squeeze caused by a reveal.
- 240ms is hard-coded in both the JS `hold` (`controller.ts:617`) and the CSS `0.24s`.
- Keyboard gaps:
  - No Home/End on separators.
  - No `aria-controls`.
  - No live announcement when a push folds a pane into the spine.
- Real touch and a real screen reader are untested.

## Suggested order

1. Euclidean click threshold (bug, one line).
2. Grab mid-animation continues from the current position (bug).
3. 40px invisible edge hit area.
4. ¼ friction past the ends.
5. Decide on body swipe-back for compact stacks (your call).
6. Clean up the doc and comment inconsistencies.

Enyo source, probe scripts and screenshots are in the session scratchpad, which is not committed.
