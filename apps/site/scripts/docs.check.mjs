// Docs example checks against a running preview: node scripts/docs.check.mjs [url]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
const open = async (path, width = 1440) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${path}: ${m.text()}`));
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  return page;
};

for (const width of [1440, 390]) {
  for (const name of ["first-frame", "layout-codes", "drawers", "stacks", "compact", "styling", "accessibility"]) {
    const page = await open(`${name}/`, width);
    await page.locator(`.demo[data-demo="${name}"][data-sashay-ready]`).waitFor();
    await page.close();
  }
}

let page = await open("layout-codes/");
const out = page.locator(".demo output");
assert.match(await out.textContent(), /^[0-9a-f]/, "shows the code on load");
const start = await out.textContent();
await page.locator('.demo [role="separator"]').first().press("ArrowRight");
assert.notEqual(await out.textContent(), start, "arrow key changes the code");

page = await open("drawers/");
await page.locator(".demo section button").click();
assert.equal(await page.locator(".demo [data-sashay-toggle]").getAttribute("aria-expanded"), "true");

page = await open("stacks/");
for (let i = 0; i < 4; i++)
  await page.locator('.demo [data-sashay-pane]:not([inert]) [data-act="open"]').last().click();
assert.equal(await page.locator(".demo [data-sashay-pane]").count(), 5);
await page.locator(".demo [data-spine]").waitFor();
await page.locator('.demo [data-sashay-pane]:not([inert]) [data-act="back"]').last().click();
assert.equal(await page.locator(".demo [data-sashay-pane]").count(), 4);

page = await open("compact/");
assert.equal(await page.locator(".demo[data-compact] [data-sashay-tab]").count(), 2);

page = await open("accessibility/");
const said = page.locator(".demo output");
const before = await said.textContent();
await page.locator('.demo [role="separator"]').press("ArrowLeft");
assert.notEqual(await said.textContent(), before, "arrow key changes aria-valuetext");

page = await open("react/");
await page.locator(".demo").scrollIntoViewIfNeeded();
await page.locator(".demo [data-sashay-ready]").waitFor();
await page.getByRole("button", { name: "Lunch?" }).click();
await page.locator('.demo [role="separator"]').waitFor();
assert.match(await page.locator(".demo").textContent(), /Message: Lunch\?/);

await browser.close();
assert.deepEqual(errors, [], "no console errors");
console.log("docs.check: ok");
