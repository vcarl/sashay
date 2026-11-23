// Feature-cell checks against a running preview: node scripts/cells.check.mjs [url]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4321/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle" });

for (const id of ["fling", "drawer", "spine", "code"]) await page.locator(`#cell-${id}[data-sashay-ready]`).waitFor();

const spine = page.locator('#cell-spine [data-spine="start"]');
const tabs = spine.locator("[data-sashay-spine-tab]");
for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Add pane" }).click();
await spine.waitFor();
const before = await tabs.count();
assert.ok(before > 0, "spine shows a tab per folded pane");
await tabs.last().click();
await page.waitForTimeout(300);
assert.ok(await tabs.count() < before, "a spine tab reveals its pane");
await page.getByRole("button", { name: "Back", exact: true }).click();

const toggle = page.locator("#cell-drawer [data-sashay-toggle]");
assert.equal(await toggle.getAttribute("aria-expanded"), "true");
await toggle.click();
assert.equal(await toggle.getAttribute("aria-expanded"), "false");

const word = page.locator(".bigcode");
const first = await word.inputValue();
await page.locator('#cell-code [role="separator"]').first().press("ArrowRight");
assert.notEqual(await word.inputValue(), first, "the word follows the layout");

// The cells and the hero point into the Guide; "See it work" runs both demos.
const hrefs = await page.locator(".cell .more").evaluateAll((as) => as.map((a) => new URL(a.href).hash));
assert.deepEqual(hrefs, [
  "#your-first-frame",
  "#your-first-frame",
  "#drawers",
  "#navigation-stacks",
  "#layout-in-the-url",
]);
assert.match(await page.getByRole("link", { name: "Read the docs" }).getAttribute("href"), /\/guide\/$/);
for (const name of ["plants", "house"]) {
  const app = page.locator(`.seeit .mb:has(.${name})`);
  await app.locator(`.${name}[data-sashay-ready]`).waitFor();
  assert.match(await app.locator(".mb-url").textContent(), /^\w+\.example\//);
}

assert.deepEqual(errors, []);
await browser.close();
console.log("cells: ok");
