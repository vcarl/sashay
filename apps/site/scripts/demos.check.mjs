// Demo app checks against a running preview: node scripts/demos.check.mjs [url]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
const open = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  page.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errors.push(`${width}: ${m.text()}`));
  await page.goto(new URL("demos/", base).href, { waitUntil: "networkidle" });
  await page.locator(".plants[data-sashay-ready]").waitFor();
  await page.locator(".house[data-sashay-ready]").waitFor();
  return page;
};
const settle = (page) => page.waitForTimeout(400);
// The visible slices: each pane runs from its edge's right side to the next edge's left side.
const slices = (frame) =>
  frame.evaluate((f) => {
    const es = [...f.querySelectorAll("[data-sashay-edge]")].map((e) => e.getBoundingClientRect());
    return es.map((e, i) => [e.right, es[i + 1]?.left ?? f.getBoundingClientRect().right]);
  });
const thirds = async (frame) => {
  const w = (await slices(frame)).map(([a, b]) => b - a);
  return Math.max(...w) - Math.min(...w) <= 2 || console.error("widths", w);
};
// Drag edge k (1 or 2) so its divider lands at fraction f of the content.
const dragTo = async (page, frame, k, f) => {
  const es = await frame.locator("[data-sashay-edge]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const total = (await slices(frame)).reduce((s, [a, b]) => s + b - a, 0);
  const to = es[0].right + f * total + (k === 2 ? es[1].width : 0) + es[k].width / 2;
  const from = es[k].left + es[k].width / 2;
  const y = es[k].top + es[k].height / 2;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from + ((to - from) * i) / 10, y);
  await page.waitForTimeout(150); // past the velocity window: a drop, not a throw
  await page.mouse.up();
  await settle(page);
};
const inSlice = async (frame, id) => {
  const [[a, b]] = await slices(frame);
  const d = await frame.locator(`[data-dot="${id}"] circle:last-child`).boundingBox();
  return (d.x >= a && d.x + d.width <= b) || console.error("slice", a, b, "dot", d.x, d.width);
};

for (const width of [1440, 390]) {
  const page = await open(width);

  // Plants: pick a window, pick a dot, pick from the list, open the card.
  const pl = page.locator(".plants");
  await pl.locator("[data-sashay-bar-toggle]").click();
  await pl.locator('[data-facing="North"]').click();
  assert.equal(await pl.locator('[data-facing="North"]').getAttribute("aria-pressed"), "true");
  assert.ok((await pl.locator("[data-dot][data-hollow]").count()) > 20, "a north window leaves most plants hollow");
  await pl.locator("[data-sashay-bar-toggle]").click();
  await settle(page);
  await pl.locator('[data-dot="monstera"]').press("Enter"); // dots take the keyboard
  await settle(page);
  const nearby = pl.locator('[data-sashay-pane="nearby"]');
  assert.equal(await nearby.getAttribute("data-closed"), null, "nearby opens");
  assert.equal(await nearby.locator("[data-row]").first().getAttribute("data-row"), "monstera", "picked plant first");
  await nearby.locator('[data-row="lemon-tree"]').click();
  await settle(page);
  assert.notEqual(await pl.locator('[data-dot="lemon-tree"]').getAttribute("data-picked"), null, "row picks the dot");
  const plUrl = page.locator(".mb:has(.plants) .mb-url");
  assert.match(
    await plUrl.textContent(),
    /^plants\.example\/\?layout=[\w.]+&plant=lemon-tree$/,
    "URL bar shows the plant",
  );
  await nearby.locator('[data-row="lemon-tree"]').click();
  await settle(page);
  const card = pl.locator('[data-sashay-pane="plant"]');
  assert.equal(await card.getAttribute("data-closed"), null, "a second click opens the card");
  assert.match(await card.textContent(), /Lemon tree.*all the sun/);
  assert.equal(await card.locator("svg").count(), 1);
  if (width >= 640) {
    // The card opens at equal thirds.
    assert.ok(await thirds(pl), "card opens at 1:1:1");
    // Squeeze the chart: the picked dot stays inside the visible slice.
    const sep = pl.locator('[role="separator"]').first();
    await sep.press("ArrowLeft");
    await settle(page);
    assert.notEqual(await pl.locator('[data-sashay-pane="chart"]').getAttribute("data-covered"), null, "chart covered");
    assert.ok(await inSlice(pl, "lemon-tree"), "squeezed, the dot stays in view");
    await pl.locator("[data-sashay-close]").click();
    await settle(page);
    assert.notEqual(await card.getAttribute("data-closed"), null, "leaf × closes the card");
    // Drag back to 1:1:1. A growing pane takes from the far side first, so widen the chart to
    // 2/3, then drag the card's edge to 2/3: the chart pays for it.
    await dragTo(page, pl, 1, 2 / 3);
    await dragTo(page, pl, 2, 2 / 3);
    assert.ok(await thirds(pl), "dragged to 1:1:1");
    assert.ok(await inSlice(pl, "lemon-tree"), "at 1:1:1, the dot is in view");
  }

  // House: drill 6 levels (it opens with the first room), see the spine (narrow), go back, open an item.
  const hs = page.locator(".house");
  const panes = hs.locator("[data-sashay-pane]");
  for (let depth = 2; depth <= 6; depth++) {
    await hs.locator(`[data-sashay-pane]:last-of-type [data-open]:has(.hs-chev)`).first().click();
    await settle(page);
  }
  assert.equal(await panes.count(), 7, "house + 6 levels");
  if (width < 640) assert.equal(await hs.locator("[data-spine]").isVisible(), true, "spine at 390");
  await hs.locator("[data-sashay-pane]:last-of-type .hs-back").click();
  await settle(page);
  assert.equal(await panes.count(), 6, "back pops one level");
  await hs.locator("[data-sashay-pane]:last-of-type [data-open]:not(:has(.hs-chev))").first().click();
  await settle(page);
  const item = hs.locator('[data-level="item"]');
  assert.equal(await item.count(), 1, "item preview opens");
  assert.equal(await item.locator("svg").count(), 1);
  assert.equal(await item.getAttribute("inert"), null, "preview is visible");
  const path = await page.locator(".mb:has(.house) .mb-url").textContent();
  assert.equal(path.split("/").length, 7, `URL bar shows the path (${path})`);
  assert.equal(new URL(page.url()).search, "", "the page's own URL stays put");
  await page.close();
}

await browser.close();
assert.deepEqual(errors, [], "no console errors");
console.log("demos.check: ok");
