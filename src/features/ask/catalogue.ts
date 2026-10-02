import type { GlossaryTerm } from "@/lib/glossary";

/** The closed set of approved evidence the Ask pipeline may use: published cards + approved glossary. */
export interface CatalogueCard {
  id: string;
  kind: "concept" | "answer" | "item" | "art";
  concept_id: string | null;
  concept_label_en: string | null;
  concept_label_ar: string | null;
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  title_en: string;
  title_ar: string;
  match_phrases: string[];
  verses: { key: string; role: "primary" | "supporting" }[];
  hadith: string[];
  explanation: { en: string; ar: string };
  disagreement_note: { en: string; ar: string } | null;
  civilizational_note: { en: string; ar: string; sources: { citation: string; url?: string }[] } | null;
  tafsir: { source_id: string; book_en: string; book_ar: string; author_en: string; author_ar: string; verse_key: string; excerpt_ar: string; excerpt_en?: string; url?: string }[];
  glossary_terms: string[];
  sensitivity_flags: string[];
  count: { tokens: number; verses: number; rule: string; label_en: string; label_ar: string } | null;
  institution: { id: string; name_en: string; name_ar: string; is_demo: boolean } | null;
}

export interface Catalogue {
  version: string;
  cards: CatalogueCard[];
  glossary: GlossaryTerm[];
}

/** All evidence ids a card brings with it (the card itself, its verses, hadith, count fact, tafsir, glossary). */
export function cardEvidenceIds(c: CatalogueCard): string[] {
  return [
    `C:${c.id}`,
    ...c.verses.map((v) => `Q:${v.key}`),
    ...c.hadith.map((h) => `H:${h}`),
    ...(c.count && c.concept_id ? [`F:count:${c.concept_id}`] : []),
    ...c.tafsir.map((t) => `T:${t.source_id}:${t.verse_key}`),
    ...c.glossary_terms.map((g) => `G:${g}`),
  ];
}

/** Every id the router may choose from. */
export function catalogueIds(cat: Catalogue): Set<string> {
  const s = new Set<string>();
  for (const c of cat.cards) for (const id of cardEvidenceIds(c)) s.add(id);
  for (const g of cat.glossary) s.add(`G:${g.id}`);
  return s;
}
