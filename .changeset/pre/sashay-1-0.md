---
"@vcarl/sashay": major
---

Sashay 1.0: a sliding-pane layout for the web.

- React components, `<Sashay>` and `<Pane>`, on a zero-dependency core. `createSashay` is the escape hatch for other frameworks or your own wrapper.
- Draggable edges that snap to simple fractions, fling on release, and open drawers. Compact mode takes over on narrow frames.
- Deep navigation stacks: panes are diffed by `id`, and the oldest fold into a spine of tabs.
- The open-pane count stays steady: closing a pane expands a collapsed one, and opening one at capacity collapses the outermost.
- `keepInView` keeps a point of a pane's content visible when the pane is covered or squeezed.
- The layout encodes to a short code you can put in the URL.
- Sizes take any CSS length: `rem`, `%`, `clamp()`, `var()`, or plain pixel numbers.
- Accessible by default: separators work with arrow keys, covered panes are `inert`, and drawer toggles set `aria-expanded`.
