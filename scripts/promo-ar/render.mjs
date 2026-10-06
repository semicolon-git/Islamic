/**
 * Renders the film's still layers (background, phone bezel, masks, captions, title and end cards) to PNG with Chromium,
 * so Arabic is shaped by a real text engine. Input: a JSON list of {file, w, h, html, transparent}.
 *
 *   node render.mjs layers.json
 */
import fs from "node:fs";

const pw = await import("playwright-core").catch(() => import("@playwright/test"));
const specs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const FONTS = process.env.FONTS_CSS ?? "";
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const s of specs) {
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.setContent(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${FONTS}
    *{margin:0;padding:0;box-sizing:border-box} html,body{width:${s.w}px;height:${s.h}px;overflow:hidden;background:${s.transparent ? "transparent" : "#0b0e29"}}
  </style></head><body>${s.html}</body></html>`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
  await page.screenshot({ path: s.file, omitBackground: !!s.transparent });
}
await browser.close();
console.log(`rendered ${specs.length} layers`);
