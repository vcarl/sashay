// Hero checks against a running preview: node scripts/hero.check.mjs [url]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4321/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
const open = async (u, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(u, { waitUntil: "networkidle" });
  return page;
};
const code = (page) => page.locator("#readout .code").textContent();
const param = (page, name = "layout") => new URL(page.url()).searchParams.get(name);

let page = await open(url);
await page.locator("#hero[data-sashay-ready]").waitFor();
assert.equal(await page.locator("#hero [data-sashay-edge]").count(), 3);
const seps = page.locator('#hero [role="separator"]');
assert.equal(await seps.count(), 2);
const start = await code(page);
assert.equal(param(page), start, "URL carries the code on load");

await seps.first().press("ArrowRight");
const keyed = await code(page);
assert.notEqual(keyed, start, "arrow key changes the code");
assert.equal(param(page), keyed);

await page.waitForTimeout(300); // let the keyed move settle before measuring
const box = await seps.first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(box.x - i * 15, box.y + box.height / 2);
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(300);
const dragged = await code(page);
assert.notEqual(dragged, keyed, "drag changes the code");
assert.equal(param(page), dragged, "drag writes ?layout=");

await page.getByRole("button", { name: "Reset" }).click();
assert.equal(await code(page), start, "Reset restores the default");

// The Install pane's facts are in its bottom bar.
const bar = page.locator('#hero [data-sashay-bar="install"]');
const strip = page.locator("#hero [data-sashay-bar-toggle]");
assert.equal(await bar.isVisible(), false, "the bar starts collapsed");
await strip.click();
await page.waitForTimeout(300);
assert.match(await bar.textContent(), /ESM only.*React ≥19.*0-dep core.*MIT/);
assert.equal(await bar.isVisible(), true);
assert.match(param(page), /\.1$/, "the URL has the bar open");
assert.ok(await bar.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "the bar shows all its facts");
await strip.click();

// Add pane: panes join at the right, older ones fold into the spine, and the URL counts them.
const added = page.locator("#hero .p-added");
const spineTabs = page.locator('#hero [data-spine="start"] [data-sashay-spine-tab]');
const titles = () => added.locator("h2").allTextContents();
const addPane = page.locator("#readout [data-act=add]");
for (let i = 0; i < 4; i++) await addPane.click();
await page.waitForTimeout(400);
assert.deepEqual(await titles(), ["Pane 1", "Pane 2", "Pane 3", "Pane 4"]);
assert.equal(param(page, "panes"), "4");
assert.ok((await spineTabs.count()) > 0, "a full frame folds into the spine");
assert.equal(await page.locator("#hero .p-added:last-of-type").getAttribute("inert"), null, "the new pane shows");
// The link restores them.
const link = page.url();
const full = await code(page);
await page.goto(link, { waitUntil: "networkidle" });
assert.deepEqual(await titles(), ["Pane 1", "Pane 2", "Pane 3", "Pane 4"]);
assert.equal(await code(page), full, "the layout comes back");
// Closing one removes it; closing one in the middle renumbers the rest.
await page.locator('#hero [data-sashay-edge="added-3"]').press("Enter");
await page.waitForTimeout(400);
assert.deepEqual(await titles(), ["Pane 1", "Pane 2", "Pane 3"]);
assert.equal(await page.locator('#hero [data-sashay-pane="added-3"]').count(), 0, "the closed pane is gone");
assert.equal(await page.locator('#hero [data-sashay-edge="added-4"]').getAttribute("aria-label"), "Pane 3");
assert.equal(param(page, "panes"), "3");
await page.locator("#hero [data-sashay-close]").click(); // the rightmost: an added pane
await page.waitForTimeout(400);
assert.equal(param(page, "panes"), "2");
// The base panes only collapse.
for (const id of ["install", "why", "hello"]) {
  const tab = page.locator(`#hero [data-sashay-spine-tab="${id}"]`);
  if (await tab.count()) await tab.press("Enter");
  await page.waitForTimeout(350);
  await page.locator(`#hero [data-sashay-edge="${id}"]`).press("Enter");
  await page.waitForTimeout(350);
  assert.equal(await page.locator(`#hero [data-sashay-pane="${id}"]`).count(), 1, `${id} stays`);
}
assert.equal(await added.count(), 2);
await page.getByRole("button", { name: "Reset" }).click();
assert.equal(await added.count(), 0, "Reset removes added panes");
assert.equal(await code(page), start, "and restores the layout");
assert.equal(param(page, "panes"), null);
// Capped.
for (let i = 0; i < 12; i++) await addPane.click();
assert.equal(await addPane.isDisabled(), true, "12 added panes at most");
await page.getByRole("button", { name: "Reset" }).click();
assert.equal(await addPane.isDisabled(), false);

// `panes` is untrusted.
for (const [value, n] of [
  ["2", 2],
  ["999", 12],
  ["-1", 0],
  ["1e3", 0],
  ["2.5", 0],
  ["9999999", 0],
  ["<b>", 0],
  ["", 0],
]) {
  await page.goto(`${url}?panes=${encodeURIComponent(value)}`, { waitUntil: "networkidle" });
  assert.equal(await added.count(), n, `panes=${value}`);
}
await page.context().close();

// Nothing overflows, before and after adding panes.
for (const width of [360, 390, 1024, 1440]) {
  page = await open(url, { viewport: { width, height: 844 } });
  for (const n of [0, 2, 8]) {
    for (let i = await page.locator("#hero .p-added").count(); i < n; i++)
      await page.locator("#readout [data-act=add]").click();
    await page.waitForTimeout(350);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= width, `${width}px, ${n} added: no horizontal scroll (${w})`);
    const cut = await page
      .locator("#hero [data-sashay-tab]")
      .evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
    assert.deepEqual(cut, [], `${width}px, ${n} added: tabs fit`);
  }
  await page.context().close();
}

page = await open(`${url}?layout=zzzz`);
await page.locator("#hero[data-sashay-ready]").waitFor();
assert.equal(await code(page), start, "garbled code falls back to the default");
await page.context().close();

page = await open(url, { javaScriptEnabled: false });
assert.match(await page.locator("#hero h1").textContent(), /^Sashay$/);
assert.equal(await page.locator("#hero .meta").isVisible(), true, "without JS the facts show");
await page.context().close();

page = await open(url, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.locator("#hero[data-compact]").waitFor();
const tab = (name) => page.locator(`#hero [data-sashay-tab="${name}"]`);
assert.equal(await tab("hello").getAttribute("aria-pressed"), "true");
const mobile = await code(page);
await tab("why").click();
await page.waitForTimeout(300);
assert.equal(await tab("why").getAttribute("aria-pressed"), "true", "tab opens its pane");
assert.notEqual(await code(page), mobile);
await tab("install").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
assert.equal(await tab("install").getAttribute("aria-pressed"), "true", "tabs work from the keyboard");
const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
assert.ok(scroll <= 390, `no horizontal page scroll (${scroll})`);
await page.context().close();

assert.deepEqual(errors, []);
await browser.close();
console.log("hero: ok");
