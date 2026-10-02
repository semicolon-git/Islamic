import { describe, expect, it } from "vitest";
import { CardContent } from "../../src/lib/cards/types";
import { findQuranInProse, RE_GRADE, RE_OCCURRENCE, RE_SCIENCE, RE_TARJIH, RE_COLLECTION_NAMES } from "../../src/features/ask/validators";
import { fixture } from "../../src/features/ask/__fixtures__/deps";
import { ASK_CARDS } from "./ask";

/** The demo answer cards must themselves obey the rules the validators enforce on generated text. */
describe("Ask seed answer cards", () => {
  const f = fixture();
  it.each(ASK_CARDS.map((c) => [c.id, c] as const))("%s is valid and references real verses / hadith", (_id, c) => {
    const ct = CardContent.parse(c.content);
    for (const v of ct.verses) expect(f.verses.has(v.key), v.key).toBe(true);
    for (const h of ct.hadith) expect(f.hadith.has(h.id), h.id).toBe(true);
    if (c.level === "C") expect(ct.disagreement_note?.en).toBeTruthy();
  });
  it.each(ASK_CARDS.map((c) => [c.id, c] as const))("%s explanations type no Quran text, grades, counts, preferences or science framing", (_id, c) => {
    const ct = CardContent.parse(c.content);
    for (const text of [ct.explanation.en, ct.explanation.ar, ct.disagreement_note?.en ?? "", ct.disagreement_note?.ar ?? ""]) {
      expect(findQuranInProse(text, f.ix)).toBeNull();
      expect(text.replace(RE_COLLECTION_NAMES, " ")).not.toMatch(RE_GRADE);
      expect(text).not.toMatch(RE_OCCURRENCE);
      expect(text).not.toMatch(RE_TARJIH);
      expect(text).not.toMatch(RE_SCIENCE);
    }
  });
});
