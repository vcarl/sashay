import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <aside data-sashay-drawer="results"><label><input type="checkbox"> Unread only</label></aside>
    <section data-sashay-pane="results"><button>Toggle filters</button></section>`;
  const sash = createSashay(el, {
    panes: [
      {
        id: "results",
        title: "Results",
        focus: 1,
        edge: { width: "2.25rem", drawer: { width: "12rem", title: "Filters" } },
      },
    ],
  });
  el.querySelector("section button")?.addEventListener("click", () => sash.toggleDrawer("results"));
  return sash.destroy;
}
