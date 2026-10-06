#!/usr/bin/env node
/**
 * Download the library's verbatim sources at PINNED commits and verify every file against data/library/manifest.json.
 *   node scripts/library/fetch.mjs                  → prep/data/raw/library/{tafsir,hadith}/… (skips files already verified)
 *   node scripts/library/fetch.mjs --write-manifest → (maintainers) recompute the manifest from what was downloaded
 *   LIBRARY_EDITIONS=core node scripts/library/fetch.mjs → only the small editions (al-Muyassar + Nawawi/Qudsi), for CI
 *
 * Tafsir: spa5k/tafsir_api (mirror of the Quran.com / QUL tafsir resources), one JSON per surah: [{surah, ayah, text}].
 * Hadith: fawazahmed0/hadith-api, one JSON per edition: {metadata, hadiths:[{hadithnumber, arabicnumber, text, grades}]}.
 * Both are mirrors: the platform labels them as such and an institution approves each book before public use.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CATALOGUE, TAFSIR_COMMIT, HADITH_COMMIT } from "./catalogue.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "prep/data/raw/library");
const MANIFEST = path.join(ROOT, "data/library/manifest.json");
const write = process.argv.includes("--write-manifest");
const core = (process.env.LIBRARY_EDITIONS || "all") === "core";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const next = write ? {} : manifest;

async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

/** Fetch one file (or reuse a verified local copy), verify, return its bytes. */
async function file(key, url, dest) {
  if (fs.existsSync(dest)) {
    const buf = fs.readFileSync(dest);
    if (write || manifest[key] === sha(buf)) {
      if (write) next[key] = sha(buf);
      return buf;
    }
  }
  const buf = await get(url);
  const sum = sha(buf);
  if (write) next[key] = sum;
  else if (manifest[key] !== sum) throw new Error(`CHECKSUM MISMATCH ${key} (source changed?)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  const books = CATALOGUE.filter((b) => !core || b.core);
  for (const b of books) {
    const t0 = Date.now();
    if (b.kind === "tafsir") {
      const consolidated = path.join(OUT, "tafsir", `${b.edition}.json`);
      const parts = new Array(114);
      await pool([...Array(114).keys()].map((i) => i + 1), 8, async (s) => {
        const url = `https://raw.githubusercontent.com/spa5k/tafsir_api/${TAFSIR_COMMIT}/tafsir/${b.edition}/${s}.json`;
        const buf = await file(`tafsir/${b.edition}/${s}`, url, path.join(OUT, "tafsir", ".parts", b.edition, `${s}.json`));
        parts[s - 1] = JSON.parse(buf.toString("utf8"));
      });
      const rows = parts.flat().filter((r) => r && r.surah && r.ayah && typeof r.text === "string").map((r) => ({ s: r.surah, a: r.ayah, text: r.text }));
      fs.writeFileSync(consolidated, JSON.stringify(rows));
      console.log(`ok  tafsir ${b.edition.padEnd(24)} ${rows.length} entries  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } else {
      for (const lang of ["ara", "eng"]) {
        const ed = `${lang}-${b.edition}`;
        const url = `https://raw.githubusercontent.com/fawazahmed0/hadith-api/${HADITH_COMMIT}/editions/${ed}.json`;
        const buf = await file(`hadith/${ed}`, url, path.join(OUT, "hadith", `${ed}.json`));
        console.log(`ok  hadith ${ed.padEnd(24)} ${(buf.length / 1e6).toFixed(1)} MB`);
      }
    }
  }
  if (write) {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + "\n");
    console.log(`wrote ${path.relative(ROOT, MANIFEST)} (${Object.keys(next).length} files)`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
