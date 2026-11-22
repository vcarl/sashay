// The vanilla DOM controller. It owns the window over the pane list: only
// window panes get edges, geometry and per-frame work; the rest are offscreen.
// Everything is keyed by pane id so state survives list changes.
import {
  contentWidth,
  drag,
  type EdgeSpec,
  fit as fitIdx,
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
  /** The current layout code, as the last onChange reported or setLayout applied. */
  readonly layout: string;
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
/** An edge's width: a drawer's edge defaults wide enough for its toggle. Internal, shared with react.tsx. */
export const edgeWidth = (e?: EdgeOptions): Length => e?.width ?? (e?.drawer ? "2.75rem" : EDGE);
export const COMPACT = "40rem"; // internal: shared with react.tsx, not re-exported
const TABS = "var(--sashay-tabs-width, 2.75rem)";
export const SPINE = "var(--sashay-spine-width, 1.5rem)"; // internal, as COMPACT
// Compact: the most panes the window (and so the tab strip) holds; the rest are in the spine.
const COMPACT_CAP = 6;
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
  const opts = { ...options, compactBelow: options.compactBelow ?? (COMPACT as Length) };
  checkLength(opts.compactBelow);
  const dl = options.defaultLayout;
  if (dl?.some((x, i) => !(x >= 0 && x <= 1) || (i > 0 && x < dl[i - 1])))
    throw new RangeError(`sashay: defaultLayout must be ascending fractions from 0 to 1, got ${JSON.stringify(dl)}`);
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
  // Each edge's controls (drawer toggle, title, compact tabs): a sibling laid over the edge,
  // so they aren't children of its role element.
  const ctls = new Map<string, HTMLElement>();
  const measure = createMeasure(frame);
  const px = measure.px;
  let W = frame.clientWidth;
  // The live dividers during a drag, and where they would settle (the marks).
  // A resize while dragging waits for release.
  let live: number[] | null = null;
  let preview: { d: number; idx: number[] } | null = null;
  let gesture: { end(ev: PointerEvent | null): void; stop(): void } | null = null;
  let dirty = false;
  let destroyed = false;
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
        closedPx: px(c ? (k === 0 ? TABS : EDGE) : edgeWidth(p.edge)),
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
  // The default view: an equal split over as many trailing panes as fit their minimums.
  // Compact shows one pane at a time anyway, so it keeps the whole split.
  const fits = (v: View) => {
    if (W <= 0 || compact()) return true;
    const to = windowEnd(v);
    const o = gridOrder(contentWidth(W - spineW(v.offset), edgeSpecs(panes.slice(v.offset, to))));
    return toWidths(fitIdx(v.div.map(snapV), sizesFor(v.offset, to), o).map(snapV)).every(isOpen);
  };
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
    const v = normalize(d?.view ?? defaultView(panes.length, opts.defaultLayout, fits), panes.length);
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
  const marks: HTMLElement[] = [];
  const tabs = document.createElement("div");
  tabs.setAttribute("data-sashay-tabs", "");
  let tabsKey = "";
  const sheetHead = document.createElement("div");
  sheetHead.setAttribute("data-sashay-sheet-head", "");
  const sheetTitle = document.createElement("span");
  const sheetClose = document.createElement("button");
  sheetClose.type = "button";
  sheetClose.setAttribute("data-sashay-sheet-close", "");
  sheetClose.textContent = "×";
  sheetHead.append(sheetTitle, sheetClose);
  // Compact: the one drawer shown, as a sheet: the rightmost open one. Others keep their bits.
  let sheet: string | undefined;

  const offscreen = (el: HTMLElement | undefined) => {
    if (!el) return;
    el.setAttribute("data-offscreen", "");
    el.removeAttribute("data-covered");
    el.removeAttribute("data-closed");
    el.inert = true;
  };

  const makeEdge = (ctl: HTMLElement, dr: EdgeOptions["drawer"]) => {
    const t = ctl.querySelector("[data-sashay-title]");
    if (Boolean(dr) === Boolean(t) && (!t || t.textContent === dr?.title)) return;
    ctl.replaceChildren();
    if (!dr) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("data-sashay-toggle", "");
    toggle.innerHTML = CHEVRON;
    const title = document.createElement("span");
    title.setAttribute("data-sashay-title", "");
    title.setAttribute("aria-hidden", "true");
    title.textContent = dr.title;
    ctl.append(toggle, title);
  };

  // Window membership, edges and ARIA. On commit and resize, never per frame.
  const sync = () => {
    const c = compact();
    frame.toggleAttribute("data-compact", c);
    const spineFocused = document.activeElement === spine;
    spine.hidden = !view.offset;
    spine.textContent = String(view.offset);
    spine.setAttribute("aria-label", `Show ${view.offset} hidden panes`);
    const w = win();
    const ids = new Set(w.map((p) => p.id));
    for (const [id, e] of edges) {
      if (ids.has(id)) continue;
      e.remove();
      edges.delete(id);
      ctls.get(id)?.remove();
      ctls.delete(id);
      offscreen(els.get(id));
      drawers.delete(id);
      drawerEls.get(id)?.removeAttribute("data-open");
    }
    sheet = c ? w.findLast((p) => p.edge?.drawer && drawers.get(p.id) && drawerEls.has(p.id))?.id : undefined;
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
        const ctl = document.createElement("div");
        ctl.setAttribute("data-sashay-controls", p.id);
        el.before(e, ctl);
        edges.set(p.id, e);
        ctls.set(p.id, ctl);
        el.removeAttribute("data-offscreen");
        el.inert = false;
      }
      const ctl = ctls.get(p.id) as HTMLElement;
      makeEdge(ctl, c ? undefined : p.edge?.drawer);
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
      ctl.toggleAttribute("data-open", open && !c);
      const t = ctl.querySelector("[data-sashay-toggle]");
      t?.setAttribute("aria-expanded", String(open));
      t?.setAttribute("aria-label", `${open ? "Close" : "Open"} ${dr?.title}`);
      const de = drawerEls.get(p.id);
      de?.toggleAttribute("data-open", c ? p.id === sheet : open);
      de?.toggleAttribute("data-sheet", p.id === sheet);
      if (p.id === sheet) {
        sheetTitle.textContent = dr?.title ?? "";
        sheetClose.setAttribute("aria-label", `Close ${dr?.title}`);
      }
    });
    if (!sheet) sheetHead.remove();
    else if (!sheetHead.isConnected) frame.append(sheetHead);
    // Compact: a tab per window pane, and a drawer tab per drawer, in the first edge.
    const e0 = c && w.length ? ctls.get(w[0].id) : undefined;
    if (!e0) tabs.remove();
    else {
      const k = JSON.stringify(w.map((p) => [p.id, p.title, p.edge?.drawer?.title]));
      if (k !== tabsKey) {
        tabsKey = k;
        tabs.replaceChildren(
          ...w.flatMap((p) => {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("data-sashay-tab", p.id);
            b.textContent = p.title;
            const dr = p.edge?.drawer;
            if (!dr) return [b];
            const t = document.createElement("button");
            t.type = "button";
            t.setAttribute("data-sashay-drawer-tab", p.id);
            t.innerHTML = CHEVRON;
            t.append(dr.title);
            return [b, t];
          }),
        );
      }
      if (tabs.parentElement !== e0) e0.append(tabs);
      w.forEach((p, k) => {
        tabs
          .querySelector(`[data-sashay-tab="${CSS.escape(p.id)}"]`)
          ?.setAttribute("aria-pressed", String(isOpen(widths[k])));
        const t = tabs.querySelector(`[data-sashay-drawer-tab="${CSS.escape(p.id)}"]`);
        const open = p.id === sheet;
        t?.setAttribute("aria-expanded", String(open));
        t?.setAttribute("aria-label", `${open ? "Close" : "Open"} ${p.edge?.drawer?.title}`);
      });
    }
    // One release mark per window divider.
    while (marks.length < w.length - 1) {
      const m = document.createElement("div");
      m.setAttribute("data-sashay-mark", "");
      m.setAttribute("aria-hidden", "true");
      frame.append(m);
      marks.push(m);
    }
    while (marks.length > Math.max(0, w.length - 1)) marks.pop()?.remove();
    if (spineFocused && spine.hidden && w.length) edges.get(w[0].id)?.focus({ preventScroll: true });
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
    const active = document.activeElement;
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
      if ((closed || covered) && !el.inert && el.contains(active)) edges.get(p.id)?.focus({ preventScroll: true });
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
      const cs = (ctls.get(p.id) as HTMLElement).style;
      cs.transform = es.transform;
      cs.width = es.width;
      cs.zIndex = es.zIndex;
      const d = drawerEls.get(p.id);
      if (d && (c ? p.id === sheet : drawers.get(p.id))) {
        const ds = touch(d);
        if (c) {
          const tw = px(TABS);
          ds.transform = `translateX(${sw + tw}px)`;
          ds.width = `${Math.min(px(p.edge?.drawer?.width ?? 0), W - sw - tw - px(EDGE))}px`;
          ds.zIndex = "";
          sheetHead.style.transform = ds.transform;
          sheetHead.style.width = ds.width;
        } else {
          ds.transform = es.transform;
          ds.width = es.width;
          ds.zIndex = es.zIndex;
        }
      }
    });
    if (preview) {
      const ghost = layout(W - sw, preview.idx.map(snapV), specs, []).edgeBoxes;
      marks.forEach((m, k) => {
        m.style.transform = `translateX(${(ghost[k + 1]?.x ?? 0) + sw}px)`;
        m.toggleAttribute("data-primary", k === preview?.d);
      });
    }
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

  /**
   * Apply a view; report it if the code changed. `closing`: report as closed the pane with
   * this id (a close the user aimed at), or with `true` every pane it shut (a drag or arrow key).
   */
  const commit = (v: View, next?: Map<string, boolean>, closing?: string | true) => {
    gesture?.end(null); // an API call or key mid-drag: settle the drag first
    const before = closing ? openIds() : null;
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
      for (const id of before) if (!after.has(id) && (closing === true || id === closing)) opts.onClose?.(id);
    }
  };

  const indexOf = (id: string) => panes.findIndex((p) => p.id === id);
  const cap = () => (compact() ? COMPACT_CAP : undefined);
  const revealAt = (p: number) => commit(revealIn(view, p, panes.length, sizesFor, order(), panes[p]?.opensTo, cap()));
  const closeAt = (p: number, user = false) =>
    commit(closeIn(view, p, panes.length, sizesFor, order()), undefined, user ? panes[p]?.id : undefined);
  // An edge is its pane's open/close toggle.
  const toggle = (k: number) =>
    isOpen(toWidths(effective())[k]) ? closeAt(view.offset + k, true) : revealAt(view.offset + k);
  const setDrawer = (id: string, open?: boolean) => {
    const p = panes.find((q) => q.id === id);
    if (!p?.edge?.drawer || !edges.has(id)) return;
    const on = open ?? !drawers.get(id);
    const next = new Map(drawers).set(id, on);
    // Compact: close the visible sheet, and any open drawer right of this one, which would outrank it.
    if (on && compact()) {
      const w = win();
      for (const q of [...w.slice(w.findIndex((q) => q.id === id) + 1), { id: sheet }])
        if (q.id && q.id !== id) next.delete(q.id);
    }
    commit(view, next);
  };
  const winIndex = (id: string | undefined) => (id === undefined ? -1 : win().findIndex((p) => p.id === id));

  const onClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest("[data-sashay-frame]") !== frame) return;
    const at = (name: string) => t.closest(`[${name}]`)?.getAttribute(name);
    const tab = at("data-sashay-tab");
    const drawerTab = at("data-sashay-drawer-tab");
    if (t.closest("[data-spine]")) revealAt(view.offset - 1);
    else if (t.closest("[data-sashay-close]")) {
      const k = toWidths(effIdx().map(snapV)).findLastIndex(isOpen);
      if (k >= 0) closeAt(view.offset + k, true);
    } else if (t.closest("[data-sashay-toggle]")) setDrawer(at("data-sashay-controls") ?? "");
    else if (tab != null) revealAt(indexOf(tab));
    else if (drawerTab != null) setDrawer(drawerTab);
    else if (t.closest("[data-sashay-sheet-close]")) setDrawer(sheet ?? "", false);
  };

  // Click → toggle its pane; drag → move divider k-1 (window edge 0 drives none).
  // The whole edge drags, an open drawer included; only its controls don't.
  const onPointerDown = (e: PointerEvent) => {
    const t = e.target as Element;
    if (e.button !== 0 || gesture || t.closest("[data-sashay-frame]") !== frame) return;
    if (t.closest("button, input, label, select, textarea, a")) return;
    const dr = t.closest<HTMLElement>("[data-sashay-drawer]");
    if (dr && (!dr.hasAttribute("data-open") || dr.hasAttribute("data-sheet"))) return;
    const src = dr ?? t.closest<HTMLElement>("[data-sashay-edge]");
    const id = dr ? dr.dataset.sashayDrawer : src?.dataset.sashayEdge;
    const k = winIndex(id);
    if (!src || k < 0) return;
    const d = k - 1;
    src.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const start = effective();
    const C = Math.max(content(), 1);
    const S = sizes();
    const o = order();
    const samples: Sample[] = [{ t: e.timeStamp, x: e.clientX }];
    let moved = false;
    let raw = start[d];
    const move = (ev: PointerEvent) => {
      samples.push({ t: ev.timeStamp, x: ev.clientX });
      if (samples.length > 32) samples.shift();
      const dx = ev.clientX - x0;
      if (d < 0 || (!moved && Math.abs(dx) < 4)) return; // below this it's a click
      if (!moved) frame.setAttribute("data-dragging", "");
      moved = true;
      raw = start[d] + dx / C;
      live = drag(start, d, raw, S);
      preview = { d, idx: settle(start, d, raw, velocity(samples, ev.timeStamp), o, S) };
      paint();
    };
    const stop = () => {
      src.removeEventListener("pointermove", move);
      src.removeEventListener("pointerup", end);
      src.removeEventListener("pointercancel", end);
      src.removeEventListener("lostpointercapture", lost);
      frame.removeAttribute("data-dragging");
      gesture = null;
      live = null;
      preview = null;
    };
    const lost = () => end(null);
    // ev null: ended by update()/setLayout()/commit or a lost capture; settles where it is.
    function end(ev: PointerEvent | null) {
      stop();
      if (!moved) {
        if (ev?.type === "pointerup" && !dr) toggle(k);
        return;
      }
      const v = ev?.type === "pointerup" ? velocity(samples, ev.timeStamp) : 0;
      commit({ offset: view.offset, div: settle(start, d, raw, v, o, S) }, undefined, true);
    }
    src.addEventListener("pointermove", move);
    src.addEventListener("pointerup", end);
    src.addEventListener("pointercancel", end);
    src.addEventListener("lostpointercapture", lost);
    gesture = { end, stop };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-sashay-frame]") !== frame) return;
    if (t.hasAttribute("data-spine")) {
      if (e.key !== "ArrowLeft") return;
      e.preventDefault();
      revealAt(view.offset - 1);
      return;
    }
    const k = winIndex(t.dataset.sashayEdge);
    if (k < 0) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(k);
      return;
    }
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const d = k - 1;
    if (!dir || d < 0) return;
    e.preventDefault();
    const o = order();
    const cur = effIdx();
    commit(
      { offset: view.offset, div: settle(cur.map(snapV), d, snapV(step(cur[d], dir, o)), 0, o, sizes()) },
      undefined,
      true,
    );
  };
  const onResize = () => {
    dirty = true;
    if (!live) refresh();
  };
  const ro = new ResizeObserver(onResize);
  frame.addEventListener("click", onClick);
  frame.addEventListener("pointerdown", onPointerDown);
  frame.addEventListener("keydown", onKeyDown);
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
    toggleDrawer(id, open) {
      if (!destroyed) setDrawer(id, open);
    },
    keepInView(id, x) {
      if (destroyed) return;
      if (x === null) keep.delete(id);
      else {
        checkLength(x);
        keep.set(id, x);
      }
      paint();
    },
    setLayout(c) {
      if (destroyed) return;
      gesture?.end(null);
      ({ v: view, m: drawers } = decodeState(c));
      refresh();
      lastCode = code();
    },
    fit(fractions) {
      if (destroyed) return;
      if (fractions.length !== view.div.length)
        throw new RangeError(`sashay: fit() needs ${view.div.length} fractions, got ${fractions.length}`);
      const f = fractions.map((x) => Math.min(1, Math.max(0, x)) || 0).sort((a, b) => a - b);
      commit({ offset: view.offset, div: fitIdx(f, sizes(), order()) });
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
      const old = new Set(prev.map((p) => p.id));
      panes = o.panes;
      ({ els, drawerEls } = f);
      for (const p of panes) if (!old.has(p.id)) offscreen(els.get(p.id));
      const ids = new Set(panes.map((p) => p.id));
      for (const id of keep.keys()) if (!ids.has(id)) keep.delete(id);
      for (const el of orig.keys()) if (!el.isConnected) orig.delete(el);
      commit(diff(prev, panes, view, ord, sizesOf, cap()) ?? defaultView(panes.length, opts.defaultLayout, fits));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      gesture?.stop();
      ro.disconnect();
      frame.removeEventListener("click", onClick);
      frame.removeEventListener("pointerdown", onPointerDown);
      frame.removeEventListener("keydown", onKeyDown);
      document.fonts?.removeEventListener("loadingdone", onResize);
      for (const e of [...edges.values(), ...ctls.values()]) e.remove();
      edges.clear();
      ctls.clear();
      spine.remove();
      leaf.remove();
      tabs.remove();
      sheetHead.remove();
      for (const m of marks) m.remove();
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
