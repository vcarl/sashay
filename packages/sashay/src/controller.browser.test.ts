import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { frames, mountFrame, pane, tx } from "../test/dom.ts";
import { createSashay, type PaneOptions, type SashayHandle } from "./index.ts";
import { decodeLayout } from "./window.ts";

const P3: PaneOptions[] = [
  { id: "a", title: "A", focus: 0.3, minWidth: "180px" },
  { id: "b", title: "B", focus: 0.25, minWidth: "150px" },
  { id: "c", title: "C", focus: 1 / 3, minWidth: "180px" },
];

let frame: HTMLElement;
let h: SashayHandle | undefined;
const $ = (sel: string) => frame.querySelector(sel) as HTMLElement;
const P = (id: string) => $(`[data-sashay-pane="${id}"]`);
const E = (id: string) => $(`[data-sashay-edge="${id}"]`);

beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  frame = mountFrame(["a", "b", "c"]);
});
afterEach(() => {
  h?.destroy();
  h = undefined;
  frame.remove();
});

const expect48 = () => {
  expect(tx(P("a"))).toBeCloseTo(12, 1);
  expect(tx(P("b"))).toBeCloseTo(332, 1);
  expect(tx(P("c"))).toBeCloseTo(652, 1);
  for (const id of "abc") expect(Number.parseFloat(P(id).style.width)).toBeCloseTo(308, 1);
};

test("paints 1:1:1", () => {
  h = createSashay(frame, { panes: P3, layout: "48" });
  expect48();
  expect(tx(E("a"))).toBeCloseTo(0, 1);
  expect(tx(E("b"))).toBeCloseTo(320, 1);
  expect(tx(E("c"))).toBeCloseTo(640, 1);
  expect(frame.querySelector("[data-covered]")).toBeNull();
  expect(frame.hasAttribute("data-sashay-ready")).toBe(true);
});

test("invalid layout falls back to the default", () => {
  const onChange = vi.fn();
  h = createSashay(frame, { panes: P3, layout: "zz", onChange });
  expect48();
  h.setLayout("4c");
  h.setLayout("997-48");
  expect48();
  expect(onChange).not.toHaveBeenCalled();
});

test("slide-over marks covered panes inert", () => {
  h = createSashay(frame, { panes: [{ ...P3[0], focus: 0.4 }, P3[1], P3[2]], layout: "48" });
  expect(P("a").hasAttribute("data-covered")).toBe(true);
  expect(P("a").inert).toBe(true);
});

test("layout reads the current code", () => {
  h = createSashay(frame, { panes: P3, layout: "48" });
  expect(h.layout).toBe("48");
  h.close("c");
  expect(h.layout).toBe("4c");
  h.setLayout("69");
  expect(h.layout).toBe("69");
});

test("reveal, close and fit fire onChange; setLayout doesn't", () => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  h = createSashay(frame, { panes: P3, layout: "48", onChange, onClose });
  h.close("c");
  expect(onChange).toHaveBeenLastCalledWith("4c");
  h.reveal("c");
  expect(onChange).toHaveBeenLastCalledWith("48");
  h.fit([0.5, 0.75]);
  expect(onChange).toHaveBeenLastCalledWith("69");
  expect(() => h?.fit([0.5])).toThrow(RangeError);
  const n = onChange.mock.calls.length;
  h.setLayout("4c");
  expect(P("c").hasAttribute("data-closed")).toBe(true);
  h.reveal("zzz");
  expect(onChange).toHaveBeenCalledTimes(n);
  expect(onClose).not.toHaveBeenCalled();
});

test("keepInView shifts covered content", () => {
  h = createSashay(frame, { panes: [{ ...P3[0], focus: 0.4 }, P3[1], P3[2]], layout: "48" });
  h.keepInView("a", 360);
  expect(P("a").style.clipPath.startsWith("inset(0px 0px 0px")).toBe(true);
  expect(tx(P("a"))).toBeLessThan(12);
  h.keepInView("a", null);
  expect(P("a").style.clipPath).toBe("");
  h.keepInView("a", "97.4%"); // ≈ 360 of 369.6
  expect(tx(P("a"))).toBeLessThan(12);
  expect(() => h?.keepInView("a", "far")).toThrow(TypeError);
});

test("a workspace with its first two panes closed shows no spine", () => {
  h = createSashay(frame, { panes: P3, layout: "48" });
  h.close("a");
  h.close("b");
  expect($("[data-spine]").hidden).toBe(true);
  expect(frame.querySelectorAll("[data-sashay-edge]").length).toBe(3);
});

const stack = (n: number): PaneOptions[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `P${i}`, focus: 1 / 3 }));

function grow(to: number, onChange = vi.fn()) {
  frame.remove();
  frame = mountFrame(["p0"]);
  h = createSashay(frame, { panes: stack(1), onChange });
  for (let i = 1; i < to; i++) {
    frame.append(pane(`p${i}`));
    h.update({ panes: stack(i + 1) });
  }
  return onChange;
}

test("stack: spine and offscreen panes", () => {
  const onChange = grow(6);
  expect(onChange).toHaveBeenLastCalledWith("3-48");
  const spine = $("[data-spine]");
  expect(spine.hidden).toBe(false);
  expect(spine.textContent).toBe("3");
  for (const id of ["p0", "p1", "p2"]) {
    expect(P(id).hasAttribute("data-offscreen")).toBe(true);
    expect(P(id).inert).toBe(true);
  }
  expect(getComputedStyle(P("p0")).contentVisibility).toBe("hidden");
  expect(frame.querySelectorAll("[data-sashay-edge]").length).toBe(3);
});

test("spine click reveals the newest hidden pane", () => {
  const onChange = grow(6);
  $("[data-spine]").click();
  expect(onChange).toHaveBeenLastCalledWith("2-48c");
  expect(P("p2").hasAttribute("data-offscreen")).toBe(false);
  expect(P("p5").hasAttribute("data-closed")).toBe(true);
});

test("pop", () => {
  const onChange = grow(6);
  P("p5").remove();
  h?.update({ panes: stack(5) });
  expect(onChange).toHaveBeenLastCalledWith("3-4");
});

test("remove everything, then add", () => {
  h = createSashay(frame, { panes: P3, layout: "48" });
  for (const id of "abc") P(id).remove();
  expect(() => h?.update({ panes: [] })).not.toThrow();
  expect(frame.querySelector("[data-sashay-edge]")).toBeNull();
  frame.append(pane("x"));
  h.update({ panes: [{ id: "x", title: "X", focus: 1 / 3 }] });
  expect(tx(P("x"))).toBeCloseTo(12, 1);
  expect(Number.parseFloat(P("x").style.width)).toBeCloseTo(948, 1);
});

test("resize re-measures lengths", async () => {
  frame.style.width = "600px";
  h = createSashay(frame, { panes: P3, layout: "48", compactBelow: "40rem" });
  await frames();
  expect(frame.hasAttribute("data-compact")).toBe(true);
  document.documentElement.style.fontSize = "12px";
  frame.style.width = "601px";
  await frames();
  expect(frame.hasAttribute("data-compact")).toBe(false);
});

test("zero-width frame", async () => {
  frame.style.width = "0px";
  h = createSashay(frame, { panes: P3, layout: "48" });
  for (const id of "abc") expect(P(id).style.transform).not.toContain("NaN");
  expect(frame.hasAttribute("data-compact")).toBe(false);
  frame.style.width = "960px";
  await frames();
  expect(tx(P("b"))).toBeCloseTo(332, 1);
});

test("bad input throws", () => {
  const dup = [P3[0], P3[0]];
  const missing = [...P3, { id: "q", title: "Q", focus: 0.3 }];
  const bad = [{ ...P3[0], minWidth: "12 parsecs" }, P3[1], P3[2]];
  expect(() => createSashay(frame, { panes: dup })).toThrow(/duplicate pane id "a"/);
  expect(() => createSashay(frame, { panes: missing })).toThrow(/no \[data-sashay-pane="q"\]/);
  expect(() => createSashay(frame, { panes: bad })).toThrow(TypeError);
  expect(frame.hasAttribute("data-sashay-frame")).toBe(false);
  h = createSashay(frame, { panes: P3, layout: "48" });
  expect(() => h?.update({ panes: dup })).toThrow(/duplicate pane id "a"/);
  expect(() => h?.update({ panes: missing })).toThrow(/no \[data-sashay-pane="q"\]/);
  expect(() => h?.update({ panes: bad })).toThrow(TypeError);
  expect48();
});

test("destroy restores the DOM", () => {
  const before = frame.innerHTML;
  const first = createSashay(frame, { panes: P3, layout: "48" });
  first.destroy();
  expect(frame.innerHTML).toBe(before);
  expect(frame.hasAttribute("data-sashay-frame")).toBe(false);
  h = createSashay(frame, { panes: P3, layout: "48" });
  expect48();
});

test("edges carry ARIA", () => {
  h = createSashay(frame, { panes: P3, layout: "48" });
  expect(E("a").getAttribute("role")).toBe("button");
  expect(E("a").getAttribute("aria-expanded")).toBe("true");
  expect(E("b").getAttribute("role")).toBe("separator");
  expect(E("b").getAttribute("aria-valuenow")).toBe("33");
  expect(E("b").getAttribute("aria-valuetext")).toBe("1:1:1");
  expect($("[data-sashay-close]").getAttribute("aria-label")).toBe("Close C");
});

test("toggleDrawer opens a drawer beside its edge", () => {
  const onChange = vi.fn();
  const d = document.createElement("div");
  d.setAttribute("data-sashay-drawer", "b");
  frame.append(d);
  const panes = [P3[0], { ...P3[1], edge: { drawer: { width: "14rem", title: "Filters" } } }, P3[2]];
  h = createSashay(frame, { panes, layout: "48.0", onChange });
  expect(E("b").hasAttribute("data-drawer")).toBe(true);
  h.toggleDrawer("b");
  expect(onChange).toHaveBeenLastCalledWith("48.1");
  expect(E("b").style.width).toBe("224px");
  expect(d.hasAttribute("data-open")).toBe(true);
  expect(d.style.transform).toBe(E("b").style.transform);
  expect($("[data-sashay-toggle]").getAttribute("aria-expanded")).toBe("true");
  h.toggleDrawer("b", false);
  expect(onChange).toHaveBeenLastCalledWith("48.0");
  expect(d.hasAttribute("data-open")).toBe(false);
});

test("focus leaves the spine for the first window edge when the spine hides", () => {
  grow(6);
  const spine = $("[data-spine]") as HTMLButtonElement;
  for (let n = 0; !spine.hidden && n < 10; n++) {
    spine.focus();
    spine.click();
  }
  expect(spine.hidden).toBe(true);
  expect(document.activeElement).toBe(frame.querySelector("[data-sashay-edge]"));
});

test("focus inside a pane that closes or becomes covered moves to its edge", () => {
  const ba = document.createElement("button");
  const bc = document.createElement("button");
  P("a").append(ba);
  P("c").append(bc);
  h = createSashay(frame, { panes: P3, layout: "48" });
  bc.focus();
  h.close("c");
  expect(document.activeElement).toBe(E("c"));
  ba.focus();
  h.fit([0.25, 0.5]);
  expect(P("a").hasAttribute("data-covered")).toBe(true);
  expect(document.activeElement).toBe(E("a"));
});

test("drawer toggles and compact tabs are not inside a role element", () => {
  const d = document.createElement("div");
  d.setAttribute("data-sashay-drawer", "b");
  frame.append(d);
  const panes = [P3[0], { ...P3[1], edge: { drawer: { width: "14rem", title: "Filters" } } }, P3[2]];
  h = createSashay(frame, { panes, layout: "48.0" });
  expect($("[data-sashay-toggle]").closest("[role]")).toBeNull();
  h.destroy();
  frame.style.width = "600px";
  h = createSashay(frame, { panes, layout: "48.0" });
  expect(frame.hasAttribute("data-compact")).toBe(true);
  expect($("[data-sashay-tab]").closest("[role]")).toBeNull();
});

test("defaultLayout must be sorted fractions; fit() sorts and clamps", () => {
  expect(() => createSashay(frame, { panes: P3, defaultLayout: [0.8, 0.2] })).toThrow(/defaultLayout/);
  expect(() => createSashay(frame, { panes: P3, defaultLayout: [0.2, 1.5] })).toThrow(/defaultLayout/);
  expect(frame.hasAttribute("data-sashay-frame")).toBe(false);
  const onChange = vi.fn();
  h = createSashay(frame, { panes: P3, layout: "48", onChange });
  h.fit([0.75, 0.5]);
  expect(onChange).toHaveBeenLastCalledWith("69");
  h.fit([-1, 2]);
  const c = onChange.mock.lastCall?.[0];
  expect(decodeLayout(c, 3, () => false)).not.toBeNull();
});

test("a reveal that squeezes panes shut doesn't fire onClose", () => {
  frame.remove();
  const ids = ["p0", "p1", "p2", "p3"];
  frame = mountFrame(ids, 1400);
  const onClose = vi.fn();
  h = createSashay(frame, { panes: stack(4), defaultLayout: [1 / 3, 2 / 3, 1], onClose });
  E("p3").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(P("p3").hasAttribute("data-closed")).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});

test("handle methods are no-ops after destroy", () => {
  const before = frame.innerHTML;
  const x = createSashay(frame, { panes: P3, layout: "48" });
  x.destroy();
  x.reveal("a");
  x.close("a");
  x.toggleDrawer("a");
  x.keepInView("a", 10);
  x.setLayout("4c");
  x.fit([0.5, 0.75]);
  x.update({ panes: P3, compactBelow: "10rem" });
  x.destroy();
  expect(frame.innerHTML).toBe(before);
});

test("the default layout respects minWidth", () => {
  frame.remove();
  const ids = ["p0", "p1", "p2", "p3", "p4", "p5"];
  frame = mountFrame(ids);
  h = createSashay(frame, { panes: ids.map((id) => ({ id, title: id, focus: 0.2, minWidth: "200px" })) });
  const open = ids.filter((id) => !P(id).hasAttribute("data-offscreen") && !P(id).hasAttribute("data-closed"));
  expect(open.length).toBeGreaterThan(1);
  for (const id of open) expect(Number.parseFloat(P(id).style.width)).toBeGreaterThanOrEqual(200);
});

const shown = (id: string) => !P(id).hasAttribute("data-offscreen") && !P(id).hasAttribute("data-closed");
const tabs = () => frame.querySelectorAll("[data-sashay-tab]");

test("compact: a fixed workspace shows a tab per pane and never a spine", () => {
  frame.style.width = "390px";
  h = createSashay(frame, { panes: P3 });
  expect(frame.hasAttribute("data-compact")).toBe(true);
  for (const id of ["a", "b", "c", "a"]) {
    expect($("[data-spine]").hidden).toBe(true);
    expect(tabs().length).toBe(3);
    $(`[data-sashay-tab="${id}"]`).click();
    expect(shown(id)).toBe(true);
    expect($(`[data-sashay-tab="${id}"]`).getAttribute("aria-pressed")).toBe("true");
  }
  expect($("[data-spine]").hidden).toBe(true);
});

test("compact: every pane of a deep stack is reachable by tab or spine", () => {
  frame.remove();
  const panes = stack(50);
  frame = mountFrame(
    panes.map((p) => p.id),
    390,
  );
  h = createSashay(frame, { panes });
  const spine = $("[data-spine]");
  expect(spine.hidden).toBe(false);
  expect(tabs().length).toBeLessThanOrEqual(7);
  const reached = new Set<string>();
  for (const t of [...tabs()] as HTMLElement[]) {
    const id = t.dataset.sashayTab as string;
    t.click();
    expect(shown(id)).toBe(true);
    reached.add(id);
  }
  while (!spine.hidden) {
    spine.click();
    expect(tabs().length).toBeLessThanOrEqual(7);
    const open = panes.filter((p) => shown(p.id));
    expect(open.length).toBe(1);
    reached.add(open[0].id);
  }
  expect(reached.size).toBe(50);
  for (let i = 1; i < 50; i++) {
    $(`[data-sashay-tab="p${i}"]`).click();
    expect(shown(`p${i}`)).toBe(true);
    expect(tabs().length).toBeLessThanOrEqual(7);
  }
});
