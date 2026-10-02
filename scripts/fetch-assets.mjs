#!/usr/bin/env node
// Vendor the Higgsfield-generated concept images into public/images/concepts/ (webp, 900px) so the app
// no longer depends on the CDN. Run on any machine that can reach the CDN, then `npm run seed`.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const manifest = JSON.parse(fs.readFileSync("data/content/concept_images.json", "utf8")).images;
const out = "public/images/concepts";
fs.mkdirSync(out, { recursive: true });
let ok = 0, fail = 0;
for (const [id, url] of Object.entries(manifest)) {
  const dest = path.join(out, `${id}.webp`);
  if (fs.existsSync(dest)) { ok++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const wide = id.startsWith("hero_");
    await sharp(buf).resize(wide ? 1600 : 900).webp({ quality: 80 }).toFile(dest);
    ok++;
    console.log("✓", id);
  } catch (e) {
    fail++;
    console.warn("✗", id, String(e));
  }
}
console.log(`${ok} ok, ${fail} failed`);
