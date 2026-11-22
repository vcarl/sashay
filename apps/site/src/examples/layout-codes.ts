import { createSashay } from "@vcarl/sashay";

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <section data-sashay-pane="a">Drag an edge. Code: <output></output></section>
    <section data-sashay-pane="b">B</section>
    <section data-sashay-pane="c">C</section>`;
  const out = el.querySelector("output") as HTMLOutputElement;
  const params = new URLSearchParams(location.search);
  const sash = createSashay(el, {
    panes: ["a", "b", "c"].map((id) => ({ id, title: id.toUpperCase(), focus: 1 / 3 })),
    layout: params.get("layout") ?? undefined,
    defaultLayout: [1 / 2, 3 / 4],
    onChange(code) {
      out.value = code;
      params.set("layout", code);
      history.replaceState(null, "", `?${params}`);
    },
  });
  out.value = sash.layout; // the code right now
  return sash.destroy;
}
