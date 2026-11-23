/*
 * The tour: one walk through sashay's features on the built site, recorded as a video.
 * It is a real test (every beat asserts) and also meant to be watchable as a demo, so it uses
 * real mouse and keyboard input, eased mouse moves, a drawn cursor, and pauses between beats.
 * Retune the pacing in BEATS below.
 *
 *   pnpm site:build && pnpm test:e2e      video: apps/site/test-results/<test>/video.webm
 *
 * | Time      | Beat |
 * |-----------|------|
 * | 0:00–0:04 | Landing hero loads. Hold. |
 * | 0:04–0:07 | Slow drag on the first edge, to 1/4: it snaps and `?layout=` changes. |
 * | 0:07–0:09 | A throw back right: the bow shows, and it lands past the release point (at 1/2). |
 * | 0:09–0:11 | Click the edge: Why closes. |
 * | 0:11–0:14 | Deep link: reload at `?layout=<code>`; the same arrangement (Why closed) comes back. |
 * | 0:14–0:16 | Click the edge again: Why reopens at its focus, 1/4. |
 * | 0:16–0:19 | Scroll to "See it work", click through to the Demos page. |
 * | 0:19–0:22 | Plants: pick a dot; Nearby opens and the URL bar gets `plant=`. |
 * | 0:22–0:27 | Drag Nearby over the chart: the dot stays in the visible slice. Drag back to 2/3. |
 * | 0:27–0:30 | Open the card from the list: it opens at 1:1:1. |
 * | 0:30–0:38 | House: scroll down, drill 6 levels, the spine fills. Click Parlour to jump back. |
 * | 0:38–0:40 | Keyboard: focus an edge, press → twice; it steps snaps (`aria-valuenow`). |
 * | 0:40–0:46 | Resize to 390×800: compact tab strip, tap a tab, open the Window drawer as a sheet. |
 *
 * Changes from the brief: the deep link comes straight after the hero (it reloads the hero's
 * own `?layout=`; the demo apps never read the real URL), 1:1:1 comes from opening the card
 * after the squeeze (dragging three open panes back to thirds fights the far-side-first rule),
 * and the keyboard beat runs before the resize.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

// Pacing, in ms. `pause` is the gap between beats; `glide` the default mouse move.
const BEATS = {
  heroHold: 3000,
  glide: 600,
  pause: 700,
  slowDrag: 1400,
  dropHold: 200, // still before release, past the 90 ms velocity window: a drop, not a throw
  throw: 110,
  settle: 500,
  scroll: 900,
  click: 120, // between press and release
  drill: 450,
  key: 500,
} as const;

// A cursor and click ripple, since the video doesn't draw the pointer. It remembers its spot
// across page loads so it doesn't jump to a corner.
function cursorOverlay() {
  const KEY = "tour-cursor";
  const mount = () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;" +
      "background:rgb(27 26 23/.55);border:2px solid #fff;box-shadow:0 1px 6px rgb(0 0 0/.5);" +
      "z-index:2147483647;pointer-events:none;transition:scale .1s";
    const put = (x: number, y: number) => {
      dot.style.translate = `${x}px ${y}px`;
      sessionStorage.setItem(KEY, JSON.stringify([x, y]));
    };
    const [x, y] = JSON.parse(sessionStorage.getItem(KEY) ?? "[-40,-40]");
    put(x, y);
    document.documentElement.append(dot);
    addEventListener("pointermove", (e) => put(e.clientX, e.clientY), true);
    addEventListener(
      "pointerdown",
      (e) => {
        dot.style.scale = "0.75";
        const ring = document.createElement("div");
        ring.style.cssText = `${dot.style.cssText};background:none;border:3px solid #e85a40;box-shadow:none;translate:${e.clientX}px ${e.clientY}px`;
        document.documentElement.append(ring);
        ring.animate({ scale: [0.5, 2.6], opacity: [1, 0] }, { duration: 450, easing: "ease-out" }).onfinish = () =>
          ring.remove();
      },
      true,
    );
    addEventListener("pointerup", () => (dot.style.scale = "1"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
}

type Pt = { x: number; y: number };
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const linear = (t: number) => t;

let page: Page;
let at: Pt = { x: 640, y: 400 };
const pause = (ms: number = BEATS.pause) => page.waitForTimeout(ms);

// Move the mouse to `to` over `ms`, eased. As many steps as round trips allow.
async function glide(to: Pt, ms: number = BEATS.glide, ease = easeInOut) {
  const from = at;
  const t0 = Date.now();
  for (let t = 0; t < 1; t = Math.min(1, (Date.now() - t0) / ms)) {
    const k = ease(t);
    await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
  }
  await page.mouse.move(to.x, to.y);
  at = to;
}
const center = async (loc: Locator): Promise<Pt> => {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box: ${loc}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function click(target: Locator | Pt, ms?: number) {
  await glide("x" in target ? target : await center(target), ms);
  await page.mouse.down();
  await page.waitForTimeout(BEATS.click);
  await page.mouse.up();
}
// A drop: drag slowly to `to`, hold still, release.
async function drag(from: Pt, to: Pt, ms: number = BEATS.slowDrag) {
  await glide(from);
  await page.mouse.down();
  await glide(to, ms);
  await page.waitForTimeout(BEATS.dropHold);
  await page.mouse.up();
  await pause(BEATS.settle);
}
// Scroll with the wheel until `loc`'s top sits at `top`.
async function scrollTo(loc: Locator, top = 70) {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box: ${loc}`);
  const n = 12;
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, (b.y - top) / n);
    await page.waitForTimeout(BEATS.scroll / n);
  }
  await expect.poll(async () => Math.abs(((await loc.boundingBox())?.y ?? 0) - top)).toBeLessThan(4);
}

// Each pane's visible slice, [left, right]: from its edge's right side to the next edge's left.
const slices = (frame: Locator) =>
  frame.evaluate((f) => {
    const es = [...f.querySelectorAll("[data-sashay-edge]")].map((e) => e.getBoundingClientRect());
    return es.map((e, i) => [e.right, es[i + 1]?.left ?? f.getBoundingClientRect().right]);
  });
const widths = async (frame: Locator) => (await slices(frame)).map(([a, b]) => b - a);
const expectThirds = async (frame: Locator) => {
  const w = await widths(frame);
  expect(Math.max(...w) - Math.min(...w), `equal thirds: ${w}`).toBeLessThanOrEqual(2);
};
// A divider rests on a fraction with a denominator up to six.
const expectSnapped = (now: number) =>
  expect(
    [1, 2, 3, 4, 5, 6].some((d) =>
      Array.from({ length: d + 1 }, (_, n) => (100 * n) / d).some((f) => Math.abs(f - now) <= 1),
    ),
    `${now} is on a snap`,
  ).toBe(true);
const valueNow = async (sep: Locator) => Number(await sep.getAttribute("aria-valuenow"));
// The point where edge k (1 or 2) lands its divider at fraction f of the frame's content.
async function edgeAt(frame: Locator, k: number, f: number): Promise<Pt> {
  const es = await frame.locator("[data-sashay-edge]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const total = (await widths(frame)).reduce((s, w) => s + w, 0);
  return {
    x: es[0].right + f * total + (k === 2 ? es[1].width : 0) + es[k].width / 2,
    y: es[k].top + es[k].height / 2,
  };
}

test("tour", async ({ page: p }) => {
  page = p;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(cursorOverlay);

  // 0:00 Landing hero loads. Hold.
  await page.goto("./");
  const hero = page.locator("#hero[data-sashay-ready]");
  const code = page.locator("#readout .code");
  const seps = hero.locator('[role="separator"]');
  const why = hero.locator('[data-sashay-pane="why"]');
  await expect(hero.locator("h1")).toHaveText(/Panes that\s+sashay\./);
  const start = (await code.textContent()) as string;
  expect(new URL(page.url()).searchParams.get("layout")).toBe(start);
  await glide({ x: 420, y: 420 }, BEATS.heroHold / 2);
  await pause(BEATS.heroHold / 2);

  // 0:04 Slow drag on the first edge: it snaps, and ?layout= changes.
  const sep = seps.first();
  const before = await valueNow(sep);
  const from = await center(sep);
  await drag(from, { x: from.x - 300, y: from.y + 20 });
  await expect(code).not.toHaveText(start);
  const dragged = (await code.textContent()) as string;
  expect(new URL(page.url()).searchParams.get("layout")).toBe(dragged);
  expect(await valueNow(sep)).toBeLessThan(before);
  expectSnapped(await valueNow(sep));
  await pause();

  // 0:07 A throw back right: the bow shows while it moves fast, and it lands past where it was let go.
  const t0 = await center(sep);
  await glide(t0);
  await page.mouse.down();
  const release = { x: t0.x + 110, y: t0.y };
  await glide(release, BEATS.throw, linear);
  await expect(hero.locator("[data-sashay-mark][data-fling]")).toHaveCount(1);
  await page.mouse.up();
  await pause(BEATS.settle);
  expect((await center(sep)).x, "a throw carries past the release point").toBeGreaterThan(release.x + 10);
  expectSnapped(await valueNow(sep));
  await expect(code).not.toHaveText(dragged);
  await pause();

  // 0:09 Click the edge: Why closes.
  await click(sep);
  await pause(BEATS.settle);
  await expect(why).toHaveAttribute("data-closed");
  expect((await widths(hero))[1]).toBeLessThan(2);
  await pause();

  // 0:11 Deep link: load the page at its own ?layout= and the same arrangement comes back.
  const saved = (await code.textContent()) as string;
  const values = await Promise.all([valueNow(seps.nth(0)), valueNow(seps.nth(1))]);
  await page.goto(`./?layout=${saved}`);
  await expect(code).toHaveText(saved);
  await expect(why).toHaveAttribute("data-closed");
  expect([await valueNow(seps.nth(0)), await valueNow(seps.nth(1))]).toEqual(values);
  await pause(BEATS.heroHold / 2);

  // 0:14 Click the edge where it now sits: Why reopens, at its focus.
  await click(sep);
  await pause(BEATS.settle);
  await expect(why).not.toHaveAttribute("data-closed");
  const w = await widths(hero);
  expect(Math.abs(w[1] - w.reduce((a, b) => a + b) / 4), `Why reopens at its focus, 1/4: ${w}`).toBeLessThan(2);
  await pause();

  // 0:16 Down to "See it work", and through to the Demos page.
  await scrollTo(page.locator("#seeit-h"));
  await pause();
  await click(page.getByRole("link", { name: "Both demos, with source" }));
  await page.waitForURL(/\/demos\/$/);
  const pl = page.locator(".plants[data-sashay-ready]");
  await expect(page.locator(".house[data-sashay-ready]")).toBeAttached();
  await pause();

  // 0:19 Plants: pick a dot. Nearby opens and the URL bar gets the plant.
  const plUrl = page.locator(".mb:has(.plants) .mb-url");
  const nearby = pl.locator('[data-sashay-pane="nearby"]');
  const card = pl.locator('[data-sashay-pane="plant"]');
  const dot = pl.locator('[data-dot="lemon-tree"] circle:last-child');
  await click(dot);
  await expect(nearby).not.toHaveAttribute("data-closed");
  await expect(pl.locator('[data-dot="lemon-tree"]')).toHaveAttribute("data-picked");
  await expect(plUrl).toHaveText(/plant=lemon-tree/);
  await pause();

  // 0:22 Drag Nearby over the chart: the chart slides so the picked dot stays in the visible slice.
  const inSlice = async () => {
    const [[a, b]] = await slices(pl);
    const d = await dot.boundingBox();
    expect(d && d.x >= a && d.x + d.width <= b, `dot ${d?.x} in [${a}, ${b}]`).toBe(true);
  };
  const plEdge = pl.locator("[data-sashay-edge]").nth(1);
  await drag(await center(plEdge), await edgeAt(pl, 1, 1 / 6));
  await expect(pl.locator('[data-sashay-pane="chart"]')).toHaveAttribute("data-covered");
  await inSlice();
  await pause();
  await drag(await center(plEdge), await edgeAt(pl, 1, 2 / 3));
  await inSlice();
  await pause();

  // 0:27 Open its card from the list: it opens at 1:1:1, and the URL bar keeps the plant.
  await click(nearby.locator('[data-row="lemon-tree"]'));
  await pause(BEATS.settle);
  await expect(card).not.toHaveAttribute("data-closed");
  await expect(card).toContainText("Lemon tree");
  await expect(plUrl).toHaveText(/^plants\.example\/\?layout=[\w.]+&plant=lemon-tree$/);
  await expectThirds(pl);
  await inSlice();
  await pause();

  // 0:30 House: drill six levels; the old ones fold into the spine. Parlour jumps straight back.
  const hs = page.locator(".house");
  await scrollTo(page.locator(".mb:has(.house)"));
  for (let depth = 2; depth <= 6; depth++) {
    await click(hs.locator("[data-sashay-pane]:last-of-type [data-open]:has(.hs-chev)").first(), BEATS.glide / 2);
    await pause(BEATS.drill);
  }
  await expect(hs.locator("[data-sashay-pane]")).toHaveCount(7);
  await expect(hs.locator("[data-sashay-spine-tab]")).toHaveCount(4);
  await expect(page.locator(".mb:has(.house) .mb-url")).toHaveText(/\/acorn-cup$/);
  const shown = hs.locator("[data-sashay-pane]:not([data-offscreen]):not([data-closed])");
  const open = await shown.count();
  await pause();
  await click(hs.locator('[data-sashay-spine-tab="h-0"]'));
  await pause(BEATS.settle);
  await expect(shown).toHaveCount(open);
  await expect(shown.first()).toHaveAttribute("data-sashay-pane", "h-0");
  await expect(hs.locator('[data-sashay-pane="h-0"]')).not.toHaveAttribute("inert");
  await pause();

  // 0:38 Keyboard: an edge takes focus, and → steps it one snap at a time.
  const hsSep = hs.locator('[role="separator"]').first();
  const v0 = await valueNow(hsSep);
  await glide({ x: at.x + 120, y: at.y + 160 });
  await hsSep.focus();
  for (let i = 0; i < 2; i++) {
    await pause(BEATS.key);
    await page.keyboard.press("ArrowRight");
  }
  await pause(BEATS.settle);
  expect(await valueNow(hsSep)).toBeGreaterThan(v0);
  expectSnapped(await valueNow(hsSep));
  await pause();

  // 0:40 A phone: compact mode, a tab strip, and the drawer as a sheet.
  await page.setViewportSize({ width: 390, height: 800 });
  at = { x: 200, y: 400 };
  await expect(pl).toHaveAttribute("data-compact");
  await scrollTo(page.locator(".mb:has(.plants)"));
  await pause();
  const tab = pl.locator('[data-sashay-tab="chart"]');
  await click(tab);
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await pause();
  await click(pl.locator("[data-sashay-drawer-tab]"));
  const sheet = pl.locator("[data-sashay-drawer][data-sheet]");
  await expect(sheet).toHaveAttribute("data-open");
  await click(sheet.locator('[data-facing="North"]'));
  await expect(sheet.locator('[data-facing="North"]')).toHaveAttribute("aria-pressed", "true");
  await pause(BEATS.heroHold / 2);

  expect(errors).toEqual([]);
});
