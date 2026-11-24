// The window over a deep pane list. The engine lays out one window: panes
// [offset, windowEnd). Panes before it fold into the spine; panes after it are
// offscreen. Every pane outside the window is closed.
//
// Panes fold into the spine only when a reveal squeezes open panes shut (they
// overflow the frame). Panes the user closes keep their edges, so a fixed
// workspace that fits never shows a spine.
//
// Compact mode passes a cap instead: one pane shows at a time, so a squeeze is
// normal and folding waits until the window holds more than `cap` panes.
import {
  closePane,
  decode,
  encode,
  fit as fitIdx,
  focusPane,
  isOpen,
  nearest,
  type Sizes,
  snapV,
  toWidths,
} from "./engine.ts";

/** offset: first window pane. div: snap index per window divider. */
export interface View {
  offset: number;
  div: number[];
}
/** Sizes for panes [from, to) of the current list. */
export type SizesFor = (from: number, to: number) => Sizes;
/** Whether sashay may open a pane nobody asked for: not if it was closed, or began closed. */
export type May = (p: number) => boolean;
const all: May = () => true;

const LAST = 12; // SNAPS index of 1

export const windowEnd = (v: View): number => v.offset + v.div.length + 1;

// Effective divider fractions: stored indices re-resolved to the grid in play.
const eff = (div: number[], order: number) => div.map((i) => snapV(nearest(snapV(i), order)));
const widths = (div: number[]) => toWidths(div.map(snapV));

/** Stretch the window to hold pane p, adding closed panes. */
function extend({ offset, div }: View, p: number): View {
  for (; p < offset; offset--) div = [0, ...div];
  while (p > offset + div.length) div = [...div, LAST];
  return { offset, div };
}

/** Keep one closed edge after the window when panes follow it. */
export function normalize(v: View, n: number): View {
  const end = windowEnd(v);
  return isOpen(widths(v.div)[v.div.length]) && end < n ? extend(v, end) : v;
}

// After overflow: a leading closed run folds into the spine (a lone closed
// first pane keeps its edge while there is no spine), and a trailing closed
// run shrinks to the one edge. With a cap: closed panes drop, oldest first,
// until the window holds `cap` panes.
function fold({ offset, div }: View, cap?: number): View {
  const w = widths(div);
  if (cap) {
    let a = 0;
    let b = w.length;
    while (b - a > cap && !isOpen(w[a])) a++;
    while (b - a > cap && !isOpen(w[b - 1])) b--;
    return { offset: offset + a, div: div.slice(a, b - 1) };
  }
  let r = 0;
  while (r < w.length - 1 && !isOpen(w[r])) r++;
  if (offset > 0 ? r >= 1 : r >= 2) {
    offset += r;
    div = div.slice(r);
  }
  const w2 = widths(div);
  let t = 0;
  while (t < w2.length - 1 && !isOpen(w2[w2.length - 1 - t])) t++;
  if (t >= 2) div = div.slice(0, div.length - (t - 1));
  return { offset, div };
}

/**
 * Open pane p, or uncover it. In the window: focus it. Next to the window:
 * extend the window by it, then focus it. Anywhere else (a spine tab): the window
 * jumps to start at it, then opens the panes after it, then before it, that it
 * may, until one more is open than before or the frame is at capacity.
 */
export function reveal(
  v: View,
  p: number,
  n: number,
  sizes: SizesFor,
  order: number,
  opensTo?: number[],
  cap?: number,
  may = all,
): View {
  if (p < 0 || p >= n) return v;
  if (p < v.offset - 1 || p > windowEnd(v)) {
    const want = openAt(v, order).length + 1;
    let j = normalize({ offset: p, div: [] }, n);
    for (const dir of [1, -1])
      for (let q = p + dir; q >= 0 && q < n && openAt(j, order).length < want; q += dir) {
        if (!may(q)) continue;
        const r = reveal(extend(j, q), q, n, sizes, order, undefined, cap);
        if (openAt(r, order).length <= openAt(j, order).length) break;
        j = r;
      }
    return j;
  }
  const { offset, div } = extend(v, p);
  const k = p - offset;
  const e = eff(div, order);
  const before = toWidths(e);
  const S = sizes(offset, offset + div.length + 1);
  // Open and drawn at its full size: nothing to do. Open but narrower (covered): uncover it.
  if (isOpen(before[k]) && before[k] >= Math.min(S.max[k], Math.max(S.focus[k], S.min[k])) - 1e-9) return v;
  const opened = opensTo?.length === div.length ? fitIdx(opensTo, S, order) : null;
  const d = opened && isOpen(widths(opened)[k]) ? opened : focusPane(e, k, S, order);
  const after = widths(d);
  const squeezed = before.some((x, j) => isOpen(x) && !isOpen(after[j]));
  const next = { offset, div: d };
  return normalize(squeezed || cap ? fold(next, cap) : next, n);
}

const openAt = (v: View, order: number) =>
  toWidths(eff(v.div, order)).flatMap((x, k) => (isOpen(x) ? [v.offset + k] : []));

// The collapsed panes sashay may open: closed window panes and the first in each spine,
// nearest `at` first (left at ties, so the most recently folded wins).
function near(v: View, at: number, n: number, order: number, may: May): number[] {
  const open = openAt(v, order);
  const out: number[] = [];
  const add = (p: number) => !open.includes(p) && may(p) && out.push(p);
  for (let p = v.offset; p < windowEnd(v); p++) add(p);
  for (let p = v.offset - 1; p >= 0 && !add(p); p--);
  for (let p = windowEnd(v); p < n && !add(p); p++);
  return out.sort((a, b) => Math.abs(a - at) - Math.abs(b - at) || a - b);
}

/**
 * Bring back panes sashay collapsed (see near) until `target` are open. One that can't
 * open without closing another is skipped; passing over panes it may not open, the window
 * takes them in closed.
 */
function refill(
  v: View,
  target: number,
  at: number,
  n: number,
  sizes: SizesFor,
  order: number,
  cap: number | undefined,
  may: May,
): View {
  const have = openAt(v, order).length;
  const next =
    have < target &&
    near(v, at, n, order, may)
      .map((p) => reveal(extend(v, p), p, n, sizes, order, undefined, cap))
      .find((r) => openAt(r, order).length > have);
  return next ? refill(next, target, at, n, sizes, order, cap, may) : v;
}

/** After `next` replaces `prev` (same list), other panes sashay collapsed make up the open count: see refill. */
export function keepOpen(
  prev: View,
  next: View,
  n: number,
  sizes: SizesFor,
  order: number,
  cap?: number,
  may = all,
): View {
  const was = openAt(prev, order);
  const now = openAt(next, order);
  const shut = was.filter((p) => !now.includes(p));
  if (!shut.length) return next;
  return refill(next, was.length, shut[0], n, sizes, order, cap, (p) => may(p) && !shut.includes(p));
}

/** Close pane p, giving its width to the nearest open pane, then keepOpen. */
export function close(v: View, p: number, n: number, sizes: SizesFor, order: number, cap?: number, may = all): View {
  const k = p - v.offset;
  if (k < 0 || k > v.div.length) return v;
  const e = eff(v.div, order);
  if (!isOpen(toWidths(e)[k])) return v;
  const shut = normalize({ offset: v.offset, div: closePane(e, k, sizes(v.offset, windowEnd(v)), order) }, n);
  return keepOpen(v, shut, n, sizes, order, cap, may);
}

/** A closed pane is inserted at index `at`; later indices shift. */
export function insert(v: View, at: number): View {
  const end = windowEnd(v);
  if (at < v.offset) return { offset: v.offset + 1, div: v.div };
  if (at > end) return v;
  if (at === end) return extend(v, at);
  const k = at - v.offset;
  const div = v.div.slice();
  div.splice(k, 0, k ? div[k - 1] : 0);
  return { offset: v.offset, div };
}

/**
 * Pane p is removed. `n` is the count after removal; `sizes` still indexes the
 * list before it. An open pane gives its width away the way close() does.
 */
export function remove(v: View, p: number, n: number, sizes: SizesFor, order: number): View {
  if (p < v.offset) return { offset: v.offset - 1, div: v.div };
  if (p >= windowEnd(v)) return v;
  if (!v.div.length) return normalize({ offset: Math.max(0, Math.min(p, n - 1)), div: [] }, n);
  const k = p - v.offset;
  const e = eff(v.div, order);
  const d = isOpen(toWidths(e)[k])
    ? closePane(e, k, sizes(v.offset, windowEnd(v)), order)
    : e.map((x) => nearest(x, order));
  d.splice(Math.max(0, k - 1), 1); // pane k, now zero-width, merges into a neighbour
  return normalize({ offset: v.offset, div: d }, n);
}

/**
 * Carry a view across a pane-list change, matching panes by id. Null when the
 * survivors were reordered or there are none: use defaultView.
 */
export function diff<P extends { id: string; opensTo?: number[] }>(
  prev: P[],
  next: P[],
  v: View,
  order: number,
  sizes: (panes: P[], from: number, to: number) => Sizes,
  cap?: number,
  may = (_id: string) => true,
): View | null {
  const nextIds = new Set(next.map((p) => p.id));
  const prevIds = new Set(prev.map((p) => p.id));
  const kept = prev.filter((p) => nextIds.has(p.id));
  const kept2 = next.filter((p) => prevIds.has(p.id));
  if (!kept.length || kept.some((p, i) => p.id !== kept2[i].id)) return null;
  const sizesIn =
    (list: P[]): SizesFor =>
    (a, b) =>
      sizes(list, a, b);
  const ok =
    (list: P[]): May =>
    (p) =>
      may(list[p].id);
  let list = prev;
  let view = v;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (nextIds.has(prev[i].id)) continue;
    const old = list;
    const cur = list.toSpliced(i, 1);
    list = cur;
    const open = openAt(view, order);
    // The only open pane: first open another, so that remove() needn't open whichever is beside it.
    const [to] = open.length === 1 && open[0] === i ? near(view, i, old.length, order, ok(old)) : [];
    if (to !== undefined) view = reveal(extend(view, to), to, old.length, sizesIn(old), order, undefined, cap);
    view = remove(view, i, cur.length, sizesIn(old), order);
    view = refill(view, open.length, i - 0.5, cur.length, sizesIn(cur), order, cap, ok(cur));
  }
  for (let i = 0; i < next.length; i++) {
    if (prevIds.has(next[i].id)) continue;
    const cur = list.toSpliced(i, 0, next[i]);
    list = cur;
    view = reveal(insert(view, i), i, cur.length, sizesIn(cur), order, next[i].opensTo, cap, ok(cur));
  }
  // One that remove() opened for want of any other closes again, unless it's still the only one.
  for (const p of openAt(view, order))
    if (prevIds.has(next[p].id) && !may(next[p].id))
      view = close(view, p, next.length, sizesIn(next), order, cap, ok(next));
  return view;
}

/**
 * defaultLayout when it fits the list, else an equal split of the last six panes, or of
 * fewer while `fits` rejects the split (panes under their minimums).
 */
export function defaultView(n: number, defaultLayout?: number[], fits?: (v: View) => boolean): View {
  if (!n) return { offset: 0, div: [] };
  if (defaultLayout?.length === n - 1) return normalize({ offset: 0, div: defaultLayout.map((x) => nearest(x, 6)) }, n);
  for (let m = Math.min(n, 6); ; m--) {
    const v = normalize({ offset: n - m, div: Array.from({ length: m - 1 }, (_, k) => nearest((k + 1) / m, 6)) }, n);
    if (m === 1 || !fits || fits(v)) return v;
  }
}

// Layout code: [offset "-"] dividers ["." bars]. One hex digit per window
// divider (its snap index); bar bits four per hex digit, present iff any
// window pane has a bar. "48", "8c.0", "997-48".
const chunks = <T>(a: T[]) => Array.from({ length: Math.ceil(a.length / 4) }, (_, j) => a.slice(4 * j, 4 * j + 4));

/** bars: open state of the window panes that have a bar, in order. */
export const encodeLayout = (v: View, bars: boolean[]): string =>
  (v.offset ? `${v.offset}-` : "") + encode(v.div, []) + (bars.length ? `.${encode([], chunks(bars))}` : "");

/** Untrusted input: anything malformed, or a window past the list's end, is null. */
export function decodeLayout(
  code: unknown,
  n: number,
  hasBar: (p: number) => boolean,
): { view: View; bars: boolean[] } | null {
  const m = typeof code === "string" ? /^(?:([1-9]\d*)-)?([0-9a-c]*)(?:\.([0-9a-f]+))?$/.exec(code) : null;
  if (!m) return null;
  const offset = m[1] ? Number(m[1]) : 0;
  const V = m[2].length;
  if (offset + V + 1 > n || (!code && n > 1)) return null; // no code, unless for one pane
  let D = 0;
  for (let p = offset; p <= offset + V; p++) if (hasBar(p)) D++;
  if ((m[3] !== undefined) !== D > 0) return null;
  const counts = chunks(Array(D).fill(0)).map((c) => c.length);
  if (!V && !D) return { view: { offset, div: [] }, bars: [] };
  const r = decode(m[2] + (m[3] ?? ""), V, counts);
  return r && { view: { offset, div: r.div }, bars: r.bits.flat() };
}
