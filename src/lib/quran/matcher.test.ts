import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIndex, matchQuran, type QuranIndex, type VerseRow } from "./matcher";

const RAW = path.join(process.cwd(), "prep/data/raw/quran_kfgqpc_hafs_v18.json");
let ix: QuranIndex;

beforeAll(() => {
  const rows = JSON.parse(fs.readFileSync(RAW, "utf8")) as Record<string, unknown>[];
  const verses: VerseRow[] = rows.map((r) => ({
    key: `${r.sora}:${r.aya_no}`,
    sura: r.sora as number,
    aya: r.aya_no as number,
    text_emlaey: r.aya_text_emlaey as string,
    text_uthmani: r.aya_text as string,
    sura_name_ar: r.sora_name_ar as string,
    sura_name_en: r.sora_name_en as string,
  }));
  ix = buildIndex(verses);
});

// Same cases as prep/scripts/match_inscription.py --test
const CASES: [string, string, string | null, number?][] = [
  ["قُلْ هُوَ اللَّهُ أَحَدٌ اللَّهُ الصَّمَدُ", "exact", "112:1"],
  ["هو الذي جعل الشمس ضياء والقمر نورا", "exact", "10:5"],
  ["هو الذي جعل القمر ضياء والشمس نورا", "near", "10:5"],
  ["الله لا إله إلا هو الحي القيوم", "exact", "2:255", 2],
  ["بسم الله الرحمن الرحيم", "exact", "1:1", 2],
  ["ولا غالب إلا الله", "none", null],
  ["لا إله إلا الله محمد رسول الله", "none", null],
  ["ما شاء الله لا قوة إلا بالله", "exact", "18:39"],
  ["قل هو الله احد الله الصمد لم يلد ولم يولد", "exact", "112:1"],
  ["الله أكبر", "too_short", null],
  ["النظافة من الإيمان", "none", null],
  ["إن الله وملائكته يصلون على النبي", "exact", "33:56"],
  ["قال يا مريم أنى لك هذا", "exact", "3:37"],
  ["الله نور السماوات والارض", "exact", "24:35"],
  ["الله لا اله الا هو الحي القيم لا تاخذه سنة ولا نوم", "near", "2:255"],
];

describe("matchQuran", () => {
  it.each(CASES)("%s → %s %s", (text, status, key, nLoc) => {
    const r = matchQuran(ix, text);
    expect(r.status).toBe(status);
    if (r.status === "exact") {
      expect(r.locations[0].verses[0]).toBe(key);
      if (nLoc) expect(r.locations.length).toBe(nLoc);
    }
    if (r.status === "near") expect(r.candidates[0].verses[0]).toBe(key);
  });
  it("flags a verse that crosses a boundary as two verses", () => {
    const r = matchQuran(ix, "قل هو الله أحد الله الصمد");
    expect(r.status === "exact" && r.locations[0].verses).toEqual(["112:1", "112:2"]);
  });
  it("lists differences for a swapped quote", () => {
    const r = matchQuran(ix, "هو الذي جعل القمر ضياء والشمس نورا");
    expect(r.status === "near" && r.candidates[0].differences.length).toBeGreaterThan(0);
  });
});
