import { one, sql } from "@/lib/db";
import { getAyat, type Ayah, DEFAULT_EDITION } from "@/lib/quran";
import { getHadith, type Hadith } from "@/lib/hadith";
import type { GlossaryTerm } from "@/lib/glossary";
import { CardContent, type CardRow } from "./types";

export interface ProvenanceStep {
  decision: string;
  to_status: string | null;
  at: string;
  reviewer_name_en: string | null;
  reviewer_name_ar: string | null;
  reviewer_role: string | null;
  institution_en: string | null;
  institution_ar: string | null;
  is_demo: boolean | null;
  note: string | null;
}

export interface ResolvedCard {
  card: CardRow;
  version: number;
  content: CardContent;
  verses: Ayah[];
  hadith: Hadith[];
  terms: GlossaryTerm[];
  count: { tokens: number; verses: number; rule: string; label_en: string; label_ar: string } | null;
  institution: { id: string; name_en: string; name_ar: string; is_demo: boolean } | null;
  provenance: ProvenanceStep[];
}

/**
 * Load a card with all references resolved from the database.
 * mode 'published' → the published version only (public app); 'current' → latest working version (portal).
 */
export async function resolveCard(
  cardId: string,
  mode: "published" | "current" = "published",
  edition = DEFAULT_EDITION,
): Promise<ResolvedCard | null> {
  const card = await one<CardRow>("select * from cards where id = $1", [cardId]);
  if (!card) return null;
  const version = mode === "published" ? card.published_version : card.current_version;
  if (!version) return null;
  const v = await one<{ content: unknown }>("select content from card_versions where card_id=$1 and version=$2", [cardId, version]);
  if (!v) return null;
  const content = CardContent.parse(v.content);

  const [verses, hadith, terms, concept, institution, provenance] = await Promise.all([
    getAyat(content.verses.map((x) => x.key), edition),
    getHadith(content.hadith.map((h) => h.id)),
    content.glossary_terms.length
      ? sql<GlossaryTerm>("select * from glossary_terms where id = any($1::text[])", [content.glossary_terms])
      : Promise.resolve([] as GlossaryTerm[]),
    card.concept_id
      ? one<{ label_en: string; label_ar: string; count_tokens: number | null; count_verses: number | null; count_rule: string | null }>(
          "select label_en, label_ar, count_tokens, count_verses, count_rule from concepts where id=$1",
          [card.concept_id],
        )
      : Promise.resolve(null),
    card.institution_id
      ? one<{ id: string; name_en: string; name_ar: string; is_demo: boolean }>(
          "select id, name_en, name_ar, is_demo from institutions where id=$1",
          [card.institution_id],
        )
      : Promise.resolve(null),
    sql<ProvenanceStep>(
      `select r.decision, r.to_status, r.created_at as at, r.note,
              u.display_name_en as reviewer_name_en, u.display_name_ar as reviewer_name_ar, u.role as reviewer_role, u.is_demo,
              i.name_en as institution_en, i.name_ar as institution_ar
         from reviews r left join users u on u.id = r.reviewer_id left join institutions i on i.id = u.institution_id
        where r.entity_type='card' and r.entity_id=$1 and (r.version is null or r.version <= $2)
        order by r.created_at asc, r.id asc`,
      [cardId, version],
    ),
  ]);

  const count =
    content.show_count && concept?.count_tokens
      ? {
          tokens: concept.count_tokens,
          verses: concept.count_verses ?? 0,
          rule: concept.count_rule ?? "qac-lemma-word-token@0.4",
          label_en: concept.label_en,
          label_ar: concept.label_ar,
        }
      : null;

  return { card, version, content, verses, hadith, terms, count, institution, provenance };
}

/** The published card for a concept, if any. */
export async function publishedCardForConcept(conceptId: string) {
  return one<{ id: string }>(
    "select id from cards where concept_id=$1 and status='published' and kind in ('concept','art') order by published_at desc limit 1",
    [conceptId],
  );
}
