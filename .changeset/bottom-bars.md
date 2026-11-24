---
"@vcarl/sashay": minor
---

**Breaking:** bottom bars replace edge drawers. A pane takes a `bar`: a strip along its bottom that expands over the lower part of the pane. Edges only resize panes and open or close them, and are `0.75rem` wide by default.

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
