import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8");
const themes = [...css.matchAll(/\[data-sashay-theme="(\w+)"\] \{(.*?)\n {2}\}/gs)].map(([, name, body]) => ({
  name,
  body,
  vars: new Map([...body.matchAll(/--sashay-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]])),
}));

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

it("six themes", () => expect(themes.map((t) => t.name)).toHaveLength(6));

describe.each(themes)("$name", ({ vars, body }) => {
  it("sets every variable the others do, and a colour scheme", () => {
    expect([...vars.keys()].sort()).toEqual([...themes[0].vars.keys()].sort());
    expect(body).toMatch(/color-scheme: (light|dark);/);
  });

  const v = (k: string) => vars.get(k) as string;
  const edge = v("edge-image").match(/#\w{6}/g) ?? [];
  it.each([
    ["fg", [v("bg"), v("raised-bg"), ...edge], 4.5],
    ["muted", [v("bg"), v("raised-bg"), ...edge], 4.5], // compact tabs lie over the edge image
    ["pane-fg", [v("pane-bg")], 4.5],
    ["pane-muted", [v("pane-bg")], 4.5],
    ["accent", [v("bg"), v("raised-bg"), v("pane-bg")], 3],
    ["grip", [v("bg"), ...edge], 3],
  ] as const)("%s stands out from what's behind it", (k, behind, min) => {
    for (const b of behind) expect(contrast(v(k), b), `${k} on ${b}`).toBeGreaterThanOrEqual(min);
  });
});
