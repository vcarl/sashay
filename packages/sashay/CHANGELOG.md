# @vcarl/sashay

## 1.1.1

### Patch Changes

- ac73789: A hash link, or `scrollIntoView`, to something in a closed or off-screen pane no longer scrolls the frame and shifts every pane. The frame now uses `overflow: clip`. If your own CSS sets `overflow: hidden` on it, change that to `clip` too.

## 1.1.0

### Minor Changes

- 4ac4e62: **Breaking:** bottom bars replace edge drawers. A pane takes a `bar`: a strip along its bottom that expands over the lower part of the pane. Edges only resize panes and open or close them, and are `0.75rem` wide by default.
  
  ```tsx
  // Before
  <Pane id="list" title="List" focus={1 / 3} edge={{ drawer: { title: "Filters", width: "14rem", content: <Filters /> } }} />;
  ref.current.toggleDrawer("list");
  
  // After
  <Pane id="list" title="List" focus={1 / 3} bar={{ title: "Filters", height: "14rem", content: <Filters /> }} />;
  ref.current.toggleBar("list");
  ```
  
  - `height` is any `Length` and defaults to half the pane. `toggleDrawer(id, open?)` is now `toggleBar(id, open?)`.
  - Without React, put the content in `[data-sashay-bar="<id>"]` (it was `[data-sashay-drawer="<id>"]`) and pass `bar: { title, height }` in the pane's options.
  - In compact mode a bar stays in its pane. Overlay sheets, drawer tabs and the limit of one open at a time are gone.
  - Saved layout codes still decode when each drawer becomes a bar on the same pane: the bits that said which drawers were open now say which bars are. Adding or removing bars changes the code format, so older codes may fall back to the default layout.
  - `data-sashay-controls`, `data-sashay-toggle`, `data-sashay-title`, `data-sashay-drawer-tab`, `data-sashay-sheet-head`, `data-sashay-sheet-close` and `data-drawer` are gone, along with `data-open` on edges and `--sashay-header`. Style a bar with `[data-sashay-bar-toggle]`, `[data-sashay-bar]` and `--sashay-bar-size`.

## 1.0.0

### Major Changes

- f1424ae: Sashay 1.0: a sliding-pane layout for the web.
  
  - React components, `<Sashay>` and `<Pane>`, on a zero-dependency core. `createSashay` is the escape hatch for other frameworks or your own wrapper.
  - Draggable edges that snap to simple fractions, fling on release, and open drawers. Compact mode takes over on narrow frames.
  - Deep navigation stacks: panes are diffed by `id`, and the oldest fold into a spine of tabs.
  - The open-pane count stays steady: closing a pane expands a collapsed one, and opening one at capacity collapses the outermost.
  - `keepInView` keeps a point of a pane's content visible when the pane is covered or squeezed.
  - The layout encodes to a short code you can put in the URL.
  - Sizes take any CSS length: `rem`, `%`, `clamp()`, `var()`, or plain pixel numbers.
  - Accessible by default: separators work with arrow keys, fully hidden panes are `inert`, and drawer toggles set `aria-expanded`.

### Patch Changes

- dbb8010: A partly covered pane is no longer `inert`: its visible slice takes clicks and focus, and the next pane takes input over the covered part. Keyboard focus landing under the next pane uncovers the pane. `reveal(id)` now uncovers an open but partly covered pane. Closed and off-screen panes stay `inert`.
- 29a9dcf: Edges feel more physical:
  
  - A vertical swipe on an edge no longer toggles its pane. The click threshold is 4px in any direction, and a gesture that goes vertical first neither drags nor toggles.
  - Grabbing an edge while panes are still sliding continues from where they are on screen, instead of jumping to where they were heading.
  - An edge is easier to grab, especially on touch: a horizontal drag that starts within 20px of a pane's leading edge moves that edge. A click or vertical swipe there still belongs to the pane's content, so buttons and text selection near the edge work as before.
  - Dragging past either end follows the pointer at a quarter of its speed, then settles back on release, instead of stopping dead.
- bb76bce: Fixes from the pre-release review:
  
  - A reveal, close, `fit()`, arrow key or spine tab during a drag settles the drag first, then acts on the settled layout, instead of undoing it.
  - Opening a pane at capacity closes only the outermost open pane, even when the others are at their `minWidth`.
  - A mouse click on a text input under the next pane no longer uncovers its pane; keyboard focus still does.
  - Each spine always has exactly one tab stop.
  - `keepInView` re-measures the content after each change settles, so it stays right after a pane narrows.
  - During a resize, panes track the frame's width at once, instead of keeping their widths until resizing stops.
- 845dbed: Keep the initial `layout` under React StrictMode. The second mount used to reset the panes to the default layout and report it through `onLayoutChange`, overwriting a layout read from the URL. The same fix covers Fast Refresh and re-shown `<Activity>` or Suspense content. Panes added to an empty frame now take the `layout` given at creation, and `onChange` fires only if that code doesn't apply as given.
  
  `import "@vcarl/sashay/style.css"` no longer reports a type error with TypeScript's `noUncheckedSideEffectImports`.

## 1.0.0-alpha.1

### Patch Changes

- 845dbed: Keep the initial `layout` under React StrictMode. The second mount used to reset the panes to the default layout and report it through `onLayoutChange`, overwriting a layout read from the URL. The same fix covers Fast Refresh and re-shown `<Activity>` or Suspense content. Panes added to an empty frame now take the `layout` given at creation, and `onChange` fires only if that code doesn't apply as given.
  
  `import "@vcarl/sashay/style.css"` no longer reports a type error with TypeScript's `noUncheckedSideEffectImports`.

## 1.0.0-alpha.0

### Major Changes

- f1424ae: Sashay 1.0: a sliding-pane layout for the web.
  
  - React components, `<Sashay>` and `<Pane>`, on a zero-dependency core. `createSashay` is the escape hatch for other frameworks or your own wrapper.
  - Draggable edges that snap to simple fractions, fling on release, and open drawers. Compact mode takes over on narrow frames.
  - Deep navigation stacks: panes are diffed by `id`, and the oldest fold into a spine of tabs.
  - The open-pane count stays steady: closing a pane expands a collapsed one, and opening one at capacity collapses the outermost.
  - `keepInView` keeps a point of a pane's content visible when the pane is covered or squeezed.
  - The layout encodes to a short code you can put in the URL.
  - Sizes take any CSS length: `rem`, `%`, `clamp()`, `var()`, or plain pixel numbers.
  - Accessible by default: separators work with arrow keys, covered panes are `inert`, and drawer toggles set `aria-expanded`.

### Patch Changes

- dbb8010: A partly covered pane is no longer `inert`: its visible slice takes clicks and focus, and the next pane takes input over the covered part. Keyboard focus landing under the next pane uncovers the pane. `reveal(id)` now uncovers an open but partly covered pane. Closed and off-screen panes stay `inert`.
- 29a9dcf: Edges feel more physical:
  
  - A vertical swipe on an edge no longer toggles its pane. The click threshold is 4px in any direction, and a gesture that goes vertical first neither drags nor toggles.
  - Grabbing an edge while panes are still sliding continues from where they are on screen, instead of jumping to where they were heading.
  - An edge is easier to grab, especially on touch: a horizontal drag that starts within 20px of a pane's leading edge moves that edge. A click or vertical swipe there still belongs to the pane's content, so buttons and text selection near the edge work as before.
  - Dragging past either end follows the pointer at a quarter of its speed, then settles back on release, instead of stopping dead.
- bb76bce: Fixes from the pre-release review:
  
  - A reveal, close, `fit()`, arrow key or spine tab during a drag settles the drag first, then acts on the settled layout, instead of undoing it.
  - Opening a pane at capacity closes only the outermost open pane, even when the others are at their `minWidth`.
  - A mouse click on a text input under the next pane no longer uncovers its pane; keyboard focus still does.
  - Each spine always has exactly one tab stop.
  - `keepInView` re-measures the content after each change settles, so it stays right after a pane narrows.
  - During a resize, panes track the frame's width at once, instead of keeping their widths until resizing stops.
