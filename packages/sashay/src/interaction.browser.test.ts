import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { frames, mountFrame, pane, pointer, slid, tx } from "../test/dom.ts";
import { createSashay, type PaneOptions, type SashayHandle, type SashayOptions } from "./index.ts";

const P3: PaneOptions[] = [
  { id: "a", title: "A", focus: 0.3, minWidth: "180px" },
  { id: "b", title: "B", focus: 0.25, minWidth: "150px" },
  { id: "c", title: "C", focus: 1 / 3, minWidth: "180px" },
];

let frame: HTMLElement;
let h: SashayHandle | undefined;
let onChange: ReturnType<typeof vi.fn<(code: string) => void>>;
let onClose: ReturnType<typeof vi.fn<(id: string) => void>>;
const $ = (sel: string) => frame.querySelector(sel) as HTMLElement;
const E = (id: string) => $(`[data-sashay-edge="${id}"]`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.left + r.width / 2;
};
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const mount = (o: Partial<SashayOptions> = {}) => {
  h = createSashay(frame, { panes: P3, layout: "48", onChange, onClose, ...o });
  return h;
};
/** Seven 22px moves right from x0, `gap` ms apart. */
const drag7 = async (el: Element, x0: number, gap = 0) => {
  pointer(el, "pointerdown", x0);
  for (let i = 1; i <= 7; i++) {
    if (gap) await wait(gap);
    pointer(el, "pointermove", x0 + 22 * i);
  }
  return x0 + 154;
};

beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  onChange = vi.fn<(code: string) => void>();
  onClose = vi.fn<(id: string) => void>();
  frame = mountFrame(["a", "b", "c"]);
});
afterEach(() => {
  h?.destroy();
  h = undefined;
  frame.remove();
});

test("slow drag snaps to nearest", async () => {
  mount();
  const B = E("b");
  const x = await drag7(B, centre(B));
  await wait(120);
  pointer(B, "pointerup", x);
  expect(onChange.mock.calls).toEqual([["69"]]);
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});

test("drag writes the DOM without reporting", () => {
  mount();
  const B = E("b");
  const x0 = centre(B);
  pointer(B, "pointerdown", x0);
  pointer(B, "pointermove", x0 + 22);
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  expect(tx($('[data-sashay-pane="b"]'))).toBeGreaterThan(332);
  expect(frame.querySelectorAll("[data-sashay-mark]").length).toBe(2);
  expect($("[data-sashay-mark][data-primary]")).toBe(frame.querySelectorAll("[data-sashay-mark]")[0]);
  pointer(B, "pointercancel", x0 + 22);
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  expect(onChange).not.toHaveBeenCalled(); // settles back on "48"
});

test("fast fling carries two snaps", async () => {
  mount();
  const B = E("b");
  const x = await drag7(B, centre(B), 10);
  pointer(B, "pointerup", x);
  expect(onChange.mock.calls).toEqual([["9c"]]);
  expect(onClose.mock.calls).toEqual([["c"]]);
});

// The preview mark sits where a no-fling release lands; a throw bows its middle toward the
// landing by --sashay-fling px: 0 when slow, up to half the fling length at FLING[1] (1.4 px/ms).
const bulge = (m: HTMLElement) => Number(m.style.getPropertyValue("--sashay-fling"));
const flick = async (gap: number, code: string) => {
  mount();
  const B = E("b");
  const x = await drag7(B, centre(B), gap);
  const m = $("[data-sashay-mark][data-primary]");
  const rest = tx(m);
  const b = bulge(m);
  expect(m.hasAttribute("data-fling")).toBe(b !== 0);
  pointer(B, "pointerup", x);
  expect(onChange.mock.calls).toEqual([[code]]);
  return { b, half: (tx(E("b")) - rest) / 2 };
};
test("slow drag: straight preview", async () => {
  const { b, half } = await flick(60, "69"); // ~0.37 px/ms, under the fling threshold
  expect(b).toBe(0);
  expect(half).toBeCloseTo(0, 6);
});
test("moderate flick: partial bulge", async () => {
  const { b, half } = await flick(30, "8c"); // ~0.73 px/ms
  expect(b).toBeGreaterThan(0);
  expect(b).toBeLessThanOrEqual(half + 1e-9);
});
test("fast flick: bulge is half the fling", async () => {
  const { b, half } = await flick(10, "9c"); // ~2 px/ms
  expect(b).toBeCloseTo(half, 6);
});

// A throw that also moves the other divider ("48" → "9c"): only the dragged mark bows.
test("fast flick: only the primary mark bows", async () => {
  mount();
  const B = E("b");
  const x = await drag7(B, centre(B), 10);
  const [primary, other] = [...frame.querySelectorAll<HTMLElement>("[data-sashay-mark]")];
  expect(primary.hasAttribute("data-primary")).toBe(true);
  expect(bulge(primary)).toBeGreaterThan(0);
  expect(other.hasAttribute("data-fling")).toBe(false);
  expect(bulge(other)).toBe(0);
  pointer(B, "pointerup", x);
  expect(onChange.mock.calls).toEqual([["9c"]]);
});

test("release below minWidth closes", async () => {
  mount();
  const C = E("c");
  const x0 = centre(C);
  const x = x0 + (0.9 - 2 / 3) * 924;
  pointer(C, "pointerdown", x0);
  pointer(C, "pointermove", (x0 + x) / 2);
  pointer(C, "pointermove", x);
  await wait(120);
  pointer(C, "pointerup", x);
  expect(onChange.mock.calls).toEqual([["4c"]]);
  expect(onClose.mock.calls).toEqual([["c"]]);
});

test("click toggles; cancel without movement does nothing", () => {
  mount();
  const C = E("c");
  pointer(C, "pointerdown", 700);
  pointer(C, "pointercancel", 700);
  expect(onChange).not.toHaveBeenCalled();
  pointer(C, "pointerdown", 700);
  pointer(C, "pointermove", 702);
  pointer(C, "pointerup", 702);
  expect(onChange).toHaveBeenLastCalledWith("4c");
  expect(onClose.mock.calls).toEqual([["c"]]);
  pointer(C, "pointerdown", 700);
  pointer(C, "pointerup", 700);
  expect(onChange).toHaveBeenLastCalledWith("48"); // below capacity: a is at its focus, so b gives
});

// The threshold is euclidean: a vertical swipe on an edge is neither a click nor a drag.
test("vertical swipe neither toggles nor drags", () => {
  mount();
  const C = E("c");
  const x0 = tx(C);
  pointer(C, "pointerdown", 700, { clientY: 100 });
  pointer(C, "pointermove", 702, { clientY: 140 });
  pointer(C, "pointermove", 712, { clientY: 180 }); // axis latched vertical: later x moves don't drag
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  expect(tx(C)).toBe(x0);
  pointer(C, "pointerup", 712, { clientY: 180 });
  expect(onChange).not.toHaveBeenCalled();
});

// A slide is a CSS transition; grabbing an edge mid-slide continues from where it is on screen.
test("grabbing mid-slide drags from the visible position", async () => {
  mount();
  const B = E("b");
  const from = tx(B);
  key(B, "ArrowRight");
  const to = tx(B);
  expect(to - from).toBeGreaterThan(40);
  await wait(100);
  const seen = new DOMMatrix(getComputedStyle(B).transform).m41;
  expect(seen).toBeGreaterThan(from + 5);
  expect(seen).toBeLessThan(to - 5);
  const x0 = centre(B);
  pointer(B, "pointerdown", x0);
  pointer(B, "pointermove", x0 + 6);
  expect(tx(B)).toBeCloseTo(seen + 6, 0);
  pointer(B, "pointercancel", x0 + 6);
});

// A pane's first 20px also grab its edge, but only to drag: clicks there stay the content's.
test("an edge grabs from 10px into its pane", () => {
  mount();
  const B = E("b");
  const x = B.getBoundingClientRect().right + 10;
  const p = $('[data-sashay-pane="b"]');
  const before = tx(B);
  pointer(p, "pointerdown", x);
  pointer(p, "pointermove", x + 10);
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  expect(tx(B)).toBeCloseTo(before + 10, 6);
  pointer(B, "pointerup", x + 10); // captured once it latched: the edge receives the rest
  expect(frame.hasAttribute("data-dragging")).toBe(false);
});
test("a click 10px into a pane neither toggles nor steals a button's click", () => {
  mount();
  const B = E("b");
  const x = B.getBoundingClientRect().right + 10;
  const p = $('[data-sashay-pane="b"]');
  pointer(p, "pointerdown", x);
  pointer(p, "pointerup", x);
  expect(onChange).not.toHaveBeenCalled();
  const btn = document.createElement("button");
  btn.style.cssText = "position:absolute;left:4px;top:100px;width:40px;height:20px";
  p.append(btn);
  const clicked = vi.fn();
  btn.addEventListener("click", clicked);
  const r = btn.getBoundingClientRect();
  expect(r.left + 6).toBeLessThan(B.getBoundingClientRect().right + 20);
  return userEvent.click(btn, { position: { x: 6, y: 10 } }).then(() => {
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const coveredA = () => {
  mount({ panes: [{ ...P3[0], focus: 0.4 }, P3[1], P3[2]] });
  const a = $('[data-sashay-pane="a"]');
  const b = $('[data-sashay-pane="b"]');
  expect(a.hasAttribute("data-covered")).toBe(true);
  const btn = (side: string) => {
    const el = document.createElement("button");
    el.style.cssText = `position:absolute;${side}:${side === "left" ? 30 : 6}px;top:100px;width:30px;height:20px`;
    a.append(el);
    return el;
  };
  return { a, b, shown: btn("left"), under: btn("right") };
};

test("a covered pane's visible slice takes clicks; the neighbour takes them over the covered part", async () => {
  const { b, shown, under } = coveredA();
  expect(under.getBoundingClientRect().left).toBeGreaterThan(b.getBoundingClientRect().left); // really under b
  const hit = vi.fn();
  shown.addEventListener("click", hit);
  await userEvent.click(shown);
  expect(hit).toHaveBeenCalledTimes(1);
  const r = under.getBoundingClientRect();
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  expect(at === under || under.contains(at)).toBe(false);
  expect(b.contains(at)).toBe(true);
});

test("keyboard focus landing under the neighbour reveals the covered pane", async () => {
  const { a, shown, under } = coveredA();
  await userEvent.click(shown); // pointer focus in the visible slice: no reveal
  expect(a.hasAttribute("data-covered")).toBe(true);
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(under);
  expect(a.hasAttribute("data-covered")).toBe(false);
  expect(onChange).toHaveBeenCalled();
});

// Past either end the layout follows the pointer at a quarter of its speed, then settles back.
test("dragging past an end moves at ¼ friction", () => {
  mount();
  for (const [el, dir] of [
    [E("b"), -1],
    [E("c"), 1],
  ] as const) {
    const x0 = centre(el);
    pointer(el, "pointerdown", x0);
    pointer(el, "pointermove", x0 + dir * 400); // past the end
    const t1 = tx(el);
    pointer(el, "pointermove", x0 + dir * 440);
    expect(tx(el) - t1).toBeCloseTo(dir * 10, 6);
    pointer(el, "pointercancel", x0 + dir * 440);
    expect(tx(E("a"))).toBe(0); // settled: no offset left behind
  }
});

test("keyboard", () => {
  mount();
  E("b").focus();
  key(E("b"), "ArrowRight");
  expect(onChange).toHaveBeenLastCalledWith("69");
  h?.destroy();
  mount();
  key(E("c"), "ArrowLeft");
  expect(onChange).toHaveBeenLastCalledWith("36");
  key(E("c"), "Enter");
  expect(onChange.mock.lastCall?.[0]).toMatch(/c$/);
  expect(onClose).toHaveBeenLastCalledWith("c");
});

test("spine: arrow keys move between tabs, Enter reveals, focus stays in the spine", async () => {
  const ids = ["p0", "p1", "p2", "p3", "p4", "p5"];
  frame.replaceChildren(...ids.map(pane));
  mount({ panes: ids.map((id) => ({ id, title: id, focus: 1 / 3 })), layout: "3-48" });
  const tab = (id: string) => $(`[data-sashay-spine-tab="${id}"]`);
  tab("p2").focus();
  key(tab("p2"), "ArrowUp");
  expect(document.activeElement).toBe(tab("p1"));
  key(tab("p1"), "Home");
  expect(document.activeElement).toBe(tab("p0"));
  key(tab("p0"), "ArrowDown");
  expect(document.activeElement).toBe(tab("p1"));
  expect([tab("p0").tabIndex, tab("p1").tabIndex, tab("p2").tabIndex]).toEqual([-1, 0, -1]);
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenLastCalledWith("1-48c");
  expect(document.activeElement).toBe(tab("p0"));
});

test("aria", () => {
  mount();
  const B = E("b");
  expect(B.getAttribute("role")).toBe("separator");
  expect(B.getAttribute("aria-valuenow")).toBe("33");
  expect(B.getAttribute("aria-valuetext")).toBe("1:1:1");
  key(B, "ArrowRight");
  expect(B.getAttribute("aria-valuenow")).toBe("50");
  expect(B.getAttribute("aria-valuetext")).toBe("2:1:1");
  expect(E("a").getAttribute("role")).toBe("button");
});

test("leaf ×", () => {
  mount();
  const x = $("[data-sashay-close]");
  expect(x.getAttribute("aria-label")).toBe("Close C");
  x.click();
  expect(onChange).toHaveBeenLastCalledWith("4c");
  expect(onClose.mock.calls).toEqual([["c"]]);
});

const T = (id: string) => $(`[data-sashay-bar-toggle="${id}"]`);
const B = (id: string) => $(`[data-sashay-bar="${id}"]`);
/** Adds the content element of a pane's bar. */
const bar = (id: string, html = "<button>tool</button>") => {
  const d = document.createElement("div");
  d.setAttribute("data-sashay-bar", id);
  d.innerHTML = html;
  $(`[data-sashay-pane="${id}"]`).after(d);
  return d;
};
const withBars = (a?: PaneOptions["bar"], b: PaneOptions["bar"] = { title: "Filters" }): PaneOptions[] => [
  { ...P3[0], bar: a },
  { ...P3[1], bar: b },
  P3[2],
];
/** An element's box relative to the frame. */
const box = (el: Element) => {
  const [r, f] = [el.getBoundingClientRect(), frame.getBoundingClientRect()];
  return { left: r.left - f.left, top: r.top - f.top, bottom: f.bottom - r.bottom, width: r.width, height: r.height };
};

test("a pane without a bar has nothing at the bottom", () => {
  mount();
  expect(frame.querySelector("[data-sashay-bar-toggle]")).toBeNull();
  expect(box($('[data-sashay-pane="b"]')).height).toBe(600);
});

test("collapsed, a bar is a 2.75rem strip the pane's content ends above", () => {
  bar("b");
  mount({ panes: withBars(), layout: "48.0" });
  expect(box(T("b"))).toEqual({ left: 332, top: 556, bottom: 0, width: 308, height: 44 });
  expect(T("b").textContent).toBe("Filters");
  expect(T("b").querySelector("svg")).not.toBeNull();
  expect(T("b").getAttribute("aria-expanded")).toBe("false");
  expect(B("b").id).not.toBe("");
  expect(T("b").getAttribute("aria-controls")).toBe(B("b").id);
  expect(B("b").inert).toBe(true);
  // Scrolled to its end, the pane's content is clear of the strip.
  const p = $('[data-sashay-pane="b"]');
  p.style.overflow = "auto";
  p.style.padding = "20px";
  p.style.boxSizing = "border-box";
  p.innerHTML = '<div style="height:2000px"></div><p style="margin:0">end</p>';
  p.scrollTop = 9999;
  expect(box(p.lastElementChild as Element).bottom).toBeCloseTo(64, 0);
  expect(box($('[data-sashay-pane="a"]')).height).toBe(600);
});

test("expanded, a bar grows over the pane to half its height without resizing it", async () => {
  bar("b");
  mount({ panes: withBars(), layout: "48.0" });
  const p = $('[data-sashay-pane="b"]');
  const before = box(p);
  T("b").click();
  expect(onChange).toHaveBeenLastCalledWith("48.1");
  expect(T("b").getAttribute("aria-expanded")).toBe("true");
  expect(B("b").inert).toBe(false);
  await slid();
  expect(box(p)).toEqual(before);
  expect(box(T("b")).top).toBe(300);
  expect(box(B("b"))).toEqual({ left: 332, top: 344, bottom: 0, width: 308, height: 256 });
  const f = frame.getBoundingClientRect();
  expect(document.elementFromPoint(f.left + 350, f.top + 100)).toBe(p);
  expect(p.inert).toBe(false);
  expect(E("b").style.width).toBe("12px");
  h?.toggleBar("b");
  expect(onChange).toHaveBeenLastCalledWith("48.0");
  expect(T("b").getAttribute("aria-expanded")).toBe("false");
  expect(B("b").inert).toBe(true);
  h?.toggleBar("b", false);
  h?.toggleBar("c"); // no bar
  expect(onChange).toHaveBeenCalledTimes(2);
});

test("a bar's height is any Length, clamped to the pane", async () => {
  bar("a");
  bar("b");
  mount({ panes: withBars({ title: "Data", height: 200 }, { title: "Filters", height: "100rem" }), layout: "48.3" });
  expect(box(T("a")).top).toBe(400);
  expect(box(T("b")).top).toBe(0);
  expect(box(B("b")).height).toBe(556);
  h?.update({ panes: withBars({ title: "Data", height: "25%" }, { title: "Filters", height: "1px" }) });
  await slid();
  expect(box(T("a")).top).toBe(450);
  expect(box(T("b")).top).toBe(556);
  expect(() => h?.update({ panes: withBars({ title: "Data", height: "nope" }) })).toThrow();
});

test("expanded content scrolls", () => {
  const d = bar("b", '<div style="height:2000px"></div>');
  mount({ panes: withBars(), layout: "48.1" });
  d.scrollTop = 100;
  expect(d.scrollTop).toBe(100);
});

test("Enter and Space on the strip toggle it; collapsing from inside returns focus to it", async () => {
  const d = bar("b");
  mount({ panes: withBars(), layout: "48.0" });
  T("b").focus();
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenLastCalledWith("48.1");
  await userEvent.keyboard(" ");
  expect(onChange).toHaveBeenLastCalledWith("48.0");
  h?.toggleBar("b", true);
  await slid();
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(d.firstElementChild);
  h?.toggleBar("b", false);
  expect(document.activeElement).toBe(T("b"));
});

test("several bars open at once, in compact too, inside their panes", async () => {
  bar("a");
  bar("b");
  mount({ panes: withBars({ title: "Data" }), layout: "48.0" });
  T("a").click();
  T("b").click();
  expect(onChange).toHaveBeenLastCalledWith("48.3");
  frame.style.width = "600px";
  await frames();
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect(onChange).toHaveBeenLastCalledWith("48.3");
  for (const id of ["a", "b"]) expect(T(id).getAttribute("aria-expanded")).toBe("true");
  await slid();
  expect(box(T("a")).left).toBe(box($('[data-sashay-pane="a"]')).left);
});

test("a covered pane's bar fits its visible slice", async () => {
  bar("a");
  mount({ panes: [{ ...P3[0], focus: 0.4, bar: { title: "Data" } }, P3[1], P3[2]], layout: "48.0" });
  const a = $('[data-sashay-pane="a"]');
  expect(a.hasAttribute("data-covered")).toBe(true);
  const right = E("b").getBoundingClientRect().left;
  expect(T("a").getBoundingClientRect().right).toBeCloseTo(right, 1);
  await userEvent.click(T("a"));
  expect(onChange).toHaveBeenLastCalledWith("48.1");
  expect(a.hasAttribute("data-covered")).toBe(true);
  expect(B("a").getBoundingClientRect().right).toBeCloseTo(right, 1);
  // It follows a drag, frame by frame.
  await slid();
  const x0 = centre(E("b"));
  pointer(E("b"), "pointerdown", x0);
  pointer(E("b"), "pointermove", x0 - 60);
  expect(T("a").getBoundingClientRect().right).toBeCloseTo(E("b").getBoundingClientRect().left, 1);
  pointer(E("b"), "pointercancel", x0 - 60);
});

test("a closed pane's bar is inert and hidden; its open state survives", async () => {
  const d = bar("b");
  mount({ panes: withBars(), layout: "48.1" });
  (d.firstElementChild as HTMLElement).focus();
  h?.close("b");
  expect([T("b").inert, d.inert]).toEqual([true, true]);
  expect(document.activeElement).toBe(E("b"));
  await slid();
  for (const el of [T("b"), d]) expect(getComputedStyle(el).visibility).toBe("hidden");
  h?.reveal("b");
  expect([T("b").inert, d.inert]).toEqual([false, false]);
  expect(T("b").getAttribute("aria-expanded")).toBe("true");
});

test("a pane in the spine hides its bar; coming back, the bar is collapsed", async () => {
  const ids = ["p0", "p1", "p2", "p3", "p4", "p5"];
  frame.replaceChildren(...ids.map(pane));
  bar("p4");
  bar("p0");
  mount({
    panes: ids.map((id) => ({ id, title: id, focus: 1 / 3, bar: /p[04]/.test(id) ? { title: "Data" } : undefined })),
    layout: "3-48.1",
  });
  expect(getComputedStyle(B("p0")).visibility).toBe("hidden");
  expect(T("p4").getAttribute("aria-expanded")).toBe("true");
  h?.reveal("p0");
  await slid();
  expect([T("p4").inert, B("p4").inert]).toEqual([true, true]);
  expect(getComputedStyle(T("p4")).visibility).toBe("hidden");
  expect(T("p0").inert).toBe(false);
  h?.reveal("p4");
  expect(T("p4").inert).toBe(false);
  expect(T("p4").getAttribute("aria-expanded")).toBe("false");
});

test("bars come and go with update(), and the pane takes the room back", async () => {
  bar("b");
  mount({ panes: withBars(), layout: "48.1" });
  h?.update({ panes: P3 });
  expect(T("b")).toBeNull();
  await slid();
  expect(getComputedStyle(B("b")).visibility).toBe("hidden");
  expect(box($('[data-sashay-pane="b"]')).height).toBe(600);
  expect(h?.layout).toBe("48");
  h?.update({ panes: withBars(undefined, { title: "New" }) });
  expect(T("b").textContent).toBe("New");
  expect(h?.layout).toBe("48.0");
  B("b").remove();
  $('[data-sashay-pane="b"]').remove();
  h?.update({ panes: [P3[0], P3[2]] });
  expect(frame.querySelector("[data-sashay-bar-toggle]")).toBeNull();
});

test("destroy restores the DOM with a bar", () => {
  bar("b");
  const before = frame.innerHTML;
  mount({ panes: withBars(), layout: "48.1" });
  h?.destroy();
  h = undefined;
  expect(frame.innerHTML).toBe(before);
});

test("pressing in a bar neither drags nor toggles an edge", () => {
  const d = bar("b", "<p>body</p>");
  mount({ panes: withBars(), layout: "48.1" });
  for (const el of [T("b"), d.firstElementChild as Element]) {
    pointer(el, "pointerdown", 340);
    pointer(el, "pointermove", 370);
    expect(frame.hasAttribute("data-dragging")).toBe(false);
    pointer(el, "pointerup", 370);
  }
  expect(onChange).not.toHaveBeenCalled();
});

// Focus under an expanded bar collapses it. The pane is 556px tall; the bar's top is at 300.
const focusables = () => {
  const b = bar("b");
  mount({ panes: withBars(), layout: "48.1" });
  const p = $('[data-sashay-pane="b"]');
  p.style.overflow = "auto";
  p.innerHTML = ["0", "100px", "400px", "900px"]
    .map((top) => `<button style="position:absolute;top:${top};left:40px;height:20px">x</button>`)
    .join("");
  return [...p.querySelectorAll("button"), b.querySelector("button")] as HTMLElement[];
};
test("keyboard focus landing under an expanded bar collapses it, and reports it", async () => {
  const [first, clear, under] = focusables();
  first.focus();
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(clear);
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(under);
  expect(onChange.mock.calls).toEqual([["48.0"]]);
});
test("focus on the pane, in the bar or from a pointer leaves the bar open", async () => {
  const [, , under, , tool] = focusables();
  await userEvent.keyboard("{Shift}");
  const p = $('[data-sashay-pane="b"]');
  p.tabIndex = 0;
  p.focus();
  expect(document.activeElement).toBe(p);
  tool.focus();
  T("b").focus();
  expect(onChange).not.toHaveBeenCalled();
  pointer(E("c"), "pointerdown", 0, { button: 1 });
  under.focus();
  expect(onChange).not.toHaveBeenCalled();
});

// Real mouse input (CDP): the strip or edge moves on between press and release.
const mouseAt = async (type: "mousePressed" | "mouseReleased", x: number, y: number) => {
  const fe = (window.frameElement as Element).getBoundingClientRect();
  const s = fe.width / innerWidth;
  await cdp().send("Input.dispatchMouseEvent", {
    type,
    button: "left",
    buttons: type === "mousePressed" ? 1 : 0,
    clickCount: 1,
    x: fe.left + x * s,
    y: fe.top + y * s,
  });
};
const pressMidSlide = async (el: Element, hold: number) => {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  await mouseAt("mousePressed", x, y);
  await wait(hold);
  const now = el.getBoundingClientRect();
  await mouseAt("mouseReleased", x, y);
  await frames();
  return Math.abs(now.top - r.top) + Math.abs(now.left - r.left);
};
test("a strip pressed mid-slide toggles though it moves from under the pointer", async () => {
  bar("a", "");
  mount({ panes: withBars({ title: "Data" }), layout: "48.0" });
  await frames();
  h?.toggleBar("a");
  await frames(1);
  expect(await pressMidSlide(T("a"), 120)).toBeGreaterThan(22);
  expect(T("a").getAttribute("aria-expanded")).toBe("false");
});
test("an edge pressed mid-slide toggles though it moves from under the pointer", async () => {
  mount();
  await slid();
  key(E("b"), "ArrowLeft");
  await frames(1);
  expect(await pressMidSlide(E("b"), 120)).toBeGreaterThan(6);
  expect($('[data-sashay-pane="b"]').hasAttribute("data-closed")).toBe(true);
});

test("a bar keeps up with a drag that shuts its pane", async () => {
  bar("b");
  mount({ panes: withBars(), layout: "48.0" });
  await slid();
  const b = $('[data-sashay-pane="b"]');
  const x0 = centre(E("c"));
  pointer(E("c"), "pointerdown", x0);
  for (const dx of [-200, -640, -650]) {
    pointer(E("c"), "pointermove", x0 + dx);
    expect(box(T("b")).left).toBeCloseTo(box(b).left, 1);
  }
  expect(b.hasAttribute("data-closed")).toBe(true);
  pointer(E("c"), "pointercancel", x0);
});

test("edges default to 0.75rem, with or without a bar", () => {
  bar("b");
  mount({ panes: withBars(), layout: "48.1" });
  for (const id of ["a", "b", "c"]) expect(E(id).style.width).toBe("12px");
});

test("update mid-drag settles first", async () => {
  mount();
  const B = E("b");
  const x = await drag7(B, centre(B));
  await wait(120);
  frame.append(pane("d"));
  h?.update({ panes: [...P3, { id: "d", title: "D", focus: 0.25 }] });
  expect(onChange.mock.calls[0]).toEqual(["69"]);
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  pointer(B, "pointerup", x);
  expect(onChange).toHaveBeenCalledTimes(2);
});

test("destroy mid-drag restores the DOM", () => {
  const before = frame.innerHTML;
  mount();
  const B = E("b");
  pointer(B, "pointerdown", 400);
  pointer(B, "pointermove", 440);
  h?.destroy();
  h = undefined;
  expect(frame.innerHTML).toBe(before);
  expect(onChange).not.toHaveBeenCalled();
});

test("an API call mid-drag ends the gesture first", () => {
  mount();
  const C = E("c");
  pointer(C, "pointerdown", 640);
  pointer(C, "pointermove", 600);
  h?.close("a");
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  pointer(C, "pointermove", 590);
  pointer(C, "pointerup", 590);
  expect($('[data-sashay-pane="a"]').hasAttribute("data-closed")).toBe(true);
});

test("lostpointercapture ends the gesture", () => {
  mount();
  const B = E("b");
  pointer(B, "pointerdown", 330);
  pointer(B, "pointermove", 380);
  B.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
  expect(frame.hasAttribute("data-dragging")).toBe(false);
  pointer(E("c"), "pointerdown", 650);
  pointer(E("c"), "pointerup", 650);
  expect($('[data-sashay-pane="c"]').hasAttribute("data-closed")).toBe(true);
});

test("compact: edges after the first are grips", () => {
  frame.style.width = "600px";
  const edge = { width: "3rem" };
  mount({ panes: [P3[0], { ...P3[1], edge }, { ...P3[2], edge }] });
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect(E("b").style.width).toBe("12px");
  expect(E("c").style.width).toBe("12px");
});

test("compact: the tab strip lies over the first edge", () => {
  frame.style.width = "600px";
  mount();
  expect(frame.querySelectorAll("[data-sashay-tab]").length).toBe(3);
  expect($('[data-sashay-tab="a"]').getAttribute("aria-pressed")).toBe("true");
  const t = $("[data-sashay-tabs]").getBoundingClientRect();
  const e = E("a").getBoundingClientRect();
  expect([t.left, t.width, t.height]).toEqual([e.left, 44, e.height]);
  expect(document.elementFromPoint(e.left + 10, e.top + 10)?.hasAttribute("data-sashay-tab")).toBe(true);
});

// Pointer deltas are viewport px; the frame lays out in its own px. A scaled ancestor must not
// make the edge trail the pointer, and fling and click must behave as at scale 1.
for (const [css, s] of [
  ["zoom: 0.8", 0.8],
  ["transform: scale(0.5)", 0.5],
] as const) {
  const scaled = () => {
    const wrap = document.createElement("div");
    wrap.style.cssText = `${css}; transform-origin: 0 0`;
    document.body.append(wrap);
    wrap.append(frame);
    return wrap;
  };

  test(`under ${css}: a dragged edge stays under the pointer`, () => {
    const wrap = scaled();
    mount();
    const B = E("b");
    const x0 = centre(B);
    pointer(B, "pointerdown", x0);
    pointer(B, "pointermove", x0 + 50);
    pointer(B, "pointermove", x0 + 100);
    expect(Math.abs(centre(B) - (x0 + 100))).toBeLessThan(1.5);
    pointer(B, "pointercancel", x0 + 100);
    wrap.remove();
  });

  test(`under ${css}: fling and click`, async () => {
    const wrap = scaled();
    mount();
    const B = E("b");
    const x0 = centre(B);
    pointer(B, "pointerdown", x0);
    for (let i = 1; i <= 7; i++) {
      await wait(10);
      pointer(B, "pointermove", x0 + 21 * s * i);
    }
    pointer(B, "pointerup", x0 + 147 * s);
    expect(onChange.mock.calls).toEqual([["8c"]]); // a slow release here snaps to "69"
    h?.destroy();
    onChange.mockClear();
    mount();
    const C = E("c");
    pointer(C, "pointerdown", centre(C));
    pointer(C, "pointermove", centre(C) + 3);
    pointer(C, "pointerup", centre(C) + 3);
    expect(onChange).toHaveBeenLastCalledWith("4c");
    wrap.remove();
  });
}

// Mid-drag, an API call, key or spine tab settles the drag, then acts on the settled view.
test("reveal mid-drag acts on the settled drag", () => {
  mount();
  const C = E("c");
  const x = tx(C);
  pointer(C, "pointerdown", x);
  pointer(C, "pointermove", x - 300);
  h?.reveal("c");
  expect(onChange.mock.calls).toEqual([["04"]]);
  expect(h?.layout).toBe("04");
  expect(onClose.mock.calls).toEqual([["a"]]);
});
test("an arrow key mid-drag acts on the settled drag", () => {
  mount();
  const C = E("c");
  const x = tx(C);
  pointer(C, "pointerdown", x);
  pointer(C, "pointermove", x + 200);
  key(E("b"), "ArrowLeft");
  expect(onChange.mock.calls[0]).toEqual(["4c"]);
  expect(h?.layout).toMatch(/c$/);
  expect(h?.layout).toBe(onChange.mock.lastCall?.[0]);
});
test("a spine tab click mid-drag acts on the settled drag", () => {
  const ids = ["p0", "p1", "p2", "p3", "p4", "p5"];
  frame.style.width = "1400px";
  frame.replaceChildren(...ids.map(pane));
  mount({ panes: ids.map((id) => ({ id, title: id, focus: 1 / 3 })), layout: "3-48" });
  const e = E("p4");
  const x = tx(e);
  pointer(e, "pointerdown", x);
  pointer(e, "pointermove", x - 150);
  $('[data-sashay-spine-tab="p2"]').click();
  expect(onChange.mock.calls).toEqual([["3-28"], ["2-46c"]]); // as a click from 3-28 lands
});

test("a mouse click on a text input under the neighbour doesn't reveal", async () => {
  mount({ panes: [{ ...P3[0], focus: 0.4 }, P3[1], P3[2]] });
  const a = $('[data-sashay-pane="a"]');
  expect(a.hasAttribute("data-covered")).toBe(true);
  const inp = document.createElement("input");
  inp.style.cssText = "position:absolute;left:30px;top:100px;width:600px";
  a.append(inp);
  await userEvent.click(inp, { position: { x: 20, y: 5 } });
  expect(document.activeElement).toBe(inp);
  expect(a.hasAttribute("data-covered")).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

// Real mouse input (CDP), 1px at a time: a drag from the grab strip over text selects nothing.
test("dragging an edge from its pane's text selects nothing", async () => {
  mount();
  const t = document.createElement("p");
  t.style.cssText = "margin:0;padding-top:100px;white-space:nowrap";
  t.textContent = "Lorem ipsum dolor sit amet ".repeat(20);
  $('[data-sashay-pane="b"]').append(t);
  const fe = (window.frameElement as Element).getBoundingClientRect();
  const sc = fe.width / innerWidth;
  const r = t.getBoundingClientRect();
  const at = (x: number) => ({ x: fe.left + (r.left + x) * sc, y: fe.top + (r.top + 108) * sc });
  const mouse = (type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number, buttons = 1) =>
    cdp().send("Input.dispatchMouseEvent", { type, button: "left", buttons, clickCount: 1, ...at(x) });
  await mouse("mousePressed", 8);
  for (let x = 9; x <= 120; x++) await mouse("mouseMoved", x);
  await mouse("mouseReleased", 120, 0);
  expect(onChange).toHaveBeenCalled(); // it dragged
  expect(getSelection()?.toString()).toBe("");
});
