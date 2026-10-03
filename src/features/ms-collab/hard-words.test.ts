import { describe, expect, it } from "vitest";
import { plainText, type Tok } from "../manuscripts/tokens";
import { applyDecision, approxTokenBox, compareKeyings, keyForm, keyingMatches, maskedContext, remapToken, unclearTokens } from "./hard-words";

const line: Tok[] = [
  { t: "text", v: "وَقَدْ " },
  { t: "unclear", v: "بذأ", conf: 41, alts: ["بدأ"] },
  { t: "text", v: " الرجل " },
  { t: "unclear", v: "ويثلث", cert: "low" },
];

describe("consensus normalisation", () => {
  it("compares letters only: vowel signs, tatweel, bidi marks and punctuation do not count", () => {
    expect(keyForm("بَذَأَ")).toBe("بذأ");
    expect(keyForm("بـذأ،")).toBe("بذأ");
    expect(keyForm("‏بذأ‎")).toBe("بذأ");
    expect(keyForm("  بذأ   ه ")).toBe("بذأ ه");
    // shadda + vowel typed in either order is the same word (NFC)
    expect(keyForm("مُدَّ")).toBe(keyForm("مُدَّ"));
  });

  it("agreement keeps the vowels both readers typed; otherwise keeps the letters only", () => {
    expect(compareKeyings({ reading: "بَذَأَ" }, { reading: "بَذَأَ" })).toEqual({ kind: "agree", reading: "بَذَأَ", vowelsDiffer: false });
    expect(compareKeyings({ reading: "بَذَأَ" }, { reading: "بذأ" })).toEqual({ kind: "agree", reading: "بذأ", vowelsDiffer: true });
    // Persian yeh and Arabic yeh are the same letter after hygiene
    expect(compareKeyings({ reading: "في" }, { reading: "فی" }).kind).toBe("agree");
  });

  it("different letters, or one reading against one 'can't read', go to a researcher", () => {
    expect(compareKeyings({ reading: "بذأ" }, { reading: "بدأ" })).toEqual({ kind: "disagree" });
    expect(compareKeyings({ reading: "بذأ" }, { cant_read: "illegible" })).toEqual({ kind: "disagree" });
  });

  it("two 'can't read' agree on a gap; damage is the stronger claim", () => {
    expect(compareKeyings({ cant_read: "illegible" }, { cant_read: "illegible" })).toEqual({ kind: "agree_gap", reason: "illegible" });
    expect(compareKeyings({ cant_read: "illegible" }, { cant_read: "damage" })).toEqual({ kind: "agree_gap", reason: "damage" });
  });

  it("matches a keying against the final decision (for points)", () => {
    expect(keyingMatches({ reading: "بَذَأَ" }, { text: "بذأ", gap: null })).toBe(true);
    expect(keyingMatches({ reading: "بدأ" }, { text: "بذأ", gap: null })).toBe(false);
    expect(keyingMatches({ cant_read: "damage" }, { text: null, gap: "illegible" })).toBe(true);
    expect(keyingMatches({ cant_read: "damage" }, { text: "بذأ", gap: null })).toBe(false);
  });
});

describe("hard-word helpers", () => {
  it("lists uncertain tokens and tells machine flags from a person's", () => {
    const u = unclearTokens(line);
    expect(u.map((x) => [x.index, x.v, x.person])).toEqual([[1, "بذأ", false], [3, "ويثلث", true]]);
  });

  it("masks the word in its line context (keyers never see the guess)", () => {
    expect(maskedContext(line, 1)).toEqual({ before: "وَقَدْ ", after: " الرجل ويثلث" });
  });

  it("writes the decision into that token only, as certain text or a gap", () => {
    const t = applyDecision(line, 1, { text: "بَذَأَ" });
    expect(plainText(t)).toBe("وَقَدْ بَذَأَ الرجل ويثلث");
    expect(t.filter((k) => k.t === "unclear")).toHaveLength(1);
    const g = applyDecision(line, 3, { gap: "damage" });
    expect(g.at(-1)).toEqual({ t: "gap", reason: "damage", extent: 1, unit: "word" });
    expect(() => applyDecision(line, 0, { text: "x" })).toThrow();
  });

  it("follows the word into a newer version of the line, or reports it gone", () => {
    const newer: Tok[] = [{ t: "text", v: "قال " }, ...line];
    expect(remapToken(newer, "بذأ")).toBe(2);
    expect(remapToken(newer, "بذأ", new Set([2]))).toBe(-1);
    expect(remapToken([{ t: "text", v: "بذأ" }], "بذأ")).toBe(-1); // edited to certain text: stale
  });

  it("estimates the word's box from the right edge (RTL) and refuses vertical glosses", () => {
    const poly: [number, number][] = [[100, 10], [1100, 10], [1100, 60], [100, 60]];
    const b = approxTokenBox(poly, line, 1)!;
    expect(b.y).toBe(10);
    expect(b.h).toBe(50);
    expect(b.x).toBeGreaterThan(600); // early in the line → near the right edge
    expect(approxTokenBox([[0, 0], [40, 0], [40, 400], [0, 400]], line, 1)).toBeNull();
  });
});
