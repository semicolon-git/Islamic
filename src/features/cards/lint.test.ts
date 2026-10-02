import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { citedHadith, lintCard, lintFingerprint, type LintInput } from "./lint";

const base: LintInput = { level: "A", certainty: "established", hadithIds: ["bukhari:1042"] };
const rules = (i: Partial<LintInput>) => lintCard({ ...base, ...i }).map((w) => `${w.rule}:${w.lang}`);

describe("card prose lint (review §9.2 V3–V9)", () => {
  it("passes the published moon card's explanation", () => {
    const en =
      "The Prophet Muhammad ﷺ taught that eclipses are among the signs of Allah and do not happen because of anyone's death or birth (al-Bukhari 1042).";
    const ar = "وأخبر النبي ﷺ أن الكسوف من آيات الله، ولا يكون لموت أحد ولا لحياته (البخاري ١٠٤٢).";
    expect(rules({ explanation: { en, ar } })).toEqual([]);
  });

  it("V4: flags 'the Prophet said' without a cited hadith reference", () => {
    expect(rules({ explanation: { en: "The Prophet said that the moon is a sign.", ar: "" } })).toEqual(["hadith_attribution:en"]);
    expect(rules({ explanation: { en: "", ar: "قال رسول الله إن القمر آية." } })).toEqual(["hadith_attribution:ar"]);
    // a reference to a hadith the card does not cite is still a problem
    expect(rules({ explanation: { en: "The Prophet said it (al-Bukhari 99).", ar: "" } })).toEqual(["hadith_attribution:en"]);
    // the cited one is fine
    expect(rules({ explanation: { en: "The Prophet said it (al-Bukhari 1042).", ar: "" } })).toEqual([]);
  });

  it("V5: flags grade words but not book titles", () => {
    expect(rules({ explanation: { en: "This is an authentic narration.", ar: "" } })).toEqual(["grade_words:en"]);
    expect(rules({ explanation: { en: "Recorded in Sahih al-Bukhari (al-Bukhari 1042).", ar: "" } })).toEqual([]);
    expect(rules({ explanation: { en: "", ar: "وهذا حديث صحيح." } })).toEqual(["grade_words:ar"]);
    expect(rules({ explanation: { en: "", ar: "رواه صحيح البخاري." } })).toEqual([]);
    // ordinary words that merely contain the letters are fine
    expect(rules({ explanation: { en: "", ar: "أحسن الناس خلقًا." } })).toEqual([]);
  });

  it("V6: flags occurrence counts in prose", () => {
    expect(rules({ explanation: { en: "The moon is mentioned 27 times.", ar: "" } })).toEqual(["occurrence_count:en"]);
    expect(rules({ explanation: { en: "", ar: "ذكر القمر في القرآن ٢٧ مرة." } })).toEqual(["occurrence_count:ar"]);
    expect(rules({ explanation: { en: "The five pillars of Islam.", ar: "" } })).toEqual([]);
  });

  it("V7: flags ruling phrases, tarjih, and consensus without an ijma tag", () => {
    expect(rules({ explanation: { en: "It is permissible for you to do this.", ar: "" } })).toEqual(["ruling_phrase:en"]);
    expect(rules({ explanation: { en: "", ar: "يجوز لك ذلك." } })).toEqual(["ruling_phrase:ar"]);
    expect(rules({ level: "C", disagreement_note: { en: "The correct view is the first.", ar: "والراجح الأول." } })).toEqual(["tarjih:en", "tarjih:ar"]);
    expect(rules({ explanation: { en: "There is consensus on this.", ar: "وعليه الإجماع." } })).toEqual(["consensus:en", "consensus:ar"]);
    expect(rules({ certainty: "ijma", explanation: { en: "There is consensus on this.", ar: "وعليه الإجماع." } })).toEqual([]);
  });

  it("V8: flags banned glossary renderings", () => {
    const bannedRenderings = [{ term: "jihad", rendering: "holy war" }];
    expect(rules({ bannedRenderings, explanation: { en: "Jihad is not a Holy War.", ar: "" } })).toEqual(["glossary_banned:en"]);
  });

  it("V9: flags persona and scientific-miracle framing", () => {
    expect(rules({ explanation: { en: "Modern science confirms this verse. As a scholar I say so.", ar: "" } }).sort()).toEqual(["persona:en", "science_framing:en"]);
    expect(rules({ explanation: { en: "", ar: "وهذا من الإعجاز العلمي." } })).toEqual(["science_framing:ar"]);
  });

  it("V3: flags Quran text pasted into prose", () => {
    expect(rules({ explanation: { en: "", ar: "قال تعالى ﴿هو الذي جعل الشمس ضياء﴾" } })).toEqual(["quran_in_prose:ar"]);
  });

  it("lints the civilisational and disagreement notes too", () => {
    const w = lintCard({ ...base, civilizational_note: { en: "Science proves it.", ar: "" }, disagreement_note: { en: "", ar: "الراجح كذا" } });
    expect(w.map((x) => x.field)).toEqual(["civilizational_note", "disagreement_note"]);
  });

  it("extracts cited hadith ids in both scripts", () => {
    expect(citedHadith("(al-Bukhari 1042) and (Muslim 1270)")).toEqual(["bukhari:1042", "muslim:1270"]);
    expect(citedHadith("(البخاري ١٠٤٢)")).toEqual(["bukhari:1042"]);
  });

  it("finds no problems in the approved fixture cards", () => {
    const dir = path.join(process.cwd(), "data/content/cards");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const w = lintCard({
        level: c.level,
        certainty: c.certainty,
        hadithIds: c.content.hadith.map((h: { id: string }) => h.id),
        explanation: c.content.explanation,
        civilizational_note: c.content.civilizational_note,
        disagreement_note: c.content.disagreement_note,
      });
      expect([f, w]).toEqual([f, []]);
    }
  });

  it("fingerprints are order-independent", () => {
    const a = lintCard({ ...base, explanation: { en: "Science proves it. It is mentioned 3 times.", ar: "" } });
    expect(lintFingerprint(a)).toBe(lintFingerprint([...a].reverse()));
  });
});
