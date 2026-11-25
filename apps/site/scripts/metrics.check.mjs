// Site metrics checks. Builds the site with a dummy key and without one, and serves both itself:
// node scripts/metrics.check.mjs (after `pnpm -F @vcarl/sashay build`). Nothing reaches PostHog:
// every request to it is answered here, and the browser can't resolve its hosts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };
const temp = [];
const servers = [];
async function site(key) {
  const dir = mkdtempSync(join(tmpdir(), "sashay-metrics-"));
  temp.push(dir);
  const env = { ...process.env, PUBLIC_POSTHOG_KEY: key, PUBLIC_POSTHOG_HOST: "", SITE_BASE: "/" };
  execFileSync("pnpm", ["exec", "astro", "build", "--outDir", dir], { cwd: root, env, stdio: "pipe" });
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const send = (status, file) => {
      const body = readFileSync(join(dir, file));
      res.writeHead(status, { "content-type": types[file.split(".").at(-1)] ?? "application/octet-stream" }).end(body);
    };
    try {
      send(200, path.endsWith("/") ? `${path}index.html` : path);
    } catch {
      send(404, "404.html");
    }
  });
  await new Promise((done) => server.listen(0, "localhost", done));
  servers.push(server);
  return `http://localhost:${server.address().port}/`;
}

const on = await site("phc_dummy");
const off = await site("");
const browser = await chromium.launch({
  args: ["--no-sandbox", "--host-resolver-rules=MAP *.posthog.com 127.0.0.1:9"],
});
const all = [];
// A page as a visitor's browser shows it, rather than an automated one, which is not counted.
async function open(base, path, { fail = false, init = "", ua, width = 1440 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    userAgent: ua ?? "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(`Object.defineProperty(navigator, "webdriver", { value: false });
    const writes = (window.writes = []);
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { writes.push(k); return set.call(this, k, v); };
    ${init}`);
  const events = [];
  const errors = [];
  await context.route(/posthog/, (route) => {
    const req = route.request();
    events.push({ ...JSON.parse(req.postData()), url: req.url(), headers: req.headers() });
    all.push(req.postData());
    return fail ? route.abort() : route.fulfill({ status: 200, body: "{}" });
  });
  // Outbound links go nowhere.
  await context.route(/github\.com|npmjs\.com/, (route) => route.fulfill({ status: 200, body: "away" }));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  const named = (name) => events.filter((e) => e.event === name);
  const uses = () => named("sashay_demo_used").map((e) => e.properties.demo);
  const settle = () => page.waitForTimeout(400);
  return { page, context, events, errors, named, uses, settle };
}
const count = (list, x) => list.filter((y) => y === x).length;

async function drag(page, frame, { hold = 150, by = -60 } = {}) {
  const b = await page.locator(`${frame} [role="separator"]`).first().boundingBox();
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(x + (by * i) / 4, y);
  if (hold) await page.waitForTimeout(hold); // past the velocity window: a drop, not a throw
  await page.mouse.up();
  await page.waitForTimeout(400);
}

try {
  // Landing: a pageview, what each frame can do, each once.
  let t = await open(on, "?layout=69&theme=sash&secret=hunter2&utm_source=hn#frag");
  assert.equal(t.named("$pageview").length, 1, "one pageview");
  const view = t.named("$pageview")[0];
  assert.equal(view.url, "https://us.i.posthog.com/i/v0/e/");
  assert.equal(view.api_key, "phc_dummy");
  assert.equal(view.distinct_id, "$posthog_cookieless");
  assert.equal(view.properties.$cookieless_mode, true);
  assert.equal(view.properties.$device_id, null);
  assert.equal(view.properties.$process_person_profile, false);
  assert.ok(view.properties.$raw_user_agent && view.properties.$host && view.properties.$timezone);
  assert.equal(view.properties.$current_url, `${on}?utm_source=hn`);
  assert.equal(view.properties.$referring_domain, "$direct");
  assert.ok(!view.headers.cookie, "no cookie header");
  console.log(JSON.stringify(JSON.parse(all[0]), null, 2));
  const { page } = t;
  for (let i = 0; i < 2; i++) await drag(page, "#hero");
  await page.locator("#hero [role=separator]").first().click();
  await t.settle();
  await page.locator("#hero [role=separator]").first().press("ArrowRight");
  await page.locator("#hero [data-sashay-bar-toggle]").click();
  for (let i = 0; i < 2; i++) await page.locator("#readout [data-act=add]").click();
  await t.settle();
  await page.locator("#hero [data-sashay-close]").click();
  await t.settle();
  await page.locator("#readout [data-act=reset]").click();
  await t.settle();
  assert.deepEqual(t.uses(), ["hero"], "many uses of one demo are one event");

  await page.locator("#cell-fling").scrollIntoViewIfNeeded();
  await t.settle();
  await drag(page, "#cell-fling", { hold: 0, by: -50 });
  await page.locator("#cell-bar [data-sashay-bar-toggle]").click();
  for (let i = 0; i < 5; i++) await page.locator("#cell-spine + .acts [data-act=add]").click();
  await page.locator("#cell-spine [data-sashay-spine-tab]").last().click();
  await t.settle();
  await page.locator("#cell-spine [data-sashay-spine-tab]").last().press("ArrowUp");
  await page.locator("#cell-spine + .acts [data-act=back]").click();
  await page.locator(".bigcode").fill("60");
  await page.locator('.plants [data-dot="pothos"]').click();
  await page.locator(".house [data-sashay-pane] button").first().click();
  await t.settle();
  assert.deepEqual(t.uses(), ["hero", "cell_fling", "cell_bar", "cell_spine", "cell_code", "plants", "house"]);

  assert.deepEqual(await page.evaluate(() => window.writes), [], "no storage writes");

  // Links: a middle click counts, and so does one that leaves the page.
  await page.locator("footer a", { hasText: "GitHub" }).click({ button: "middle" });
  await page.locator("a[data-cta=cell_spine]").click();
  await page.waitForURL(/guide/);
  await t.settle();
  assert.deepEqual(
    t.named("sashay_link_clicked").map(({ properties: p }) => [p.host, p.cta]),
    [
      ["github.com", undefined],
      [undefined, "cell_spine"],
    ],
  );
  assert.equal(t.named("$pageview").length, 2, "the next page is a view");
  assert.equal(t.named("$pageview")[1].properties.$current_url, `${on}guide/`);
  assert.deepEqual(await t.context.cookies(), [], "no cookies");
  assert.deepEqual(t.errors, []);
  await t.context.close();

  // Each kind of use counts by itself, on a fresh page.
  const edge = "#hero [role=separator]";
  for (const [why, demo, use, opts] of [
    ["a drag", "hero", (p) => drag(p, "#hero")],
    ["a throw", "cell_fling", (p) => drag(p, "#cell-fling", { hold: 0, by: -50 })],
    ["an edge click", "hero", (p) => p.locator(edge).first().click()],
    ["a key on an edge", "hero", (p) => p.locator(edge).first().press("ArrowRight")],
    ["a bar", "hero", (p) => p.locator("#hero [data-sashay-bar-toggle]").click()],
    ["a close button", "hero", (p) => p.locator("#hero [data-sashay-close]").click()],
    ["a theme", "hero", (p) => p.locator(".th-pick input[value=curtain]").click()],
    ["add pane", "hero", (p) => p.locator("#readout [data-act=add]").click()],
    ["a tab, on a phone", "hero", (p) => p.locator("#hero [data-sashay-tab]").nth(1).click(), { width: 390 }],
  ]) {
    t = await open(on, "", opts);
    await t.page.locator(`#${demo.replace("_", "-")}`).scrollIntoViewIfNeeded();
    await t.settle();
    assert.deepEqual(t.uses(), [], `${why}: nothing before it`);
    await use(t.page);
    await t.settle();
    assert.deepEqual(t.uses(), [demo], why);
    await t.context.close();
  }

  // Not a use: script-made input, a demo's plain content, or a link in it.
  t = await open(on, "");
  await t.page.locator("#hero[data-sashay-ready] [data-sashay-bar-toggle]").waitFor();
  await t.page.evaluate(() => document.querySelector("#hero [data-sashay-bar-toggle]").click());
  await t.page.locator("#hero h1").click();
  await t.page.locator("#hero a[data-cta=hero_docs]").click({ button: "middle" });
  await t.settle();
  assert.deepEqual(t.uses(), []);
  await t.context.close();

  // Docs pages, the 404 included.
  for (const path of ["guide/", "demos/", "reference/", "themes/", "nowhere/"]) {
    t = await open(on, path);
    assert.equal(t.named("$pageview").length, 1, `${path} is a view`);
    assert.equal(t.named("$pageview")[0].properties.$pathname, `/${path}`);
    if (path === "guide/") {
      const demo = t.page.locator(".demo-app").first();
      await demo.scrollIntoViewIfNeeded();
      await demo.locator("[data-sashay-ready]").waitFor();
      await demo.locator("[role=separator]").first().press("ArrowLeft");
      await t.page.locator(".expressive-code").nth(1).hover();
      await t.page.locator(".expressive-code").nth(1).locator(".copy button").click();
      await t.settle();
      assert.deepEqual(t.uses(), ["guide_plants"]);
      assert.deepEqual(
        t.named("sashay_code_copied").map((e) => e.properties.block),
        [2],
      );
    }
    if (path === "themes/") {
      await t.page.locator("#themed[data-sashay-ready]").waitFor();
      await t.page.locator(".th-pick input[value=curtain]").click();
      await t.page.locator("#themed [role=separator]").first().press("ArrowLeft");
      await t.settle();
      assert.deepEqual(t.uses(), ["themed"]);
    }
    const note = t.page.locator(".metrics-note");
    assert.equal(await note.count(), 1, `${path} says so`);
    assert.deepEqual(await t.context.cookies(), []);
    assert.deepEqual(await t.page.evaluate(() => window.writes.filter((k) => k !== "starlight-theme")), []);
    assert.deepEqual(t.errors, []);
    await t.context.close();
  }

  // The labels and hosts that leave are fixed: no query, hash, layout code, or text.
  const allowed = {
    $pageview: ["$current_url", "$referring_domain", "utm_source", "utm_medium", "utm_campaign"],
    sashay_demo_used: ["demo"],
    sashay_link_clicked: ["host", "cta"],
    sashay_code_copied: ["block"],
  };
  const common = "$cookieless_mode $device_id $process_person_profile $host $pathname $raw_user_agent $timezone site";
  for (const raw of all) {
    const { event, properties } = JSON.parse(raw);
    assert.equal(properties.site, "sashay", "every event is scoped to this site");
    assert.match(event, /^(\$pageview$|sashay_)/);
    for (const k of Object.keys(properties))
      assert.ok([...common.split(" "), ...allowed[event]].includes(k), `${event}.${k} is on the list`);
    assert.doesNotMatch(raw, /layout=|panes=|theme=|curtain|hunter2|frag|#|pothos|Pothos|\d+\.\d\b(?=")/, raw);
    for (const k of ["demo", "cta"]) if (k in properties) assert.match(properties[k], /^[a-z_]+$/, `${k} is a label`);
  }

  // Opted out: nothing at all. Automated browsers and bots are not people.
  const get = (o, k, v) => `Object.defineProperty(${o}, "${k}", { get: () => ${v} });`;
  for (const [why, opts] of [
    ["DNT", { init: get("navigator", "doNotTrack", '"1"') }],
    ["GPC", { init: get("navigator", "globalPrivacyControl", "true") }],
    ["a bot", { ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }],
  ]) {
    t = await open(on, "", opts);
    await drag(t.page, "#hero");
    assert.deepEqual(t.events, [], `${why} sends nothing`);
    await t.context.close();
  }

  // The endpoint failing: the page still works, with no uncaught errors.
  t = await open(on, "", { fail: true });
  const before = t.page.url();
  await drag(t.page, "#hero");
  assert.ok(t.events.length >= 2, "it tried");
  assert.notEqual(t.page.url(), before, "a drag still works");
  assert.deepEqual(t.errors, []);
  await t.context.close();

  // No key: no script, no note, no requests.
  for (const path of ["", "guide/"]) {
    t = await open(off, path);
    if (!path) await drag(t.page, "#hero");
    assert.deepEqual(t.events, [], "no key, no requests");
    assert.doesNotMatch(await t.page.content(), /posthog|class="metrics-note/);
    await t.context.close();
  }
} finally {
  await browser.close();
  for (const s of servers) s.close();
  for (const dir of temp) rmSync(dir, { recursive: true });
}
