---
"@vcarl/sashay": minor
---

Themes. Import the optional `@vcarl/sashay/themes.css` and put `data-sashay-theme` on the frame or an ancestor: `sash`, `shoji`, `greenhouse`, `blueprint`, `curtain` or `sleeper`. Each sets colours, type, edge thickness, the drag symbol, the chevron and close mark, and how a throw is drawn. New `--sashay-*` variables do the same for a theme of your own; the Reference lists them.

The mark that shows where a drag will settle now eases between positions instead of jumping, and the bow a throw draws relaxes when the pointer pauses. Where a release lands is unchanged.

The default chevron and × are drawn as CSS shapes, so CSS that targeted the bar toggle's `svg` or the close button's `font-size` needs updating. An edge is now as wide as its `width` on a page without a `box-sizing` reset.

In forced-colors mode the grips and marks are visible.
