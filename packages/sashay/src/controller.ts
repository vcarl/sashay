// The vanilla DOM controller. It owns the window over the pane list: only
// window panes get edges, geometry and per-frame work; the rest are offscreen.
// Everything is keyed by pane id so state survives list changes.
import {
  contentWidth,
  drag,
  FLING,
  fit as fitIdx,
  flingReach,
  focusShift,
  gridOrder,
  isOpen,
  layout,
  nearest,
  ratio,
  type Sample,
  type Sizes,
  settle,
  snapV,
  step,
  toWidths,
  velocity,
} from "./engine.ts";
import { checkLength, createMeasure, type Length } from "./length.ts";
import {
  close as closeIn,
  decodeLayout,
  defaultView,
  diff,
  encodeLayout,
  keepOpen,
  normalize,
  reveal as revealIn,
  type View,
  windowEnd,
} from "./window.ts";

export type { Length };
export interface EdgeOptions {
  width?: Length;
}
export interface BarOptions {
  title: string;
  height?: Length;
}
export interface PaneOptions {
  id: string;
  title: string;
  focus: number;
  minWidth?: Length;
  maxWidth?: Length;
  opensTo?: number[];
  edge?: EdgeOptions;
  bar?: BarOptions;
}
export interface SashayOptions {
  panes: PaneOptions[];
  layout?: string;
  defaultLayout?: number[];
  compactLayout?: number[];
  onChange?: (layout: string) => void;
  onClose?: (id: string) => void;
  compactBelow?: Length;
}
export interface SashayHandle {
  /** The current layout code, as the last onChange reported or setLayout applied. */
  readonly layout: string;
  reveal(id: string): void;
  close(id: string): void;
  toggleBar(id: string, open?: boolean): void;
  keepInView(id: string, x: Length | null): void;
  setLayout(code: string): void;
  fit(fractions: number[]): void;
  update(options: Partial<Pick<SashayOptions, "panes" | "onChange" | "onClose" | "compactBelow">>): void;
  destroy(): void;
}

export const EDGE = "var(--sashay-edge-width, 0.75rem)"; // internal, as COMPACT
export const COMPACT_EDGE = `min(${EDGE}, 0.75rem)`; // internal, as COMPACT
export const COMPACT = "40rem"; // internal: shared with react.tsx, not re-exported
export const TABS = "var(--sashay-tabs-width, 2.75rem)"; // internal, as COMPACT
export const SPINE = "var(--sashay-spine-width, 1.5rem)"; // internal, as COMPACT
export const barHeight = ({ height = "50%" }: BarOptions) => (typeof height === "number" ? `${height}px` : height); // internal, as COMPACT
// Compact: the most panes the window (and so the tab strip) holds; the rest are in the spine.
const COMPACT_CAP = 6;
// The release marks ease toward where a release would land, with this time constant.
const SMOOTH_MS = 60;
// internal, as COMPACT
export const CHEVRON = "<i data-sashay-chevron></i>";

const own = (frame: HTMLElement, sel: string) =>
  [...frame.querySelectorAll<HTMLElement>(sel)].filter((el) => el.closest("[data-sashay-frame]") === frame);

// Validates a pane list against the frame's DOM. Throws before any state changes.
function scan(frame: HTMLElement, list: PaneOptions[]) {
  const els = new Map(own(frame, "[data-sashay-pane]").map((el) => [el.dataset.sashayPane ?? "", el]));
  const barEls = new Map(own(frame, "[data-sashay-bar]").map((el) => [el.dataset.sashayBar ?? "", el]));
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p.id)) throw new Error(`sashay: duplicate pane id "${p.id}"`);
    seen.add(p.id);
    if (!els.has(p.id)) throw new Error(`sashay: no [data-sashay-pane="${p.id}"] element`);
    for (const v of [p.minWidth, p.maxWidth, p.edge?.width, p.bar?.height]) if (v !== undefined) checkLength(v);
  }
  return { els, barEls };
}

// What a destroyed frame's `shut` (below) was, and for which layout and panes, for a remount.
const held = new WeakMap<HTMLElement, { key: string; shut: Set<string> }>();

let uid = 0;
export function createSashay(frame: HTMLElement, options: SashayOptions): SashayHandle {
  const opts = { ...options, compactBelow: options.compactBelow ?? (COMPACT as Length) };
  checkLength(opts.compactBelow);
  for (const k of ["defaultLayout", "compactLayout"] as const) {
    const dl = options[k];
    if (dl?.some((x, i) => !(x >= 0 && x <= 1) || (i > 0 && x < dl[i - 1])))
      throw new RangeError(`sashay: ${k} must be ascending fractions from 0 to 1, got ${JSON.stringify(dl)}`);
  }
  frame.setAttribute("data-sashay-frame", "");
  let found: ReturnType<typeof scan>;
  try {
    found = scan(frame, options.panes);
  } catch (e) {
    frame.removeAttribute("data-sashay-frame");
    throw e;
  }

  let panes = options.panes;
  let { els, barEls } = found;
  let view: View;
  let bars = new Map<string, boolean>(); // open bars
  // Closed panes that only an explicit open may bring back: closed by the user or the app, or
  // closed when a layout was applied. The other closed panes sashay collapsed, to make room.
  let shut = new Set<string>();
  // keepInView points. w: the content's extent, measured on resize or a keepInView change
  // (never per frame); s: the shift applied to the pane's children.
  const keep = new Map<string, { x: Length; w?: number; s: number }>();
  const edges = new Map<string, HTMLElement>(); // window panes only
  // Each bar's strip. A bar is a sibling of its pane, so it is clear of the pane's scrolling and
  // padding; strip and content are placed over the pane's visible slice.
  const strips = new Map<string, HTMLButtonElement>();
  const barOf = (id: string): HTMLElement[] => {
    const t = strips.get(id);
    return t ? [t, barEls.get(id) as HTMLElement] : [];
  };
  const named = new WeakSet<HTMLElement>(); // panes and bar content given an id, for aria-controls
  const measure = createMeasure(frame);
  const px = measure.px;
  let W = frame.clientWidth;
  // The live dividers during a drag, and where they would settle (the marks): `rest` without
  // a fling, `idx` with the current velocity, `t` its flingReach. A resize while dragging waits for release.
  let live: number[] | null = null;
  // A drag past either end: px the whole window shifts, at ¼ of the overshoot (Enyo's friction).
  let rubber = 0;
  let preview: { d: number; rest: number[]; idx: number[]; t: number } | null = null;
  let gesture: { end(ev: PointerEvent | null): void; stop(): void } | null = null;
  let dirty = false;
  let destroyed = false;
  let lastCode = "";
  // Animation: panes entering the window start, and leaving ones end, offset by how far the
  // window slid (lastX: each window pane's last painted x). While a change settles (`hold`),
  // widths only grow, so a shrinking pane never opens a gap before its neighbour slides over,
  // and a pane sliding right also covers the distance it travels.
  const lastX = new Map<string, number>();
  const entering = new Set<string>();
  const leaving = new Map<string, number>();
  const lastW = new WeakMap<HTMLElement, number>();
  let hold = false;
  let holdT: ReturnType<typeof setTimeout> | undefined;
  const size = (el: HTMLElement, w: number) => {
    const v = hold && !live ? Math.max(w, lastW.get(el) ?? 0) : w;
    lastW.set(el, v);
    el.style.width = `${v}px`;
  };

  const orig = new Map<HTMLElement, string | null>(); // style attributes as the app left them
  const touch = (el: HTMLElement) => {
    if (!orig.has(el)) orig.set(el, el.getAttribute("style"));
    return el.style;
  };

  const win = () => panes.slice(view.offset, windowEnd(view));
  const idsOf = (list = win()) => new Set(list.map((p) => p.id));
  const compact = () => W > 0 && W < px(opts.compactBelow);
  // The spines: panes [0, from) fold into one at the left, panes [to, n) into one at the right.
  const spineW = (from: number, to: number, n: number) => (from > 0 ? px(SPINE) : 0) + (to < n ? px(SPINE) : 0);
  const spinesW = () => spineW(view.offset, windowEnd(view), panes.length);
  const edgeWidths = (list: PaneOptions[]) => {
    const c = compact();
    return list.map((p, k) => px(c ? (k === 0 ? TABS : COMPACT_EDGE) : (p.edge?.width ?? EDGE)));
  };
  const sizesOf = (list: PaneOptions[], from: number, to: number): Sizes => {
    const w = list.slice(from, to);
    const C = Math.max(1, contentWidth(W - spineW(from, to, list.length), edgeWidths(w)));
    return {
      focus: w.map((p) => p.focus),
      min: w.map((p) => Math.min(1, px(p.minWidth ?? 0) / C)),
      max: w.map((p) => (p.maxWidth === undefined ? 1 : Math.min(1, px(p.maxWidth) / C))),
    };
  };
  const content = () => contentWidth(W - spinesW(), edgeWidths(win()));
  // The grid ignores the spines, so a pane folding into one doesn't coarsen the grid and
  // re-round every divider (thirds becoming halves would shut a middle pane).
  const order = () => gridOrder(content() + spinesW());
  const sizes = () => sizesOf(panes, view.offset, windowEnd(view));
  const sizesFor = (a: number, b: number) => sizesOf(panes, a, b);
  // The default view: an equal split over as many trailing panes as fit their minimums.
  // Compact shows one pane at a time anyway, so it keeps the whole split.
  const fits = (v: View) => {
    if (W <= 0 || compact()) return true;
    const to = windowEnd(v);
    const o = gridOrder(contentWidth(W, edgeWidths(panes.slice(v.offset, to))));
    return toWidths(fitIdx(v.div.map(snapV), sizesFor(v.offset, to), o).map(snapV)).every(isOpen);
  };
  const effIdx = () => view.div.map((i) => nearest(snapV(i), order()));
  const effective = () => live ?? effIdx().map(snapV);
  const openIds = (div = effIdx()) => {
    const w = toWidths(div.map(snapV));
    return new Set(win().flatMap((p, k) => (isOpen(w[k]) ? [p.id] : [])));
  };
  const may = (id: string) => !shut.has(id);
  const mayAt = (p: number) => may(panes[p].id);
  const heldKey = () => JSON.stringify([lastCode, ...idsOf(panes)]);
  // A % keepInView point is of the pane's width. Measured at two widths and
  // interpolated, so a drag never measures.
  // ponytail: exact for calc() and %, approximate for clamp()/min()/max() of %.
  const keepPx = (v: Length, w: number) => {
    const a = px(v, 0);
    return a + ((px(v, 1000) - a) * w) / 1000;
  };
  // The content's right edge from the pane's left, as laid out: the applied shift undone.
  // ponytail: element children only; a pane whose content is bare text never shifts.
  const extent = (el: HTMLElement, s: number) => {
    const left = el.getBoundingClientRect().left;
    let r = 0;
    for (const c of el.children) r = Math.max(r, c.getBoundingClientRect().right - left + s);
    return r;
  };

  const code = () =>
    encodeLayout(
      view,
      win()
        .filter((p) => p.bar)
        .map((p) => Boolean(bars.get(p.id))),
    );
  const decodeState = (c: unknown) => {
    const d = decodeLayout(c, panes.length, (p) => Boolean(panes[p].bar));
    const dl = (compact() && opts.compactLayout) || opts.defaultLayout;
    const v = normalize(d?.view ?? defaultView(panes.length, dl, fits), panes.length);
    const m = new Map<string, boolean>();
    if (d) {
      const ids = panes.slice(v.offset, windowEnd(v)).filter((p) => p.bar);
      ids.forEach((p, j) => {
        m.set(p.id, d.bars[j]);
      });
    }
    return { v, m };
  };
  // Panes closed in an applied layout, as stored (not as a narrow frame's grid shows it), stay shut.
  const apply = (c: unknown) => {
    ({ v: view, m: bars } = decodeState(c));
    shut = idsOf();
    for (const id of openIds(view.div)) shut.delete(id);
  };

  // Controls sashay owns.
  const spines = (["start", "end"] as const).map((side) => {
    const n = document.createElement("nav");
    n.setAttribute("data-spine", side);
    n.setAttribute("aria-label", side === "start" ? "Earlier panes" : "Later panes");
    return n;
  });
  const spineTabs = new Map<string, HTMLButtonElement>();
  const leaf = document.createElement("button");
  leaf.type = "button";
  leaf.setAttribute("data-sashay-close", "");
  leaf.append(document.createElement("i"));
  frame.prepend(leaf); // a spine joins the frame only while it holds tabs
  let lone = false; // closing the leaf is impossible: set in sync, read per frame in paint
  const marks: HTMLElement[] = [];
  const tabs = document.createElement("div");
  tabs.setAttribute("data-sashay-tabs", "");
  let tabsKey = "";

  const offscreen = (id: string) => {
    for (const el of [els.get(id), ...barOf(id)]) {
      if (!el) continue;
      el.setAttribute("data-offscreen", "");
      el.removeAttribute("data-covered");
      el.removeAttribute("data-closed");
      el.inert = true;
    }
  };
  // A bar's strip takes room from its pane for as long as the pane has one, so a slide or a
  // toggle never resizes the pane. On mount and pane-list changes.
  const setBars = () => {
    for (const p of panes) els.get(p.id)?.toggleAttribute("data-bar", Boolean(p.bar));
    for (const [id, t] of strips) {
      if (barEls.has(id) && els.get(id)?.hasAttribute("data-bar")) continue;
      t.remove();
      strips.delete(id);
      bars.delete(id);
      barEls.get(id)?.removeAttribute("data-open");
    }
  };
  const syncBar = (p: PaneOptions) => {
    const be = barEls.get(p.id);
    if (!p.bar || !be) return;
    let t = strips.get(p.id);
    if (!t) {
      t = document.createElement("button");
      t.type = "button";
      t.setAttribute("data-sashay-bar-toggle", p.id);
      t.innerHTML = `<span></span>${CHEVRON}`;
      if (!be.id) {
        be.id = `sashay-bar-${++uid}`;
        named.add(be);
      }
      t.setAttribute("aria-controls", be.id);
      be.before(t);
      strips.set(p.id, t);
    }
    (t.firstElementChild as HTMLElement).textContent = p.bar.title;
    const open = Boolean(bars.get(p.id));
    t.setAttribute("aria-expanded", String(open));
    be.toggleAttribute("data-open", open);
    if (!open && be.contains(document.activeElement)) t.focus({ preventScroll: true });
    for (const x of [t, be]) {
      touch(x).setProperty("--sashay-bar-height", barHeight(p.bar));
      x.removeAttribute("data-offscreen");
      if (entering.has(p.id)) lastW.delete(x);
    }
  };

  // The spine's one tab stop (roving tabindex).
  const rove = (s: HTMLElement, t: HTMLElement) => {
    for (const x of s.querySelectorAll<HTMLElement>('[tabindex="0"]')) x.tabIndex = -1;
    t.tabIndex = 0;
  };
  // A tab per folded pane, in pane order. Incremental: only tabs joining or leaving the spine
  // touch the DOM, so a deep stack costs O(change) in DOM work. `near`: the tab next to the
  // window (the most recently folded), which is the roving tab stop and stays scrolled into view.
  const fillSpine = (s: HTMLElement, list: PaneOptions[], near: "first" | "last") => {
    const want = new Set(list.map((p) => p.id));
    const drop = (el: Element | null) => {
      while (el) {
        const next = el.nextElementSibling;
        if (want.has((el as HTMLElement).dataset.sashaySpineTab as string)) return el;
        el.remove(); // kept in spineTabs until sync ends: it may be moving to the other spine
        el = next;
      }
      return null;
    };
    let cur = s.firstElementChild;
    let added = false;
    for (const p of list) {
      cur = drop(cur);
      let b = spineTabs.get(p.id);
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.setAttribute("data-sashay-spine-tab", p.id);
        spineTabs.set(p.id, b);
      }
      if (b.textContent !== p.title) {
        b.textContent = p.title;
        b.setAttribute("aria-label", `${p.title}, collapsed`);
      }
      if (b === cur) cur = cur.nextElementSibling;
      else {
        b.tabIndex = -1; // a tab moving from the other spine may have been its stop
        s.insertBefore(b, cur);
        added = true;
      }
    }
    drop(cur);
    if (!list.length) s.remove();
    else if (!s.isConnected) frame.prepend(s);
    const t = (near === "last" ? s.lastElementChild : s.firstElementChild) as HTMLElement | null;
    if (!t) return;
    rove(s, s.contains(document.activeElement) ? (document.activeElement as HTMLElement) : t);
    if (added) s.scrollTop = near === "last" ? s.scrollHeight : 0;
  };

  // Window membership, edges and ARIA. On commit and resize, never per frame.
  const sync = () => {
    const c = compact();
    frame.toggleAttribute("data-compact", c);
    const focused = document.activeElement as HTMLElement | null;
    const fromSpine = focused?.hasAttribute("data-sashay-spine-tab") ? focused.parentElement : null;
    fillSpine(spines[0], panes.slice(0, view.offset), "last");
    fillSpine(spines[1], panes.slice(windowEnd(view)), "first");
    for (const [id, b] of spineTabs) if (!b.isConnected) spineTabs.delete(id);
    const w = win();
    const ids = idsOf();
    for (const [id, e] of edges) {
      if (ids.has(id)) continue;
      e.remove();
      edges.delete(id);
      offscreen(id);
      const x = lastX.get(id);
      if (x !== undefined) leaving.set(id, x);
      lastX.delete(id);
      bars.delete(id);
    }
    const idx = effIdx();
    const widths = toWidths(idx.map(snapV));
    w.forEach((p, k) => {
      const el = els.get(p.id) as HTMLElement;
      let e = edges.get(p.id);
      if (!e) {
        e = document.createElement("div");
        e.setAttribute("data-sashay-edge", p.id);
        e.tabIndex = 0;
        e.append(document.createElement("span"));
        e.firstElementChild?.setAttribute("data-sashay-dots", "");
        el.before(e);
        edges.set(p.id, e);
        el.removeAttribute("data-offscreen");
        el.inert = false;
        entering.add(p.id);
        lastW.delete(el);
      }
      syncBar(p);
      if (!el.id) {
        el.id = `sashay-pane-${++uid}`;
        named.add(el);
      }
      e.setAttribute("aria-controls", el.id);
      e.setAttribute("aria-label", p.title);
      if (k === 0) {
        e.setAttribute("role", "button");
        e.setAttribute("aria-expanded", String(isOpen(widths[0])));
        for (const a of ["aria-orientation", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"])
          e.removeAttribute(a);
      } else {
        e.setAttribute("role", "separator");
        e.removeAttribute("aria-expanded");
        e.setAttribute("aria-orientation", "vertical");
        e.setAttribute("aria-valuemin", "0");
        e.setAttribute("aria-valuemax", "100");
        e.setAttribute("aria-valuenow", String(Math.round(snapV(idx[k - 1]) * 100)));
        e.setAttribute("aria-valuetext", ratio(idx));
      }
    });
    // Compact: a tab per window pane, in a strip laid over the first edge (a sibling, so the
    // tabs aren't children of its role element).
    const e0 = c && w.length ? edges.get(w[0].id) : undefined;
    if (!e0) tabs.remove();
    else {
      const k = JSON.stringify(w.map((p) => [p.id, p.title]));
      if (k !== tabsKey) {
        tabsKey = k;
        tabs.replaceChildren(
          ...w.map((p) => {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("data-sashay-tab", p.id);
            b.textContent = p.title;
            return b;
          }),
        );
      }
      if (tabs.previousElementSibling !== e0) e0.after(tabs);
      w.forEach((p, k) => {
        tabs
          .querySelector(`[data-sashay-tab="${CSS.escape(p.id)}"]`)
          ?.setAttribute("aria-pressed", String(isOpen(widths[k])));
      });
    }
    // One release mark per window divider.
    while (marks.length < w.length - 1) {
      const m = document.createElement("div");
      m.setAttribute("data-sashay-mark", "");
      m.setAttribute("aria-hidden", "true");
      m.innerHTML = '<svg viewBox="0 0 1 100" preserveAspectRatio="none"><path d="M0 0Q0 25 1 50Q0 75 0 100"/></svg>';
      frame.append(m);
      marks.push(m);
    }
    while (marks.length > Math.max(0, w.length - 1)) marks.pop()?.remove();
    // A focused spine tab that left (its pane was revealed): focus the tab now nearest the
    // window on that side, or, with that spine empty, the window's edge on that side.
    if (fromSpine && document.activeElement !== focused) {
      const start = fromSpine === spines[0];
      const t = !fromSpine.isConnected
        ? edges.get(w[start ? 0 : w.length - 1]?.id)
        : fromSpine.querySelector<HTMLElement>('[tabindex="0"]');
      t?.focus({ preventScroll: true });
    }
    const open = [...openIds()];
    lone = c || open.length < 2;
    if (lone && document.activeElement === leaf) edges.get(open.pop() ?? w[0]?.id)?.focus({ preventScroll: true });
  };

  // Each mark sits where a no-fling release lands; a throw bows the dragged mark toward where the
  // fling lands, by up to half that distance (preview.t). What's drawn eases toward that, for as
  // long as the drag lasts: `dt` ms since the last frame, 0 to only place what's new.
  let shown: { x: number[]; b: number } | null = null;
  let frameId = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const paintMarks = (dt = 0) => {
    if (!preview) return;
    const sw = view.offset > 0 ? px(SPINE) : 0;
    const p = preview;
    const inner = W - spineW(view.offset, windowEnd(view), panes.length);
    const ew = edgeWidths(win());
    const at = (idx: number[]) => layout(inner, idx.map(snapV), ew, []).edgeBoxes;
    const rest = at(p.rest);
    const fly = at(p.idx);
    const a = reduced.matches ? 1 : 1 - Math.exp(-dt / SMOOTH_MS);
    shown ??= { x: marks.map((_, k) => rest[k + 1]?.x ?? 0), b: 0 };
    const now = shown;
    marks.forEach((m, k) => {
      const x = rest[k + 1]?.x ?? 0;
      now.x[k] += (x - now.x[k]) * a;
      if (k === p.d) now.b += ((p.t * ((fly[k + 1]?.x ?? 0) - x)) / 2 - now.b) * a;
      const b = k === p.d && Math.abs(now.b) > 0.5 ? now.b : 0;
      m.style.transform = `translateX(${now.x[k] + sw}px)`;
      m.style.setProperty("--sashay-fling", String(b));
      m.toggleAttribute("data-fling", b !== 0);
      m.toggleAttribute("data-primary", k === p.d);
    });
  };

  // Geometry for window panes only: safe to call every frame.
  const paint = () => {
    const w = win();
    if (W <= 0 || !w.length) {
      leaf.hidden = true;
      return;
    }
    const sw = view.offset > 0 ? px(SPINE) : 0;
    const sr = spinesW() - sw;
    const ew = edgeWidths(w);
    const { paneBoxes, edgeBoxes } = layout(
      W - sw - sr,
      effective(),
      ew,
      w.map((p) => ({ focus: p.focus })),
    );
    // How far each staying pane slid; an entering or leaving pane moves with the nearest one.
    const moved = w.flatMap((p, k) => {
      const x0 = entering.has(p.id) ? undefined : lastX.get(p.id);
      return x0 === undefined ? [] : [[k, paneBoxes[k].x + sw - x0]];
    });
    const delta = (k: number) => {
      let best: number[] | undefined;
      for (const m of moved) if (!best || Math.abs(m[0] - k) < Math.abs(best[0] - k)) best = m;
      return best?.[1] ?? 0;
    };
    for (const [id, x] of leaving) {
      const to = `translateX(${x + delta(indexOf(id) < view.offset ? -1 : w.length)}px)`;
      for (const el of [els.get(id), ...barOf(id)]) if (el) touch(el).transform = to;
    }
    leaving.clear();
    if (entering.size) {
      const start = w.flatMap((p, k) => {
        if (!entering.has(p.id)) return [];
        const d = delta(k);
        const x = paneBoxes[k].x + sw - d;
        return [
          [els.get(p.id), x],
          [edges.get(p.id), edgeBoxes[k].x + sw - d],
          ...barOf(p.id).map((el) => [el, x]),
        ] as [HTMLElement, number][];
      });
      for (const [el, x] of start) {
        const s = touch(el);
        s.transition = "none";
        s.transform = `translateX(${x}px)`;
      }
      void frame.offsetWidth; // commit the start positions, then transition from them
      for (const [el] of start) el.style.transition = "";
      entering.clear();
    }
    let right = -1;
    let last = "";
    const active = document.activeElement;
    w.forEach((p, k) => {
      const b = paneBoxes[k];
      const el = els.get(p.id) as HTMLElement;
      const x = b.x + sw + rubber;
      const s = touch(el);
      s.transform = `translateX(${x}px)`;
      const trail = Math.max(0, hold ? x - (lastX.get(p.id) ?? x) : 0); // moving right: cover it
      size(el, b.width + trail);
      const kv = keep.get(p.id);
      if (kv) {
        kv.w ??= extent(el, kv.s); // after size(): content sized in % follows the pane
        const shift = b.width ? focusShift(Math.max(b.width, kv.w), b.visible, keepPx(kv.x, b.width)) : 0;
        if (shift !== kv.s) s.setProperty("--sashay-shift", shift ? `${-shift}px` : "");
        kv.s = shift;
      }
      lastX.set(p.id, x);
      s.zIndex = String(2 * k);
      const closed = b.visible < 1;
      const covered = !closed && b.width - b.visible > 0.5;
      el.toggleAttribute("data-closed", closed);
      el.toggleAttribute("data-covered", covered);
      if (closed && !el.inert && el.contains(active)) edges.get(p.id)?.focus({ preventScroll: true });
      el.inert = closed; // a covered pane's visible slice stays live; the next pane (z 2k+2) takes clicks over the rest
      if (!closed) {
        right = x + b.visible;
        last = p.title;
      }
      const eb = edgeBoxes[k];
      const es = (edges.get(p.id) as HTMLElement).style;
      es.transform = `translateX(${eb.x + sw + rubber}px)`;
      es.width = `${eb.w}px`;
      es.zIndex = String(2 * k + 1);
      if (k === 0) {
        tabs.style.transform = es.transform;
        tabs.style.zIndex = es.zIndex;
      }
      for (const [j, x] of barOf(p.id).entries()) {
        const bs = touch(x);
        bs.transform = s.transform;
        bs.zIndex = es.zIndex; // over its pane, under the next
        size(x, b.visible + trail);
        x.toggleAttribute("data-closed", closed);
        if (closed && x.contains(active)) edges.get(p.id)?.focus({ preventScroll: true });
        x.inert = closed || (j === 1 && !bars.get(p.id)); // collapsed content
      }
    });
    paintMarks();
    leaf.hidden = right < 0 || lone;
    leaf.style.transform = `translateX(${right}px)`;
    if (leaf.getAttribute("aria-label") !== `Close ${last}`) leaf.setAttribute("aria-label", `Close ${last}`);
  };

  // A commit holds widths while it slides; a resize doesn't slide (see onResize).
  const refresh = (resize = false) => {
    if (!live && !resize) {
      hold = true;
      clearTimeout(holdT);
      holdT = setTimeout(() => {
        hold = false;
        for (const k of keep.values()) k.w = undefined; // widths settled: re-measure, once per commit
        if (!destroyed) paint();
      }, 240);
    }
    if (dirty && !live) {
      dirty = false;
      W = frame.clientWidth;
      measure.clear();
      for (const k of keep.values()) k.w = undefined;
    }
    sync();
    paint();
  };

  /**
   * Apply a view; report it if the code changed. `closing`: the pane with this id was closed, or
   * with `true` every pane it shut was (a drag, an arrow key or fit). `user`: report them as closed.
   * `to` computes the view only once any drag has settled, so it never starts from a stale one.
   */
  const commit = (to: () => View, closing?: string | true, user = true) => {
    gesture?.end(null); // an API call or key mid-drag: settle the drag first
    const before = closing ? openIds() : new Set<string>();
    view = normalize(to(), panes.length);
    for (const id of closing === true ? before : closing ? [closing] : []) shut.add(id);
    for (const id of openIds()) shut.delete(id);
    refresh();
    const c = code();
    if (c !== lastCode) {
      lastCode = c;
      opts.onChange?.(c);
    }
    if (closing && user) {
      const after = openIds();
      for (const id of before) if (!after.has(id) && (closing === true || id === closing)) opts.onClose?.(id);
    }
  };

  const indexOf = (id: string) => panes.findIndex((p) => p.id === id);
  const cap = () => (compact() ? COMPACT_CAP : undefined);
  const revealAt = (p: number) =>
    commit(() => revealIn(view, p, panes.length, sizesFor, order(), panes[p]?.opensTo, cap(), mayAt));
  const closeAt = (p: number, user = false) =>
    commit(() => closeIn(view, p, panes.length, sizesFor, order(), cap(), mayAt), panes[p]?.id, user);
  // The user moved the dividers.
  const divide = (div: number[], o: number) =>
    keepOpen(view, { offset: view.offset, div }, panes.length, sizesFor, o, cap(), mayAt);
  // An edge is its pane's open/close toggle.
  const toggle = (k: number) =>
    isOpen(toWidths(effective())[k]) ? closeAt(view.offset + k, true) : revealAt(view.offset + k);
  const setBar = (id: string, open = !bars.get(id)) => {
    if (edges.has(id) && panes[indexOf(id)].bar)
      commit(() => {
        bars.set(id, open);
        return view;
      });
  };
  const winIndex = (id: string | undefined) => (id === undefined ? -1 : win().findIndex((p) => p.id === id));

  const onClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-sashay-frame]") !== frame) return;
    const at = (name: string) => t.closest(`[${name}]`)?.getAttribute(name);
    const tab = at("data-sashay-tab");
    const bar = at("data-sashay-bar-toggle");
    const spineTab = at("data-sashay-spine-tab");
    if (spineTab != null) revealAt(indexOf(spineTab));
    else if (t.closest("[data-sashay-close]")) {
      const id = [...openIds()].pop();
      if (id !== undefined) closeAt(indexOf(id), true);
    } else if (bar != null) setBar(bar);
    else if (tab != null) revealAt(indexOf(tab));
  };

  // Click → toggle its pane; drag → move divider k-1 (window edge 0 drives none).
  // A pane's first 20px (`body`) drag its edge too, but never toggle: clicks and selection there stay the content's.
  const onPointerDown = (e: PointerEvent) => {
    const t = e.target as Element;
    if (e.button !== 0 || e.defaultPrevented || gesture || t.closest("[data-sashay-frame]") !== frame) return;
    // A strip can slide from under the pointer before release: capture keeps the click its own.
    t.closest("[data-sashay-bar-toggle]")?.setPointerCapture(e.pointerId);
    if (t.closest("button, input, label, select, textarea, a")) return;
    const edge = t.closest<HTMLElement>("[data-sashay-edge]");
    const pane = edge ? null : t.closest<HTMLElement>("[data-sashay-pane]");
    const pid = pane?.dataset.sashayPane;
    const body = pid !== undefined;
    // Not from editable content, or from an open popover or dialog (shown anywhere, even outside the pane).
    if (body && ((t as HTMLElement).isContentEditable || pane?.contains(t.closest("[popover], dialog")))) return;
    const src = body ? edges.get(pid) : edge;
    const id = src?.dataset.sashayEdge;
    const k = winIndex(id);
    if (!src || k < 0 || (body && k < 1)) return;
    const d = k - 1;
    // Pointer x in the frame's own px: a zoomed or scaled ancestor makes viewport px differ.
    // Measured once per gesture, never per move.
    const fr = frame.getBoundingClientRect();
    const scale = fr.width / frame.offsetWidth || 1;
    const into = e.clientX - fr.left - (frame.clientLeft + (lastX.get(pid as string) ?? 0)) * scale;
    if (body && (into < 0 || into >= 20)) return;
    // Captured at once on an edge; from a pane only once it drags, so its clicks stay its own.
    const on = (body ? document : src) as HTMLElement; // same pointer events either way
    if (!body) src.setPointerCapture(e.pointerId);
    const x0 = e.clientX / scale;
    const C = Math.max(content(), 1);
    // Mid-slide, start from what's on screen, not the target: each edge's transitioning
    // transform against the one it's heading for. Read once per gesture.
    const w = win();
    const start = effective().map((v, j) => {
      const el = edges.get(w[j + 1]?.id);
      if (!el?.style.transform) return v;
      const off = new DOMMatrix(getComputedStyle(el).transform).m41 - new DOMMatrix(el.style.transform).m41;
      return Math.abs(off) > 0.5 ? v + off / C : v;
    });
    const S = sizes();
    const o = order();
    const samples: Sample[] = [{ t: e.timeStamp, x: x0 }];
    // Latched once the pointer is 4px away: true drags (horizontal); false is a swipe that
    // neither drags nor toggles; undefined is still a click.
    let moved: boolean | undefined;
    let raw = start[d];
    const aim = (t: number) => {
      const v = velocity(samples, t);
      const rest = settle(start, d, raw, 0, o, S);
      preview = { d, rest, idx: Math.abs(v) < FLING[0] ? rest : settle(start, d, raw, v, o, S), t: flingReach(v) };
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const x = ev.clientX / scale;
      samples.push({ t: ev.timeStamp, x });
      if (samples.length > 32) samples.shift();
      const dx = x - x0;
      if (moved === undefined) {
        const [mx, my] = [ev.clientX - e.clientX, ev.clientY - e.clientY]; // pointer px
        if (mx * mx + my * my < 16) return;
        moved = d >= 0 && Math.abs(mx) >= Math.abs(my);
        if (moved) frame.setAttribute("data-dragging", "");
        if (moved && body) src.setPointerCapture(e.pointerId);
      }
      if (!moved) return;
      raw = start[d] + dx / C;
      live = drag(start, d, raw, S);
      rubber = ((raw < 0 ? raw : raw > 1 ? raw - 1 : 0) * C) / 4;
      aim(ev.timeStamp);
      paint();
      if (!frameId) {
        let last = performance.now();
        const tick = (t: number) => {
          aim(t); // a pause reads as no throw, as a release then would
          paintMarks(Math.max(0, t - last));
          last = t;
          frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      on.removeEventListener("pointermove", move);
      on.removeEventListener("pointerup", end);
      on.removeEventListener("pointercancel", end);
      on.removeEventListener("lostpointercapture", lost);
      frame.removeAttribute("data-dragging");
      gesture = null;
      live = null;
      rubber = 0;
      preview = null;
      shown = null;
      cancelAnimationFrame(frameId);
      frameId = 0;
      for (const m of marks) {
        m.style.setProperty("--sashay-fling", "0");
        m.removeAttribute("data-fling");
      }
    };
    const lost = (ev: PointerEvent) => ev.pointerId === e.pointerId && end(null);
    // ev null: ended by update()/setLayout()/commit or a lost capture; settles where it is.
    function end(ev: PointerEvent | null) {
      if (ev && ev.pointerId !== e.pointerId) return;
      stop();
      if (!moved) {
        if (moved === undefined && ev?.type === "pointerup" && !body) toggle(k);
        return;
      }
      const v = ev?.type === "pointerup" ? velocity(samples, ev.timeStamp) : 0;
      commit(() => divide(settle(start, d, raw, v, o, S), o), true);
    }
    on.addEventListener("pointermove", move);
    on.addEventListener("pointerup", end);
    on.addEventListener("pointercancel", end);
    on.addEventListener("lostpointercapture", lost);
    gesture = { end, stop };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.defaultPrevented || t.closest("[data-sashay-frame]") !== frame) return;
    if (t.hasAttribute("data-sashay-spine-tab")) {
      const s = t.parentElement as HTMLElement;
      const to = {
        ArrowUp: t.previousElementSibling,
        ArrowDown: t.nextElementSibling,
        Home: s.firstElementChild,
        End: s.lastElementChild,
      }[e.key];
      if (!(to instanceof HTMLElement)) return;
      e.preventDefault();
      rove(s, to);
      to.focus();
      return;
    }
    const id = t.dataset.sashayEdge;
    const k = winIndex(id);
    if (k < 0) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(k);
      return;
    }
    // Home and End: as if the arrow were pressed until the divider stops.
    const dir = ({ ArrowLeft: -1, ArrowRight: 1, Home: -1, End: 1 } as Record<string, number>)[e.key];
    if (!dir || k < 1) return;
    e.preventDefault();
    commit(() => {
      const d = winIndex(id) - 1;
      if (d < 0) return view;
      const o = order();
      const S = sizes();
      let cur = effIdx();
      for (let n = e.key[0] === "A" ? 1 : 99; n--; ) {
        const next = settle(cur.map(snapV), d, snapV(step(cur[d], dir, o)), 0, o, S);
        if (`${next}` === `${cur}`) break;
        cur = next;
      }
      return divide(cur, o);
    }, true);
  };
  // Keyboard focus landing under the next pane reveals the covered pane, and under an expanded bar
  // collapses the bar, so the focus ring is never hidden.
  // Input modality: `:focus-visible` matches a text input on mouse focus too.
  let keyed: boolean | undefined;
  const onModality = (e: Event) => {
    keyed = e.type === "keydown";
  };
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    if (keyed === false) return;
    const w = win();
    const k = w.findIndex((p) => els.get(p.id)?.contains(t));
    if (k < 0 || !t.matches(":focus-visible")) return;
    const { id } = w[k];
    const el = els.get(id) as HTMLElement;
    const r = t.getBoundingClientRect();
    // The bar rises over the pane by its content's height. The pane itself always reaches under it.
    const be = bars.get(id) && el !== t && barEls.get(id);
    if (be && r.bottom > el.getBoundingClientRect().bottom - be.getBoundingClientRect().height) setBar(id, false);
    const next = els.get(w[k + 1]?.id);
    if (next && r.right > next.getBoundingClientRect().left) revealAt(view.offset + k);
  };
  // A resize tracks the frame at once, without the slide: a slide would need the grow-only
  // hold, which would keep widths from shrinking for as long as resize events keep coming.
  const onResize = () => {
    dirty = true;
    if (live) return;
    if (frame.clientWidth === W) return refresh(); // fonts, or the observer's first call
    const still = (v: string) => {
      tabs.style.transition = v;
      for (const p of win())
        for (const el of [els.get(p.id), edges.get(p.id), ...barOf(p.id)]) if (el) touch(el).transition = v;
    };
    still("none");
    refresh(true);
    void frame.offsetWidth; // apply the new geometry before the transition returns
    still("");
  };
  const ro = new ResizeObserver(onResize);
  frame.addEventListener("click", onClick);
  frame.addEventListener("pointerdown", onPointerDown);
  frame.addEventListener("keydown", onKeyDown);
  frame.addEventListener("focusin", onFocusIn);
  for (const type of ["keydown", "pointerdown"]) document.addEventListener(type, onModality, true);
  document.fonts?.addEventListener("loadingdone", onResize);

  // Mount.
  apply(options.layout);
  const w0 = idsOf();
  for (const p of panes) if (!w0.has(p.id)) offscreen(p.id);
  setBars();
  sync();
  paint();
  // With no panes there's nothing to apply the code to: keep it for the first panes (see update).
  lastCode = panes.length ? code() : (options.layout ?? "");
  const was = held.get(frame);
  if (was?.key === heldKey()) shut = was.shut;
  // Its size follows the theme's rails, so switching theme re-measures.
  const rails = document.createElement("div");
  rails.setAttribute("data-sashay-probe", "");
  rails.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${EDGE};height:calc(${SPINE} + ${TABS})`;
  frame.append(rails);
  ro.observe(frame);
  ro.observe(rails);
  frame.setAttribute("data-sashay-ready", "");

  return {
    get layout() {
      return lastCode;
    },
    reveal(id) {
      if (destroyed) return;
      const p = indexOf(id);
      if (p >= 0) revealAt(p);
    },
    close(id) {
      if (destroyed) return;
      const p = indexOf(id);
      if (p >= 0) closeAt(p);
    },
    toggleBar(id, open) {
      if (!destroyed) setBar(id, open);
    },
    keepInView(id, x) {
      if (destroyed) return;
      if (x !== null) checkLength(x);
      const s = keep.get(id)?.s ?? 0;
      if (x !== null) keep.set(id, { x, s });
      else if (keep.delete(id) && s) els.get(id)?.style.removeProperty("--sashay-shift");
      paint();
    },
    setLayout(c) {
      if (destroyed) return;
      gesture?.end(null);
      const was = shut;
      apply(c);
      if (c === lastCode) shut = was; // what's showing already
      refresh();
      lastCode = panes.length ? code() : c;
    },
    fit(fractions) {
      if (destroyed) return;
      if (fractions.length !== view.div.length)
        throw new RangeError(`sashay: fit() needs ${view.div.length} fractions, got ${fractions.length}`);
      const f = fractions.map((x) => Math.min(1, Math.max(0, x)) || 0).sort((a, b) => a - b);
      commit(
        () => (f.length === view.div.length ? { offset: view.offset, div: fitIdx(f, sizes(), order()) } : view),
        true,
        false,
      );
    },
    update(o) {
      if (destroyed) return;
      if (o.compactBelow !== undefined) checkLength(o.compactBelow);
      const f = o.panes && scan(frame, o.panes);
      if (o.panes || o.compactBelow !== undefined) gesture?.end(null);
      if ("onChange" in o) opts.onChange = o.onChange;
      if ("onClose" in o) opts.onClose = o.onClose;
      if (o.compactBelow !== undefined) opts.compactBelow = o.compactBelow;
      if (!o.panes || !f) {
        if (o.compactBelow !== undefined) refresh();
        return;
      }
      const prev = panes;
      const ord = order();
      const old = idsOf(prev);
      panes = o.panes;
      ({ els, barEls } = f);
      for (const p of panes) if (!old.has(p.id)) offscreen(p.id);
      setBars();
      const ids = idsOf(panes);
      for (const m of [keep, shut]) for (const id of m.keys()) if (!ids.has(id)) m.delete(id);
      for (const el of orig.keys()) if (!el.isConnected) orig.delete(el);
      // No diff (no pane kept, or a reorder) resets to the default, except that the
      // first panes take the held code, as at creation. Either reports only if the code changed.
      commit(() => {
        const v = diff(prev, panes, view, ord, sizesOf, cap(), may);
        if (v) return v;
        apply(prev.length ? "" : lastCode);
        return view;
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      held.set(frame, { key: heldKey(), shut });
      gesture?.stop();
      ro.disconnect();
      clearTimeout(holdT);
      frame.removeEventListener("click", onClick);
      frame.removeEventListener("pointerdown", onPointerDown);
      frame.removeEventListener("keydown", onKeyDown);
      frame.removeEventListener("focusin", onFocusIn);
      for (const type of ["keydown", "pointerdown"]) document.removeEventListener(type, onModality, true);
      document.fonts?.removeEventListener("loadingdone", onResize);
      for (const e of [...edges.values(), ...strips.values()]) e.remove();
      edges.clear();
      strips.clear();
      for (const s of spines) s.remove();
      spineTabs.clear();
      leaf.remove();
      tabs.remove();
      for (const m of marks) m.remove();
      rails.remove();
      measure.destroy();
      for (const el of [...els.values(), ...barEls.values()]) {
        for (const a of ["data-covered", "data-closed", "data-offscreen", "data-open", "data-bar"])
          el.removeAttribute(a);
        el.inert = false;
        if (named.has(el)) el.removeAttribute("id");
      }
      for (const [el, s] of orig) {
        el.setAttribute("style", s ?? "");
        if (s === null) el.removeAttribute("style"); // after setAttribute: Chrome syncs CSSOM writes lazily
      }
      orig.clear();
      for (const a of ["data-sashay-frame", "data-sashay-ready", "data-dragging", "data-compact"])
        frame.removeAttribute(a);
    },
  };
}
