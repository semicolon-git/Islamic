/**
 * Recitation gate: checks the Al-Husary recordings against the app's Quran text. Needs network.
 *
 *   npx tsx scripts/recitation-check.mts           # verify (exit 1 on any failure)
 *   npx tsx scripts/recitation-check.mts --write   # re-pin checksums after a deliberate source change
 *
 * 1. Numbering: in every sura the last verse (KFGQPC count) has a recording and the next number does not.
 * 2. Bismillah: first verses are recorded without it. 55:1, 101:1 and 103:1 are one word each, so their
 *    recordings must be shorter than the bismillah alone (1:1).
 * 3. Checksums: every verse cited by a card in data/content/cards is downloaded, and its sha256 must equal the
 *    pin in data/content/recitation/husary.json, so a changed upstream file can't slip in unnoticed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AYAH_COUNTS, RECITER, recitationFile, recitationUrl } from "../src/lib/quran/recitation";

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, "data/content/cards");
const PINS = path.join(ROOT, "data/content/recitation/husary.json");
const WRITE = process.argv.includes("--write");

type Pins = { reciter: string; source: string; base_url: string; files: Record<string, { file: string; bytes: number; sha256: string }> };

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

async function status(url: string): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await fetch(url, { method: "HEAD" })).status;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const fileUrl = (sura: number, aya: number) =>
  `${RECITER.base_url}/${String(sura).padStart(3, "0")}${String(aya).padStart(3, "0")}.mp3`;

// 1. Numbering
await pool(AYAH_COUNTS.map((n, i) => [i + 1, n] as const), 8, async ([sura, last]) => {
  const [have, extra] = await Promise.all([status(fileUrl(sura, last)), status(fileUrl(sura, last + 1))]);
  if (have !== 200) fail(`numbering: ${sura}:${last} (last verse) has no recording (HTTP ${have})`);
  if (extra === 200) fail(`numbering: ${sura}:${last + 1} has a recording but sura ${sura} has ${last} verses`);
});
console.log(`numbering: checked all ${AYAH_COUNTS.length} suras`);

// 2. Bismillah
const bismillah = (await download(recitationUrl("1:1")!)).length;
for (const k of ["55:1", "101:1", "103:1"]) {
  const bytes = (await download(recitationUrl(k)!)).length;
  if (bytes >= bismillah) fail(`bismillah: ${k} (${bytes} B) is not shorter than the bismillah (${bismillah} B); it may include it`);
}
console.log("bismillah: first verses recorded without it");

// 3. Checksums of every verse the cards cite
const keys = new Set<string>();
for (const f of fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))) {
  const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8")) as { content?: { verses?: { key: string }[] } };
  for (const v of card.content?.verses ?? []) keys.add(v.key);
}
const sorted = [...keys].sort((a, b) => {
  const [as, aa] = a.split(":").map(Number);
  const [bs, ba] = b.split(":").map(Number);
  return as - bs || aa - ba;
});
const old: Pins | null = fs.existsSync(PINS) ? JSON.parse(fs.readFileSync(PINS, "utf8")) : null;
const files: Pins["files"] = {};
await pool(sorted, 6, async (key) => {
  const url = recitationUrl(key);
  if (!url) return fail(`checksum: ${key} is not a valid verse key`);
  const buf = await download(url);
  files[key] = { file: recitationFile(key)!, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  const pin = old?.files[key];
  if (!WRITE && !pin) fail(`checksum: ${key} is cited by a card but not pinned (run with --write)`);
  else if (!WRITE && pin.sha256 !== files[key].sha256) fail(`checksum: ${key} changed upstream (${pin.sha256.slice(0, 12)} → ${files[key].sha256.slice(0, 12)})`);
});
if (WRITE) {
  const out: Pins = { reciter: RECITER.name_en, source: RECITER.source, base_url: RECITER.base_url, files: Object.fromEntries(sorted.map((k) => [k, files[k]])) };
  fs.mkdirSync(path.dirname(PINS), { recursive: true });
  fs.writeFileSync(PINS, JSON.stringify(out, null, 1) + "\n");
  console.log(`checksum: pinned ${sorted.length} verses → ${path.relative(ROOT, PINS)}`);
} else {
  console.log(`checksum: ${sorted.length} verses cited by cards`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("ok: recitation matches the Quran text");
