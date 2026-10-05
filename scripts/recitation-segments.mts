/**
 * Build the word timings that highlight each word while Al-Husary recites it. Needs network.
 *
 *   npx tsx scripts/recitation-segments.mts      # → data/content/recitation/husary-segments.json
 *
 * Source: Quran.com API v4, recitation 6 (Al-Husary), per-verse segments [index, word, start ms, end ms] timed to
 * the exact EveryAyah file the app plays (Husary_64kbps/SSSAAA.mp3). A verse is kept only when every check
 * passes, so a highlight can never land on the wrong word; any other verse simply plays without highlighting:
 *   1. the timings are for the same file the app plays;
 *   2. Quran.com's word list has as many words as the KFGQPC v18 verse (verseTokens: tokens with letters);
 *   3. every word matches the KFGQPC word at the same position letter for letter (skeleton(), as in the matcher);
 *   4. each word 1..N has exactly one segment, with start < end, in order, never overlapping the next word.
 */
import fs from "node:fs";
import path from "node:path";
import { skeleton } from "../src/lib/quran/normalize";
import { AYAH_COUNTS, RECITER, recitationFile, verseTokens } from "../src/lib/quran/recitation";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "prep/data/raw/quran_kfgqpc_hafs_v18.json");
const OUT = path.join(ROOT, "data/content/recitation/husary-segments.json");
const API = "https://api.quran.com/api/v4";
const RECITATION_ID = 6;

/** KFGQPC words of a verse, numbered exactly as the highlighter numbers them. */
const kfgqpcWords = (text: string) => verseTokens(text).filter((t) => t.word !== null).map((t) => t.text);

const rows = JSON.parse(fs.readFileSync(RAW, "utf8")) as { sora: number; aya_no: number; aya_text: string }[];
const text = new Map(rows.map((r) => [`${r.sora}:${r.aya_no}`, r.aya_text]));

async function get<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

type AudioFile = { verse_key: string; url: string; segments?: number[][] };
type Verse = { verse_key: string; words: { char_type_name: string; position: number; text_uthmani: string }[] };

const verses: Record<string, [number, number][]> = {};
const rejected: Record<string, string[]> = {};
const reject = (key: string, why: string) => (rejected[why] ??= []).push(key);

for (let sura = 1; sura <= AYAH_COUNTS.length; sura++) {
  const [audio, words] = await Promise.all([
    get<{ audio_files: AudioFile[] }>(`${API}/recitations/${RECITATION_ID}/by_chapter/${sura}?fields=segments&per_page=300`),
    get<{ verses: Verse[] }>(`${API}/verses/by_chapter/${sura}?words=true&word_fields=text_uthmani&per_page=300&fields=`),
  ]);
  const wordsBy = new Map(words.verses.map((v) => [v.verse_key, v.words.filter((w) => w.char_type_name === "word")]));
  for (const f of audio.audio_files) {
    const key = f.verse_key;
    const ours = kfgqpcWords(text.get(key) ?? "");
    const theirs = wordsBy.get(key) ?? [];
    if (!f.url.endsWith(`/Husary_64kbps/${recitationFile(key)}`)) { reject(key, "timed to a different audio file"); continue; }
    if (!ours.length || ours.length !== theirs.length) { reject(key, "word count differs from KFGQPC"); continue; }
    if (theirs.some((w, i) => w.position !== i + 1 || skeleton(w.text_uthmani) !== skeleton(ours[i]))) { reject(key, "a word differs from KFGQPC"); continue; }
    const segs = (f.segments ?? []).filter((s) => s.length === 4);
    const byWord = new Map<number, number[]>();
    let dup = false;
    for (const s of segs) {
      if (byWord.has(s[1])) dup = true;
      byWord.set(s[1], s);
    }
    const timed = ours.map((_, i) => byWord.get(i + 1));
    if (dup || segs.length !== ours.length || timed.some((s) => !s)) { reject(key, "not exactly one segment per word"); continue; }
    const spans = timed.map((s) => [Math.round(s![2]), Math.round(s![3])] as [number, number]);
    if (spans.some(([a, b], i) => !(a >= 0 && b > a) || (i > 0 && a < spans[i - 1][1]))) { reject(key, "timings out of order or overlapping"); continue; }
    verses[key] = spans;
  }
  process.stdout.write(`\rsura ${sura}/114`);
}

const total = AYAH_COUNTS.reduce((a, b) => a + b, 0);
const kept = Object.keys(verses).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    reciter: RECITER.name_en,
    audio: "EveryAyah Husary_64kbps (the file the app plays)",
    source: `Quran.com API v4, recitation ${RECITATION_ID}, per-verse segments`,
    format: "verse key → [start ms, end ms] for each KFGQPC word, in order",
    verses,
  }) + "\n",
);
console.log(`\nkept ${kept}/${total} verses (${((kept / total) * 100).toFixed(1)}%) → ${path.relative(ROOT, OUT)}`);
for (const [why, keys] of Object.entries(rejected)) console.log(`  rejected ${keys.length}: ${why} (e.g. ${keys.slice(0, 6).join(", ")})`);
