import { describe, expect, it } from "vitest";
import {
  closePane,
  decode,
  drag,
  encode,
  fit,
  focusPane,
  focusShift,
  gridOrder,
  isOpen,
  nearest,
  ratio,
  releaseTarget,
  type Sizes,
  SNAPS,
  settle,
  toWidths,
  velocity,
} from "./engine.ts";

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((x, k) => {
    expect(x).toBeCloseTo(b[k], 9);
  });
};
const F = [0.2, 0.2, 0.2];
const Z = [0, 0, 0];
const ONE = [1, 1, 1];
const S0: Sizes = { focus: F, min: Z, max: ONE };
const SM: Sizes = { focus: F, min: [0.15, 0.15, 0.15], max: ONE };
// The app's panes at an 800px content width: scatter / results / details.
const C = 800;
const APP: Sizes = { focus: [0.4, 0.25, 1 / 3], min: [180 / C, 150 / C, 180 / C], max: [1, 460 / C, 560 / C] };
const widthsOf = (idx: number[]) => toWidths(idx.map((k) => SNAPS[k].v));

describe("snaps and persistence", () => {
  it("13 snaps, 0 → 1", () => {
    expect(SNAPS).toHaveLength(13);
    expect(SNAPS[0].v).toBe(0);
    expect(SNAPS[12].v).toBe(1);
  });
  it("1:1:1 is 1/3, 2/3", () => expect(ratio([4, 8])).toBe("1:1:1"));
  it("1:4:1 in sixths", () => expect(ratio([1, 11])).toBe("1:4:1"));
  it("grid by device: iPhone one pane, iPad portrait thirds, wide desktop sixths", () => {
    expect(gridOrder(390 - 44 - 12 - 12)).toBe(1);
    expect(gridOrder(768 - 100)).toBe(3);
    expect(gridOrder(1440 - 100)).toBe(6);
  });
  it("order 1 → only 0/1", () => {
    expect(nearest(1 / 3, 1)).toBe(0);
    expect(nearest(0.7, 1)).toBe(12);
  });
  it("encode/decode round-trip", () => {
    expect(decode(encode([4, 8], [[true, false, false]]), 2, [3])).toEqual({
      div: [4, 8],
      bits: [[true, false, false]],
    });
  });
  it("decode rejects junk", () => {
    for (const s of ["zz0", "840", "d00", "48f"]) expect(decode(s, 2, [3])).toBeNull();
  });
});

describe("drag", () => {
  it("grow details: chart gives first, outermost", () => near(drag([0.3, 0.6], 1, 0.4, S0), [0.1, 0.4]));
  it("grow details leftward: chart goes past focus to min before the list moves", () =>
    near(drag([0.3, 0.6], 1, 0.45, SM), [0.15, 0.45]));
  it("grow chart rightward: details goes to min before the list moves", () =>
    near(drag([0.3, 0.6], 0, 0.45, SM), [0.45, 0.75]));
  it("…then chart goes, outermost", () => near(drag([0.3, 0.6], 1, 0.2, S0), [0, 0.2]));
  it("grow chart: details gives way before the list", () => near(drag([0.2, 0.6], 0, 0.4, S0), [0.4, 0.8]));
  it("grow chart from 1:3:2: details shrinks to its min, list untouched", () => {
    const S = { focus: [0.4, 0.25, 1 / 3], min: [0.15, 0.15, 0.15], max: ONE };
    near(drag([1 / 6, 2 / 3], 0, 1 / 3, S), [1 / 3, 5 / 6]); // details 1/3 → 1/6; list keeps 1/2
  });
  it("grow list leftward: details untouched", () => near(drag([0.4, 0.8], 0, 0.2, S0), [0.2, 0.8]));
  it("closed chart stays closed", () => near(drag([0, 0.2], 1, 0.6, S0), [0, 0.6]));
  it("min: all trim to min before any goes under", () => near(drag([0.3, 0.6], 1, 0.3, SM), [0.15, 0.3]));
  it("min: under it shrinks smoothly (no jump)", () => near(drag([0.3, 0.6], 1, 0.25, SM), [0.1, 0.25]));
  // A maximum limits panes grown as a side effect; it never stops a drag.
  const LISTMAX = { ...S0, max: [1, 0.3, 1] };
  it("max: the pane beside the dragged edge grows past it; details stays put", () =>
    near(drag([0.6, 0.8], 0, 0.2, LISTMAX), [0.2, 0.8]));
  it("max: growing the list from its right edge pushes details, not the chart", () =>
    near(drag([1 / 6, 2 / 3], 1, 0.8, LISTMAX), [1 / 6, 0.8]));
  it("max: still limits panes grown as a side effect (closing one)", () =>
    expect(closePane([0.2, 0.5], 2, { ...LISTMAX, max: [1, 0.4, 1] }, 6)).toEqual([7, 12])); // list stops at 0.4, chart takes the rest
  it("max: release lets the chart shrink below half with the list capped", () => {
    const C = 1100;
    const S = { focus: [0.4, 0.25, 1 / 3], min: [180 / C, 150 / C, 180 / C], max: [1, 460 / C, 560 / C] };
    expect(settle([2 / 3, 1], 0, 0.2, 0, 6, S)).toEqual([2, 12]);
  });
});

describe("settle", () => {
  it("min: snapped too small → closes on release", () => {
    expect(settle([1 / 3, 2 / 3], 1, 0.62, 0, 6, { ...S0, min: [0, 0, 0.45] })).toEqual([3, 12]);
  });
  it("min: pane held at min doesn't round shut", () => {
    expect(widthsOf(settle([1 / 3, 2 / 3], 0, 0.66, 0, 6, APP)).filter(isOpen)).toHaveLength(2);
  });
  it("min: closing pane's space goes to its neighbour, edge stays on its snap", () => {
    expect(settle([1 / 3, 2 / 3], 0, 0.6, 0, 6, APP)).toEqual([7, 12]);
  });
  it("viable: won't close a pane into another's max", () => {
    expect(settle([1 / 3, 2 / 3], 1, 0.8, 0, 6, APP)).toEqual([4, 9]); // details keeps 200px at 3/4
  });
  it("max: snap won't round past it", () => {
    expect(settle([1 / 3, 2 / 3], 1, 0.62, 0, 6, { ...S0, max: [1, 1, 0.4] })).toEqual([3, 7]);
  });
  it("max: a lone grower's max doesn't stop the release", () => {
    expect(settle([1 / 3, 2 / 3], 1, 0.5, 0, 6, { ...S0, max: [1, 1, 0.45] })).toEqual([1, 6]);
  });

  // Slow releases of both dividers from 1:1:1, swept across the frame.
  const sweep = (check: (live: number[], out: number[], at: string) => void) => {
    const start = [1 / 3, 2 / 3];
    for (const i of [0, 1])
      for (let r = 0; r <= 200; r++) {
        const raw = r / 200;
        check(
          toWidths(drag(start, i, raw, APP)),
          widthsOf(settle(start, i, raw, 0, 6, APP)),
          `divider ${i} raw ${raw}`,
        );
      }
  };
  it("from 1:1:1 a release that closes a pane leaves every open pane ≥ min, and ≤ max unless the drag forced it", () => {
    sweep((live, out, at) => {
      if (out.every(isOpen)) return;
      out.forEach((w, k) => {
        if (!isOpen(w)) return;
        expect(w, `${at}: pane ${k} under min`).toBeGreaterThanOrEqual(APP.min[k] - 1e-9);
        expect(w, `${at}: pane ${k} over max`).toBeLessThanOrEqual(Math.max(APP.max[k], live[k]) + 1e-9);
      });
    });
  });
  // e.g. divider 0 released at raw 0.56 (live 448/172/180px) must not land on 3/5 and close details.
  it("from 1:1:1 a slow release never closes a pane that was at or above its minimum", () => {
    sweep((live, out, at) => {
      live.forEach((w, k) => {
        if (w >= APP.min[k] - 1e-9) expect(isOpen(out[k]), `${at}: pane ${k} closed`).toBe(true);
      });
    });
  });
});

describe("focus and close", () => {
  it("390px phone: 1:3:2 rounds details shut, so opening falls back to focusPane, which shows it", () => {
    const C = 390 - 44 - 12 - 12;
    const o = gridOrder(C);
    const S = { focus: [0.4, 0.25, 1 / 3], min: [180 / C, 150 / C, 180 / C], max: [1, 460 / C, 560 / C] };
    const shown = (idx: number[]) => isOpen(toWidths(idx.map((k) => SNAPS[k].v))[2]);
    // biome-ignore lint/suspicious/noFocusedTests: the engine's fit(), not vitest's
    expect(shown(fit([1 / 6, 2 / 3], S, o))).toBe(false);
    expect(shown(focusPane([2 / 3, 1], 2, S, o))).toBe(true);
  });
  it("max: focus is capped", () => {
    expect(focusPane([1 / 3, 1], 2, { focus: [0.4, 0.25, 0.5], min: Z, max: [1, 1, 1 / 3] }, 6)).toEqual([0, 8]);
  });
  it("close details → list takes it", () => expect(closePane([1 / 3, 2 / 3], 2, S0, 6)).toEqual([4, 12]));
  it("focus details from hidden: the outermost pane gives first", () => {
    expect(focusPane([1 / 3, 1], 2, { ...S0, focus: [0.4, 0.25, 1 / 3] }, 6)).toEqual([0, 8]);
  });
  // Opening takes like a drag: outermost to min, then the next, then to zero.
  const OPEN: Sizes = { focus: [0.2, 0.2, 0.5], min: [0.15, 0.15, 0.15], max: ONE };
  it("opening #3 takes from #1 before #2", () => expect(focusPane([0.5, 1], 2, OPEN, 6)).toEqual([1, 6]));
  it("opening #1 takes from #3 before #2", () =>
    expect(focusPane([0, 0.5], 0, { ...OPEN, focus: [0.5, 0.2, 0.2] }, 6)).toEqual([6, 11]));
  it("focus at order 1 = whole frame", () => {
    expect(focusPane([1 / 3, 1], 2, { ...S0, focus: [0.4, 0.25, 1 / 3] }, 1)).toEqual([0, 0]);
  });
  it("focus is a no-op when big enough", () => expect(focusPane([1 / 3, 2 / 3], 1, S0, 6)).toEqual([4, 8]));
});

describe("fling", () => {
  it("slow → nearest", () => expect(releaseTarget(0.36, 0.1, 6)).toBe(4));
  it("fast → next beyond", () => expect(releaseTarget(0.36, 0.8, 6)).toBe(5));
  it("faster → two over", () => {
    expect(releaseTarget(0.36, 2, 6)).toBe(6);
    expect(releaseTarget(0.36, -2, 6)).toBe(3);
  });
  it("pause before release = 0 velocity", () => {
    expect(
      velocity(
        [
          { t: 0, x: 0 },
          { t: 10, x: 50 },
        ],
        200,
      ),
    ).toBe(0);
  });
});

it("focus point stays visible", () => {
  const s = focusShift(600, 200, 0.9);
  expect(540 - s).toBeGreaterThanOrEqual(0);
  expect(540 - s).toBeLessThanOrEqual(200);
});
