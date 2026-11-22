// Docs checks against a running preview: node scripts/docs.check.mjs [url]
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

// Every Guide step mounts, and no code block scrolls sideways.
for (const width of [1440, 390]) {
  for (const path of ["guide/", "reference/"]) {
    const page = await open(path, width);
    const apps = page.locator(".demo-app");
    for (let i = 0; i < (await apps.count()); i++) await apps.nth(i).and(page.locator("[data-sashay-ready]")).waitFor();
    const wide = await page.$$eval("pre", (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    assert.equal(wide, 0, `${path} at ${width}: code blocks fit`);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scroll <= width, `${path} at ${width}: no horizontal page scroll (${scroll})`);
    await page.close();
  }
}

let page = await open("guide/");
const steps = page.locator(".demo-app");
assert.equal(await steps.count(), 6, "five finance steps and the house");
assert.equal(await steps.nth(0).locator("[data-sashay-drawer]").count(), 0, "first frame has no drawer");
assert.equal(await steps.nth(2).locator("[data-sashay-drawer]").count(), 1, "drawers step has one");
assert.notEqual(await steps.nth(3).getAttribute("data-compact"), null, "compact step is compact");
assert.equal(await page.locator(".expressive-code .frame.is-terminal").count(), 0, "no terminal frames");

// Layout in the URL: a keypress writes ?layout=.
const url = steps.nth(1);
await url.scrollIntoViewIfNeeded();
await url.locator("[data-bar]").first().click();
await page.waitForTimeout(300);
await url.locator('[role="separator"]').first().press("ArrowLeft");
const code = new URL(page.url()).searchParams.get("layout");
assert.match(code ?? "", /^[0-9a-f]/, "the URL step writes ?layout=");
page = await open(`guide/?layout=${code}`);
const period = page.locator('.demo-app[data-sashay-ready] [data-sashay-pane="period"]').nth(1);
await period.waitFor({ state: "attached" });
assert.equal(await period.getAttribute("data-closed"), null, "the layout survives a reload");

page = await open("reference/");
await page.locator(".demo").scrollIntoViewIfNeeded();
await page.locator(".demo [data-sashay-ready]").waitFor();
await page.getByRole("button", { name: "Lunch?" }).click();
await page.locator('.demo [role="separator"]').waitFor();
assert.match(await page.locator(".demo").textContent(), /Message: Lunch\?/);

// The old pages land on their new anchors.
const moved = {
  install: "guide/#install",
  "first-frame": "guide/#your-first-frame",
  "layout-codes": "guide/#layout-in-the-url",
  drawers: "guide/#drawers",
  stacks: "guide/#navigation-stacks",
  compact: "guide/#compact-mode",
  styling: "guide/#styling",
  api: "reference/",
  react: "reference/#vcarlsashayreact",
  accessibility: "reference/#accessibility",
};
for (const [from, to] of Object.entries(moved)) {
  page = await open(`${from}/`);
  await page.waitForURL(new URL(to, base).href);
  const hash = new URL(to, base).hash;
  if (hash) assert.equal(await page.locator(hash).count(), 1, `${to} exists`);
  await page.close();
}

await browser.close();
assert.deepEqual(errors, [], "no console errors");
console.log("docs.check: ok");
