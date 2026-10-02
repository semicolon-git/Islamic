import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIndex, matchQuran, type QuranIndex, type VerseRow } from "@/lib/quran/matcher";
import { alignWords, keysOf, proposedKeys, refLabel, toInscriptionView, type InscriptionVerse } from "./inscription-view";

const RAW = path.join(process.cwd(), "prep/data/raw/quran_kfgqpc_hafs_v18.json");
let ix: QuranIndex;
let byKey: Map<string, InscriptionVerse>;

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
  byKey = new Map(verses.map((v) => [v.key, { ...v, translation: { edition_id: "en.test", edition_name: "Test", text: `T ${v.key}` } }]));
});

const view = (text: string) => {
  const m = matchQuran(ix, text);
  return toInscriptionView(m, keysOf(m).map((k) => byKey.get(k)!));
};

describe("toInscriptionView", () => {
  it("exact: the Light Verse opening (lamp inscription) → 24:35, partial, with its verse and translation", () => {
    const v = view("الله نور السموات والأرض مثل نوره كمشكاة فيها مصباح");
    expect(v.status).toBe("exact");
    if (v.status !== "exact") return;
    expect(v.locations).toHaveLength(1);
    const [loc] = v.locations;
    expect(loc.ref).toBe("24:35");
    expect(loc.partial).toBe(true);
    expect(loc.sura).toBe(24);
    expect(loc.ayaFrom).toBe(35);
    expect(loc.verses[0].text_uthmani).toBe(byKey.get("24:35")!.text_uthmani); // verbatim from the database
    expect(loc.verses[0].translation?.text).toBe("T 24:35");
  });

  it("exact: lists every location (Ayat al-Kursi opening is in 2:255 and 3:2)", () => {
    const v = view("الله لا إله إلا هو الحي القيوم");
    expect(v.status).toBe("exact");
    if (v.status !== "exact") return;
    expect(v.locations.map((l) => l.ref).sort()).toEqual(["2:255", "3:2"]);
  });

  it("exact: a quote crossing a verse boundary gets a range reference", () => {
    const v = view("قل هو الله أحد الله الصمد");
    expect(v.status === "exact" && v.locations[0].ref).toBe("112:1–2");
    expect(v.status === "exact" && v.locations[0].ayaTo).toBe(2);
  });

  it("near: a swapped quote shows both texts and the differences, word by word", () => {
    const v = view("هو الذي جعل القمر ضياء والشمس نورا");
    expect(v.status).toBe("near");
    if (v.status !== "near") return;
    const c = v.candidates[0];
    expect(c.ref).toBe("10:5");
    expect(c.alignment.differences).toEqual([
      { op: "replace", given: "القمر", standard: "الشمس" },
      { op: "replace", given: "والشمس", standard: "والقمر" },
    ]);
    expect(c.alignment.inscription.filter((w) => w.state !== "same").map((w) => w.w)).toEqual(["القمر", "والشمس"]);
    // The rest of the verse (outside the quote) is not reported as a difference.
    expect(c.alignment.standard.length).toBe(7);
  });

  it("near: an OCR slip is a difference, not an error", () => {
    const v = view("الله لا اله الا هو الحي القيم لا تاخذه سنة ولا نوم");
    expect(v.status === "near" && v.candidates[0].alignment.differences).toEqual([{ op: "replace", given: "القيم", standard: "القيوم" }]);
  });

  it("none: the Alhambra motto and the shahada are not identified as verses", () => {
    expect(view("ولا غالب إلا الله").status).toBe("none");
    expect(view("لا إله إلا الله محمد رسول الله").status).toBe("none");
  });

  it("too_short: two words cannot identify a verse", () => {
    expect(view("الله أكبر")).toEqual({ status: "too_short", input: "الله أكبر" });
  });
});

describe("helpers", () => {
  it("refLabel", () => {
    expect(refLabel(["24:35"])).toBe("24:35");
    expect(refLabel(["112:1", "112:2"])).toBe("112:1–2");
    expect(refLabel(["2:286", "3:1"])).toBe("2:286–3:1");
    expect(refLabel([])).toBe("");
  });

  it("proposedKeys: all exact locations, else the best near candidate, else none", () => {
    expect(proposedKeys(matchQuran(ix, "الله لا إله إلا هو الحي القيوم")).sort()).toEqual(["2:255", "3:2"]);
    expect(proposedKeys(matchQuran(ix, "هو الذي جعل القمر ضياء والشمس نورا"))).toEqual(["10:5"]);
    expect(proposedKeys(matchQuran(ix, "ولا غالب إلا الله"))).toEqual([]);
  });

  it("alignWords ignores spelling of alef/hamza and tashkil", () => {
    const a = alignWords("الله نور السماوات والارض", "الله نور السموات والأرض مثل نوره");
    expect(a.differences).toEqual([]);
    expect(a.standard.map((w) => w.w)).toEqual(["الله", "نور", "السموات", "والأرض"]);
  });

  it("alignWords reports missing and extra words", () => {
    const a = alignWords("بسم الله الرحيم", "بسم الله الرحمن الرحيم");
    expect(a.differences).toEqual([{ op: "insert", given: "", standard: "الرحمن" }]);
    expect(a.standard.find((w) => w.state === "missing")?.w).toBe("الرحمن");
    const b = alignWords("بسم الله العظيم الرحمن الرحيم", "بسم الله الرحمن الرحيم");
    expect(b.differences).toEqual([{ op: "delete", given: "العظيم", standard: "" }]);
    expect(b.inscription.find((w) => w.state === "extra")?.w).toBe("العظيم");
  });
});
