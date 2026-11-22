import { createSashay } from "@vcarl/sashay";

const html = (id: string) =>
  `<section data-sashay-pane="${id}">${id} <button data-act="open">Open</button><button data-act="back">Back</button></section>`;

export function mount(el: HTMLElement) {
  el.innerHTML = html("p1");
  const stack = [{ id: "p1", title: "1", focus: 1 / 3 }];
  const sash = createSashay(el, { panes: stack });

  el.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === "open") {
      const id = `p${stack.length + 1}`;
      el.insertAdjacentHTML("beforeend", html(id));
      stack.push({ id, title: id.slice(1), focus: 1 / 3 });
    } else if (act === "back" && stack.length > 1) {
      el.querySelector(`[data-sashay-pane="${stack.pop()?.id}"]`)?.remove();
    } else return;
    sash.update({ panes: [...stack] });
  });
  return sash.destroy;
}
