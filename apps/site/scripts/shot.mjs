// Full-page screenshot: node scripts/shot.mjs <url> <width> <out.png>
import { chromium } from "playwright";

const [url, width, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
