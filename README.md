# sashay

A sliding-panes layout for the web, in the style of webOS/Enyo. Panes sit in a horizontal
row, each with a draggable edge. Dragging snaps to simple fractions, a throw flings the edge,
a squeezed pane slides under its neighbour, and panes can have expanding bottom bars. The
whole layout encodes to a short string that fits in a URL. React components (React `>=19`),
server-rendered and usable from React Server Components, with a zero-dependency core
underneath.

```sh
pnpm add @vcarl/sashay react react-dom
```

```jsx
import { Sashay, Pane } from "@vcarl/sashay/react";
import "@vcarl/sashay/style.css";

<Sashay onLayoutChange={save}>
  <Pane id="list" title="List" focus={0.4}>...</Pane>
  <Pane id="detail" title="Detail" focus={0.6}>...</Pane>
</Sashay>
```

Not using React? `createSashay(frame, options)` from `@vcarl/sashay` is the same layout as a
vanilla DOM controller, for other frameworks or your own wrapper.

[Docs](https://vcarl.com/sashay/) · [GitHub](https://github.com/vcarl/sashay) · [npm](https://www.npmjs.com/package/@vcarl/sashay)

MIT
