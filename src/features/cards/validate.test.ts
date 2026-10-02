import { describe, expect, it } from "vitest";
import { CardContent } from "@/lib/cards/types";
import { checklistPasses, validateCard, type CardMeta } from "./validate";

const meta: CardMeta = { kind: "concept", level: "A", certainty: "established", title_en: "The Moon", title_ar: "القمر", concept_id: "moon", match_phrases: [] };
const good = CardContent.parse({
  verses: [{ key: "10:5", role: "primary" }],
  hadith: [{ id: "bukhari:1042" }],
  tafsir: [{ source_id: "tabari", book_ar: "جامع البيان", book_en: "Jami' al-Bayan", author_ar: "الطبري", author_en: "al-Tabari", verse_key: "10:5", excerpt_ar: "نص" }],
  explanation: { en: "Explanation.", ar: "شرح." },
});
const run = (over: Partial<Parameters<typeof validateCard>[0]> = {}) =>
  validateCard({ meta, content: good, knownVerseKeys: ["10:5"], knownHadithIds: ["bukhari:1042"], lint: [], lintAcknowledged: false, ...over });
const failing = (items: ReturnType<typeof run>) => items.filter((i) => !i.ok).map((i) => `${i.id}:${i.detail.join(",")}`);

describe("validation checklist", () => {
  it("passes a complete card", () => {
    expect(failing(run())).toEqual([]);
    expect(checklistPasses(run())).toBe(true);
  });

  it("reports unknown verse keys and hadith ids", () => {
    const content = { ...good, verses: [...good.verses, { key: "200:1", role: "supporting" as const }], hadith: [{ id: "muslim:999999" }] };
    expect(failing(run({ content }))).toEqual(["verse_keys_exist:200:1", "hadith_exist:muslim:999999"]);
  });

  it("requires evidence and both titles", () => {
    const content = { ...good, verses: [], hadith: [], tafsir: [] };
    expect(failing(run({ content, meta: { ...meta, title_ar: " " } }))).toEqual(["titles:ar", "evidence:none"]);
  });

  it("flags duplicates", () => {
    const content = { ...good, verses: [good.verses[0], good.verses[0]] };
    expect(failing(run({ content }))).toEqual(["no_duplicates:10:5"]);
  });

  it("requires tafsir to be labelled and tied to a cited verse", () => {
    const content = { ...good, tafsir: [{ ...good.tafsir[0], verse_key: "2:255" }, { ...good.tafsir[0], author_en: "" }] };
    expect(failing(run({ content }))).toEqual(["tafsir_labelled:1,2"]);
  });

  it("requires bilingual explanation and notes", () => {
    const content = CardContent.parse({ ...good, explanation: { en: "x", ar: "" }, civilizational_note: { en: "x", ar: "", sources: [] }, disagreement_note: { en: "", ar: "خلاف" } });
    expect(failing(run({ content }))).toEqual([
      "explanation_bilingual:ar",
      "notes_bilingual:civilizational_note.ar,civilizational_note.sources,disagreement_note.en",
    ]);
  });

  it("requires a disagreement note for level C", () => {
    expect(failing(run({ meta: { ...meta, level: "C" } }))).toEqual(["disagreement_required:en,ar"]);
    const content = { ...good, disagreement_note: { en: "Scholars differ.", ar: "اختلف العلماء." } };
    expect(failing(run({ meta: { ...meta, level: "C" }, content }))).toEqual([]);
  });

  it("requires match phrases for answer cards", () => {
    expect(failing(run({ meta: { ...meta, kind: "answer" } }))).toEqual(["match_phrases:none"]);
    expect(failing(run({ meta: { ...meta, kind: "answer", match_phrases: ["why fast"] } }))).toEqual([]);
  });

  it("blocks on lint warnings until acknowledged", () => {
    const lint = [{ rule: "grade_words" as const, field: "explanation" as const, lang: "en" as const, match: "authentic", ref: "V5" as const }];
    expect(failing(run({ lint }))).toEqual(["lint:1"]);
    expect(failing(run({ lint, lintAcknowledged: true }))).toEqual([]);
  });
});
