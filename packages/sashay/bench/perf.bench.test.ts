// The performance contract in docs/api.md, at 1,000 panes. Budgets are
// assertions on the median, measured after warm-up.
import { afterEach, beforeEach, expect, test } from "vitest";
import { createSashay, type PaneOptions, type SashayHandle } from "../src/index.ts";
import { frames, mountFrame, pane, pointer } from "../test/dom.ts";

declare const gc: () => void;
const N = 1000;
const opt = (id: string): PaneOptions => ({ id, title: id, focus: 1 / 3, minWidth: "10rem" });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const heap = () => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;

let frame: HTMLElement;
let h: SashayHandle;
let panes: PaneOptions[];

beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  const ids = Array.from({ length: N }, (_, i) => String(i));
  frame = mountFrame(ids, 1440);
  frame.style.height = "800px";
  panes = ids.map(opt);
  h = createSashay(frame, { panes });
});
afterEach(() => {
  h.destroy();
  frame.remove();
});

/** Drags the second window pane's edge by +2px per move; returns per-move times. */
const dragFrames = (moves: number) => {
  const edge = frame.querySelector('[data-sashay-edge="995"]') as HTMLElement;
  const x0 = edge.getBoundingClientRect().left + 2;
  pointer(edge, "pointerdown", x0);
  pointer(edge, "pointermove", x0 + 6); // past the click threshold
  const t: number[] = [];
  for (let i = 1; i <= moves; i++) {
    const s = performance.now();
    pointer(edge, "pointermove", x0 + 6 + 2 * i);
    t.push(performance.now() - s);
  }
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  pointer(edge, "pointerup", x0 + 6 + 2 * moves);
  return t;
};

test("drag frame < 2 ms of script at 1,000 panes", () => {
  dragFrames(30); // warm-up
  h.setLayout("994-1468b");
  const t = dragFrames(120);
  console.log(`drag frame median ${median(t).toFixed(3)} ms`);
  expect(median(t)).toBeLessThan(2);
});

test("drag frame < 2 ms with a bar on every pane, the window's open", () => {
  h.destroy();
  for (const p of panes) {
    const bar = document.createElement("div");
    bar.setAttribute("data-sashay-bar", p.id);
    frame.append(bar);
  }
  h = createSashay(frame, { panes: panes.map((p) => ({ ...p, bar: { title: p.id } })) });
  for (let i = 994; i < N; i++) h.toggleBar(String(i), true);
  expect(frame.querySelectorAll("[data-sashay-bar][data-open]").length).toBe(6);
  dragFrames(30); // warm-up
  const t = dragFrames(120);
  console.log(`drag frame with bars median ${median(t).toFixed(3)} ms`);
  expect(median(t)).toBeLessThan(2);
});

test("adding a pane < 16 ms", () => {
  const t: number[] = [];
  for (let i = 0; i < 60; i++) {
    const id = `new${i}`;
    frame.append(pane(id));
    panes = [...panes, opt(id)];
    const s = performance.now();
    h.update({ panes });
    if (i >= 10) t.push(performance.now() - s); // first 10 are warm-up
  }
  console.log(`add pane median ${median(t).toFixed(3)} ms`);
  expect(median(t)).toBeLessThan(16);
});

// A rolling stack 997 deep: each step drops the oldest pane (its spine tab goes) and pushes a
// new one (the oldest open pane folds: its tab comes). Each change touches only those tabs.
test("adding and removing with a deep spine < 16 ms each", async () => {
  frame.style.width = "960px"; // three panes at thirds fill it, so each push folds one
  await frames();
  const stackOpt = (id: string): PaneOptions => ({ id, title: id, focus: 1 / 3 });
  panes = panes.map((p) => stackOpt(p.id));
  h.update({ panes });
  h.setLayout("997-48");
  const spine = frame.querySelector('[data-spine="start"]') as HTMLElement;
  const t: number[] = [];
  for (let i = 0; i < 60; i++) {
    frame.querySelector(`[data-sashay-pane="${panes[0].id}"]`)?.remove();
    panes = panes.slice(1);
    let s = performance.now();
    h.update({ panes });
    const rm = performance.now() - s;
    frame.append(pane(`new${i}`));
    panes = [...panes, stackOpt(`new${i}`)];
    s = performance.now();
    h.update({ panes });
    if (i >= 10) t.push(rm, performance.now() - s); // the first 10 are warm-up
    expect(h.layout).toBe("997-48");
    expect(spine.children.length).toBe(997);
    expect(spine.firstElementChild?.getAttribute("data-sashay-spine-tab")).toBe(panes[0].id);
    expect(spine.lastElementChild?.getAttribute("data-sashay-spine-tab")).toBe(panes[996].id);
  }
  console.log(`deep spine add/remove median ${median(t).toFixed(3)} ms, max ${Math.max(...t).toFixed(3)} ms`);
  expect(median(t)).toBeLessThan(16);
});

test("memory stays flat across adds and removes", () => {
  const cycle = () => {
    const el = pane("x");
    frame.append(el);
    h.update({ panes: [...panes, opt("x")] });
    el.remove();
    h.update({ panes });
  };
  for (let i = 0; i < 20; i++) cycle();
  const edges = frame.querySelectorAll("[data-sashay-edge]").length;
  gc();
  const before = heap();
  for (let i = 0; i < 200; i++) cycle();
  gc();
  const growth = heap() - before;
  console.log(`heap growth over 200 cycles ${growth} bytes`);
  expect(growth).toBeLessThan(1_048_576);
  expect(frame.querySelectorAll("[data-sashay-edge]").length).toBe(edges);
});

test("only window panes are painted", () => {
  const p0 = frame.querySelector('[data-sashay-pane="0"]') as HTMLElement;
  const before = p0.style.transform;
  const edge = frame.querySelector('[data-sashay-edge="995"]') as HTMLElement;
  const x0 = edge.getBoundingClientRect().left + 2;
  pointer(edge, "pointerdown", x0);
  pointer(edge, "pointermove", x0 + 20);
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  expect(p0.style.transform).toBe(before);
  pointer(edge, "pointerup", x0 + 20);
});
