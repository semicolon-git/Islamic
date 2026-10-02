#!/usr/bin/env node
// Generate the PWA icon set, favicons, badge and Open Graph image into public/icons/.
//
//   node scripts/make-icons.mjs
//
// The mark is the 8-point khatam star from src/components/ui/khatam.tsx (two squares, one turned 45°)
// in mint #36dcb8 on deep navy #10143a, with a small crescent at its heart. Shapes are drawn as SVG and
// rasterised by sharp. Text on the OG image is rendered by sharp's Pango + HarfBuzz text input using the app's
// own IBM Plex Sans Arabic files, so «آيات حولك» is shaped and joined correctly (no system-font fallback).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/icons");
fs.mkdirSync(out, { recursive: true });

const NAVY = "#10143a";
const NAVY_DEEP = "#0b0e29";
const MINT = "#36dcb8";
const INK_2 = "#b5badb";

/**
 * Unpack a WOFF 1.0 file into the plain TrueType/OpenType font it wraps. sharp's bundled FreeType does not
 * open web fonts (it silently falls back to system fonts), so we hand it the sfnt. Spec: https://www.w3.org/TR/WOFF/
 */
function woffToSfnt(woff) {
  if (woff.toString("ascii", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const flavor = woff.readUInt32BE(4);
  const n = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const offset = woff.readUInt32BE(e + 4);
    const compLength = woff.readUInt32BE(e + 8);
    const origLength = woff.readUInt32BE(e + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag: woff.subarray(e, e + 4), checksum: woff.readUInt32BE(e + 16), data: compLength < origLength ? zlib.inflateSync(raw) : raw });
  }
  const pow = 2 ** Math.floor(Math.log2(n));
  const head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(flavor, 0);
  head.writeUInt16BE(n, 4);
  head.writeUInt16BE(pow * 16, 6);
  head.writeUInt16BE(Math.log2(pow), 8);
  head.writeUInt16BE(n * 16 - pow * 16, 10);
  const chunks = [head];
  let offset = head.length;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    t.tag.copy(head, r);
    head.writeUInt32BE(t.checksum, r + 4);
    head.writeUInt32BE(offset, r + 8);
    head.writeUInt32BE(t.data.length, r + 12);
    const padded = Buffer.alloc((t.data.length + 3) & ~3);
    t.data.copy(padded);
    chunks.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(chunks);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "make-icons-"));
function plex(file) {
  const dest = path.join(tmp, file.replace(".woff", ".ttf"));
  fs.writeFileSync(dest, woffToSfnt(fs.readFileSync(path.join(root, "node_modules/@fontsource/ibm-plex-sans-arabic/files", file))));
  return dest;
}
// IBM Plex Sans Arabic is the app's long-form Arabic face; its Latin companion is IBM Plex Sans.
const FONTS = {
  arabic: plex("ibm-plex-sans-arabic-arabic-600-normal.woff"),
  title: plex("ibm-plex-sans-arabic-latin-500-normal.woff"),
  body: plex("ibm-plex-sans-arabic-latin-400-normal.woff"),
};

/**
 * Render Pango markup with one font file. libvips only honours the first `fontfile` registered in a process
 * (later ones silently fall back to system fonts), so each text block renders in a fresh child process.
 */
function text(markup, fontDesc, fontfile, opts = {}) {
  const job = JSON.stringify({ text: markup, font: fontDesc, fontfile, rgba: true, dpi: 72, ...opts });
  const code = `import sharp from "sharp";
    const o = JSON.parse(process.argv[1]);
    const { data, info } = await sharp({ text: o }).png().toBuffer({ resolveWithObject: true });
    process.stdout.write(JSON.stringify({ w: info.width, h: info.height, b64: data.toString("base64") }));`;
  const res = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code, job], { cwd: root, maxBuffer: 64 << 20 }).toString());
  return { data: Buffer.from(res.b64, "base64"), info: { width: res.w, height: res.h } };
}

/**
 * The mark, centred on (cx, cy). `r` is the half-side of each square.
 * Two rounded squares (stroked), a faint filled star behind them for depth, and a crescent in the middle.
 */
function mark({ cx = 256, cy = 256, r = 118, stroke = 30, color = MINT, fillOpacity = 0.14, crescent = true, id = "m" }) {
  const sq = (rot) =>
    `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.09}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  const cr = r * 0.46; // crescent outer radius
  const cut = cr * 0.8; // radius of the circle that carves the crescent
  const dx = cr * 0.42;
  const dy = -cr * 0.26;
  const moon = crescent
    ? `<mask id="${id}-moon" maskUnits="userSpaceOnUse" x="0" y="0" width="${cx * 2}" height="${cy * 2}">
         <circle cx="${cx}" cy="${cy}" r="${cr}" fill="#fff"/>
         <circle cx="${cx + dx}" cy="${cy + dy}" r="${cut}" fill="#000"/>
       </mask>
       <circle cx="${cx}" cy="${cy}" r="${cr}" fill="${color}" mask="url(#${id}-moon)"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="${color}"/>`;
  return `
    <g fill="${color}" fill-opacity="${fillOpacity}" stroke="none">${sq(0)}${sq(45)}</g>
    <g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round">${sq(0)}${sq(45)}</g>
    ${moon}`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const glow = (cy = "42%") =>
  `<defs><radialGradient id="g" cx="50%" cy="${cy}" r="72%"><stop offset="0" stop-color="#1a2160"/><stop offset="1" stop-color="${NAVY}"/></radialGradient></defs>`;

/** "any" icon: rounded navy tile with a soft inner glow; the mark sits inside generous padding. */
const tileIcon = () => svg(512, 512, `${glow()}<rect width="512" height="512" rx="112" fill="url(#g)"/>${mark({ r: 116, stroke: 30 })}`);
/** Maskable icon: full-bleed square; the mark stays inside the 40%-radius safe zone (points reach r≈155). */
const maskableIcon = () => svg(512, 512, `${glow("45%")}<rect width="512" height="512" fill="url(#g)"/>${mark({ r: 96, stroke: 26 })}`);
/** Apple touch icon: iOS rounds the corners itself, so full-bleed. */
const appleIcon = () => svg(512, 512, `${glow()}<rect width="512" height="512" fill="url(#g)"/>${mark({ r: 112, stroke: 30 })}`);
/** Favicon (scales): flat colours and bolder strokes so it survives 16px tabs. */
const faviconSvg = () => svg(512, 512, `<rect width="512" height="512" rx="112" fill="${NAVY}"/>${mark({ r: 124, stroke: 40, fillOpacity: 0.18 })}`);
/** Tiny raster favicon: thicker strokes and a solid dot (a crescent turns to mush at 32px). */
const favicon32Svg = () => svg(512, 512, `<rect width="512" height="512" rx="96" fill="${NAVY}"/>${mark({ r: 134, stroke: 52, fillOpacity: 0.2, crescent: false })}`);
/** Monochrome (alpha-only) silhouette for notification badges and `purpose: monochrome`. */
const monoSvg = () => svg(512, 512, mark({ r: 132, stroke: 46, color: "#ffffff", fillOpacity: 0 }));

/** Thin lattice of khatam outlines used as a quiet background texture on the OG card. */
function lattice(x0, y0, cols, rows, step, opacity) {
  let s = "";
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cx = x0 + i * step;
      const cy = y0 + j * step;
      const r = step * 0.3;
      const sq = `x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"`;
      s += `<rect ${sq}/><rect ${sq} transform="rotate(45 ${cx} ${cy})"/>`;
    }
  return `<g fill="none" stroke="${MINT}" stroke-opacity="${opacity}" stroke-width="1.5">${s}</g>`;
}

const OG = { W: 1200, H: 630, X: 80, markX: 950 };
function ogBackground() {
  const { W, H, markX } = OG;
  return svg(
    W,
    H,
    `<defs>
       <radialGradient id="glow" cx="76%" cy="50%" r="55%">
         <stop offset="0" stop-color="#1c2466"/>
         <stop offset="1" stop-color="${NAVY}"/>
       </radialGradient>
       <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
         <stop offset="0" stop-color="#fff" stop-opacity="0"/>
         <stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/>
         <stop offset="1" stop-color="#fff" stop-opacity="1"/>
       </linearGradient>
       <mask id="fm"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
     </defs>
     <rect width="${W}" height="${H}" fill="url(#glow)"/>
     <g mask="url(#fm)">${lattice(615, 15, 7, 7, 100, 0.08)}</g>
     <g transform="translate(${markX} ${H / 2})">
       <circle r="196" fill="${NAVY_DEEP}" fill-opacity="0.6"/>
       <g transform="translate(-256 -256)">${mark({ r: 124, stroke: 22, fillOpacity: 0.1, id: "og" })}</g>
     </g>`,
  );
}

async function og() {
  const { X, H } = OG;
  const bg = await sharp(Buffer.from(ogBackground())).png().toBuffer();
  const arabic = text(`<span foreground="${MINT}">آيات حولك</span>`, "IBM Plex Sans Arabic SemiBold, SemiBold 54", FONTS.arabic);
  const title = text(`<span foreground="#ffffff" letter_spacing="-1200">Signs Around You</span>`, "IBM Plex Sans Arabic Medium, Medium 74", FONTS.title);
  const tagline = text(
    `<span foreground="${INK_2}">Point your camera at the world and discover what the Quran says — only from approved sources.</span>`,
    "IBM Plex Sans Arabic, 28",
    FONTS.body,
    { width: 540, spacing: 2 },
  );
  if (X + title.info.width > 700) throw new Error(`OG title too wide (${title.info.width}px)`);
  const gap1 = 6;
  const gap2 = 34;
  const rule = 4;
  const gap3 = 30;
  const block = arabic.info.height + gap1 + title.info.height + gap2 + rule + gap3 + tagline.info.height;
  let y = Math.round((H - block) / 2);
  const comps = [];
  comps.push({ input: arabic.data, left: X, top: y });
  y += arabic.info.height + gap1;
  comps.push({ input: title.data, left: X - 3, top: y });
  y += title.info.height + gap2;
  comps.push({ input: Buffer.from(svg(64, rule, `<rect width="64" height="${rule}" rx="2" fill="${MINT}"/>`)), left: X, top: y });
  y += rule + gap3;
  comps.push({ input: tagline.data, left: X, top: y });
  await sharp(bg).composite(comps).png({ compressionLevel: 9 }).toFile(path.join(out, "og.png"));
}

async function png(svgText, size, file, { flatten } = {}) {
  let img = sharp(Buffer.from(svgText), { density: Math.max(72, Math.ceil((72 * size) / 512) * 2) }).resize(size, size);
  if (flatten) img = img.flatten({ background: NAVY });
  await img.png({ compressionLevel: 9, palette: size <= 96 }).toFile(path.join(out, file));
}

async function run() {
  const files = ["icon.svg"];
  fs.writeFileSync(path.join(out, "icon.svg"), faviconSvg().replace(/\s{2,}/g, " ").trim() + "\n");
  for (const s of [192, 512]) {
    await png(tileIcon(), s, `icon-${s}.png`);
    await png(maskableIcon(), s, `maskable-${s}.png`, { flatten: true });
    files.push(`icon-${s}.png`, `maskable-${s}.png`);
  }
  await png(appleIcon(), 180, "apple-touch-icon.png", { flatten: true });
  await png(favicon32Svg(), 32, "favicon-32.png");
  await png(tileIcon(), 48, "icon-48.png");
  await png(monoSvg(), 96, "badge-96.png");
  await png(monoSvg(), 512, "monochrome-512.png");
  await og();
  files.push("apple-touch-icon.png", "favicon-32.png", "icon-48.png", "badge-96.png", "monochrome-512.png", "og.png");
  for (const f of files) console.log(`✓ public/icons/${f}`, `${fs.statSync(path.join(out, f)).size} B`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
