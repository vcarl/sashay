import { afterEach, beforeEach, expect, test } from "vitest";
import { checkLength, createMeasure } from "./length.js";

let frame: HTMLElement;
beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  frame = document.createElement("div");
  frame.style.cssText = "position:relative;width:800px;font-size:16px";
  document.body.append(frame);
});
afterEach(() => frame.remove());

test("resolves numbers and CSS lengths", () => {
  const m = createMeasure(frame);
  expect(m.px(30)).toBe(30);
  expect(m.px("12rem")).toBe(192);
  expect(m.px("30%")).toBe(240);
  frame.style.setProperty("--rail", "50px");
  expect(m.px("var(--rail)")).toBe(50);
  const c = m.px("clamp(10rem, 20vw, 18rem)");
  expect(c).toBeGreaterThanOrEqual(160);
  expect(c).toBeLessThanOrEqual(288);
});

test("% resolves against a given reference width", () => {
  const m = createMeasure(frame);
  expect(m.px("40%", 500)).toBe(200);
  expect(m.px("40%")).toBe(320);
  expect(m.px("3rem", 500)).toBe(48);
});

test("caches until clear()", () => {
  const m = createMeasure(frame);
  expect(m.px("30%")).toBe(240);
  frame.style.width = "1000px";
  expect(m.px("30%")).toBe(240);
  m.clear();
  expect(m.px("30%")).toBe(300);
});

test("checkLength rejects invalid values", () => {
  expect(() => checkLength("12 parsecs")).toThrow(TypeError);
  expect(() => checkLength(-1)).toThrow(TypeError);
  expect(() => checkLength(Number.NaN)).toThrow(TypeError);
  for (const k of [
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
    "auto",
    "fit-content",
    "min-content",
    "max-content",
    " Auto ",
  ])
    expect(() => checkLength(k)).toThrow(TypeError);
  expect(() => checkLength("0")).not.toThrow();
  expect(() => checkLength(0)).not.toThrow();
});

test("destroy removes the probe", () => {
  const m = createMeasure(frame);
  m.px("1rem");
  expect(frame.querySelector("[data-sashay-probe]")).not.toBeNull();
  m.destroy();
  expect(frame.querySelector("[data-sashay-probe]")).toBeNull();
});
