# `@vcarl/sashay` API (1.0 target)

Approved design. Implementation must match. Change it only with Carl's sign-off.

## `createSashay(frame, options) → SashayHandle`

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
| `onClose` | `(id: string) => void` | none | Fires when the user closes a pane, by × or by dragging it below `minWidth`. |
| `compactBelow` | `number` (px) | `640` | Below this frame width, compact mode applies. |

### `PaneOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | required | Matches `data-sashay-pane`. Stable identity across list changes. |
| `title` | `string` | required | Used for the edge label, the compact tab and accessible names. |
| `focus` | `number` (fraction) | required | The width the pane opens to. When covered, it is also the narrowest the pane is ever drawn. |
| `minWidth` | `number` (px) | `0` | A pane released narrower than this closes. A drag may go below it. |
| `maxWidth` | `number` (px) | none | Caps growth from dragging *other* edges. It never limits dragging the pane's own edge. |
| `opensTo` | `number[]` | none | Divider fractions to snap to when this pane is revealed. |
| `edge` | `EdgeOptions` | `{ width: 12 }` | The pane's leading edge. |

### `EdgeOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `number` (px) | `12` | Edge width. Edges sit outside the fractional layout. |
| `drawer` | `{ width: number; title: string }` | none | The edge opens a drawer `width` px wide. Its content goes in `[data-sashay-drawer]`. In compact mode, the drawer is an overlay sheet, one open at a time. |

### `SashayHandle`

| Method | Description |
|---|---|
| `reveal(id)` | Opens the pane, or uncovers it, including bringing it back from the spine. Uses `opensTo` if set. |
| `close(id)` | Closes the pane. |
| `toggleDrawer(id, open?)` | Opens or closes a drawer. Leave out `open` to toggle. |
| `keepInView(id, x \| null)` | While covered, keeps `x` (px from the pane's left) inside the visible slice. |
| `setLayout(code)` | Applies a code. Does not fire `onChange`. |
| `fit(fractions)` | Moves the dividers to the nearest snaps. Fires `onChange`. |
| `update(options)` | Replaces `panes` or the callbacks without rebuilding. |
| `destroy()` | Removes the listeners, the observer and the controls sashay added. |

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
- **Spine.** When the panes no longer fit, the oldest panes fold into a single spine at the
  left that shows a count. Clicking it, or pressing ← on it, reveals the newest hidden pane.
  A fixed workspace that fits never shows a spine.
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
| `--sashay-*` | frame | Colour, radius, font size and shadow, all with fallbacks. |

Styles ship as `@vcarl/sashay/style.css`, inside `@layer sashay`.

## Accessibility

- Edges have `role="separator"`, take focus, and carry `aria-valuenow` and `aria-valuetext`.
- On a focused edge, ← and → move between snaps, and Enter or Space opens or closes the pane.
- Drawer toggles carry `aria-expanded`.
- Covered and off-screen panes are `inert`.

## `@vcarl/sashay/react`

### `<Sashay>`

| Prop | Description |
|---|---|
| `layout`, `defaultLayout`, `compactBelow` | Same as the options. |
| `onLayoutChange` | Same as `onChange`. |
| `ref` | Gives you the `SashayHandle` methods. |

### `<Pane>`

| Prop | Description |
|---|---|
| all `PaneOptions` fields | Same as above. `edge.drawer` also takes `content: ReactNode`. |
| `keepInView` | `number \| null`. |
| `onClose` | Fires when this pane is closed. |
| `children` | The pane's content, or `(state: { offscreen: boolean }) => ReactNode` so an app can unmount heavy content in very deep stacks. |

`<Pane>` renders its own element and registers itself with the nearest `<Sashay>`, so it can
be wrapped in other components or rendered conditionally. Server rendering produces
percentage widths from `layout`, so the first paint matches the hydrated layout.

## Not public in 1.0

The engine functions (`drag`, `settle`, `encode`, …) and the tuned constants stay internal.
