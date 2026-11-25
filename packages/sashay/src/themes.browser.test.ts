import { afterEach, beforeEach, expect, test } from "vitest";
import { frames, mountFrame } from "../test/dom.ts";
import { createSashay, type SashayHandle, type SashayOptions } from "./index.ts";
import "./themes.css";

let frame: HTMLElement;
let h: SashayHandle;
const widths = () => [...frame.querySelectorAll("[data-sashay-edge]")].map((e) => e.getBoundingClientRect().width);
const settled = () => new Promise((r) => setTimeout(r, 400));
const mount = (o: Partial<SashayOptions> = {}) => {
  h = createSashay(frame, {
    panes: ["a", "b", "c"].map((id) => ({ id, title: id, focus: 1 / 3 })),
    layout: "48",
    ...o,
  });
};
beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  frame = mountFrame(["a", "b", "c"]);
});
afterEach(() => {
  h.destroy();
  frame.remove();
});

test("switching theme re-measures the rails and keeps the layout", async () => {
  mount();
  expect(widths()).toEqual([12, 12, 12]);
  for (const [theme, w] of [
    ["curtain", 28],
    ["shoji", 8],
    ["sash", 20],
    [null, 12],
  ] as const) {
    if (theme) frame.dataset.sashayTheme = theme;
    else delete frame.dataset.sashayTheme;
    await settled();
    expect(widths(), String(theme)).toEqual([w, w, w]);
    expect(h.layout).toBe("48");
    const last = frame.querySelector('[data-sashay-pane="c"]') as HTMLElement;
    expect(last.getBoundingClientRect().right).toBeCloseTo(frame.getBoundingClientRect().right, 0);
  }
});

test("a theme on an ancestor applies", async () => {
  mount();
  document.body.dataset.sashayTheme = "curtain";
  await frames(2);
  await settled();
  expect(widths()).toEqual([28, 28, 28]);
  delete document.body.dataset.sashayTheme;
});

test("edge.width wins over the theme", () => {
  frame.dataset.sashayTheme = "curtain";
  mount({ panes: ["a", "b", "c"].map((id) => ({ id, title: id, focus: 1 / 3, edge: { width: 10 } })) });
  expect(widths()).toEqual([10, 10, 10]);
});

test("compact caps the theme's rails", () => {
  frame.dataset.sashayTheme = "curtain";
  mount({ compactBelow: 5000 });
  expect(widths().slice(1)).toEqual([12, 12]);
});

test("destroy removes the probes", () => {
  mount();
  h.destroy();
  expect(frame.querySelector("[data-sashay-probe]")).toBeNull();
});
