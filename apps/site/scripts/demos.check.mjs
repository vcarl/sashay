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
  await page.locator(".finance[data-sashay-ready]").waitFor();
  await page.locator(".house[data-sashay-ready]").waitFor();
  return page;
};
const settle = (page) => page.waitForTimeout(400);

for (const width of [1440, 390]) {
  const page = await open(width);

  // Finance: pick an interval, click a bar, click a transaction, close it.
  const fi = page.locator(".finance");
  await fi.locator(width < 640 ? "[data-sashay-drawer-tab]" : "[data-sashay-toggle]").click();
  await fi.locator('[data-interval="1Y"]').click();
  assert.equal(await fi.locator('[data-interval="1Y"]').getAttribute("aria-pressed"), "true");
  assert.equal(await fi.locator("[data-bar]").count(), 12, "1Y shows 12 bars");
  if (width < 640) await fi.locator("[data-sashay-sheet-close]").click();
  await settle(page);
  await fi.locator('[data-bar="9"]').click();
  await settle(page);
  assert.equal(await fi.locator('[data-sashay-pane="period"]').getAttribute("data-closed"), null, "period opens");
  await fi.locator('[data-sashay-pane="period"] [data-txn]').first().click();
  await settle(page);
  const details = fi.locator('[data-sashay-pane="details"]');
  assert.equal(await details.getAttribute("data-closed"), null, "details opens");
  assert.match(await details.textContent(), /Reference/);
  const finUrl = page.locator(".mb:has(.finance) .mb-url");
  assert.match(await finUrl.textContent(), /txn=TX-/, "URL bar shows the transaction");
  // Compact shows one pane at a time, and the library keeps the last open pane: its × is a no-op there.
  if (width >= 640) {
    await fi.locator("[data-sashay-close]").click();
    await settle(page);
    assert.notEqual(await details.getAttribute("data-closed"), null, "leaf × closes details");
    assert.doesNotMatch(await finUrl.textContent(), /txn=/, "closing details drops the transaction");
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
  const item = hs.locator("[data-sashay-pane]:has(> .hs-item)");
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
