// Docs checks against a running preview: node scripts/docs.check.mjs [url]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
const open = async (path, width = 1440) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  page.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errors.push(`${path}: ${m.text()}`));
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  return page;
};

// Every Guide step mounts, and no code block scrolls sideways.
for (const width of [1440, 390]) {
  for (const path of ["guide/", "reference/"]) {
    const page = await open(path, width);
    const apps = page.locator(".demo-app");
    for (let i = 0; i < (await apps.count()); i++) await apps.nth(i).locator("[data-sashay-ready]").waitFor();
    const wide = await page.$$eval("pre", (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    assert.equal(wide, 0, `${path} at ${width}: code blocks fit`);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scroll <= width, `${path} at ${width}: no horizontal page scroll (${scroll})`);
    await page.close();
  }
}

let page = await open("guide/");
const steps = page.locator(".demo-app");
for (let i = 0; i < 6; i++) await steps.nth(i).locator("[data-sashay-ready]").waitFor();
const urls = await page.$$eval(".demo-app .mb-url", (els) => els.map((e) => e.value));
const pane = (i, id) => steps.nth(i).locator(`[data-sashay-pane="${id}"]`);
assert.equal(await steps.count(), 6, "five finance steps and the house");
assert.equal(await steps.nth(0).locator("[data-sashay-drawer]").count(), 0, "first frame has no drawer");
assert.equal(await pane(0, "period").getAttribute("data-closed"), null, "first frame opens on Period");
assert.match(urls[1], /^portfolio\.example\/\?layout=6a&period=[\w-]+&txn=TX-/, "URL step shows its layout code");
assert.equal(await steps.nth(2).locator("[data-sashay-drawer]").count(), 1, "drawers step has one");
assert.equal(await steps.nth(2).locator("[data-sashay-toggle]").getAttribute("aria-expanded"), "true", "drawer opens");
assert.notEqual(await steps.nth(3).locator(".finance").getAttribute("data-compact"), null, "compact step is compact");
assert.equal(await pane(4, "details").getAttribute("data-closed"), null, "styling step shows all three panes");
assert.match(urls[5], /^house\.example\/[\w-]+\/[\w-]+\/[\w-]+\/[\w-]+$/, "house opens four levels down");
assert.equal(await page.locator(".mb-chrome[aria-hidden='true']").count(), 6, "chrome is decorative");
assert.equal(await page.locator(".expressive-code .frame.is-terminal").count(), 0, "no terminal frames");

// Under the 80% zoom, a dragged edge stays under the pointer, and a release snaps near it.
const first = steps.nth(0);
await first.scrollIntoViewIfNeeded();
const sep = first.locator('[role="separator"]').first();
const mid = async () => {
  const b = await sep.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
let { x, y } = await mid();
await page.mouse.move(x, y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(x - 8 * i, y);
assert.ok(Math.abs((await mid()).x - (x - 80)) < 1.5, "edge tracks the pointer under zoom");
await page.waitForTimeout(150); // past the velocity window, so the release is a drop, not a throw
await page.mouse.up();
await page.waitForTimeout(400);
assert.ok(Math.abs((await mid()).x - (x - 80)) < 40, "release snaps near the pointer");
assert.match(await first.locator(".mb-url").textContent(), /layout=/, "the URL bar follows a drag");
const before = await first.locator(".mb-url").textContent();
// A throw: a short fast flick carries the edge past where the pointer let go.
({ x, y } = await mid());
await page.mouse.move(x, y);
await page.mouse.down();
for (let i = 1; i <= 4; i++) await page.mouse.move(x - 10 * i, y);
await page.mouse.up();
await page.waitForTimeout(400);
assert.ok((await mid()).x < x - 60, "a fling carries the edge on");
assert.notEqual(await first.locator(".mb-url").textContent(), before, "the URL bar follows a fling");
// A click under zoom lands on the bar under the pointer.
await first.locator('[data-bar="3"]').click();
await page.waitForTimeout(400);
assert.match(await first.locator(".mb-url").textContent(), /period=/);
assert.notEqual(await first.locator('[data-bar="3"]').getAttribute("data-picked"), null, "click picks the bar");

// Layout in the URL: a keypress rewrites the mini URL bar, never the page's.
const url = steps.nth(1);
await url.scrollIntoViewIfNeeded();
await url.locator('[role="separator"]').first().press("ArrowLeft");
assert.doesNotMatch(await url.locator(".mb-url").textContent(), /layout=6a&/, "the mini URL bar follows a keypress");
assert.equal(new URL(page.url()).search, "", "the page's own URL stays put");

// The excerpts are the React demo's own source, and "Without React" runs the core on its own.
assert.ok((await page.locator(".expressive-code", { hasText: "finance/index.tsx" }).count()) >= 3, "TSX excerpts");
const vanilla = page.locator("#vanilla-mail");
await vanilla.scrollIntoViewIfNeeded();
await page.locator("#vanilla-mail[data-sashay-ready]").waitFor();
await vanilla.getByRole("button", { name: "Invoice" }).click();
await page.waitForTimeout(400);
assert.equal(
  await vanilla.locator('[data-sashay-pane="message"]').getAttribute("data-closed"),
  null,
  "reveal opens it",
);
assert.match(await vanilla.textContent(), /Message: Invoice/);
assert.match(await vanilla.textContent(), /Layout: \w+/, "onChange reports the layout");
await page.close();

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
