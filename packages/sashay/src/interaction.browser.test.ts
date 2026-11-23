import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { frames, mountFrame, pane, pointer, tx } from "../test/dom.ts";
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
const drawer = (id: string) => {
  const d = document.createElement("div");
  d.setAttribute("data-sashay-drawer", id);
  d.innerHTML = "<p>body</p>";
  frame.append(d);
  return d;
};
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

// The grab target reaches past the 12px visual edge into its own pane only: on the left sit
// the neighbour's scrollbar and any stacked edges.
test("an edge grabs from 10px outside its visual width", () => {
  mount();
  const B = E("b");
  const r = B.getBoundingClientRect();
  const y = r.top + 300;
  expect(document.elementFromPoint(r.left - 1, y)).not.toBe(B);
  const t = document.elementFromPoint(r.right + 10, y) as Element;
  expect(t).toBe(B);
  pointer(t, "pointerdown", r.right + 10);
  pointer(t, "pointermove", r.right + 20);
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  pointer(t, "pointercancel", r.right + 20);
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

const withDrawers = (a?: string, b = "14rem"): PaneOptions[] => [
  a ? { ...P3[0], edge: { drawer: { width: a, title: "Data" } } } : P3[0],
  { ...P3[1], edge: { drawer: { width: b, title: "Filters" } } },
  P3[2],
];

test("drawer", () => {
  drawer("b");
  mount({ panes: withDrawers(), layout: "48.0" });
  const t = $('[data-sashay-controls="b"] [data-sashay-toggle]');
  t.click();
  expect(t.getAttribute("aria-expanded")).toBe("true");
  expect(E("b").style.width).toBe("224px");
  expect(E("b").hasAttribute("data-open")).toBe(true);
  expect($('[data-sashay-drawer="b"]').hasAttribute("data-open")).toBe(true);
  expect(onChange).toHaveBeenLastCalledWith("48.1");
  h?.toggleDrawer("b");
  expect(onChange).toHaveBeenLastCalledWith("48.0");
  expect(t.getAttribute("aria-expanded")).toBe("false");
});

test("an edge with a drawer defaults to 2.75rem wide, others to 0.75rem", () => {
  drawer("b");
  mount({ panes: withDrawers(), layout: "48.0" });
  expect(E("a").style.width).toBe("12px");
  expect(E("b").style.width).toBe("44px");
  expect(E("c").style.width).toBe("12px");
});

test("drawer body drags but doesn't toggle", () => {
  const d = drawer("b");
  mount({ panes: withDrawers(), layout: "48.1" });
  const body = d.querySelector("p") as HTMLElement;
  pointer(body, "pointerdown", 400);
  pointer(body, "pointerup", 400);
  expect(onChange).not.toHaveBeenCalled();
  pointer(body, "pointerdown", 400);
  pointer(body, "pointermove", 430);
  expect(frame.hasAttribute("data-dragging")).toBe(true);
  pointer(body, "pointerup", 430);
  expect(frame.hasAttribute("data-dragging")).toBe(false);
});

test("compact", () => {
  frame.style.width = "600px";
  drawer("a");
  drawer("b");
  mount({ panes: withDrawers("10rem"), layout: "48.0" });
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect(frame.querySelectorAll("[data-sashay-tab]").length).toBe(3);
  expect($('[data-sashay-tab="a"]').getAttribute("aria-pressed")).toBe("true");
  expect(E("a").querySelector("[data-sashay-toggle]")).toBeNull();
  $('[data-sashay-drawer-tab="b"]').click();
  const db = $('[data-sashay-drawer="b"]');
  expect(db.hasAttribute("data-sheet")).toBe(true);
  expect(tx(db)).toBeCloseTo(44, 1);
  expect(db.style.width).toBe("224px");
  const head = $("[data-sashay-sheet-head]");
  expect(head.textContent).toContain("Filters");
  expect(head.closest("[data-sashay-drawer]")).toBeNull();
  expect(tx(head)).toBeCloseTo(44, 1);
  expect(head.style.width).toBe("224px");
  expect($('[data-sashay-drawer-tab="b"]').getAttribute("aria-expanded")).toBe("true");
  $('[data-sashay-drawer-tab="a"]').click();
  expect($('[data-sashay-drawer="a"]').hasAttribute("data-open")).toBe(true);
  expect(db.hasAttribute("data-open")).toBe(false);
  expect(frame.querySelectorAll("[data-sashay-sheet-head]").length).toBe(1);
  expect($("[data-sashay-sheet-head]").textContent).toContain("Data");
  expect(E("b").style.width).toBe("12px");
  $("[data-sashay-sheet-close]").click();
  expect($('[data-sashay-drawer="a"]').hasAttribute("data-open")).toBe(false);
  expect($("[data-sashay-sheet-head]")).toBeNull();
});

test("entering compact shows only the rightmost open drawer, and keeps the others' bits", async () => {
  const da = drawer("a");
  const db = drawer("b");
  mount({ panes: withDrawers("10rem"), layout: "48.3" });
  expect(da.hasAttribute("data-open") && db.hasAttribute("data-open")).toBe(true);
  frame.style.width = "600px";
  await frames();
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect(db.hasAttribute("data-sheet")).toBe(true);
  expect(da.hasAttribute("data-open")).toBe(false);
  expect(frame.querySelectorAll("[data-sheet]").length).toBe(1);
  expect($('[data-sashay-drawer-tab="a"]').getAttribute("aria-expanded")).toBe("false");
  expect(onChange).not.toHaveBeenCalled();
  frame.style.width = "960px";
  await frames();
  expect(da.hasAttribute("data-open") && db.hasAttribute("data-open")).toBe(true);
  expect(frame.querySelector("[data-sheet], [data-sashay-sheet-head]")).toBeNull();
});

test("opening a sheet in compact closes the visible one", () => {
  frame.style.width = "600px";
  const da = drawer("a");
  const db = drawer("b");
  mount({ panes: withDrawers("10rem"), layout: "48.2" });
  expect(db.hasAttribute("data-sheet")).toBe(true);
  h?.toggleDrawer("a", true);
  expect(da.hasAttribute("data-sheet")).toBe(true);
  expect(db.hasAttribute("data-open")).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith("48.1");
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

test("compact: edges after the first are grips, with or without drawers", () => {
  frame.style.width = "600px";
  drawer("b");
  const wide = { width: "3rem" };
  mount({
    panes: [P3[0], { ...P3[1], edge: { ...wide, drawer: { width: "10rem", title: "F" } } }, { ...P3[2], edge: wide }],
    layout: "48.0",
  });
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect(E("b").style.width).toBe("12px");
  expect(E("c").style.width).toBe("12px");
});

test("a drawer renders at its configured width", () => {
  const d = drawer("b");
  mount({ panes: withDrawers(undefined, "10rem"), layout: "48.1" });
  expect(d.getBoundingClientRect().width).toBe(160);
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
