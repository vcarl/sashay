# sashay

A sliding-panes layout for the web, in the style of webOS/Enyo. Panes sit in a horizontal
row, each with a draggable edge. Dragging snaps to simple fractions, a throw flings the edge,
a squeezed pane slides under its neighbour, and drawers open from edges. The whole layout
encodes to a short string that fits in a URL. Zero runtime dependencies; React is an optional
peer (`>=19`).

```sh
pnpm add @vcarl/sashay
```

```js
import { createSashay } from "@vcarl/sashay";
import "@vcarl/sashay/style.css";

const sashay = createSashay(frame, {
  panes: [
    { id: "list", title: "List", focus: 0.4 },
    { id: "detail", title: "Detail", focus: 0.6 },
  ],
  onChange: (layout) => history.replaceState(null, "", `#${layout}`),
});
```

```jsx
import { Sashay, Pane } from "@vcarl/sashay/react";
import "@vcarl/sashay/style.css";

<Sashay onLayoutChange={save}>
  <Pane id="list" title="List" focus={0.4}>...</Pane>
  <Pane id="detail" title="Detail" focus={0.6}>...</Pane>
</Sashay>
```

[Docs](docs/api.md) <!-- site URL: add when deploy path decided -->

MIT
