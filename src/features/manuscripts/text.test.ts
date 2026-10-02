import { describe, expect, it } from "vitest";
import { hasCollision, suggestExpansions } from "./abbreviations";
import { bbox, boxFromPoints, center, fitPolygon, orderLines, pointInPolygon, rectPolygon, regionAt, vIoU } from "./geometry";
import { cer, cerForm, detectTypedMarks, diffChars, levenshtein, normalizeStoreText, searchForm, stripDiacritics } from "./text";

describe("Unicode hygiene (memo M15, §7.4 pitfall 7)", () => {
  const cases: [string, string, string, string[]][] = [
    ["shadda typed before fatha is reordered (fatha first)", "بَّ", "بَّ", ["nfc"]],
    ["dotless letters kept", "ٮسر ڡ ٯ ں", "ٮسر ڡ ٯ ں", []],
    ["ornate parentheses kept", "﴿الحمد﴾", "﴿الحمد﴾", []],
    ["ﷺ kept", "محمد ﷺ", "محمد ﷺ", []],
    ["mixed digits kept as written", "١٢ ۱۲ 12", "١٢ ۱۲ 12", []],
    ["ZWNJ kept", "a‌b", "a‌b", []],
    ["presentation forms decomposed", "ﻻﺍ", "لاا", ["presentation"]],
    ["Persian yeh/keheh → Arabic", "یک", "يك", ["persian"]],
    ["bidi controls removed", "‫نص‬‏", "نص", ["bidi"]],
  ];
  for (const [name, input, out, changes] of cases)
    it(name, () => {
      const r = normalizeStoreText(input);
      expect(r.text).toBe(out);
      for (const c of changes) expect(r.changes).toContain(c);
    });
  it("is stable when called repeatedly (no stateful regex)", () => {
    expect(normalizeStoreText("‏x").changes).toEqual(["bidi"]);
    expect(normalizeStoreText("‏x").changes).toEqual(["bidi"]);
  });
  it("search form strips tashkil, unifies letters and maps digits", () => {
    expect(searchForm("أَحْمَدُ ١٢ ۳")).toBe("احمد 12 3");
    expect(stripDiacritics("بِسْمِ")).toBe("بسم");
  });
});

describe("CER and diff", () => {
  it("uses the dataset's rule", () => {
    expect(cerForm("قَالَ: ١٢ • هَذَا")).toBe("قال هذا");
    expect(cerForm("الخطأ", true)).toBe("الخطا");
    expect(cer("الخطا", "الخطأ")).toBeCloseTo(0.2);
    expect(cer("الخطا", "الخطأ", true)).toBe(0);
    expect(cer("", "abc")).toBe(1);
    expect(cer("x", "")).toBeNull();
    expect(levenshtein("كتاب", "كتب")).toBe(1);
  });
  it("character diff covers both strings", () => {
    const d = diffChars("القب", "الثقب");
    expect(d.filter((p) => p.op !== "insert").map((p) => p.text).join("")).toBe("القب");
    expect(d.filter((p) => p.op !== "delete").map((p) => p.text).join("")).toBe("الثقب");
    expect(d).toContainEqual({ op: "insert", text: "ث" });
  });
  it("spots marks typed as text", () => {
    expect(detectTypedMarks("بذأ صح ثم كذا")).toEqual(["صح", "كذا"]);
    expect(detectTypedMarks("أصحاب")).toEqual([]);
  });
});

describe("abbreviations are genre-aware and never global (memo §2.3)", () => {
  it("أنبا expands to أنبأنا, never to أخبرنا", () => {
    const s = suggestExpansions("أنبا", "hadith");
    expect(s.map((x) => x.expan)).toEqual(["أنبأنا"]);
    expect(s[0].warn).toBe(true);
  });
  it("«خ» in a margin is a variant (nuskha); al-Bukhārī only fits rijāl works", () => {
    const margin = suggestExpansions("خ", "lexicon", "margin");
    expect(margin[0]).toMatchObject({ expan: "نسخة", fits: true });
    expect(margin.find((x) => x.expan === "البخاري")?.fits).toBe(false);
    const rijal = suggestExpansions("خ", "rijal", "main");
    expect(rijal[0]).toMatchObject({ expan: "البخاري", fits: true });
    expect(hasCollision("خ")).toBe(true);
  });
  it("«ق» means Ibn Mājah in rijāl but muttafaq ʿalayh in al-Jāmiʿ al-Ṣaghīr", () => {
    expect(suggestExpansions("ق", "rijal")[0].expan).toBe("ابن ماجه");
    expect(suggestExpansions("ق", "hadith")[0].expan).toBe("متفق عليه");
  });
  it("al-Qāmūs sigla for the lexicon genre", () => {
    expect(suggestExpansions("ة", "lexicon")[0]).toMatchObject({ expan: "قرية", fits: true });
    expect(suggestExpansions("ع", "lexicon")[0].expan).toBe("موضع");
    expect(suggestExpansions("م", "lexicon")[0].expan).toBe("معروف");
    expect(suggestExpansions("جج", "lexicon")[0].expan).toBe("جمع الجمع");
  });
  it("ignores vowel signs on the written form, returns nothing for unknown forms", () => {
    expect(suggestExpansions("ثَنَا", "hadith")[0].expan).toBe("حدثنا");
    expect(suggestExpansions("كتاب", "general")).toEqual([]);
    expect(suggestExpansions("  ", "general")).toEqual([]);
  });
  it("the taṣliya abbreviation expands in the reading, never to ﷺ", () => {
    expect(suggestExpansions("صلعم")[0].expan).toBe("صلى الله عليه وسلم");
  });
});

describe("geometry", () => {
  const sq = rectPolygon({ x: 10, y: 20, w: 100, h: 50 });
  it("boxes, centres and point tests", () => {
    expect(bbox(sq)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(center(sq)).toEqual([60, 45]);
    expect(pointInPolygon([50, 40], sq)).toBe(true);
    expect(pointInPolygon([5, 40], sq)).toBe(false);
    expect(boxFromPoints([30, 40], [10, 5])).toEqual({ x: 10, y: 5, w: 20, h: 35 });
    expect(bbox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
  it("moves and resizes a polygon keeping its shape", () => {
    expect(bbox(fitPolygon(sq, { x: 0, y: 0, w: 200, h: 25 }))).toEqual({ x: 0, y: 0, w: 200, h: 25 });
  });
  it("vertical IoU", () => {
    expect(vIoU({ x: 0, y: 0, w: 1, h: 10 }, { x: 0, y: 5, w: 1, h: 10 })).toBeCloseTo(5 / 15);
  });
  it("finds the smallest containing region and orders lines by region then seq", () => {
    const regions = [
      { id: "page", seq: 2, polygon: rectPolygon({ x: 0, y: 0, w: 1000, h: 1000 }) },
      { id: "margin", seq: 1, polygon: rectPolygon({ x: 800, y: 0, w: 100, h: 500 }) },
    ];
    expect(regionAt(regions, [850, 100])?.id).toBe("margin");
    const lines = [{ id: "a", region_id: "page", seq: 1 }, { id: "b", region_id: null, seq: 0 }, { id: "c", region_id: "margin", seq: 3 }];
    expect(orderLines(lines, regions).map((l) => l.id)).toEqual(["c", "a", "b"]);
  });
});
