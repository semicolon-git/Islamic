/**
 * Renders the pitch deck HTML to a 16:9 PDF (one 1920×1080 page per <section class="slide">) and optional PNG previews.
 *
 *   node scripts/pitch-deck/render.mjs docs/pitch/v8/deck.html docs/pitch/v8/Signs-Around-You-Pitch-v8.pdf [PNG_DIR]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pw = await import("playwright-core").catch(() => import("@playwright/test"));
const [src, out, pngDir] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--font-render-hinting=none", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.resolve(src)).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
for (const f of ['600 30px "Readex"']) if (!(await page.evaluate((f) => document.fonts.check(f, "آية"), f))) throw new Error("font not loaded: " + f);
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute("src")));
if (broken.length) throw new Error("missing images: " + broken.join(", "));
await page.emulateMedia({ media: "print" });
await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
const n = await page.locator("section.slide").count();
if (pngDir) {
  fs.mkdirSync(pngDir, { recursive: true });
  await page.emulateMedia({ media: "print" });
  for (let i = 0; i < n; i++) await page.locator("section.slide").nth(i).screenshot({ path: path.join(pngDir, `slide-${String(i + 1).padStart(2, "0")}.png`) });
}
await browser.close();
console.log(`rendered ${n} slides → ${out}`);
