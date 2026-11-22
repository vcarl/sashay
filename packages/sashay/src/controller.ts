// The vanilla DOM controller. It owns the window over the pane list: only
// window panes get edges, geometry and per-frame work; the rest are offscreen.
// Everything is keyed by pane id so state survives list changes.
import {
  contentWidth,
  type EdgeSpec,
  fit as fitIdx,
  focusShift,
  gridOrder,
  isOpen,
  layout,
  nearest,
  ratio,
  type Sizes,
  snapV,
  toWidths,
} from "./engine.ts";
import { checkLength, createMeasure, type Length } from "./length.ts";
import {
  close as closeIn,
  decodeLayout,
  defaultView,
  diff,
  encodeLayout,
  normalize,
  reveal as revealIn,
  type View,
  windowEnd,
} from "./window.ts";

export type { Length };
export interface EdgeOptions {
  width?: Length;
  drawer?: { width: Length; title: string };
}
export interface PaneOptions {
  id: string;
  title: string;
  focus: number;
  minWidth?: Length;
  maxWidth?: Length;
  opensTo?: number[];
  edge?: EdgeOptions;
}
export interface SashayOptions {
  panes: PaneOptions[];
  layout?: string;
  defaultLayout?: number[];
  onChange?: (layout: string) => void;
  onClose?: (id: string) => void;
  compactBelow?: Length;
}
export interface SashayHandle {
  reveal(id: string): void;
  close(id: string): void;
  toggleDrawer(id: string, open?: boolean): void;
  keepInView(id: string, x: Length | null): void;
  setLayout(code: string): void;
  fit(fractions: number[]): void;
  update(options: Partial<Pick<SashayOptions, "panes" | "onChange" | "onClose" | "compactBelow">>): void;
  destroy(): void;
}

const EDGE = "0.75rem";
const TABS = "var(--sashay-tabs-width, 2.75rem)";
const SPINE = "var(--sashay-spine-width, 1.5rem)";
const CHEVRON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const own = (frame: HTMLElement, sel: string) =>
  [...frame.querySelectorAll<HTMLElement>(sel)].filter((el) => el.closest("[data-sashay-frame]") === frame);

// Validates a pane list against the frame's DOM. Throws before any state changes.
function scan(frame: HTMLElement, list: PaneOptions[]) {
  const els = new Map(own(frame, "[data-sashay-pane]").map((el) => [el.dataset.sashayPane ?? "", el]));
  const drawerEls = new Map(own(frame, "[data-sashay-drawer]").map((el) => [el.dataset.sashayDrawer ?? "", el]));
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p.id)) throw new Error(`sashay: duplicate pane id "${p.id}"`);
    seen.add(p.id);
    if (!els.has(p.id)) throw new Error(`sashay: no [data-sashay-pane="${p.id}"] element`);
    for (const v of [p.minWidth, p.maxWidth, p.edge?.width, p.edge?.drawer?.width]) if (v !== undefined) checkLength(v);
  }
  return { els, drawerEls };
}

export function createSashay(frame: HTMLElement, options: SashayOptions): SashayHandle {
  const opts = { ...options, compactBelow: options.compactBelow ?? ("40rem" as Length) };
  checkLength(opts.compactBelow);
  frame.setAttribute("data-sashay-frame", "");
  let found: ReturnType<typeof scan>;
  try {
    found = scan(frame, options.panes);
  } catch (e) {
    frame.removeAttribute("data-sashay-frame");
    throw e;
  }

  let panes = options.panes;
  let { els, drawerEls } = found;
  let view: View;
  let drawers = new Map<string, boolean>();
  const keep = new Map<string, Length>();
  const edges = new Map<string, HTMLElement>(); // window panes only
  const measure = createMeasure(frame);
  const px = measure.px;
  let W = frame.clientWidth;
  // Task 7: the live dividers during a drag; a resize while dragging waits for release.
  const live: number[] | null = null;
  let dirty = false;
  let lastCode = "";

  const orig = new Map<HTMLElement, string | null>(); // style attributes as the app left them
  const touch = (el: HTMLElement) => {
    if (!orig.has(el)) orig.set(el, el.getAttribute("style"));
    return el.style;
  };

  const win = () => panes.slice(view.offset, windowEnd(view));
  const compact = () => W > 0 && W < px(opts.compactBelow);
  const spineW = (offset: number) => (offset > 0 ? px(SPINE) : 0);
  const edgeSpecs = (list: PaneOptions[]): EdgeSpec[] => {
    const c = compact();
    return list.map((p, k) => {
      const dr = p.edge?.drawer;
      return {
        closedPx: px(c && k === 0 ? TABS : c && dr ? EDGE : (p.edge?.width ?? EDGE)),
        openPx: !c && dr ? px(dr.width) : undefined,
        open: Boolean(drawers.get(p.id)),
      };
    });
  };
  const sizesOf = (list: PaneOptions[], from: number, to: number): Sizes => {
    const w = list.slice(from, to);
    const C = Math.max(1, contentWidth(W - spineW(from), edgeSpecs(w)));
    return {
      focus: w.map((p) => p.focus),
      min: w.map((p) => Math.min(1, px(p.minWidth ?? 0) / C)),
      max: w.map((p) => (p.maxWidth === undefined ? 1 : Math.min(1, px(p.maxWidth) / C))),
    };
  };
  const content = () => contentWidth(W - spineW(view.offset), edgeSpecs(win()));
  const order = () => gridOrder(content());
  const sizes = () => sizesOf(panes, view.offset, windowEnd(view));
  const sizesFor = (a: number, b: number) => sizesOf(panes, a, b);
  const effIdx = () => view.div.map((i) => nearest(snapV(i), order()));
  const effective = () => live ?? effIdx().map(snapV);
  const openIds = () => {
    const w = toWidths(effIdx().map(snapV));
    return new Set(win().flatMap((p, k) => (isOpen(w[k]) ? [p.id] : [])));
  };
  // A % keepInView point is of the pane's width. Measured at two widths and
  // interpolated, so a drag never measures.
  // ponytail: exact for calc() and %, approximate for clamp()/min()/max() of %.
  const keepPx = (v: Length, w: number) => {
    const a = px(v, 0);
    return a + ((px(v, 1000) - a) * w) / 1000;
  };

  const code = () =>
    encodeLayout(
      view,
      win()
        .filter((p) => p.edge?.drawer)
        .map((p) => Boolean(drawers.get(p.id))),
    );
  const decodeState = (c: unknown) => {
    const d = decodeLayout(c, panes.length, (p) => Boolean(panes[p].edge?.drawer));
    const v = normalize(d?.view ?? defaultView(panes.length, opts.defaultLayout), panes.length);
    const m = new Map<string, boolean>();
    if (d) {
      const ids = panes.slice(v.offset, windowEnd(v)).filter((p) => p.edge?.drawer);
      ids.forEach((p, j) => {
        m.set(p.id, d.drawers[j]);
      });
    }
    return { v, m };
  };

  // Controls sashay owns.
  const spine = document.createElement("button");
  spine.type = "button";
  spine.setAttribute("data-spine", "");
  const leaf = document.createElement("button");
  leaf.type = "button";
  leaf.setAttribute("data-sashay-close", "");
  leaf.textContent = "×";
  frame.prepend(spine, leaf);

  const offscreen = (el: HTMLElement | undefined) => {
    if (!el) return;
    el.setAttribute("data-offscreen", "");
    el.removeAttribute("data-covered");
    el.removeAttribute("data-closed");
    el.inert = true;
  };

  const makeEdge = (e: HTMLElement, p: PaneOptions) => {
    const dr = p.edge?.drawer;
    const t = e.querySelector("[data-sashay-title]");
    if (e.firstChild && Boolean(dr) === Boolean(t) && (!t || t.textContent === dr?.title)) return;
    const dots = document.createElement("span");
    dots.setAttribute("data-sashay-dots", "");
    e.replaceChildren(dots);
    if (!dr) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("data-sashay-toggle", "");
    toggle.innerHTML = CHEVRON;
    const title = document.createElement("span");
    title.setAttribute("data-sashay-title", "");
    title.textContent = dr.title;
    e.append(toggle, title);
  };

  // Window membership, edges and ARIA. On commit and resize, never per frame.
  const sync = () => {
    const c = compact();
    frame.toggleAttribute("data-compact", c);
    spine.hidden = !view.offset;
    spine.textContent = String(view.offset);
    spine.setAttribute("aria-label", `Show ${view.offset} hidden panes`);
    const w = win();
    const ids = new Set(w.map((p) => p.id));
    for (const [id, e] of edges) {
      if (ids.has(id)) continue;
      e.remove();
      edges.delete(id);
      offscreen(els.get(id));
      drawers.delete(id);
      drawerEls.get(id)?.removeAttribute("data-open");
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
        el.before(e);
        edges.set(p.id, e);
        el.removeAttribute("data-offscreen");
        el.inert = false;
      }
      makeEdge(e, p);
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
      const dr = p.edge?.drawer;
      const open = Boolean(dr && drawers.get(p.id));
      e.toggleAttribute("data-drawer", Boolean(dr));
      e.toggleAttribute("data-open", open && !c);
      const t = e.querySelector("[data-sashay-toggle]");
      t?.setAttribute("aria-expanded", String(open));
      t?.setAttribute("aria-label", `${open ? "Close" : "Open"} ${dr?.title}`);
      drawerEls.get(p.id)?.toggleAttribute("data-open", open);
    });
  };

  // Geometry for window panes only: safe to call every frame.
  const paint = () => {
    const w = win();
    if (W <= 0 || !w.length) {
      leaf.hidden = true;
      return;
    }
    const sw = spineW(view.offset);
    const specs = edgeSpecs(w);
    const c = compact();
    const { paneBoxes, edgeBoxes } = layout(
      W - sw,
      effective(),
      specs,
      w.map((p) => ({ focus: p.focus })),
    );
    let right = -1;
    let last = "";
    w.forEach((p, k) => {
      const b = paneBoxes[k];
      const el = els.get(p.id) as HTMLElement;
      const x = b.x + sw;
      const kv = keep.get(p.id);
      const shift = focusShift(b.width, b.visible, kv == null || !b.width ? null : keepPx(kv, b.width) / b.width);
      const s = touch(el);
      s.transform = `translateX(${x - shift}px)`;
      s.width = `${b.width}px`;
      s.zIndex = String(2 * k);
      s.clipPath = shift > 0 ? `inset(0px 0px 0px ${shift}px)` : "";
      const closed = b.visible < 1;
      const covered = !closed && b.width - b.visible > 0.5;
      el.toggleAttribute("data-closed", closed);
      el.toggleAttribute("data-covered", covered);
      el.inert = closed || covered;
      if (!closed) {
        right = x + b.visible;
        last = p.title;
      }
      const eb = edgeBoxes[k];
      const es = (edges.get(p.id) as HTMLElement).style;
      es.transform = `translateX(${eb.x + sw}px)`;
      es.width = `${eb.w}px`;
      es.zIndex = String(2 * k + 1);
      const d = drawerEls.get(p.id);
      if (d && !c && drawers.get(p.id)) {
        const ds = touch(d);
        ds.transform = es.transform;
        ds.width = es.width;
        ds.zIndex = es.zIndex;
      }
    });
    leaf.hidden = right < 0;
    leaf.style.transform = `translateX(${right}px)`;
    if (leaf.getAttribute("aria-label") !== `Close ${last}`) leaf.setAttribute("aria-label", `Close ${last}`);
  };

  const refresh = () => {
    if (dirty && !live) {
      dirty = false;
      W = frame.clientWidth;
      measure.clear();
    }
    sync();
    paint();
  };

  /** Apply a view; report it if the code changed; on a user action, report panes it closed. */
  const commit = (v: View, next?: Map<string, boolean>, user = false) => {
    const before = user ? openIds() : null;
    view = normalize(v, panes.length);
    if (next) drawers = next;
    refresh();
    const c = code();
    if (c !== lastCode) {
      lastCode = c;
      opts.onChange?.(c);
    }
    if (before) {
      const after = openIds();
      for (const id of before) if (!after.has(id)) opts.onClose?.(id);
    }
  };

  const indexOf = (id: string) => panes.findIndex((p) => p.id === id);
  const revealAt = (p: number) => commit(revealIn(view, p, panes.length, sizesFor, order(), panes[p]?.opensTo));

  const onClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-sashay-frame]") !== frame) return;
    if (t.closest("[data-spine]")) revealAt(view.offset - 1);
    else if (t.closest("[data-sashay-close]")) {
      const w = toWidths(effIdx().map(snapV));
      const k = w.findLastIndex(isOpen);
      if (k >= 0) commit(closeIn(view, view.offset + k, panes.length, sizesFor, order()), undefined, true);
    }
  };
  const onResize = () => {
    dirty = true;
    if (!live) refresh();
  };
  const ro = new ResizeObserver(onResize);
  frame.addEventListener("click", onClick);
  document.fonts?.addEventListener("loadingdone", onResize);

  // Mount.
  ({ v: view, m: drawers } = decodeState(options.layout));
  const w0 = new Set(win().map((p) => p.id));
  for (const p of panes) if (!w0.has(p.id)) offscreen(els.get(p.id));
  sync();
  paint();
  lastCode = code();
  ro.observe(frame);
  frame.setAttribute("data-sashay-ready", "");

  return {
    reveal(id) {
      const p = indexOf(id);
      if (p >= 0) revealAt(p);
    },
    close(id) {
      const p = indexOf(id);
      if (p >= 0) commit(closeIn(view, p, panes.length, sizesFor, order()));
    },
    toggleDrawer(id, open) {
      const p = panes.find((q) => q.id === id);
      if (!p?.edge?.drawer || !edges.has(id)) return;
      commit(view, new Map(drawers).set(id, open ?? !drawers.get(id)));
    },
    keepInView(id, x) {
      if (x === null) keep.delete(id);
      else {
        checkLength(x);
        keep.set(id, x);
      }
      paint();
    },
    setLayout(c) {
      ({ v: view, m: drawers } = decodeState(c));
      refresh();
      lastCode = code();
    },
    fit(fractions) {
      if (fractions.length !== view.div.length)
        throw new RangeError(`sashay: fit() needs ${view.div.length} fractions, got ${fractions.length}`);
      commit({ offset: view.offset, div: fitIdx(fractions, sizes(), order()) });
    },
    update(o) {
      if (o.compactBelow !== undefined) checkLength(o.compactBelow);
      const f = o.panes && scan(frame, o.panes);
      if ("onChange" in o) opts.onChange = o.onChange;
      if ("onClose" in o) opts.onClose = o.onClose;
      if (o.compactBelow !== undefined) opts.compactBelow = o.compactBelow;
      if (!o.panes || !f) {
        if (o.compactBelow !== undefined) refresh();
        return;
      }
      const prev = panes;
      const ord = order();
      const old = new Set(prev.map((p) => p.id));
      panes = o.panes;
      ({ els, drawerEls } = f);
      for (const p of panes) if (!old.has(p.id)) offscreen(els.get(p.id));
      const ids = new Set(panes.map((p) => p.id));
      for (const id of keep.keys()) if (!ids.has(id)) keep.delete(id);
      for (const el of orig.keys()) if (!el.isConnected) orig.delete(el);
      commit(diff(prev, panes, view, ord, sizesOf) ?? defaultView(panes.length, opts.defaultLayout));
    },
    destroy() {
      ro.disconnect();
      frame.removeEventListener("click", onClick);
      document.fonts?.removeEventListener("loadingdone", onResize);
      for (const e of edges.values()) e.remove();
      edges.clear();
      spine.remove();
      leaf.remove();
      measure.destroy();
      for (const el of [...els.values(), ...drawerEls.values()]) {
        for (const a of ["data-covered", "data-closed", "data-offscreen", "data-open", "data-sheet"])
          el.removeAttribute(a);
        el.inert = false;
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
