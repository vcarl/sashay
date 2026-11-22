// Sliding panes: pure layout math for a row of panes separated by edges.
// Pane widths are fractions of the content width (the frame minus its edges);
// N panes have N-1 dividers, each resting on a snap. controller.ts feeds
// pointer/key input in and paints the result.

// ── Snap grid ────────────────────────────────────────────────────────────
// A divider rests only on a "simple" fraction k/n (n ≤ MAX_DEN), plus 0
// (pane to its left fully covered) and 1 (panes to its right pushed off).
// The list is fixed, so a position's index in it IS its persisted form.
interface Snap {
  k: number;
  n: number;
  v: number;
}

const MAX_DEN = 6;
export const SNAPS: Snap[] = (() => {
  const seen = new Map<number, Snap>();
  for (let n = 1; n <= MAX_DEN; n++)
    for (let k = 0; k <= n; k++) if (!seen.has(k / n)) seen.set(k / n, { k, n, v: k / n }); // first hit is the reduced form
  return [...seen.values()].sort((a, b) => a.v - b.v);
})(); // 0, 1/6, 1/5, 1/4, 1/3, 2/5, 1/2, 3/5, 2/3, 3/4, 4/5, 5/6, 1  → 13 entries (one hex digit)

/** Snap index → fraction. */
export const snapV = (i: number): number => SNAPS[i].v;

// The viewport picks the finest denominator in play: one grid unit per
// UNIT_PX of content. Order 1 leaves only {0, 1} → one pane at a time.
// A phone (< 440px content) → 1; a tablet → halves/thirds/quarters;
// ~1320px+ (a wide desktop) → all sixths.
// ponytail: flat px heuristic; per-pane minimums replace it once UX is tuned.
const UNIT_PX = 220;
export const gridOrder = (contentPx: number): number => Math.max(1, Math.min(MAX_DEN, Math.floor(contentPx / UNIT_PX)));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const allowedIdx = (order: number) => SNAPS.map((_, i) => i).filter((i) => SNAPS[i].n <= order); // always has 0 and 1

// Nearest allowed snap index. Stored indices are never rewritten by a narrow
// viewport; they're re-resolved here every render, so widening the window
// restores the layout the user chose.
export function nearest(v: number, order: number): number {
  let best = 0;
  for (const i of allowedIdx(order)) if (Math.abs(SNAPS[i].v - v) < Math.abs(SNAPS[best].v - v)) best = i;
  return best;
}
// Allowed snap at-or-past v in a direction (-1: floor, +1: ceil).
function snapToward(v: number, dir: number, order: number): number {
  const hits = allowedIdx(order).filter((i) => dir * (SNAPS[i].v - v) >= -1e-9);
  return hits[dir > 0 ? 0 : hits.length - 1];
}
// First allowed snap strictly past v.
function beyond(v: number, dir: number, order: number): number {
  const hits = allowedIdx(order).filter((i) => dir * (SNAPS[i].v - v) > 1e-9);
  return hits.length ? hits[dir > 0 ? 0 : hits.length - 1] : nearest(v, order);
}
/** Keyboard: the next allowed snap left (-1) or right (+1). */
export const step = (i: number, dir: number, order: number): number => beyond(SNAPS[i].v, dir, order);

// ── Space allocation ─────────────────────────────────────────────────────
// Dividers ⇄ pane widths (fractions of content, summing to 1).
export const toWidths = (d: number[]): number[] => [...d, 1].map((x, k) => x - (k ? d[k - 1] : 0));
const toDividers = (w: number[]): number[] => {
  let a = 0;
  return w.slice(0, -1).map((x) => {
    a += x;
    return a;
  });
};

/** Sizes per pane, as fractions of content. */
export interface Sizes {
  focus: number[];
  min: number[];
  max: number[];
}

// A pane is open iff it has width. While dragging, panes shrink smoothly,
// even below their minimum; on release, any open pane under its minimum
// closes (enforceMin). The glow preview shows it first.
export const isOpen = (w: number): boolean => w > 1e-9;

// Panes by distance from p (left first at ties), excluding p.
const byDistance = (p: number, P: number) => {
  const out: number[] = [];
  for (let r = 1; r < P; r++) {
    if (p - r >= 0) out.push(p - r);
    if (p + r < P) out.push(p + r);
  }
  return out;
};

// Take `need` from donor panes (listed nearest-the-grower first).
//   Pass 1 (only when `spareFirst`): trim each down to its focus size,
//           nearest first, so a middle pane gives up only what it doesn't
//           need. Used when a later pane grows leftward (details takes the
//           list's spare width before the scatter's).
//   Pass 2: trim to the minimum, outermost first. Growing the scatter
//           (rightward) starts here: details shrinks before the list.
//   Pass 3: below the minimum, outermost first, down to zero. Smooth: no
//           jump. A pane left under its minimum closes on release.
function take(w0: number[], S: Sizes, donors: number[], need0: number, spareFirst = true) {
  const w = w0.slice();
  let need = need0;
  const outer = [...donors].reverse();
  for (const k of spareFirst ? donors : []) {
    const t = Math.min(need, Math.max(0, w[k] - Math.max(S.focus[k], S.min[k])));
    w[k] -= t;
    need -= t;
  }
  for (const k of outer) {
    const t = Math.min(need, Math.max(0, w[k] - S.min[k]));
    w[k] -= t;
    need -= t;
  }
  for (const k of outer) {
    const t = Math.min(need, w[k]);
    w[k] -= t;
    need -= t;
  }
  return { w, short: need };
}

// Hand `amount` out over `receivers` (first = the intended one): each takes
// up to its maximum, in order; whatever nobody can take goes to the first.
// A maximum only limits a pane that grows as a side effect — it never stops
// a drag; the frame must stay full, so the last resort is exceeding it.
function fill(w: number[], receivers: number[], amount: number, max: number[]): void {
  for (const k of receivers) {
    const t = Math.min(amount, Math.max(0, max[k] - w[k]));
    w[k] += t;
    amount -= t;
  }
  w[receivers[0]] += amount;
}

// Move divider i to v. Panes the divider moves into pay via take(); only
// the pane adjacent on the other side grows — expanding the list never
// feeds details. That pane is the one being scaled, so its maximum doesn't
// apply. Dragging a closed pane's edge outward opens it.
export function drag(dividers: number[], i: number, v: number, S: Sizes): number[] {
  const w = toWidths(dividers);
  const P = w.length;
  const delta = clamp(v, 0, 1) - dividers[i];
  if (Math.abs(delta) < 1e-12) return dividers.slice();
  const left = delta < 0;
  const donors = left ? [...Array(i + 1).keys()].reverse() : [...Array(P - i - 1).keys()].map((k) => i + 1 + k);
  const r = take(w, S, donors, Math.abs(delta), left);
  r.w[left ? i + 1 : i] += Math.abs(delta) - r.short;
  return toDividers(r.w);
}

// Any open pane under its minimum closes. Its width goes to the nearest open
// pane on its own side of `prefer` (the pane being grown), so the dragged
// divider stays on the snap the user chose; failing that, to `prefer`;
// failing that, to the nearest open pane. Maximums apply via fill().
function enforceMin(vals: number[], S: Sizes, prefer: number): number[] {
  const w = toWidths(vals);
  for (let k = 0; k < w.length; k++) {
    const x = w[k];
    if (!isOpen(x) || x >= S.min[k] - 1e-9) continue;
    const near = byDistance(k, w.length).filter((j) => isOpen(w[j]));
    const to =
      near.find((j) => j !== prefer && Math.sign(j - prefer) === Math.sign(k - prefer)) ??
      (prefer !== k && isOpen(w[prefer] ?? 0) ? prefer : near[0]);
    if (to == null) continue;
    w[k] = 0;
    fill(w, [to, ...near.filter((j) => j !== to)], x, S.max);
  }
  return toDividers(w);
}
const snapAll = (vals: number[], order: number) => vals.map((x) => SNAPS[nearest(x, order)].v);
const toIdx = (vals: number[], order: number) => vals.map((x) => nearest(x, order));

/** Close pane p: its whole width goes to the nearest open pane. Returns snap indices. */
export function closePane(dividers: number[], p: number, S: Sizes, order: number): number[] {
  const w = toWidths(dividers);
  const near = byDistance(p, w.length).filter((j) => isOpen(w[j]));
  if (!near.length) return toIdx(dividers, order); // last open pane stays
  const freed = w[p];
  w[p] = 0;
  fill(w, near, freed, S.max);
  return toIdx(enforceMin(snapAll(toDividers(w), order), S, near[0]), order);
}

/** Snap any layout (presets, restored layouts) and enforce minimums. Returns snap indices. */
export const fit = (vals: number[], S: Sizes, order: number): number[] =>
  toIdx(enforceMin(snapAll(vals, order), S, -1), order);

// Bring pane p up to its focus size, taking space from both sides (nearest
// panes first in pass 1, outermost first in pass 2). Its own edges snap
// outward so it gets at least the focus size; at grid order 1 that means
// the whole frame. Returns snap indices.
// Target is the focus size, raised to the minimum, capped at the maximum.
export function focusPane(dividers: number[], p: number, S: Sizes, order: number): number[] {
  const w = toWidths(dividers);
  let d = dividers.slice();
  const need = Math.min(S.max[p], Math.max(S.focus[p], S.min[p])) - w[p];
  if (need > 1e-9) {
    const r = take(w, S, byDistance(p, w.length), need);
    r.w[p] += need - r.short;
    d = toDividers(r.w);
  }
  const s = d.map(
    (x, k) => SNAPS[k === p - 1 ? snapToward(x, -1, order) : k === p ? snapToward(x, 1, order) : nearest(x, order)].v,
  );
  for (let k = p - 2; k >= 0; k--) s[k] = Math.min(s[k], s[k + 1]);
  for (let k = p + 1; k < s.length; k++) s[k] = Math.max(s[k], s[k - 1]);
  return toIdx(enforceMin(s, S, p), order);
}

// ── Release: fling ───────────────────────────────────────────────────────
// Release speed (px/ms) picks how far past the pointer the divider lands:
// below FLING[0] → nearest snap; ≥ FLING[0] → first snap beyond the pointer
// in the throw direction; ≥ FLING[1] → the one after that.
// ponytail: fixed thresholds; tune by feel (trackpads and touch differ).
const FLING = [0.45, 1.4] as const;
const VELOCITY_WINDOW_MS = 90;

export interface Sample {
  t: number;
  x: number;
}

// samples: pointer history; only the last window counts, so a pause before
// letting go reads as zero velocity.
export function velocity(samples: Sample[], now: number): number {
  const s = samples.filter((p) => now - p.t <= VELOCITY_WINDOW_MS);
  if (s.length < 2) return 0;
  const a = s[0];
  const b = s[s.length - 1];
  return b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
}

export function releaseTarget(v: number, vel: number, order: number): number {
  const speed = Math.abs(vel);
  if (speed < FLING[0]) return nearest(v, order);
  const dir = Math.sign(vel);
  const j = beyond(v, dir, order);
  return speed >= FLING[1] ? step(j, dir, order) : j;
}

// Where every divider ends up if released now: the dragged one goes to its
// fling target, the rest follow via the same allocation from the gesture's
// start, then snap. The view uses this for both the drop and the glow
// marks, so the preview can't disagree with the result.
// Order matters:
//   1. Close panes that are under their minimum *before* snapping — only
//      those the user actually squeezed.
//   2. Snap. If that pushes the grower past its maximum, the dragged
//      divider snaps back toward where it started.
//   3. Snapping must not push any other open pane under its minimum (a pane
//      held at exactly its min would otherwise round down and close too):
//      round its edge away from it, the grower paying.
// The release lands on the snap nearest the fling target whose resolved
// layout is viable: every open pane within [min, max], with closed panes
// already accounted for. Only if none is viable does the raw target stand.
// Returns snap indices.
export function settle(start: number[], i: number, raw: number, vel: number, order: number, S: Sizes): number[] {
  const T = SNAPS[releaseTarget(raw, vel, order)].v;
  // Only panes already shut, or under their minimum where the user aimed
  // (the pointer, or the fling target when thrown), may end up closed.
  const aim = Math.abs(vel) < FLING[0] ? raw : T;
  const aimed = toWidths(drag(start, i, aim, S));
  const closable = aimed.map((w, k) => !isOpen(w) || w < S.min[k] - 1e-9);
  // A pane may exceed its max only as far as the drag itself already forced it to.
  const cap = aimed.map((w, k) => Math.max(S.max[k], w));
  const ok = (idx: number[]) =>
    toWidths(idx.map((k) => SNAPS[k].v)).every((w, k) =>
      isOpen(w) ? w >= S.min[k] - 1e-9 && w <= cap[k] + 1e-9 : closable[k],
    );
  const byNear = allowedIdx(order).sort((a, b) => Math.abs(SNAPS[a].v - T) - Math.abs(SNAPS[b].v - T));
  for (const c of byNear) {
    const r = resolve(start, i, SNAPS[c].v, order, S);
    if (ok(r)) return r;
  }
  return resolve(start, i, T, order, S);
}

function resolve(start: number[], i: number, target: number, order: number, S: Sizes): number[] {
  const left = target < start[i];
  const grower = left ? i + 1 : i;
  const d = enforceMin(drag(start, i, target, S), S, grower);
  const s = snapAll(d, order);
  const over = (vals: number[]) => toWidths(vals)[grower] > S.max[grower] + 1e-9;
  if (over(s) && !over(d)) s[i] = SNAPS[snapToward(d[i], left ? 1 : -1, order)].v; // rounding only
  const ws = toWidths(s);
  for (let k = 0; k < ws.length; k++) {
    if (k === grower || !isOpen(ws[k]) || ws[k] >= S.min[k] - 1e-9) continue;
    if (k > grower) s[k - 1] = SNAPS[snapToward((s[k] ?? 1) - S.min[k], -1, order)].v;
    else s[k] = SNAPS[snapToward((s[k - 1] ?? 0) + S.min[k], 1, order)].v;
  }
  for (let k = 1; k < s.length; k++) s[k] = Math.max(s[k], s[k - 1]);
  return toIdx(s, order);
}

// ── Layout ───────────────────────────────────────────────────────────────
// Every pane has an edge on its leading side (edges[i] leads panes[i]).
// Edges are fixed-px and live outside the ratio system: fractions apply to
// what's left after them. An edge is "expandable" when it has an openPx.
export interface EdgeSpec {
  closedPx: number;
  openPx?: number | undefined;
  open: boolean;
}
export interface PaneSpec {
  focus: number;
  focusX?: number | null | undefined;
}
interface Box {
  x: number;
  w: number;
  z: number;
}
interface PaneBox {
  x: number;
  visible: number;
  width: number;
  shift: number;
  z: number;
}

const edgeWidth = (e: EdgeSpec) => (e.open && e.openPx ? e.openPx : e.closedPx);
export const contentWidth = (W: number, edges: EdgeSpec[]): number =>
  Math.max(0, W - edges.reduce((s, e) => s + edgeWidth(e), 0));

// Slide-over: a pane renders at max(visible, focus·C) — never squeezed
// below its focus size; the excess is covered by the next pane or runs off
// the frame's right edge.
export function layout(W: number, dividers: number[], edges: EdgeSpec[], panes: PaneSpec[]) {
  const C = contentWidth(W, edges);
  const frac = (i: number) => (i === 0 ? 0 : i === panes.length ? 1 : dividers[i - 1]);
  const through = (b: number) => edges.slice(0, b + 1).reduce((s, e) => s + edgeWidth(e), 0);
  const edgeBoxes: Box[] = edges.map((e, b) => {
    const w = edgeWidth(e);
    return { x: frac(b) * C + through(b) - w, w, z: b };
  });
  const paneBoxes: PaneBox[] = panes.map((p, i) => {
    const x = frac(i) * C + through(i);
    const visible = Math.max(0, frac(i + 1) * C + through(i) - x);
    const width = Math.max(visible, p.focus * C);
    return { x, visible, width, shift: focusShift(width, visible, p.focusX), z: i };
  });
  return { C, edgeBoxes, paneBoxes };
}

// Horizontal focus: `f` is a 0–1 fraction of the pane's content width
// (a chart passes its selected point's x). When the pane is partly
// covered, shift its content left — as little as possible — so the focus
// stays FOCUS_MARGIN px inside the visible slice. Never reveals a gap.
const FOCUS_MARGIN = 28;
export function focusShift(width: number, visible: number, f: number | null | undefined): number {
  if (f == null || width <= visible) return 0;
  const m = Math.min(FOCUS_MARGIN, visible / 2);
  return clamp(f * width + m - visible, 0, width - visible);
}

// ── Persistence ──────────────────────────────────────────────────────────
// One hex digit per divider (its SNAPS index), then one hex digit per bit
// set (≤ 4 flags each; e.g. the drawers). Pane open/closed needs no bits: a
// pane is open iff it has width. 1:1:1, drawers shut → "480".
export const encode = (div: number[], bitsets: boolean[][]): string =>
  div.map((i) => i.toString(16)).join("") +
  bitsets.map((bs) => bs.reduce((b, o, i) => b | (o ? 1 << i : 0), 0).toString(16)).join("");

// URL input is untrusted: anything malformed decodes to null (caller uses default).
export function decode(
  s: unknown,
  dividerCount: number,
  bitCounts: number[],
): { div: number[]; bits: boolean[][] } | null {
  if (typeof s !== "string" || !/^[0-9a-f]+$/.test(s) || s.length !== dividerCount + bitCounts.length) return null;
  const n = [...s].map((c) => Number.parseInt(c, 16));
  const div = n.slice(0, dividerCount);
  const bits = n.slice(dividerCount);
  if (div.some((i, j) => i >= SNAPS.length || (j > 0 && i < div[j - 1]))) return null;
  if (bits.some((b, j) => b >= 1 << bitCounts[j])) return null;
  return { div, bits: bits.map((b, j) => Array.from({ length: bitCounts[j] }, (_, i) => Boolean((b >> i) & 1))) };
}

/** Human label for a layout: pane widths as the smallest integer ratio. */
export function ratio(divIdx: number[]): string {
  const edges = [SNAPS[0], ...divIdx.map((i) => SNAPS[i]), SNAPS[SNAPS.length - 1]];
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const L = edges.reduce((l, e) => (l * e.n) / gcd(l, e.n), 1);
  const segs = edges.slice(1).map((e, i) => (e.k * L) / e.n - (edges[i].k * L) / edges[i].n);
  const g = segs.reduce((a, b) => gcd(a, b), 0) || 1;
  return segs.map((s) => s / g).join(":");
}
