/*
 * The hero, recorded: 22 seconds of the landing page's hero frame and its theme picker. It is
 * a real test (every beat asserts) driven by real mouse and keyboard input, with a drawn cursor.
 *
 *   pnpm site:build && pnpm test:e2e                          the test only
 *   HERO_VIDEO=/some/dir pnpm test:e2e                        also writes hero.mp4 and hero-poster.png there
 *                                                             (needs ffmpeg; 2560×1600, 60 fps, H.264)
 *
 * Each beat starts at a fixed time, in BEATS. Retune the pacing there.
 *
 * The page's chrome is hidden by STAGE, below, so nothing in the site's code knows about the
 * recording. Add pane lives in the readout under the frame, so STAGE floats that button over the
 * frame's foot for its beat. The frame narrows by its own width: the video's size doesn't change.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";

// When each beat starts, in ms.
const BEATS = {
  hold: 0,
  slowDrag: 800,
  sash: 2350,
  throw: 2950,
  shoji: 4000,
  squeeze: 4600,
  greenhouse: 5750,
  close: 6350,
  reopen: 7050,
  blueprint: 8000,
  barOpen: 8600,
  barClose: 9400,
  add: 10100,
  curtain: 12050,
  spineTab: 12650,
  closeAdded: 13750,
  sleeper: 16350,
  keys: 16950,
  narrow: 18550,
  tab: 19450,
  widen: 20350,
  house: 21300,
  end: 22500,
} as const;
// How long moves take, in ms.
const MOVE = {
  glide: 380,
  dart: 80,
  slowDrag: 900,
  throw: 270,
  squeeze: 650,
  drop: 160,
  click: 80,
  addGap: 520,
  closeGap: 600,
};

const STAGE = `
  .mast, footer, main > :not(.window), .themer .more, .readout > :not([data-act="add"]) { display: none !important }
  html, body { background: #f6eedc; overflow: hidden }
  .wrap { max-width: none; padding: 0 }
  .window { margin: 0 }
  #hero { width: 100vw; height: calc(100vh - 68px); margin: auto; border: 0; border-radius: 0; container-type: inline-size; transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1) }
  .narrow #hero { width: 390px; box-shadow: 0 0 0 6px #1b1a17 }
  @container (max-width: 640px) { .p-hello h1 { font-size: 54px } .hint .wide { display: none } .hint .narrow { display: inline } .pane .in { padding: 22px 20px } }
  .themer { height: 68px; padding: 0; justify-content: center }
  .readout { position: fixed; z-index: 999; left: 50%; bottom: 108px; translate: -50% 0; padding: 0; border: 0; opacity: 0; transition: opacity 0.2s }
  .adding .readout { opacity: 1 }
  .readout button[data-act="add"] { margin: 0; padding: 14px 26px; border-width: 3px; background: #f6eedc; font-size: 18px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.4) }
`;

// A cursor and click ripple, since the video doesn't draw the pointer.
function cursorOverlay() {
  const mount = () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgb(27 26 23/.6);border:2.5px solid #fff;box-shadow:0 1px 6px rgb(0 0 0/.5);" +
      "z-index:2147483647;pointer-events:none;transition:scale .1s;translate:-40px -40px";
    document.documentElement.append(dot);
    const put = (e: PointerEvent) => (dot.style.translate = `${e.clientX}px ${e.clientY}px`);
    addEventListener("pointermove", put, true);
    addEventListener(
      "pointerdown",
      (e) => {
        dot.style.scale = "0.75";
        const ring = document.createElement("div");
        ring.style.cssText = `${dot.style.cssText};background:none;border:3px solid #fff;box-shadow:0 0 0 2px #1b1a17;translate:${e.clientX}px ${e.clientY}px`;
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
const HOME: Pt = { x: 560, y: 600 };

let page: Page;
let at = HOME;
let t0 = 0;
/** Waits for a beat's start. */
const beat = (ms: number) => page.waitForTimeout(Math.max(0, t0 + ms - Date.now()));

// Moves the mouse to `to` over `ms`. As many steps as round trips allow.
async function glide(to: Pt, ms = MOVE.glide, ease = easeInOut) {
  const from = at;
  const start = Date.now();
  for (let t = 0; t < 1; t = Math.min(1, (Date.now() - start) / ms)) {
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
async function click(loc: Locator | Pt, ms?: number) {
  await glide("x" in loc ? loc : await center(loc), ms);
  await page.mouse.down();
  await page.waitForTimeout(MOVE.click);
  await page.mouse.up();
}

/** Picks a theme at its beat: a dart to the picker and back. Its colours fade while the next beat plays. */
async function pick(name: keyof typeof BEATS) {
  await beat(BEATS[name]);
  const theme = name === "house" ? "" : name;
  const from = at;
  await click(page.locator(`.th-pick input[value="${theme}"]`), MOVE.dart);
  await glide(from, MOVE.dart);
  const hero = page.locator("#hero");
  if (theme) await expect(hero).toHaveAttribute("data-sashay-theme", theme);
  else await expect(hero).not.toHaveAttribute("data-sashay-theme");
}

/** Records the page through CDP, at its device pixels. Frames come only when something changes. */
async function record() {
  const frames: { file: string; ts: number }[] = [];
  const dir = test.info().outputPath("frames");
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, ts: metadata.timestamp ?? 0 });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 96, maxWidth: 2560, maxHeight: 1600 });
  return async (from: number, out: string) => {
    await cdp.send("Page.stopScreencast");
    const start = from / 1000;
    const end = start + BEATS.end / 1000;
    const first = Math.max(
      0,
      frames.findLastIndex((f) => f.ts <= start),
    );
    const used = frames.slice(first).filter((f) => f.ts < end);
    const list = used.flatMap((f, i) => [
      `file '${f.file}'`,
      `duration ${((used[i + 1]?.ts ?? end) - Math.max(f.ts, start)).toFixed(4)}`,
    ]);
    writeFileSync(`${dir}/list.txt`, [...list, `file '${used.at(-1)?.file}'`].join("\n"));
    mkdirSync(out, { recursive: true });
    const ff = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    const h264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
    const src = ["-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`];
    ff(
      ...src,
      "-vf",
      "fps=60,scale=in_range=pc:out_range=tv,format=yuv420p",
      "-t",
      String(BEATS.end / 1000),
      ...h264,
      `${out}/hero.mp4`,
    );
    ff("-i", used[0].file, `${out}/hero-poster.png`);
    console.log(`${used.length} frames captured; wrote ${out}/hero.mp4`);
  };
}

const valueNow = async (sep: Locator) => Number(await sep.getAttribute("aria-valuenow"));
// A divider rests on a fraction with a denominator up to six.
const expectSnapped = (now: number) =>
  expect(
    [1, 2, 3, 4, 5, 6].some((d) =>
      Array.from({ length: d + 1 }, (_, n) => (100 * n) / d).some((f) => Math.abs(f - now) <= 1),
    ),
    `${now} is on a snap`,
  ).toBe(true);

test("hero", async ({ page: p }) => {
  page = p;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(cursorOverlay);
  await page.goto("./");
  await page.addStyleTag({ content: STAGE });
  const hero = page.locator("#hero[data-sashay-ready]");
  const pane = (id: string) => hero.locator(`[data-sashay-pane="${id}"]`);
  const edge = (id: string) => hero.locator(`[data-sashay-edge="${id}"]`);
  const code = page.locator("#readout .code");
  const added = hero.locator(".p-added");
  const tabs = hero.locator('[data-spine="start"] [data-sashay-spine-tab]');
  const root = page.locator("html");
  await expect(hero.locator("h1")).toHaveText("Sashay");
  await expect(code).toHaveText("69.0");
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(HOME.x, HOME.y);
  await page.waitForTimeout(600);
  const save = process.env.HERO_VIDEO ? await record() : undefined;
  await page.waitForTimeout(300);

  // Hold.
  t0 = Date.now();
  await beat(BEATS.slowDrag);

  // A slow drag on Why's edge: it snaps.
  const why = edge("why");
  const from = await center(why);
  await glide(from, MOVE.glide);
  await page.mouse.down();
  await glide({ x: from.x - 310, y: from.y + 10 }, MOVE.slowDrag);
  await page.waitForTimeout(MOVE.drop);
  await page.mouse.up();
  await expect(code).toHaveText("39.0");
  expectSnapped(await valueNow(why));
  await expect(pane("hello")).toHaveAttribute("data-covered");

  await pick("sash");

  // A long hard throw: the mark bows, and the edge lands past where it was let go.
  await beat(BEATS.throw);
  const t = await center(why);
  await glide(t, 150);
  await page.mouse.down();
  const release = { x: t.x + 455, y: t.y };
  // Watched for during the throw: waiting before the release would end it.
  await Promise.all([
    expect(hero.locator("[data-sashay-mark][data-fling]")).toHaveCount(1),
    glide(release, MOVE.throw, (k) => k).then(() => page.mouse.up()),
  ]);
  await page.waitForTimeout(300);
  expect((await center(why)).x, "a throw carries past the release point").toBeGreaterThan(release.x + 60);
  expectSnapped(await valueNow(why));
  await expect(pane("install")).toHaveAttribute("data-closed");

  await pick("shoji");

  // Dragged far: Hello can't shrink any further, so Why slides over it.
  await beat(BEATS.squeeze);
  const s = await center(why);
  await glide(s, 200);
  await page.mouse.down();
  await glide({ x: s.x - 520, y: s.y + 20 }, MOVE.squeeze);
  await page.waitForTimeout(MOVE.drop);
  await page.mouse.up();
  await expect(pane("hello")).toHaveAttribute("data-covered");

  await pick("greenhouse");

  // Clicks on the edge close Why and open it again.
  await beat(BEATS.close);
  await click(why, 250);
  await expect(pane("why")).toHaveAttribute("data-closed");
  await beat(BEATS.reopen);
  await click(why, 250);
  await expect(pane("why")).not.toHaveAttribute("data-closed");
  await expect(pane("install")).toHaveAttribute("data-closed"); // the throw shut it: it stays shut
  await click(edge("install"), 250);
  await page.waitForTimeout(300); // the bar slides in with its pane
  await expect(code).toHaveText("69.0");

  await pick("blueprint");

  // Install's bar.
  await beat(BEATS.barOpen);
  const strip = hero.locator("[data-sashay-bar-toggle]");
  const b = await strip.boundingBox();
  const chevron = { x: (b?.x ?? 0) + (b?.width ?? 0) - 36, y: (b?.y ?? 0) + 22 }; // clear of the facts
  await click(chevron);
  await expect(strip).toHaveAttribute("aria-expanded", "true");
  await expect(hero.locator('[data-sashay-bar="install"]')).toContainText("ESM only");
  await beat(BEATS.barClose);
  await glide({ x: chevron.x, y: (await center(strip)).y }, 150);
  await click(at, 0);
  await expect(strip).toHaveAttribute("aria-expanded", "false");

  // Added panes join at the right; older ones fold into the spine.
  await root.evaluate((el) => el.classList.add("adding"));
  const add = page.locator('#readout [data-act="add"]');
  for (let i = 0; i < 4; i++) {
    await beat(BEATS.add + i * MOVE.addGap);
    await click(add, i ? 60 : MOVE.glide);
    await expect(added).toHaveCount(i + 1);
  }
  await expect(tabs).toHaveText(["Hello", "Why", "Install"]);
  expect(new URL(page.url()).searchParams.get("panes")).toBe("4");

  await pick("curtain");

  // A spine tab brings its pane back.
  await beat(BEATS.spineTab);
  await root.evaluate((el) => el.classList.remove("adding"));
  await click(tabs.last());
  await expect(tabs).toHaveText(["Hello", "Why"]);
  await expect(pane("install")).not.toHaveAttribute("inert");

  // Closing the added panes removes them, and the spine empties.
  for (let i = 0; i < 4; i++) {
    await beat(BEATS.closeAdded + i * MOVE.closeGap);
    await click(hero.locator(":scope > [data-sashay-close]"), i ? 100 : MOVE.glide);
    await expect(added).toHaveCount(3 - i);
  }
  await expect(tabs).toHaveCount(0);
  await expect(code).toHaveText("69.0");

  await pick("sleeper");

  // The keyboard: Tab to Why's edge, then step it.
  await beat(BEATS.keys);
  glide(HOME, 500);
  await edge("hello").focus();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 4 && !(await why.evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press("Tab");
  await expect(why).toBeFocused();
  expect(await why.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
  expect(Number.parseFloat(await why.evaluate((e) => getComputedStyle(e).outlineWidth))).toBeGreaterThan(1);
  const before = await valueNow(why);
  for (const [i, k] of ["ArrowLeft", "ArrowRight", "ArrowRight"].entries()) {
    await beat(BEATS.keys + 350 + i * 400);
    await page.keyboard.press(k);
  }
  expect(await valueNow(why)).toBeGreaterThan(before);
  expectSnapped(await valueNow(why));

  // A phone's width: one pane at a time, with a tab each.
  await beat(BEATS.narrow);
  await root.evaluate((el) => {
    el.classList.add("narrow");
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(hero).toHaveAttribute("data-compact");
  await beat(BEATS.tab);
  const tab = hero.locator('[data-sashay-tab="why"]');
  await expect(tab).toHaveAttribute("aria-pressed", "false");
  await click(tab, 350);
  await expect(tab).toHaveAttribute("aria-pressed", "true");

  // Back to the opening layout, where it loops.
  await beat(BEATS.widen);
  // Reset goes to the default for the frame's width, so it waits until the frame is wide again.
  await root.evaluate((el) => el.classList.remove("narrow"));
  await expect(hero).not.toHaveAttribute("data-compact");
  await page.locator('#readout [data-act="reset"]').evaluate((b: HTMLElement) => b.click());
  await glide(HOME, 400);
  await expect(code).toHaveText("69.0");
  await pick("house");
  await glide(HOME, 400);
  await beat(BEATS.end);

  await save?.(t0, process.env.HERO_VIDEO as string);
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
});
