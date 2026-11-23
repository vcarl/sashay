import { createSashay, type PaneOptions } from "@vcarl/sashay";

const compactBelow = "12rem";
const edge = { width: "18px" };

export function mountCells(root: HTMLElement): () => void {
  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  const off: (() => void)[] = [];

  // 02: a pair to throw.
  const fling = createSashay($("#cell-fling"), {
    compactBelow,
    defaultLayout: [0.5],
    panes: [
      { id: "a", title: "A", focus: 0.5, edge },
      { id: "b", title: "B", focus: 0.5, edge },
    ],
  });
  off.push(fling.destroy);

  // 03: a pane whose edge opens a drawer.
  const drawer = createSashay($("#cell-drawer"), {
    compactBelow,
    panes: [{ id: "list", title: "List", focus: 1, edge: { drawer: { width: "50%", title: "Filters" } } }],
  });
  drawer.toggleDrawer("list", true);
  off.push(drawer.destroy);

  // 04: a stack the app edits; old panes fold into the spine.
  const stackEl = $("#cell-spine");
  const stack: PaneOptions[] = [
    { id: "s1", title: "1", focus: 0.5, edge },
    { id: "s2", title: "2", focus: 0.5, edge },
  ];
  const spine = createSashay(stackEl, { compactBelow, panes: stack, defaultLayout: [0.5] });
  const acts = $("#cell-spine + .acts");
  const onAct = (ev: Event) => {
    const act = (ev.target as HTMLElement).closest("button")?.dataset.act;
    if (act === "add") {
      const n = String(stack.length + 1);
      const el = document.createElement("div");
      el.dataset.sashayPane = `s${n}`;
      el.innerHTML = `<b>${n}</b><div class="line" style="width:70%"></div><div class="line" style="width:45%"></div>`;
      stackEl.append(el);
      stack.push({ id: `s${n}`, title: n, focus: 0.5, edge });
    } else if (act === "back" && stack.length > 1) {
      stackEl.querySelector(`[data-sashay-pane="${stack.pop()?.id}"]`)?.remove();
    } else return;
    spine.update({ panes: [...stack] });
  };
  acts.addEventListener("click", onAct);
  off.push(() => acts.removeEventListener("click", onAct), spine.destroy);

  // 05: the code, editable.
  const codeEl = $("#cell-code");
  const input = $(".bigcode") as HTMLInputElement;
  const word = createSashay(codeEl, {
    compactBelow,
    defaultLayout: [1 / 3, 2 / 3],
    panes: ["x", "y", "z"].map((id) => ({ id, title: id, focus: 1 / 3, edge })),
    onChange: (c) => {
      input.value = c;
    },
  });
  input.value = word.layout;
  const onInput = () => word.setLayout(input.value.trim());
  input.addEventListener("input", onInput);
  off.push(() => input.removeEventListener("input", onInput), word.destroy);

  return () => {
    for (const f of off) f();
  };
}
