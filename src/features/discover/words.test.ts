import { describe, expect, it } from "vitest";
import { arabicWordMatcher, englishWordMatcher, subjectKey } from "./words";
import { normalizeArabic } from "@/lib/quran/normalize";

const tok = (s: string) => normalizeArabic(s);

describe("arabicWordMatcher", () => {
  it.each([
    ["رمان", "والرمان", true],
    ["الرمان", "ورمان", true],
    ["نخلة", "النخل", false],
    ["نخلة", "نخلتين", true],
    ["نخلة", "والنخلة", true],
    ["زيتون", "والزيتون", true],
    ["نحل", "النحل", true],
    ["نحل", "انتحل", false],
    ["جمل", "الجمل", true],
    ["جمل", "جميلا", false],
    ["قمر", "والقمر", true],
    ["قمر", "بالقمر", true],
    ["نجم", "بالنجم", true],
    ["نجم", "النجوم", false],
  ])("%s matches %s → %s", (term, token, ok) => {
    expect(arabicWordMatcher(term)!(tok(token))).toBe(ok);
  });
  it("ignores very short or multi-word terms", () => {
    expect(arabicWordMatcher("ال")).toBeNull();
    expect(arabicWordMatcher("فنجان قهوة")).toBeNull();
  });
});

describe("englishWordMatcher", () => {
  it("matches whole words and simple plurals", () => {
    const m = englishWordMatcher("pomegranate")!;
    expect(m("olives and pomegranates, similar")).toBe(true);
    expect(englishWordMatcher("bee")!("the bee and honey")).toBe(true);
    expect(englishWordMatcher("bee")!("he has been")).toBe(false);
    expect(englishWordMatcher("the")).toBeNull();
  });
});

describe("subjectKey", () => {
  it("prefers the English label without articles", () => {
    expect(subjectKey("A Coffee cup!", "فنجان")).toBe("en:coffee cup");
    expect(subjectKey("", "الرُّمّان")).toBe("ar:رمان");
    expect(subjectKey("", "")).toBe("");
  });
});
