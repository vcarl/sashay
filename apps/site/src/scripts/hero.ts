import { createSashay, type PaneOptions } from "@vcarl/sashay";

const edge = { width: "var(--edge)" };
const BASE: PaneOptions[] = [
  { id: "hello", title: "Hello", focus: 0.5, edge },
  { id: "why", title: "Why", focus: 0.25, edge },
  { id: "install", title: "Install", focus: 0.25, edge, bar: { title: "Package", height: "8rem" } },
];
const MAX = 12; // added panes

/** `?panes=`, untrusted: the number of added panes, or 0 for anything malformed. */
export const paneCount = (param: string | null): number =>
  /^\d{1,3}$/.test(param ?? "") ? Math.min(Number(param), MAX) : 0;

export function mountHero(frame: HTMLElement, readout: HTMLElement): () => void {
  // Compact (a phone): one pane at a time, starting on Hello.
  const DEFAULT = frame.clientWidth < 640 ? "cc.0" : "69.0";
  const code = readout.querySelector(".code") as HTMLElement;
  const add = readout.querySelector('[data-act="add"]') as HTMLButtonElement;
  const params = new URLSearchParams(location.search);

  // Added panes, left to right. They are numbered by position, so removing one in the middle
  // renumbers the rest and the URL needs only the count.
  const added: HTMLElement[] = [];
  let seq = 0;
  const append = () => {
    const el = document.createElement("div");
    el.className = `pane p-added tint-${seq % 3}`;
    el.dataset.sashayPane = `added-${++seq}`;
    el.innerHTML = '<div class="in"><h2></h2><p>An added pane. Close it and it is removed.</p></div>';
    frame.append(el);
    added.push(el);
  };
  const panes = () => [
    ...BASE,
    ...added.map((el, i): PaneOptions => {
      const title = `Pane ${i + 1}`;
      (el.querySelector("h2") as HTMLElement).textContent = title;
      return { id: el.dataset.sashayPane as string, title, focus: 0.25, minWidth: "8rem", edge };
    }),
  ];
  const show = () => {
    code.textContent = h.layout;
    add.disabled = added.length >= MAX;
    const url = new URL(location.href);
    url.searchParams.set("layout", h.layout);
    if (added.length) url.searchParams.set("panes", String(added.length));
    else url.searchParams.delete("panes");
    history.replaceState(history.state, "", url);
  };

  for (let n = paneCount(params.get("panes")); n > 0; n--) append();
  const h = createSashay(frame, {
    panes: panes(),
    layout: params.get("layout") ?? DEFAULT,
    defaultLayout: added.length ? undefined : frame.clientWidth < 640 ? [1, 1] : [0.5, 0.75],
    onChange: () => show(),
    onClose: (id) => {
      const i = added.findIndex((el) => el.dataset.sashayPane === id);
      if (i < 0) return;
      added.splice(i, 1)[0].remove();
      h.update({ panes: panes() });
      show(); // the count changed, whether or not the layout did
    },
  });
  show();

  const onAdd = () => {
    append();
    h.update({ panes: panes() });
    show();
  };
  const onReset = () => {
    for (const el of added.splice(0)) el.remove();
    h.update({ panes: panes() });
    h.setLayout(DEFAULT);
    show();
  };
  const reset = readout.querySelector('[data-act="reset"]') as HTMLButtonElement;
  add.addEventListener("click", onAdd);
  reset.addEventListener("click", onReset);
  return () => {
    add.removeEventListener("click", onAdd);
    reset.removeEventListener("click", onReset);
    h.destroy();
  };
}
