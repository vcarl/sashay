import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <section data-sashay-pane="list">Tab to the edge on my right, then press ← or →.</section>
    <section data-sashay-pane="detail">The separator says: <output></output></section>`;
  const out = el.querySelector("output") as HTMLOutputElement;
  const say = () => {
    out.value = el.querySelector('[role="separator"]')?.getAttribute("aria-valuetext") ?? "";
  };
  const sash = createSashay(el, {
    panes: [
      { id: "list", title: "Messages", focus: 1 / 3 },
      { id: "detail", title: "Message", focus: 2 / 3 },
    ],
    onChange: say,
  });
  say();
  return sash.destroy;
}
