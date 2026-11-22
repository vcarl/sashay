# `@vcarl/sashay` API (1.0 target)

Approved design. Implementation must match. Change it only with Carl's sign-off.

## `@vcarl/sashay/react`

### `<Sashay>`

| Prop | Description |
|---|---|
| `layout`, `defaultLayout`, `compactBelow` | Same as the core options, below. |
| `onLayoutChange` | Same as `onChange`. |
| `ref` | Gives you the `SashayHandle` methods (below). |

### `<Pane>`

| Prop | Description |
|---|---|
| all `PaneOptions` fields | Same as the core's, below. `edge.drawer` also takes `content: ReactNode`. |
| `keepInView` | `Length \| null`. |
| `onClose` | Fires when this pane is closed. |
| `children` | The pane's content, or `(state: { offscreen: boolean }) => ReactNode` so an app can unmount heavy content in very deep stacks. |
| other div props | Passed to the pane element: `className`, `style`, `data-*`, `aria-*`, event handlers. Sashay's own attributes win: `data-sashay-pane`, `aria-label` (from `title`), `inert`, `data-covered`, `data-closed`, `data-offscreen`, and the inline position and width. |

`<Pane>` renders its own element and registers itself with the nearest `<Sashay>`, so it can
be wrapped in other components or rendered conditionally. Server rendering produces
percentage widths from `layout`, so the first paint matches the hydrated layout on frames wide
enough for the layout's grid. Narrower frames (compact mode, or a coarser snap grid) re-snap on
hydration.

### `SashayHandle`

The React `ref`, and the return value of `createSashay`.

| Method | Description |
|---|---|
| `layout` (getter) | The current layout code. |
| `reveal(id)` | Opens the pane, or uncovers it, including bringing it back from the spine. Uses `opensTo` if set. |
| `close(id)` | Closes the pane. |
| `toggleDrawer(id, open?)` | Opens or closes a drawer. Leave out `open` to toggle. |
| `keepInView(id, x \| null)` | While covered, keeps point `x` (a `Length` from the pane's left; `"40%"` is 40% of the pane's width) inside the visible slice. |
| `setLayout(code)` | Applies a code. Does not fire `onChange`. |
| `fit(fractions)` | Moves the dividers to the nearest snaps. Fires `onChange`. |
| `update(options)` | Replaces `panes` or the callbacks without rebuilding. |
| `destroy()` | Removes the listeners, the observer and the controls sashay added. |

## Core (escape hatch)

The React components wrap a vanilla DOM controller with no dependencies. Use it directly
from another framework or library, or to build your own wrapper.

### `createSashay(frame, options) → SashayHandle`

Attaches to `frame`. `frame` contains one `[data-sashay-pane="<id>"]` element per pane and,
optionally, one `[data-sashay-drawer="<id>"]` element per pane with a drawer. sashay creates
and owns all the controls: edges, the leaf × button, the compact tab strip, grips and the spine.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `panes` | `PaneOptions[]` | required | The panes, left to right. The list may change at any time (see Dynamic panes). |
| `layout` | `string` | none | A saved layout code. Invalid input falls back to `defaultLayout`. |
| `defaultLayout` | `number[]` | equal split | Divider positions as fractions (0–1). |
| `onChange` | `(layout: string) => void` | none | Fires on release, click, keypress or a pane-list change, never during a drag. |
| `onClose` | `(id: string) => void` | none | Fires when the user closes a pane (×, edge click, Enter/Space, or dragging it below `minWidth`). Not fired by `close()`. |
| `compactBelow` | `Length` | `"40rem"` | Below this frame width, compact mode applies. |

### `PaneOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | required | Matches `data-sashay-pane`. Stable identity across list changes. |
| `title` | `string` | required | Used for the edge label, the compact tab and accessible names. |
| `focus` | `number` (fraction) | required | The width the pane opens to. When covered, it is also the narrowest the pane is ever drawn. |
| `minWidth` | `Length` | `0` | A pane released narrower than this closes. A drag may go below it. |
| `maxWidth` | `Length` | none | Caps growth from dragging *other* edges. It never limits dragging the pane's own edge. |
| `opensTo` | `number[]` | none | Divider fractions to snap to when this pane is revealed. |
| `edge` | `EdgeOptions` | `{ width: "0.75rem" }` | The pane's leading edge. |

### `EdgeOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `Length` | `"2.75rem"` with a `drawer`, else `"0.75rem"` | Edge width. Edges sit outside the fractional layout. |
| `drawer` | `{ width: Length; title: string }` | none | The edge opens a drawer `width` wide. Its content goes in `[data-sashay-drawer]`. In compact mode, the drawer is an overlay sheet, one open at a time. |

## Lengths

Every size option is a `Length`: either a CSS length string (`"12rem"`, `"180px"`, `"20ch"`,
`"30%"`, `"clamp(10rem, 20vw, 18rem)"`, `"var(--rail)"`) or a number, which means pixels.
Percentages are relative to the frame's width. sashay resolves each distinct value by
measuring it in place. It re-measures on resize and font load, never during a drag. Invalid
values throw (checked with `CSS.supports`). Pane widths themselves (`focus`, layouts) are
fractions, because they live on the snap grid.

## Dynamic panes and deep stacks

One API serves both a fixed workspace (a set of panes that open and close) and a navigation
stack (drill-down: picking an item adds a pane on the right; going back removes it).

- **Diff by `id`.** Vanilla: add or remove the elements, then call `update({ panes })`.
  React: render or stop rendering `<Pane>`.
  - A new pane slides in at its position and opens to `focus`, taking space the way `reveal`
    does.
  - A removed pane closes, giving its width to its neighbour the way `close` does, then
    leaves the DOM.
  - There are no `push`/`pop` helpers: a stack is just an array the app edits.
- **Spine.** When the open panes no longer fit, the oldest panes fold into a single spine at the
  left that shows a count. Clicking it, or pressing ← on it, reveals the newest hidden pane.
  Closed panes keep their own edges and never
  fold into the spine, so a fixed workspace that fits never shows one.
- **Compact.** The tab strip lists the visible window, up to six panes; panes fold into the
  spine only past six, so a workspace of six or fewer shows one tab per pane and no spine.
- **Layout code.** It holds one hex digit (the snap index) per visible divider, plus the
  offset where the visible window starts and the drawer bitsets, so it can be any length.
  After a list change, dividers that didn't move keep their positions. The code stores
  geometry only. Which panes exist is app state (for example the route) and is stored
  separately.

## Performance contract

Enforced by browser-mode benchmarks in CI.

- Per-frame drag work is O(visible panes), never O(depth). Panes in the spine are skipped.
- Off-screen panes get `data-offscreen`, `inert` and `content-visibility: hidden`, so they
  keep their state without costing layout or paint.
- At 1,000 panes: a drag frame takes under 2 ms of script, adding a pane takes under 16 ms,
  and memory stays flat across repeated adds and removes.
- During a drag, geometry is written straight to the DOM (transforms) with no framework
  re-render.

## Styling hooks

| Hook | Where | Meaning |
|---|---|---|
| `data-covered` | pane | Partly covered by the next pane, and marked `inert`. |
| `data-closed` | pane | Closed. |
| `data-offscreen` | pane | In the spine or otherwise not visible. |
| `data-spine` | spine element | The collapsed stack. |
| `data-dragging` | frame | A drag is in progress. |
| `data-compact` | frame | Compact mode is active. |
| `data-sashay-controls="<id>"` | controls element | A sibling laid over each edge. It holds the drawer toggle, the title and, in compact mode, the tab strip. |
| `--sashay-*` | frame | Colour, radius, font size and shadow, all with fallbacks. |

Styles ship as `@vcarl/sashay/style.css`, inside `@layer sashay`.

## Accessibility

- Edges take focus. Edges with a divider have `role="separator"` and carry `aria-valuenow` and
  `aria-valuetext`. The first edge, which has no divider, is a `role="button"` with `aria-expanded`.
  Drawer toggles and compact tabs sit beside the edge, not inside it, so they are announced.
- On a focused edge, ← and → move between snaps, and Enter or Space opens or closes the pane.
- Drawer toggles carry `aria-expanded`.
- Covered and off-screen panes are `inert`.

## Not public in 1.0

The engine functions (`drag`, `settle`, `encode`, …) and the tuned constants stay internal.
