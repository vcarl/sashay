import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <section data-sashay-pane="a">Theme me</section>
    <section data-sashay-pane="b">B</section>`;
  const theme = {
    "--sashay-bg": "#1b1a17",
    "--sashay-pane-bg": "#f6eedc",
    "--sashay-muted": "#ffc846",
    "--sashay-accent": "#ffc846",
  };
  for (const [k, v] of Object.entries(theme)) el.style.setProperty(k, v);
  const sash = createSashay(el, {
    panes: [
      { id: "a", title: "A", focus: 1 / 2, edge: { width: "1.25rem" } },
      { id: "b", title: "B", focus: 1 / 2, edge: { width: "1.25rem" } },
    ],
  });
  return sash.destroy;
}
