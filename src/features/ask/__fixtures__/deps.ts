import fs from "node:fs";
import path from "node:path";
import { buildIndex, matchQuran, type QuranIndex, type VerseRow } from "@/lib/quran/matcher";
import type { Hadith } from "@/lib/hadith";
import type { GlossaryTerm } from "@/lib/glossary";
import { CardContent } from "@/lib/cards/types";
import { ASK_CARDS, EQUIVALENT } from "../../../../scripts/seed/ask";
import type { Catalogue, CatalogueCard } from "../catalogue";
import type { AskDeps } from "../pipeline";
import type { VerseView } from "../types";

/**
 * In-memory dependencies for unit tests, built from the pinned raw sources (prep/data/raw) and the
 * seed content — the same data the database is seeded from, without a database.
 */
const ROOT = process.cwd();
const RAW = path.join(ROOT, "prep/data/raw");
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;

let cache: { ix: QuranIndex; verses: Map<string, VerseView>; hadith: Map<string, Hadith>; catalogue: Catalogue } | null = null;

function load() {
  if (cache) return cache;
  const rows = read<Record<string, unknown>[]>(path.join(RAW, "quran_kfgqpc_hafs_v18.json"));
  const vrows: VerseRow[] = rows.map((r) => ({
    key: `${r.sora}:${r.aya_no}`,
    sura: r.sora as number,
    aya: r.aya_no as number,
    text_emlaey: r.aya_text_emlaey as string,
    text_uthmani: r.aya_text as string,
    sura_name_ar: String(r.sora_name_ar).trim(),
    sura_name_en: String(r.sora_name_en).trim(),
  }));
  const tr = new Map(read<{ quran: { chapter: number; verse: number; text: string }[] }>(path.join(RAW, "translations/eng-ummmuhammad.json")).quran.map((t) => [`${t.chapter}:${t.verse}`, t.text.trim()]));
  const verses = new Map<string, VerseView>(
    vrows.map((v) => [
      v.key,
      {
        key: v.key,
        sura: v.sura,
        aya: v.aya,
        text_uthmani: v.text_uthmani,
        sura_name_ar: v.sura_name_ar,
        sura_name_en: v.sura_name_en,
        translation: tr.has(v.key) ? { edition_id: "en.saheeh", edition_name: "Saheeh International", text: tr.get(v.key)! } : null,
      },
    ]),
  );
  const hadith = new Map<string, Hadith>();
  type H = { hadithnumber: number; arabicnumber?: number | string; text: string };
  for (const coll of ["bukhari", "muslim"] as const) {
    const ar = read<{ hadiths: H[] }>(path.join(RAW, "hadith", `ara-${coll}.json`)).hadiths;
    const en = new Map(read<{ hadiths: H[] }>(path.join(RAW, "hadith", `eng-${coll}.json`)).hadiths.map((h) => [h.hadithnumber, h.text]));
    for (const h of ar) {
      if (!h.text?.trim()) continue;
      const num = coll === "bukhari" ? (Number.isInteger(h.hadithnumber) ? String(h.hadithnumber) : null) : h.arabicnumber != null && h.arabicnumber !== "" ? String(h.arabicnumber).split(".")[0] : null;
      if (!num || hadith.has(`${coll}:${num}`)) continue;
      hadith.set(`${coll}:${num}`, {
        id: `${coll}:${num}`,
        collection: coll,
        number: num,
        numbering_scheme: coll === "bukhari" ? "Bukhari standard (Fath al-Bari)" : "Muslim — Muhammad Fu'ad Abd al-Baqi",
        text_ar: h.text.trim(),
        text_en: en.get(h.hadithnumber)?.trim() || null,
        grade: "sahih",
        grader: coll === "bukhari" ? "al-Bukhari" : "Muslim",
        source_url: null,
        verified_by: null,
      });
    }
  }
  const inst = { id: "inst_uni", name_en: "College of Sharia — Demo University", name_ar: "كلية الشريعة — الجامعة التجريبية", is_demo: true };
  const concepts: Record<string, { en: string; ar: string; tokens?: number; verses?: number }> = { moon: { en: "Moon", ar: "القمر", tokens: 27, verses: 26 }, qibla: { en: "Kaaba / qibla direction", ar: "القبلة" } };
  const toCard = (c: { id: string; kind?: string; concept_id?: string | null; level: string; certainty: string; title_en: string; title_ar: string; match_phrases?: string[]; content: unknown }): CatalogueCard => {
    const ct = CardContent.parse(c.content);
    const k = c.concept_id ? concepts[c.concept_id] : null;
    return {
      id: c.id,
      kind: (c.kind ?? "answer") as CatalogueCard["kind"],
      concept_id: c.concept_id ?? null,
      concept_label_en: k?.en ?? null,
      concept_label_ar: k?.ar ?? null,
      level: c.level as CatalogueCard["level"],
      certainty: c.certainty as CatalogueCard["certainty"],
      title_en: c.title_en,
      title_ar: c.title_ar,
      match_phrases: c.match_phrases ?? [],
      verses: ct.verses,
      hadith: ct.hadith.map((h) => h.id),
      explanation: ct.explanation,
      disagreement_note: ct.disagreement_note ?? null,
      civilizational_note: ct.civilizational_note ? { en: ct.civilizational_note.en, ar: ct.civilizational_note.ar, sources: ct.civilizational_note.sources } : null,
      tafsir: ct.tafsir,
      glossary_terms: ct.glossary_terms,
      sensitivity_flags: ct.sensitivity_flags,
      count: ct.show_count && k?.tokens ? { tokens: k.tokens, verses: k.verses ?? 0, rule: "qac-lemma-word-token@0.4", label_en: k.en, label_ar: k.ar } : null,
      institution: inst,
    };
  };
  const dir = path.join(ROOT, "data/content/cards");
  const content = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => toCard(read(path.join(dir, f))));
  // Mirror the seed: a demo answer is skipped when the reviewed content set covers the same topic.
  const have = new Set(content.map((c) => c.id));
  const demo = ASK_CARDS.filter((c) => !have.has(c.id) && !(EQUIVALENT[c.id] && have.has(EQUIVALENT[c.id])));
  const cards = [...content, ...demo.map((c) => toCard({ ...c, kind: "answer" }))];
  const glossary = read<GlossaryTerm[]>(path.join(ROOT, "data/content/glossary.json"));
  cache = { ix: buildIndex(vrows), verses, hadith, catalogue: { version: "fixture-1", cards, glossary } };
  return cache;
}

export function fixture() {
  return load();
}

export function testDeps(overrides: Partial<AskDeps> = {}): AskDeps {
  const f = load();
  let n = 0;
  return {
    catalogue: async () => f.catalogue,
    matchText: async (t) => matchQuran(f.ix, t),
    quranIndex: async () => f.ix,
    searchHadith: async (q) => {
      const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 6);
      if (!words.length) return [];
      return [...f.hadith.values()].filter((h) => words.every((w) => (h.text_en ?? "").toLowerCase().includes(w))).slice(0, 8);
    },
    getAyat: async (keys) => keys.map((k) => f.verses.get(k)).filter((v): v is VerseView => !!v),
    getHadith: async (ids) => ids.map((i) => f.hadith.get(i)).filter((h): h is Hadith => !!h),
    ai: null,
    newId: () => `ans_test_${++n}`,
    ...overrides,
  };
}
