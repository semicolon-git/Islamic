import { describe, expect, it } from "vitest";
import { cardHref, cardsFirst, conceptHue, conceptLabel, normalizeSearch, searchConcepts, ARABIC_LABEL_FIXES } from "./labels";
import { fitWithin } from "./image";

const C = [
  { id: "moon", label_en: "Moon", label_ar: "القمر" },
  { id: "date_palm", label_en: "Date palm / dates", label_ar: "النخل والتمر" },
  { id: "qibla", label_en: "Kaaba / qibla direction (compass, prayer mat)", label_ar: "القبلة" },
  { id: "mosque_lamp", label_en: "Mosque Lamp", label_ar: "mosque_lamp" },
  { id: "sun", label_en: "Sun", label_ar: "الشمس" },
];

describe("conceptLabel", () => {
  it("uses short display labels and never shows a raw id in Arabic", () => {
    expect(conceptLabel(C[2], "en")).toBe("Qibla (prayer direction)");
    expect(conceptLabel(C[3], "ar")).toBe("قنديل المسجد");
    expect(conceptLabel(C[0], "ar")).toBe("القمر");
    expect(conceptLabel({ id: "x_y", label_en: "X Y", label_ar: "x_y" }, "ar")).toBe("X Y");
  });
  it("exposes Arabic fixes for the seed", () => {
    expect(ARABIC_LABEL_FIXES.astrolabe).toBe("الأسطرلاب");
    expect(Object.values(ARABIC_LABEL_FIXES).every((v) => /[؀-ۿ]/.test(v))).toBe(true);
  });
});

describe("searchConcepts", () => {
  it("returns everything for an empty query", () => {
    expect(searchConcepts(C, "  ")).toHaveLength(C.length);
  });
  it("matches English prefixes, case-insensitively", () => {
    expect(searchConcepts(C, "PAL").map((c) => c.id)).toEqual(["date_palm"]);
    expect(searchConcepts(C, "lamp").map((c) => c.id)).toEqual(["mosque_lamp"]);
  });
  it("matches Arabic with or without the article and diacritics", () => {
    expect(searchConcepts(C, "قمر").map((c) => c.id)).toEqual(["moon"]);
    expect(searchConcepts(C, "القَمَر").map((c) => c.id)).toEqual(["moon"]);
    expect(searchConcepts(C, "قنديل").map((c) => c.id)).toEqual(["mosque_lamp"]);
  });
  it("requires every term to match", () => {
    expect(searchConcepts(C, "moon sun")).toEqual([]);
  });
  it("ranks exact word matches first", () => {
    const list = [
      { id: "sunset", label_en: "Sunset", label_ar: "" },
      { id: "sun", label_en: "Sun", label_ar: "" },
    ];
    expect(searchConcepts(list, "sun").map((c) => c.id)).toEqual(["sun", "sunset"]);
  });
});

describe("helpers", () => {
  it("normalises Arabic letter forms", () => {
    expect(normalizeSearch("أَإآ ة ى")).toBe("ااا ه ي");
  });
  it("puts concepts with cards first, keeping order", () => {
    const l = [{ id: "a", has_card: false }, { id: "b", has_card: true }, { id: "c", has_card: false }, { id: "d", has_card: true }];
    expect(cardsFirst(l).map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });
  it("gives stable hues", () => {
    expect(conceptHue("moon", "nature")).toBe(conceptHue("moon", "nature"));
  });
  it("links concept cards to the concept page and others to /card", () => {
    expect(cardHref({ id: "card:moon", kind: "concept", concept_id: "moon" })).toBe("/c/moon");
    expect(cardHref({ id: "answer:kaaba", kind: "answer", concept_id: "qibla" })).toBe("/card/answer%3Akaaba");
  });
});

describe("fitWithin", () => {
  it("downscales the long edge to 1024 and keeps aspect", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });
  it("never upscales", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
  it("handles empty input", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});
