/**
 * Verse-by-verse recitation: a human recording of each verse, looked up by its key. Nothing is generated.
 *
 * Source: EveryAyah.com, Mahmoud Khalil Al-Husary (murattal), Hafs ʿan ʿĀṣim, one MP3 per verse named SSSAAA.mp3.
 * Its numbering matches KFGQPC Hafs v18 (6,236 verses), and a sura's first verse is recorded without the
 * bismillah, matching the verse text the app shows (only 1:1 is the bismillah). Both are verified by
 * `npx tsx scripts/recitation-check.mts`, which also pins checksums for every verse the cards cite.
 * The 64 kbps files are used because they are the exact files the word timings were made for
 * (scripts/recitation-segments.mts), so the highlighted word follows the recitation.
 * Shared by server and client code: no server-only imports here.
 */

export const RECITER = {
  id: "husary",
  name_en: "Mahmoud Khalil Al-Husary",
  name_ar: "محمود خليل الحصري",
  short_en: "Al-Husary",
  short_ar: "الحصري",
  style: "murattal",
  riwaya: "Hafs ʿan ʿĀṣim",
  source: "EveryAyah.com",
  base_url: "https://everyayah.com/data/Husary_64kbps",
} as const;

/** Verses per sura in the Hafs (Kufan) count, sura 1 first. Sums to 6,236; checked against KFGQPC v18 in the tests. */
export const AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77,
  227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36,
  25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const KEY_RE = /^(\d{1,3}):(\d{1,3})$/;

/** Parse "10:5" into numbers, or null when it is not a real verse in the Hafs count. */
export function parseVerseKey(key: string): { sura: number; aya: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const sura = Number(m[1]);
  const aya = Number(m[2]);
  if (sura < 1 || sura > AYAH_COUNTS.length || aya < 1 || aya > AYAH_COUNTS[sura - 1]) return null;
  return { sura, aya };
}

/** The recording file name for a verse ("10:5" → "010005.mp3"), or null for an invalid key. */
export function recitationFile(key: string): string | null {
  const v = parseVerseKey(key);
  if (!v) return null;
  return `${String(v.sura).padStart(3, "0")}${String(v.aya).padStart(3, "0")}.mp3`;
}

/**
 * Split KFGQPC verse text into display tokens. Tokens with letters are the verse's words, numbered from 0; the
 * verse-number glyph and marks written as their own token (۞) are not words. Word timings (husary-segments.json)
 * are indexed by this same numbering, so the generator and the highlighter must both use this function.
 */
export function verseTokens(text: string): { text: string; word: number | null }[] {
  let n = 0;
  return text
    .trim()
    .split(/\s+/)
    .map((t) => ({ text: t, word: /\p{L}/u.test(t) ? n++ : null }));
}

/** The recording URL for a verse, or null for an invalid key (so a wrong key can never play another verse). */
export function recitationUrl(key: string): string | null {
  const file = recitationFile(key);
  return file ? `${RECITER.base_url}/${file}` : null;
}

/** After a verse's last word ends, keep it lit this long (the reciter's final madd often runs past the timing). */
const TAIL_MS = 400;

/** Index of the word being recited at `ms`: the last word that has started, or -1 before the first / after the last. */
export function wordAt(spans: [number, number][], ms: number): number {
  if (!spans.length || ms < spans[0][0] || ms > spans[spans.length - 1][1] + TAIL_MS) return -1;
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (spans[mid][0] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
