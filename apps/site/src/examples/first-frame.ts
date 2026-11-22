import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <section data-sashay-pane="list">List</section>
    <section data-sashay-pane="detail">Detail</section>
    <section data-sashay-pane="preview">Preview</section>`;
  const sash = createSashay(el, {
    panes: [
      { id: "list", title: "List", focus: 1 / 3 },
      { id: "detail", title: "Detail", focus: 1 / 3 },
      { id: "preview", title: "Preview", focus: 1 / 3 },
    ],
  });
  return sash.destroy; // call it when the frame leaves the page
}
