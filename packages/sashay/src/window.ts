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

const LAST = 12; // SNAPS index of 1

export const windowEnd = (v: View): number => v.offset + v.div.length + 1;

// Effective divider fractions: stored indices re-resolved to the grid in play.
const eff = (div: number[], order: number) => div.map((i) => snapV(nearest(snapV(i), order)));
const widths = (div: number[]) => toWidths(div.map(snapV));

/** Keep one closed edge after the window when panes follow it. */
export function normalize({ offset, div }: View, n: number): View {
  const w = widths(div);
  if (isOpen(w[w.length - 1]) && offset + div.length + 1 < n) div = [...div, LAST];
  return { offset, div };
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
 * extend the window by it, then focus it. Anywhere else: the window jumps to it.
 */
export function reveal(
  v: View,
  p: number,
  n: number,
  sizes: SizesFor,
  order: number,
  opensTo?: number[],
  cap?: number,
): View {
  if (p < 0 || p >= n) return v;
  let { offset, div } = v;
  const end = windowEnd(v);
  if (p < offset - 1 || p > end) return normalize({ offset: p, div: [] }, n);
  if (p === offset - 1) {
    offset = p;
    div = [0, ...div];
  } else if (p === end) div = [...div, LAST];
  const k = p - offset;
  const e = eff(div, order);
  const before = toWidths(e);
  if (isOpen(before[k])) return v;
  const S = sizes(offset, offset + div.length + 1);
  const opened = opensTo?.length === div.length ? fitIdx(opensTo, S, order) : null;
  const d = opened && isOpen(widths(opened)[k]) ? opened : focusPane(e, k, S, order);
  const after = widths(d);
  const squeezed = before.some((x, j) => isOpen(x) && !isOpen(after[j]));
  const next = { offset, div: d };
  return normalize(squeezed || cap ? fold(next, cap) : next, n);
}

/** Close pane p, giving its width to the nearest open pane. */
export function close(v: View, p: number, n: number, sizes: SizesFor, order: number): View {
  const k = p - v.offset;
  if (k < 0 || k > v.div.length) return v;
  const e = eff(v.div, order);
  if (!isOpen(toWidths(e)[k])) return v;
  return normalize({ offset: v.offset, div: closePane(e, k, sizes(v.offset, windowEnd(v)), order) }, n);
}

/** A closed pane is inserted at index `at`; later indices shift. */
export function insert(v: View, at: number): View {
  const end = windowEnd(v);
  if (at < v.offset) return { offset: v.offset + 1, div: v.div };
  if (at > end) return v;
  if (at === end) return { offset: v.offset, div: [...v.div, LAST] };
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
  if (!v.div.length) return n ? normalize({ offset: Math.min(p, n - 1), div: [] }, n) : { offset: 0, div: [] };
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
 * survivors were reordered or no window pane survived: use defaultView.
 */
export function diff<P extends { id: string; opensTo?: number[] }>(
  prev: P[],
  next: P[],
  v: View,
  order: number,
  sizes: (panes: P[], from: number, to: number) => Sizes,
  cap?: number,
): View | null {
  const nextIds = new Set(next.map((p) => p.id));
  const prevIds = new Set(prev.map((p) => p.id));
  const kept = prev.filter((p) => nextIds.has(p.id));
  const kept2 = next.filter((p) => prevIds.has(p.id));
  if (kept.some((p, i) => p.id !== kept2[i].id)) return null;
  if (!prev.slice(v.offset, windowEnd(v)).some((p) => nextIds.has(p.id))) return null;
  let list = prev;
  let view = v;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (nextIds.has(prev[i].id)) continue;
    const old = list;
    list = list.toSpliced(i, 1);
    view = remove(view, i, list.length, (a, b) => sizes(old, a, b), order);
  }
  for (let i = 0; i < next.length; i++) {
    if (prevIds.has(next[i].id)) continue;
    const cur = list.toSpliced(i, 0, next[i]);
    list = cur;
    view = reveal(insert(view, i), i, cur.length, (a, b) => sizes(cur, a, b), order, next[i].opensTo, cap);
  }
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

// Layout code: [offset "-"] dividers ["." drawers]. One hex digit per window
// divider (its snap index); drawer bits four per hex digit, present iff any
// window pane has a drawer. "48", "8c.0", "997-48".
const chunks = <T>(a: T[]) => Array.from({ length: Math.ceil(a.length / 4) }, (_, j) => a.slice(4 * j, 4 * j + 4));

/** drawers: open state of the window panes that have a drawer, in order. */
export const encodeLayout = (v: View, drawers: boolean[]): string =>
  (v.offset ? `${v.offset}-` : "") + encode(v.div, []) + (drawers.length ? `.${encode([], chunks(drawers))}` : "");

/** Untrusted input: anything malformed, or a window past the list's end, is null. */
export function decodeLayout(
  code: unknown,
  n: number,
  hasDrawer: (p: number) => boolean,
): { view: View; drawers: boolean[] } | null {
  const m = typeof code === "string" ? /^(?:([1-9]\d*)-)?([0-9a-c]*)(?:\.([0-9a-f]+))?$/.exec(code) : null;
  if (!m) return null;
  const offset = m[1] ? Number(m[1]) : 0;
  const V = m[2].length;
  if (offset + V + 1 > n) return null;
  let D = 0;
  for (let p = offset; p <= offset + V; p++) if (hasDrawer(p)) D++;
  if ((m[3] !== undefined) !== D > 0) return null;
  const counts = chunks(Array(D).fill(0)).map((c) => c.length);
  if (!V && !D) return { view: { offset, div: [] }, drawers: [] };
  const r = decode(m[2] + (m[3] ?? ""), V, counts);
  return r && { view: { offset, div: r.div }, drawers: r.bits.flat() };
}
