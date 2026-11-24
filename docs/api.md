# `@vcarl/sashay` API

The approved API, as of 1.2. Implementation must match. Change it only with Carl's sign-off. The
site's Reference (`apps/site/src/content/docs/reference.mdx`) repeats it; update both.

## `@vcarl/sashay/react`

### `<Sashay>`

| Prop | Description |
|---|---|
| `layout`, `defaultLayout`, `compactLayout`, `compactBelow` | Same as the core options, below. |
| `onLayoutChange` | Same as `onChange`. |
| `nonce` | For the server's inline `<style>` (see Server rendering). |
| `ref` | Gives you the `SashayHandle` methods (below). |

### `<Pane>`

| Prop | Description |
|---|---|
| all `PaneOptions` fields | Same as the core's, below. `bar` also takes `content: ReactNode`. |
| `keepInView` | `Length \| null`: keeps that point of the pane's content in view, as the handle's `keepInView` does. The content must be wrapped in an element to shift; bare text nodes don't. |
| `onClose` | Fires when this pane is closed. |
| `children` | The pane's content, or `(state: { offscreen: boolean }) => ReactNode` so an app can unmount heavy content in very deep stacks. |
| other div props | Passed to the pane element: `className`, `style`, `data-*`, `aria-*`, event handlers. Sashay's own attributes win: `data-sashay-pane`, `aria-label` (from `title`), `inert`, `data-covered`, `data-closed`, `data-offscreen`, and the inline position and width (`transform`, `width`, `zIndex`, `clipPath` are dropped from `style`; other `style` keys merge). |

`<Pane>` renders its own element and registers itself with the nearest `<Sashay>`, so it can
be wrapped in other components or rendered conditionally. A frame that remounts (StrictMode, Fast
Refresh, a re-shown `<Activity>`) keeps its layout.

### Server rendering

The server's HTML has the whole frame: panes, edges, bars, spines and compact tabs, each where
hydration will put it. The frame's width isn't known on the server, so the snap grid, compact mode
and the default split are chosen by container queries. The server's controls are `inert` copies,
removed when the frame mounts.

- The React entry is a client module, so a server component can render `<Sashay>` and `<Pane>`
  directly, with server components as pane children and bar content. Functions and refs can't be
  passed from a server component: a function as `children`, `onLayoutChange`, `onClose` and `ref` need
  a client component.
- Lengths with `var()` or `%` can't be used in a container query. For `compactBelow`, `edge.width`
  and `minWidth` written that way, the first paint is chosen as if they were `"40rem"`, `"0.75rem"`
  and `0`, so a frame whose width is near a threshold may re-snap on hydration. So may one that
  changes `--sashay-tabs-width` or `--sashay-spine-width`.
- Set on hydration, so not there for your CSS to match in the first paint: `data-compact`,
  `data-covered`, `data-closed`, `data-offscreen`, `data-open` and the `keepInView` shift.
- Suspend inside a `<Pane>`, not around one: the first paint covers the panes rendered with
  `<Sashay>`, and one that arrives later is hidden until hydration, then opens as an added pane.
- `nonce` on `<Sashay>` is set on the inline `<style>` the first paint uses, for a Content Security
  Policy.
- Without JavaScript the bars show open, and a frame where any pane would be covered, folded or
  closed is a row of panes that scrolls sideways, each bar under its pane.

### `SashayHandle`

The React `ref`, and the return value of `createSashay`.

| Method | Description |
|---|---|
| `layout` (getter) | The current layout code. |
| `reveal(id)` | Opens the pane, or uncovers it (open but partly covered), including bringing it back from the spine. Uses `opensTo` if set. |
| `close(id)` | Closes the pane. |
| `toggleBar(id, open?)` | Expands or collapses a pane's bar. Leave out `open` to toggle. |
| `keepInView(id, x \| null)` | Whenever the pane's visible slice is too narrow for point `x` (a `Length` from the pane's left; `"40%"` is 40% of the pane's width), whether covered, squeezed or narrower than its content, shifts the pane's children left just enough to show it, never past the content's right edge. The content must be wrapped in an element to shift; bare text nodes don't. |
| `setLayout(code)` | Applies a code. Does not fire `onChange`. |
| `fit(fractions)` | Moves the dividers to the nearest snaps. Fires `onChange`. |
| `update(options)` | Replaces `panes`, the callbacks or `compactBelow` without rebuilding. |
| `destroy()` | Removes the listeners, the observer and the controls sashay added. |

## Core (escape hatch)

The React components wrap a vanilla DOM controller with no dependencies. Use it directly
from another framework or library, or to build your own wrapper.

### `createSashay(frame, options) → SashayHandle`

Attaches to `frame`. `frame` contains one `[data-sashay-pane="<id>"]` element per pane and
one `[data-sashay-bar="<id>"]` element per pane with a bar, after its pane. sashay creates and
owns all the controls: edges, bar strips, the leaf × button, the compact tab strip, grips and the
spine.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `panes` | `PaneOptions[]` | required | The panes, left to right. The list may change at any time (see Dynamic panes). |
| `layout` | `string` | none | A saved layout code. Invalid input falls back to `defaultLayout`, as does an empty code with more than one pane. |
| `defaultLayout` | `number[]` | equal split | Divider positions as fractions (0–1). |
| `compactLayout` | `number[]` | `defaultLayout` | Used in place of `defaultLayout` when the frame is compact at that moment. A valid `layout` still wins, and a frame that becomes compact later keeps its layout. |
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
| `bar` | `BarOptions` | none | A bar at the pane's bottom. |

### `EdgeOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `Length` | `"0.75rem"` | Edge width. Edges sit outside the fractional layout. |

### `BarOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | required | Shown on the strip, and the toggle's accessible name. |
| `height` | `Length` | `"50%"` | The expanded height, strip included. Percentages are of the pane's height, and it never exceeds the pane. |

Collapsed, a bar is a 2.75rem strip with the title and a chevron, and the pane ends above it.
Expanded, it grows over the lower part of the pane, which doesn't move or resize. The content goes
in `[data-sashay-bar]` and scrolls when it's too tall. A bar is as wide as its pane's visible
slice, any number can be open at once, and compact mode changes nothing.

## Lengths

Every size option is a `Length`: either a CSS length string (`"12rem"`, `"180px"`, `"20ch"`,
`"30%"`, `"clamp(10rem, 20vw, 18rem)"`, `"var(--rail)"`) or a number, which means pixels.
Percentages are relative to the frame's width, except in a bar's `height`. sashay resolves each distinct value by
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
  - Panes added to an empty frame take `layout` (or the last `setLayout` code) as at
    creation. `onChange` fires only if that code doesn't apply as given.
- **Open count.** Opening and closing keep the number of open panes steady. Closing a pane
  (any way, including removal) expands the nearest collapsed one (closed, in the spine or
  just past the window), the most recently folded first. Opening one below capacity adds
  it; at capacity, the outermost open pane collapses.
  - **Capacity:** the frame is at capacity when the open panes plus the one opening can't
    all fit at their `focus`, each rounded up to the snap grid in play.
- **Spine.** When the open panes no longer fit, the oldest panes fold into a spine at the
  left: a narrow column with a vertical tab per folded pane, oldest at the top, scrolling when
  it overflows, with the most recently folded tab kept in view. Clicking a tab (or Enter/Space)
  is `reveal(id)`: the window jumps to start at that pane and keeps the open count. Panes left
  after the window then fold into a second spine at the right, nearest first. Closed panes keep
  their own edges and never fold into the spine, so a fixed workspace that fits never shows one.
- **Compact.** The tab strip lists the visible window, up to six panes; panes fold into the
  spine only past six, so a workspace of six or fewer shows one tab per pane and no spine.
- **Layout code.** It holds one hex digit (the snap index) per visible divider, plus the
  offset where the visible window starts and the open bars, so it can be any length.
  Adding or removing a pane's `bar` changes the format, so codes saved before may fall back to
  the default layout.
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
| `data-covered` | pane | Partly covered by the next pane. Its visible slice stays interactive. |
| `data-closed` | pane | Closed. |
| `data-offscreen` | pane | In the spine or otherwise not visible. |
| `data-spine="start"`, `"end"` | spine element | The panes folded before (left) or after (right) the window. |
| `data-sashay-spine-tab="<id>"` | spine tab | The tab for one folded pane. |
| `data-dragging` | frame | A drag is in progress. |
| `data-compact` | frame | Compact mode is active. |
| `data-bar` | pane | The pane has a bar. |
| `data-sashay-bar-toggle="<id>"` | bar strip | The button that expands a bar; `aria-expanded` gives its state. |
| `data-sashay-bar="<id>"` | bar content | `data-open` while expanded. |
| `--sashay-*` | frame | Colour, radius, font size, shadow and `--sashay-bar-size` (the strip's height), all with fallbacks. |

Styles ship as `@vcarl/sashay/style.css`, inside `@layer sashay`. The frame uses `overflow: clip`, so a
hash link can't scroll it; if you set `overflow` on it yourself, keep `clip`.

## Accessibility

- Edges take focus. Edges with a divider have `role="separator"` and carry `aria-valuenow` and
  `aria-valuetext`. The first edge, which has no divider, is a `role="button"` with `aria-expanded`.
  Compact tabs sit beside the edge, not inside it, so they are announced.
- On a focused edge, ← and → move between snaps, and Enter or Space opens or closes the pane.
- A bar's strip is a button with `aria-expanded` and `aria-controls`. Collapsed content is `inert`,
  and so is the bar of a closed or off-screen pane. Keyboard focus landing under an
  expanded bar collapses it, so focus is never hidden.
- Closed and off-screen panes are `inert`. A partly covered pane is not: its visible slice
  takes input, and keyboard focus landing under the next pane uncovers it, so focus is never hidden.
- Each spine is a `<nav>` labelled "Earlier panes" or "Later panes". Its tabs are buttons named
  "<title>, collapsed", with one tab stop: ↑/↓, Home and End move between tabs. When a focused
  tab's pane is revealed, focus moves to the spine's tab nearest the window, or to the window's
  edge on that side once the spine is empty.

## Not public

The engine functions (`drag`, `settle`, `encode`, …) and the tuned constants stay internal.
