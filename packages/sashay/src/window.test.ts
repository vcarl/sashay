import { describe, expect, it } from "vitest";
import {
  close,
  decodeLayout,
  defaultView,
  diff,
  encodeLayout,
  insert,
  normalize,
  remove,
  reveal,
  type SizesFor,
  type View,
} from "./window.ts";

const S0 =
  (focus: number[]): SizesFor =>
  (a, b) => ({ focus: focus.slice(a, b), min: Array(b - a).fill(0), max: Array(b - a).fill(1) });
const F = Array(1000).fill(1 / 3);
const push = (v: View, n: number, order: number) => reveal(insert(v, n), n, n + 1, S0(F), order);

describe("normalize", () => {
  // Lead decision 2: closed panes keep their edges; only overflow from a reveal folds.
  it("never folds closed panes", () =>
    expect(normalize({ offset: 0, div: [0, 0, 4, 12, 12] }, 6)).toEqual({ offset: 0, div: [0, 0, 4, 12, 12] }));
  it("keeps a lone closed first pane at offset 0", () =>
    expect(normalize({ offset: 0, div: [0, 8] }, 3)).toEqual({ offset: 0, div: [0, 8] }));
  it("keeps a leading closed pane once a spine exists", () =>
    expect(normalize({ offset: 3, div: [0, 6] }, 6)).toEqual({ offset: 3, div: [0, 6] }));
  it("adds one trailing closed edge when panes follow", () =>
    expect(normalize({ offset: 2, div: [6] }, 6)).toEqual({ offset: 2, div: [6, 12] }));
});

describe("stack", () => {
  it("pushes fold the oldest into the spine", () => {
    let v: View = { offset: 0, div: [] };
    const seen = [];
    for (let n = 1; n < 6; n++) {
      v = push(v, n, 6);
      seen.push(v);
    }
    expect(seen).toEqual([
      { offset: 0, div: [8] },
      { offset: 0, div: [4, 8] },
      { offset: 0, div: [0, 4, 8] },
      { offset: 2, div: [4, 8] },
      { offset: 3, div: [4, 8] },
    ]);
  });
  it("1,000 pushes keep a 3-pane window", () => {
    let v: View = { offset: 0, div: [] };
    for (let n = 1; n < 1000; n++) v = push(v, n, 6);
    expect(v).toEqual({ offset: 997, div: [4, 8] });
  });
  const six = { offset: 3, div: [4, 8] };
  it("spine reveal takes the newest hidden pane", () =>
    expect(reveal(six, 2, 6, S0(F), 6)).toEqual({ offset: 2, div: [4, 8, 12] }));
  it("again", () =>
    expect(reveal({ offset: 2, div: [4, 8, 12] }, 1, 6, S0(F), 6)).toEqual({ offset: 1, div: [4, 8, 12] }));
  it("same at order 4", () => expect(reveal(six, 2, 6, S0(F), 4)).toEqual({ offset: 2, div: [4, 8, 12] }));
  // A spine tab: the window starts at the pane and keeps three open; 4 and 5 follow it, hidden.
  it("non-adjacent reveal jumps and keeps the open count", () =>
    expect(reveal(six, 0, 6, S0(F), 6)).toEqual({ offset: 0, div: [4, 8, 12] }));
  it("a jump to the last pane opens the panes before it", () =>
    expect(reveal({ offset: 0, div: [4, 8, 12] }, 5, 6, S0(F), 6)).toEqual({ offset: 3, div: [4, 8] }));
  // Closing keeps the open count: the newest spine pane unfolds.
  it("close the leaf keeps its edge and unfolds the spine", () =>
    expect(close(six, 5, 6, S0(F), 6)).toEqual({ offset: 2, div: [4, 8, 12] }));
  it("pop gives width to the neighbour", () => expect(remove(six, 5, 5, S0(F), 6)).toEqual({ offset: 3, div: [4] }));
  it("removing a spine pane shifts the offset", () =>
    expect(remove(six, 1, 5, S0(F), 6)).toEqual({ offset: 2, div: [4, 8] }));
  it("removing the first window pane", () => expect(remove(six, 3, 5, S0(F), 6)).toEqual({ offset: 3, div: [8] }));
});

// The house demo at order 2 (two panes at focus 1/3 fill the frame): a navigation stack.
describe("open count", () => {
  const count = (v: View) => {
    const d = [0, ...v.div, 12];
    return d.slice(1).filter((x, k) => x > d[k]).length;
  };
  // Spine holds h, p, d; md is closed in the window; hatbox and envelope are open.
  const house: View = { offset: 3, div: [0, 6] };
  it("closing the leaf with a non-empty spine unfolds the nearest collapsed pane", () => {
    const v = close(house, 5, 6, S0(F), 2);
    expect(count(v)).toBe(2);
    expect(v).toEqual({ offset: 3, div: [6, 12] });
  });
  it("removing the leaf via diff with a non-empty spine keeps the count", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
    const sz = (panes: { id: string }[], a: number, b: number) => S0(Array(panes.length).fill(1 / 3))(a, b);
    const v = diff(ids(6), ids(5), house, 2, sz) as View;
    expect(count(v)).toBe(2);
    expect(v).toEqual({ offset: 3, div: [6] });
  });
  it("below capacity, opening adds", () => {
    const v = reveal(insert({ offset: 0, div: [6] }, 2), 2, 3, S0(F), 3);
    expect(v).toEqual({ offset: 0, div: [4, 8] });
  });
  it("at capacity, opening collapses the outermost", () => {
    const v = reveal(insert({ offset: 0, div: [6] }, 2), 2, 3, S0(F), 2);
    expect(v).toEqual({ offset: 0, div: [0, 6] });
  });
});

describe("workspace", () => {
  const W = S0([0.2, 0.2, 0.2, 0.25]);
  it("below capacity: append takes from the first pane first, closing none", () =>
    expect(reveal(insert({ offset: 0, div: [4, 8] }, 3), 3, 4, W, 6)).toEqual({ offset: 0, div: [2, 5, 9] }));
  it("insert in the middle", () =>
    expect(reveal(insert({ offset: 0, div: [4, 8] }, 1), 1, 4, S0([0.2, 0.25, 0.2, 0.2]), 6)).toEqual({
      offset: 0,
      div: [4, 7, 10],
    }));
  it("remove middle", () =>
    expect(remove({ offset: 0, div: [4, 8] }, 1, 2, S0([0.2, 0.2, 0.2]), 6)).toEqual({ offset: 0, div: [8] }));
  it("remove the only open pane", () =>
    expect(remove({ offset: 0, div: [0, 12] }, 1, 2, S0([0.2, 0.2, 0.2]), 6)).toEqual({ offset: 0, div: [12] }));
  it("remove the last pane", () =>
    expect(remove({ offset: 0, div: [] }, 0, 0, S0([]), 6)).toEqual({ offset: 0, div: [] }));
  it("closing the first two shows no spine; the second reopens the first", () => {
    const a = close({ offset: 0, div: [4, 8] }, 0, 3, S0([0.2, 0.2, 0.2]), 6);
    expect(a).toEqual({ offset: 0, div: [0, 8] });
    expect(close(a, 1, 3, S0([0.2, 0.2, 0.2]), 6)).toEqual({ offset: 0, div: [2, 2] });
  });
  // Same donor order as a drag: outermost first, to min, then the next.
  const M: SizesFor = (a, b) => ({
    focus: [0.5, 0.2, 0.2].slice(a, b),
    min: Array(b - a).fill(0.15),
    max: Array(b - a).fill(1),
  });
  it("revealing a covered first pane takes from #3 before #2", () =>
    expect(reveal({ offset: 0, div: [0, 6] }, 0, 3, M, 6)).toEqual({ offset: 0, div: [6, 10] }));
  it("reopening a closed pane keeps the others' edges", () =>
    expect(reveal({ offset: 0, div: [0, 0] }, 0, 3, S0([0.2, 0.2, 0.2]), 6).offset).toBe(0));
});

describe("diff", () => {
  const ids = (s: string) => [...s].map((id) => ({ id }));
  const sz = (panes: { id: string }[], a: number, b: number) => S0(Array(panes.length).fill(1 / 3))(a, b);
  it("append = push", () =>
    expect(diff(ids("abcde"), ids("abcdef"), { offset: 2, div: [4, 8] }, 6, sz)).toEqual({ offset: 3, div: [4, 8] }));
  it("an added pane takes from #1 before #2", () => {
    const sz = (_: unknown, a: number, b: number) => ({
      focus: [0.2, 0.2, 0.5].slice(a, b),
      min: Array(b - a).fill(0.15),
      max: Array(b - a).fill(1),
    });
    expect(diff(ids("ab"), ids("abc"), { offset: 0, div: [6] }, 6, sz)).toEqual({ offset: 0, div: [2, 6] });
  });
  it("pop unfolds the newest spine pane", () =>
    expect(diff(ids("abcdef"), ids("abcde"), { offset: 3, div: [4, 8] }, 6, sz)).toEqual({ offset: 2, div: [4, 8] }));
  it("unchanged ids → same view", () =>
    expect(diff(ids("abc"), ids("abc"), { offset: 0, div: [4, 8] }, 6, sz)).toEqual({ offset: 0, div: [4, 8] }));
  it("reorder → null", () => expect(diff(ids("abc"), ids("acb"), { offset: 0, div: [4, 8] }, 6, sz)).toBeNull());
  it("window gone → null", () => expect(diff(ids("abcdef"), ids("ab"), { offset: 3, div: [4, 8] }, 6, sz)).toBeNull());
  it("from empty → null", () => expect(diff(ids(""), ids("a"), { offset: 0, div: [] }, 6, sz)).toBeNull());
});

describe("defaultView", () => {
  it("equal split", () => expect(defaultView(3)).toEqual({ offset: 0, div: [4, 8] }));
  it("quarters", () => expect(defaultView(4)).toEqual({ offset: 0, div: [3, 6, 9] }));
  it("deep: last six", () => expect(defaultView(1000)).toEqual({ offset: 994, div: [1, 4, 6, 8, 11] }));
  it("defaultLayout", () => expect(defaultView(2, [2 / 3])).toEqual({ offset: 0, div: [8] }));
  it("defaultLayout of the wrong length is ignored", () =>
    expect(defaultView(3, [0.5])).toEqual({ offset: 0, div: [4, 8] }));
  it("no panes", () => expect(defaultView(0)).toEqual({ offset: 0, div: [] }));
});

describe("layout code", () => {
  const none = () => false;
  it("encodes", () => {
    expect(encodeLayout({ offset: 0, div: [4, 8] }, [])).toBe("48");
    expect(encodeLayout({ offset: 0, div: [8, 12] }, [false, false])).toBe("8c.0");
    expect(encodeLayout({ offset: 997, div: [4, 8] }, [])).toBe("997-48");
    expect(encodeLayout({ offset: 5, div: [] }, [])).toBe("5-");
    expect(encodeLayout({ offset: 0, div: [6] }, [true, false, false, false, true])).toBe("6.11");
  });
  it("round-trips", () => {
    const d = (p: number) => p < 2;
    expect(decodeLayout("8c.2", 3, d)).toEqual({ view: { offset: 0, div: [8, 12] }, drawers: [false, true] });
    expect(decodeLayout("997-48", 1000, none)).toEqual({ view: { offset: 997, div: [4, 8] }, drawers: [] });
    expect(decodeLayout("", 1, none)).toEqual({ view: { offset: 0, div: [] }, drawers: [] });
    expect(decodeLayout("6.11", 2, () => true)).toBeNull();
  });
  it("rejects", () => {
    const d = (p: number) => p < 2;
    for (const [code, n, has] of [
      ["997-48", 999, none],
      ["0-48", 3, none],
      ["84", 3, none],
      ["d", 2, none],
      ["48", 2, none],
      ["8c", 3, d],
      ["8c.4", 3, d],
      ["48.0", 3, none],
      ["48.00", 3, d],
      [null, 3, none],
      ["4-8", 3, none],
    ] as const)
      expect(decodeLayout(code, n, has), String(code)).toBeNull();
  });
});
