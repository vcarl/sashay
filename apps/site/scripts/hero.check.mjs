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
const param = (page) => new URL(page.url()).searchParams.get("layout");

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
await page.context().close();

page = await open(`${url}?layout=zzzz`);
await page.locator("#hero[data-sashay-ready]").waitFor();
assert.equal(await code(page), start, "garbled code falls back to the default");
await page.context().close();

page = await open(url, { javaScriptEnabled: false });
assert.match(await page.locator("#hero h1").textContent(), /Panes that\s+sashay\./);
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
