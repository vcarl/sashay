---
"@vcarl/sashay": patch
---

Fixes from the pre-release review:

- A reveal, close, `fit()`, arrow key or spine tab during a drag settles the drag first, then acts on the settled layout, instead of undoing it.
- Opening a pane at capacity closes only the outermost open pane, even when the others are at their `minWidth`.
- A mouse click on a text input under the next pane no longer uncovers its pane; keyboard focus still does.
- Each spine always has exactly one tab stop.
- `keepInView` re-measures the content after each change settles, so it stays right after a pane narrows.
- During a resize, panes track the frame's width at once, instead of keeping their widths until resizing stops.
