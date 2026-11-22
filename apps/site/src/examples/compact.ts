import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <aside data-sashay-drawer="list">Tags…</aside>
    <section data-sashay-pane="list">List</section>
    <section data-sashay-pane="item">Item</section>`;
  const sash = createSashay(el, {
    // The frame is always narrower than the window, so it is always compact.
    compactBelow: "100vw",
    panes: [
      { id: "list", title: "List", focus: 1 / 2, edge: { drawer: { width: "10rem", title: "Tags" } } },
      { id: "item", title: "Item", focus: 1 / 2 },
    ],
  });
  return sash.destroy;
}
