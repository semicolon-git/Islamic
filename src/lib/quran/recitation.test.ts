import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AYAH_COUNTS, parseVerseKey, recitationFile, recitationUrl, RECITER, verseTokens, wordAt } from "./recitation";

const RAW = path.join(process.cwd(), "prep/data/raw/quran_kfgqpc_hafs_v18.json");
const rows = JSON.parse(fs.readFileSync(RAW, "utf8")) as { sora: number; aya_no: number; aya_text: string; aya_text_emlaey: string }[];
const SEGMENTS = path.join(process.cwd(), "data/content/recitation/husary-segments.json");
const timings = (JSON.parse(fs.readFileSync(SEGMENTS, "utf8")) as { verses: Record<string, [number, number][]> }).verses;

describe("recitation mapping", () => {
  it("uses the same verse count per sura as KFGQPC Hafs v18", () => {
    const counts = new Array<number>(114).fill(0);
    for (const r of rows) counts[r.sora - 1] = Math.max(counts[r.sora - 1], r.aya_no);
    expect(AYAH_COUNTS).toEqual(counts);
    expect(AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
  });

  it("maps every KFGQPC verse to its own file, and no two verses share one", () => {
    const files = new Set<string>();
    for (const r of rows) {
      const file = recitationFile(`${r.sora}:${r.aya_no}`);
      expect(file).toBe(`${String(r.sora).padStart(3, "0")}${String(r.aya_no).padStart(3, "0")}.mp3`);
      files.add(file!);
    }
    expect(files.size).toBe(6236);
  });

  it("builds the Al-Husary URL by key", () => {
    expect(recitationUrl("10:5")).toBe(`${RECITER.base_url}/010005.mp3`);
    expect(recitationUrl("114:6")).toBe(`${RECITER.base_url}/114006.mp3`);
    expect(recitationUrl("1:1")).toBe(`${RECITER.base_url}/001001.mp3`);
  });

  it("never returns a URL for a verse that does not exist", () => {
    for (const k of ["0:1", "1:0", "1:8", "2:287", "114:7", "115:1", "10:05x", "", "Q:10:5", "10-5", "1000:1"]) {
      expect(parseVerseKey(k)).toBeNull();
      expect(recitationUrl(k)).toBeNull();
    }
  });

  it("matches the text's bismillah rule: only 1:1 is the bismillah, other first verses start without it", () => {
    // The recordings follow the same rule (checked against the audio by scripts/recitation-check.mts).
    const first = (s: number) => rows.find((r) => r.sora === s && r.aya_no === 1)!.aya_text_emlaey;
    expect(first(1)).toMatch(/^بسم الله/);
    for (let s = 2; s <= 114; s++) expect(first(s)).not.toMatch(/^بسم الله الرحمن الرحيم/);
  });
});

describe("word highlighting", () => {
  it("splits a verse into words without the verse number or a standalone ۞, keeping every character", () => {
    const text = rows.find((r) => r.sora === 2 && r.aya_no === 26)!.aya_text;
    const tokens = verseTokens(text);
    expect(tokens[0]).toEqual({ text: "۞", word: null });
    expect(tokens[1].word).toBe(0);
    expect(tokens.at(-1)).toEqual({ text: "٢٦", word: null });
    expect(tokens.map((t) => t.text).join(" ")).toBe(text.trim().split(/\s+/).join(" "));
  });

  it("has timings for at least 99% of verses, each one span per KFGQPC word, in order", () => {
    const text = new Map(rows.map((r) => [`${r.sora}:${r.aya_no}`, r.aya_text]));
    const keys = Object.keys(timings);
    expect(keys.length / 6236).toBeGreaterThanOrEqual(0.99);
    for (const key of keys) {
      const words = verseTokens(text.get(key)!).filter((t) => t.word !== null).length;
      const spans = timings[key];
      expect(spans.length, key).toBe(words);
      spans.forEach(([a, b], i) => {
        expect(b, key).toBeGreaterThan(a);
        if (i > 0) expect(a, key).toBeGreaterThanOrEqual(spans[i - 1][1]);
      });
    }
  });

  it("finds the word being recited", () => {
    const spans: [number, number][] = [[900, 1300], [1400, 2700], [5000, 6000]];
    expect(wordAt(spans, 0)).toBe(-1); // before the first word
    expect(wordAt(spans, 900)).toBe(0);
    expect(wordAt(spans, 1350)).toBe(0); // a short gap keeps the previous word lit
    expect(wordAt(spans, 1400)).toBe(1);
    expect(wordAt(spans, 4000)).toBe(1); // a pause (waqf) keeps the last word lit
    expect(wordAt(spans, 5999)).toBe(2);
    expect(wordAt(spans, 6300)).toBe(2); // the final madd runs a little past its timing
    expect(wordAt(spans, 7000)).toBe(-1); // after the verse
    expect(wordAt([], 100)).toBe(-1);
  });
});
