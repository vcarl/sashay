// A close brings back only panes sashay collapsed itself: never one that was closed, or began closed.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountFrame, pane, pointer } from "../test/dom.ts";
import { createSashay, type PaneOptions, type SashayHandle, type SashayOptions } from "./index.ts";

let frame: HTMLElement;
let h: SashayHandle;
const $ = (sel: string) => frame.querySelector(sel) as HTMLElement;
const E = (id: string) => $(`[data-sashay-edge="${id}"]`);
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const opts = (ids: string, o: Partial<PaneOptions> = {}): PaneOptions[] =>
  [...ids].map((id) => ({ id, title: id, focus: 1 / 3, ...o }));
const mount = (ids: string, width: number, o: Partial<SashayOptions> = {}, p: Partial<PaneOptions> = {}) => {
  h?.destroy();
  frame.remove();
  frame = mountFrame([...ids], width);
  h = createSashay(frame, { panes: opts(ids, p), ...o });
};
/** Replaces the list, making and removing elements as an app would. */
const list = (ids: string, p: Partial<PaneOptions> = {}) => {
  for (const el of frame.querySelectorAll<HTMLElement>("[data-sashay-pane]"))
    if (!ids.includes(el.dataset.sashayPane as string)) el.remove();
  for (const id of ids) frame.append($(`[data-sashay-pane="${id}"]`) ?? pane(id));
  h.update({ panes: opts(ids, p) });
};
const open = () =>
  [...frame.querySelectorAll<HTMLElement>("[data-sashay-pane]:not([data-offscreen]):not([data-closed])")]
    .map((p) => p.dataset.sashayPane)
    .sort()
    .join("");
const dragBy = (id: string, dx: number) => {
  const e = E(id);
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2;
  pointer(e, "pointerdown", x);
  pointer(e, "pointermove", x + dx / 2);
  pointer(e, "pointermove", x + dx);
  pointer(e, "pointercancel", x + dx); // no fling
};
const MIN = { minWidth: "280px" }; // three fill a 960px frame

beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  frame = mountFrame([]);
});
afterEach(() => {
  h.destroy();
  frame.remove();
});

describe("a pane that was closed stays closed", () => {
  const ways: [string, (id: string) => void][] = [
    ["close()", (id) => h.close(id)],
    [
      "edge click",
      (id) => {
        pointer(E(id), "pointerdown", 0);
        pointer(E(id), "pointerup", 0);
      },
    ],
    ["Enter", (id) => key(E(id), "Enter")],
    ["×", () => $("[data-sashay-close]").click()],
  ];
  for (const [how, shut] of ways)
    test(`${how}, then closing another doesn't bring it back`, () => {
      mount("abc", 1400, { layout: "48" });
      shut("c");
      expect(open()).toBe("ab");
      shut("b");
      expect(open()).toBe("a");
      h.reveal("b");
      h.reveal("c");
      expect(open()).toBe("abc");
    });
  test("closing the last pane doesn't open the first, nor the reverse", () => {
    mount("abc", 1400, { layout: "48" });
    h.close("a");
    h.close("c");
    expect(open()).toBe("b");
    mount("abc", 1400, { layout: "48" });
    h.close("c");
    h.close("a");
    expect(open()).toBe("b");
  });
  for (const order of ["abcde", "edcba", "cbdae"])
    test(`five, closed in turn: ${order}`, () => {
      mount("abcde", 1400, { defaultLayout: [0.2, 0.4, 0.6, 0.8] }, { focus: 0.2 });
      for (let i = 0; i < 4; i++) {
        h.close(order[i]);
        expect(open()).toBe([...order.slice(i + 1)].sort().join(""));
      }
      h.close(order[4]); // the last open pane stays
      expect(open()).toBe(order[4]);
    });
  test("shut by a drag, or an arrow key", () => {
    mount("abc", 1400, { layout: "48" }, { minWidth: "200px" });
    dragBy("b", -400);
    expect(open()).toBe("bc");
    h.close("c");
    expect(open()).toBe("b");
    mount("abc", 1400, { layout: "48" });
    for (let i = 0; i < 12 && open() === "abc"; i++) key(E("b"), "ArrowLeft");
    expect(open()).toBe("bc");
    h.close("c");
    expect(open()).toBe("b");
  });
  test("a drag that shuts two brings neither back", () => {
    mount("abc", 1400, { layout: "48" }, { minWidth: "200px" });
    dragBy("c", -950);
    expect(open()).toBe("c");
  });
  test("closing a closed pane again changes nothing", () => {
    mount("abc", 1400, { layout: "48" });
    h.close("c");
    h.close("c");
    h.close("a");
    expect(open()).toBe("b");
  });
  test("onClose fires only for the pane closed; × stays while two are open", () => {
    const onClose = vi.fn();
    mount("abc", 1400, { layout: "48", onClose });
    $("[data-sashay-close]").click();
    expect($("[data-sashay-close]").hidden).toBe(false);
    $("[data-sashay-close]").click();
    expect(onClose.mock.calls).toEqual([["c"], ["b"]]);
    expect($("[data-sashay-close]").hidden).toBe(true);
  });
});

describe("a pane that began closed stays closed", () => {
  for (const [what, o] of Object.entries({ layout: { layout: "6c" }, defaultLayout: { defaultLayout: [0.5, 1] } }))
    test(what, () => {
      mount("abc", 1400, o);
      h.close("a");
      expect(open()).toBe("b");
    });
  test("setLayout, fit", () => {
    mount("abc", 1400, { layout: "48" });
    h.setLayout("6c");
    h.close("a");
    expect(open()).toBe("b");
    mount("abc", 1400, { layout: "48" });
    h.fit([0.5, 1]);
    h.close("a");
    expect(open()).toBe("b");
  });
  test("compactLayout, and the frame can't end with nothing open", () => {
    mount("abc", 400, { compactLayout: [1, 1] });
    h.close("a");
    expect(open()).toBe("a");
    list("bc"); // the only open pane is removed: one of the rest must open
    expect(open()).toHaveLength(1);
  });
  test("opened by an opensTo layout, then closed", () => {
    mount("abc", 1400, { layout: "cc" }, { opensTo: [0.25, 0.5] });
    h.reveal("c");
    expect(open()).toBe("abc");
    h.close("b");
    h.close("c");
    expect(open()).toBe("a");
  });
  test("its neighbours take the space", () => {
    mount("abc", 1400, { layout: "6c" });
    h.close("b");
    expect(h.layout).toBe("cc");
  });
  test("a removal doesn't open it", () => {
    mount("abc", 1400, { layout: "6c" });
    list("ac");
    expect(open()).toBe("a");
    list("acd");
    list("ac");
    expect(open()).toBe("a");
  });
  test("replacing the only open pane doesn't open it", () => {
    mount("abc", 1400, { layout: "0c" });
    expect(open()).toBe("b");
    list("adc");
    expect(open()).toBe("d");
  });
  test("a reorder resets to the default, closed panes too", () => {
    mount("abc", 1400, { defaultLayout: [0.5, 1] });
    h.reveal("c");
    list("acb");
    expect(open()).toBe("ac");
    h.close("c");
    expect(open()).toBe("a");
  });
});

describe("a pane sashay pushed shut comes back", () => {
  const four = () => mount("abcd", 960, { layout: "48c" }, MIN);
  test("undo of a reveal", () => {
    four();
    h.reveal("d");
    expect(open()).toBe("bcd");
    h.close("d");
    expect(open()).toBe("abc");
  });
  test("with opensTo", () => {
    mount("abc", 960, { layout: "6c" }, { opensTo: [0, 0.5] });
    h.reveal("c");
    expect(open()).toBe("bc");
    h.close("c");
    expect(open()).toBe("ab");
  });
  test("but not one closed meanwhile", () => {
    four();
    h.reveal("d");
    h.close("b"); // a, pushed shut, takes its place
    expect(open()).toBe("acd");
    h.close("d");
    expect(open()).toBe("ac");
  });
  test("nor one closed while it is pushed shut", () => {
    four();
    h.reveal("d");
    h.close("a");
    h.close("d");
    expect(open()).toBe("bc");
  });
  test("rapid opens", () => {
    mount("abcde", 960, { layout: "48cc" }, MIN);
    h.reveal("d");
    h.reveal("e");
    expect(open()).toBe("cde");
    h.close("e");
    expect(open()).toBe("bcd");
    h.close("d");
    expect(open()).toBe("abc");
    h.close("c");
    expect(open()).toBe("ab");
  });
  test("by an added pane; the same id again starts afresh", () => {
    mount("abc", 960, { layout: "48" }, MIN);
    for (let i = 0; i < 2; i++) {
      list("abcd", MIN);
      expect(open()).toBe("bcd");
      list("abc", MIN);
      expect(open()).toBe("abc");
    }
    list("abcd", MIN);
    h.close("d");
    list("abc", MIN);
    list("abcd", MIN);
    expect(open()).toBe("bcd");
    h.reveal("a"); // pushes d
    expect(open()).toBe("abc");
    h.close("b");
    expect(open()).toBe("acd");
  });
  test("removing the only open pane prefers it over one that began closed", () => {
    mount("abc", 400, { compactLayout: [1, 1] });
    h.reveal("c");
    expect(open()).toBe("c");
    list("ab");
    expect(open()).toBe("a");
  });
  test("a close mid-drag settles the drag first", () => {
    mount("abc", 1400, { layout: "48" }, { minWidth: "200px" });
    const x = E("b").getBoundingClientRect().left + 6;
    pointer(E("b"), "pointerdown", x);
    pointer(E("b"), "pointermove", x - 200);
    pointer(E("b"), "pointermove", x - 450);
    h.close("c");
    expect(open()).toBe("b");
  });
  test("a setLayout of the layout already showing forgets nothing", () => {
    four();
    h.reveal("d");
    h.setLayout(h.layout);
    h.close("d");
    expect(open()).toBe("abc");
  });
  test("nor does a remount on the same frame with the same layout", () => {
    four();
    h.reveal("d");
    const { layout } = h;
    h.destroy();
    h = createSashay(frame, { panes: opts("abcd", MIN), layout });
    h.close("d");
    expect(open()).toBe("abc");
    h.reveal("d");
    h.destroy();
    h = createSashay(frame, { panes: opts("abcd", MIN), layout: "06c" }); // another: from its code alone
    h.close("b");
    expect(open()).toBe("c");
  });
});

describe("the spine", () => {
  const ID = "abcdefghij";
  const deep = (to: number, from = 1) => {
    for (let n = from + 1; n <= to; n++) list(ID.slice(0, n));
  };
  // Between these widths a frame's edges tip the grid as it deepens, so the count it fits varies.
  for (const width of [320, 500, 700, 960, 1400, 2000])
    for (const minWidth of [undefined, "12rem"] as const)
      test(`${width}px, minWidth ${minWidth}: drilling down and back retraces`, () => {
        mount("a", width, {}, { minWidth });
        const seen = [];
        for (let n = 2; n <= 10; n++) {
          seen.push(open());
          list(ID.slice(0, n), { minWidth });
          expect(open()).toContain(ID[n - 1]);
        }
        for (let n = 9; n; n--) {
          list(ID.slice(0, n), { minWidth });
          expect(open(), `back to ${n}`).toContain(ID[n - 1]);
          if (width !== 500 && width !== 700) expect(open(), `back to ${n}`).toBe(seen[n - 1]);
        }
      });
  test("closing then popping the leaf", () => {
    mount("a", 960);
    deep(8);
    for (let n = 7; n >= 4; n--) {
      $("[data-sashay-close]").click();
      list(ID.slice(0, n));
    }
    expect(open()).toBe("bcd");
    list("abc");
    expect(open()).toBe("abc");
  });
  test("popping several", () => {
    mount("a", 960);
    deep(8);
    list("abcdefg");
    list("abcd");
    expect(open()).toBe("bcd");
    list("abc");
    expect(open()).toBe("abc");
  });
  test("after a spine jump, panes in the right spine come back", () => {
    mount("a", 960);
    deep(8);
    h.reveal("b");
    expect(open()).toBe("bcd");
    h.close("b");
    expect(open()).toBe("acd");
    h.close("c");
    expect(open()).toBe("ade");
    h.close("a");
    expect(open()).toBe("def");
  });
  test("a closed pane folded into the spine is passed over, and shows its edge again", () => {
    mount("a", 960);
    deep(3);
    h.close("b");
    deep(7, 3);
    expect(open()).toBe("efg");
    for (let n = 6; n >= 3; n--) list(ID.slice(0, n));
    expect(open()).toBe("ac");
    expect(E("b")).not.toBeNull();
    h.reveal("b");
    expect(open()).toBe("abc");
  });
  test("a spine jump doesn't open a closed pane", () => {
    mount("a", 960);
    deep(3);
    h.close("c");
    deep(8, 3);
    h.reveal("b");
    expect(open()).toBe("bde");
  });
});
