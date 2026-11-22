import { createSashay, type PaneOptions } from "@vcarl/sashay";
import { kids, type Node, picture, root } from "./data";
import "./house.css";

// A navigation stack: the panes are just the path you've opened, an array the app edits.
export function mount(el: HTMLElement) {
  let path: Node[] = [root];
  const byId = new Map<string, Node>([[root.id, root]]);

  const pane = (n: Node, parent?: Node) => {
    const back = parent
      ? `<button class="hs-back" data-go="${parent.id}" aria-label="Back to ${parent.name}">‹ ${parent.name}</button>`
      : "";
    if (n.item)
      return `<section data-sashay-pane="${n.id}" class="hs-item">${back}<div class="hs-pic">${picture(n.item)}</div>
        <h3>${n.name}</h3><p>${n.item.desc}</p><p class="hs-meta">Found in ${parent?.name}</p></section>`;
    const list = kids(n);
    for (const k of list) byId.set(k.id, k);
    const rows = list
      .map(
        (k) =>
          `<li><button data-open="${k.id}">${k.item ? `<span class="hs-dot" style="background:${k.item.colour}"></span>` : `<span class="hs-box"></span>`}<span>${k.name}</span>${k.item ? "" : "<span class='hs-chev'>›</span>"}</button></li>`,
      )
      .join("");
    return `<section data-sashay-pane="${n.id}" data-depth="${n.depth % 3}">${back}
      <h3>${n.name}</h3><p class="hs-meta">${list.length ? `${list.length} ${list.length === 1 ? "thing" : "things"}` : "Empty"}</p>
      ${list.length ? `<ul>${rows}</ul>` : `<p class="hs-empty">Nothing in here but a little dust.</p>`}</section>`;
  };
  // #region stack
  // `path` is the stack: the nodes from the house down to what's open.
  const panes = (): PaneOptions[] => path.map((n) => ({ id: n.id, title: n.name, focus: 1 / 3 }));
  // #endregion

  el.classList.add("house");
  // Start with the first room open, so there's a stack to see.
  el.innerHTML = pane(root);
  path = [root, kids(root)[0]];
  el.insertAdjacentHTML("beforeend", pane(path[1], root));
  el.querySelector(`[data-open="${path[1].id}"]`)?.setAttribute("aria-current", "");
  const sash = createSashay(el, {
    panes: panes(),
    // The leaf × pops the stack back to the pane before it.
    onClose: (id) => go(path[path.findIndex((n) => n.id === id) - 1]?.id ?? root.id),
  });

  // Show the path ending at `id`: an ancestor on the path (back), or a child of any pane on it.
  // #region stack
  function go(id: string) {
    const n = byId.get(id) as Node;
    const next = [...path.slice(0, n.depth), n]; // path[i] is always at depth i
    for (const p of path) if (!next.includes(p)) el.querySelector(`[data-sashay-pane="${p.id}"]`)?.remove();
    for (const [i, p] of next.entries())
      if (!path.includes(p)) el.insertAdjacentHTML("beforeend", pane(p, next[i - 1]));
    path = next;
    // #endregion
    for (const b of el.querySelectorAll<HTMLElement>("[data-open]"))
      b.toggleAttribute(
        "aria-current",
        path.some((p) => p.id === b.dataset.open),
      );
    // #region stack
    sash.update({ panes: panes() });
    sash.reveal(n.id);
  }
  // #endregion

  const onClick = (e: Event) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-open], [data-go]");
    if (b) go((b.dataset.open ?? b.dataset.go) as string);
  };
  el.addEventListener("click", onClick);
  return () => {
    el.removeEventListener("click", onClick);
    sash.destroy();
    el.classList.remove("house");
    el.innerHTML = "";
  };
}
