#!/usr/bin/env node
// Build data/sky/stars.json: the brightest stars (V ≤ 3.0, plus a few named extras) from the HYG database v4.1,
// merged with the curated names in ./star-names.mjs.
//
//   node scripts/sky/build-stars.mjs            # download (pinned + sha256-checked) and rebuild
//   node scripts/sky/build-stars.mjs --csv FILE # use an already-downloaded hygdata_v41.csv (still sha256-checked)
//
// The generated JSON is committed, so the app never needs the network. The HYG CSV (~34 MB) is cached in
// prep/data/raw/ (git-ignored), like the other third-party inputs in prep/fetch_sources.sh.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARABIC, CONSTELLATIONS, NAME_AR } from "./star-names.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The GitHub repository is the frozen archive of HYG (new releases go to codeberg.org/astronexus/hyg); pinned by commit.
const HYG_COMMIT = "c7f7f883fe678cc7680169a50ccd7dcc49b060ce";
const HYG_URL = `https://raw.githubusercontent.com/astronexus/HYG-Database/${HYG_COMMIT}/hyg/CURRENT/hygdata_v41.csv`;
const HYG_SHA256 = "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd";
const CACHE = path.join(ROOT, "prep/data/raw/hygdata_v41.csv");
const OUT = path.join(ROOT, "data/sky/stars.json");

const MAG_LIMIT = 3.0;
/** Named stars fainter than the limit that are kept for their history (Thuban was the pole star c. 3000 BCE). */
const EXTRAS = ["Thuban"];

const KS_CITATION = (name) => `P. Kunitzsch & T. Smart, A Dictionary of Modern Star Names, 2nd ed. (Cambridge, MA: Sky Publishing, 2006), s.v. “${name}”`;
const KS_URL = "https://en.wikipedia.org/wiki/List_of_Arabic_star_names";

const GREEK = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ",
  Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω",
};
const SUP = { 1: "¹", 2: "²", 3: "³" };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function loadCsv() {
  const i = process.argv.indexOf("--csv");
  const file = i > 0 ? process.argv[i + 1] : CACHE;
  let buf;
  if (existsSync(file)) buf = readFileSync(file);
  else {
    console.log(`fetch  ${HYG_URL}`);
    const res = await fetch(HYG_URL);
    if (!res.ok) throw new Error(`HYG download failed: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const sum = sha256(buf);
  if (sum !== HYG_SHA256) throw new Error(`CHECKSUM MISMATCH for HYG v4.1: got ${sum} (source changed?)`);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, buf);
  }
  return buf.toString("utf8");
}

/** Minimal RFC 4180 line parser (HYG quotes some fields; none contain newlines). */
function parseLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out;
}

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function bayerOf(r) {
  if (!r.bayer || !r.con) return null;
  const [g, n] = r.bayer.split("-");
  const letter = GREEK[g];
  if (!letter) return null;
  return `${letter}${n ? SUP[n] ?? n : ""} ${r.con}`;
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

function lightYears(pc) {
  const d = Number(pc);
  if (!d || d >= 100000) return null; // HYG uses 100000 pc for "unknown"
  const ly = d * 3.261563777;
  return ly < 100 ? round(ly, 1) : Math.round(ly);
}

async function main() {
  const text = await loadCsv();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = parseLine(lines[0]);
  const rows = lines.slice(1).map((l) => Object.fromEntries(parseLine(l).map((v, i) => [head[i], v])));

  const picked = rows.filter((r) => {
    if (r.proper === "Sol" || !r.mag || !r.hip) return false; // the Sun, and secondaries without their own HIP entry
    if (Number(r.comp) > 1) return false; // e.g. Toliman (α Cen B): seen as one point of light with its primary
    return Number(r.mag) <= MAG_LIMIT || EXTRAS.includes(r.proper);
  });

  const unusedArabic = new Set(Object.keys(ARABIC));
  const stars = picked
    .sort((a, b) => Number(a.mag) - Number(b.mag))
    .map((r) => {
      const conInfo = CONSTELLATIONS[r.con];
      if (!conInfo) throw new Error(`No constellation names for ${r.con} (${r.proper || r.hip})`);
      const bayer = bayerOf(r);
      const iau = r.proper || null;
      const ar = iau ? ARABIC[iau] : undefined;
      if (iau && !ar && !NAME_AR[iau]) throw new Error(`No Arabic rendering for ${iau}`);
      if (ar) unusedArabic.delete(iau);
      const rec = {
        id: iau ? slug(iau) : slug(`${r.bayer}-${r.con}`),
        iau,
        name_ar: iau ? (ar ? ar.ar : NAME_AR[iau]) : null,
        bayer,
        hip: Number(r.hip),
        constellation: r.con,
        constellation_en: conInfo[0],
        constellation_ar: conInfo[1],
        ra_hours: round(Number(r.ra), 6),
        dec_deg: round(Number(r.dec), 6),
        mag: Number(r.mag),
        distance_ly: lightYears(r.dist),
        spectral: r.spect || null,
      };
      if (ar) {
        Object.assign(rec, {
          arabic_name: ar.ar,
          arabic_translit: ar.tr,
          arabic_part: ar.part ?? "full",
          meaning_en: ar.en,
          meaning_ar: ar.arMeaning,
          name_source: { citation: KS_CITATION(iau), url: KS_URL },
        });
      }
      return rec;
    });

  if (unusedArabic.size) throw new Error(`Curated Arabic names not matched to a star: ${[...unusedArabic].join(", ")}`);
  const ids = new Set();
  for (const s of stars) {
    if (ids.has(s.id)) throw new Error(`Duplicate id ${s.id}`);
    ids.add(s.id);
  }

  const out = {
    meta: {
      generated_by: "scripts/sky/build-stars.mjs",
      selection: `V magnitude ≤ ${MAG_LIMIT} (primary components only), plus ${EXTRAS.join(", ")}`,
      epoch: "J2000.0 (equinox and epoch)",
      positions: { source: "HYG database v4.1 (astronexus)", url: HYG_URL, sha256: HYG_SHA256, licence: "CC BY-SA 4.0" },
      names: "IAU Working Group on Star Names (WGSN), as carried in HYG v4.1",
      arabic_names: "Kunitzsch & Smart, A Dictionary of Modern Star Names (2006); pending scholar review, see data/sky/README.md",
      count: stars.length,
      arabic_origin_count: stars.filter((s) => s.arabic_name).length,
    },
    stars,
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${stars.length} stars, ${out.meta.arabic_origin_count} with Arabic-origin names`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
