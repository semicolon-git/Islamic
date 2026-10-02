import { one, sql } from "@/lib/db";
import { getAyat, matchText, quranIndex, DEFAULT_EDITION } from "@/lib/quran";
import { getHadith, searchHadith } from "@/lib/hadith";
import { allTerms } from "@/lib/glossary";
import { aiEnabled, callStructured } from "@/lib/ai/claude";
import { CardContent } from "@/lib/cards/types";
import { newId } from "@/lib/ids";
import type { Catalogue, CatalogueCard } from "./catalogue";
import { answer, type AskDeps } from "./pipeline";
import type { AskOptions, AskResult } from "./types";

/** Server entry points for Ask: catalogue loading, default dependencies, trace persistence. */

interface CardJoin {
  id: string;
  kind: CatalogueCard["kind"];
  concept_id: string | null;
  level: CatalogueCard["level"];
  certainty: CatalogueCard["certainty"];
  title_en: string;
  title_ar: string;
  match_phrases: string[];
  content: unknown;
  inst_id: string | null;
  inst_en: string | null;
  inst_ar: string | null;
  inst_demo: boolean | null;
  label_en: string | null;
  label_ar: string | null;
  count_tokens: number | null;
  count_verses: number | null;
  count_rule: string | null;
}

const g = globalThis as unknown as { __askCatalogue?: { stamp: string; cat: Catalogue; at: number } };

/** Published cards + approved glossary. Rebuilt whenever the published set changes (cheap freshness probe). */
export async function loadCatalogue(): Promise<Catalogue> {
  const probe = await one<{ n: number; p: string | null; u: string | null; gn: number }>(
    "select (select count(*)::int from cards where status='published') as n, (select max(published_at)::text from cards where status='published') as p, (select max(updated_at)::text from cards) as u, (select count(*)::int from glossary_terms where status='approved') as gn",
  );
  const stamp = `${probe?.n}|${probe?.p}|${probe?.u}|${probe?.gn}`;
  if (g.__askCatalogue && g.__askCatalogue.stamp === stamp) return g.__askCatalogue.cat;
  const rows = await sql<CardJoin>(
    `select c.id, c.kind, c.concept_id, c.level, c.certainty, c.title_en, c.title_ar, c.match_phrases, v.content,
            i.id as inst_id, i.name_en as inst_en, i.name_ar as inst_ar, i.is_demo as inst_demo,
            k.label_en, k.label_ar, k.count_tokens, k.count_verses, k.count_rule
       from cards c
       join card_versions v on v.card_id = c.id and v.version = c.published_version
       left join institutions i on i.id = c.institution_id
       left join concepts k on k.id = c.concept_id
      where c.status = 'published' and c.published_version is not null
      order by c.published_at desc nulls last, c.id`,
  );
  const cards: CatalogueCard[] = [];
  for (const r of rows) {
    const parsed = CardContent.safeParse(r.content);
    if (!parsed.success) continue;
    const ct = parsed.data;
    cards.push({
      id: r.id,
      kind: r.kind,
      concept_id: r.concept_id,
      concept_label_en: r.label_en,
      concept_label_ar: r.label_ar,
      level: r.level,
      certainty: r.certainty,
      title_en: r.title_en,
      title_ar: r.title_ar,
      match_phrases: r.match_phrases ?? [],
      verses: ct.verses.map((v) => ({ key: v.key, role: v.role })),
      hadith: ct.hadith.map((h) => h.id),
      explanation: { en: ct.explanation.en, ar: ct.explanation.ar },
      disagreement_note: ct.disagreement_note && (ct.disagreement_note.en || ct.disagreement_note.ar) ? { en: ct.disagreement_note.en, ar: ct.disagreement_note.ar } : null,
      civilizational_note: ct.civilizational_note && (ct.civilizational_note.en || ct.civilizational_note.ar) ? { en: ct.civilizational_note.en, ar: ct.civilizational_note.ar, sources: ct.civilizational_note.sources.map((s) => ({ citation: s.citation, url: s.url })) } : null,
      tafsir: ct.tafsir,
      glossary_terms: ct.glossary_terms,
      sensitivity_flags: ct.sensitivity_flags,
      count:
        ct.show_count && r.count_tokens
          ? { tokens: r.count_tokens, verses: r.count_verses ?? 0, rule: r.count_rule ?? "qac-lemma-word-token@0.4", label_en: r.label_en ?? "", label_ar: r.label_ar ?? "" }
          : null,
      institution: r.inst_id ? { id: r.inst_id, name_en: r.inst_en ?? "", name_ar: r.inst_ar ?? "", is_demo: !!r.inst_demo } : null,
    });
  }
  const cat: Catalogue = { version: stamp, cards, glossary: await allTerms() };
  g.__askCatalogue = { stamp, cat, at: Date.now() };
  return cat;
}

/** Persist a trace row (no user identifiers; the question is already PII-redacted). */
export async function writeTrace(r: AskResult) {
  await sql(
    `insert into answer_traces (id, lang, question, level, intent, route, flags, evidence_ids, blocks, checks, outcome, latency_ms, ai)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      r.id,
      r.lang,
      r.question,
      r.level,
      r.intent,
      r.route,
      JSON.stringify([...r.trace.floors, ...r.trace.flags]),
      r.trace.evidence_ids,
      JSON.stringify(r.blocks.map((b) => ({ type: b.type, ...(b.type === "verses" ? { keys: b.verses.map((v) => v.key) } : b.type === "hadith" ? { id: b.hadith.id } : b.type === "notice" ? { kind: b.kind } : b.type === "explanation" ? { source: b.source, cites: b.cites } : {}) }))),
      JSON.stringify(r.trace.checks),
      r.outcome,
      r.trace.latency_ms,
      JSON.stringify(r.trace.ai),
    ],
  );
}

export function defaultDeps(overrides: Partial<AskDeps> = {}): AskDeps {
  return {
    catalogue: loadCatalogue,
    matchText,
    quranIndex: async () => {
      try {
        return await quranIndex();
      } catch {
        return null;
      }
    },
    searchHadith,
    getAyat: (keys) => getAyat(keys, DEFAULT_EDITION),
    getHadith,
    writeTrace,
    ai: aiEnabled() ? { enabled: true, call: callStructured } : null,
    newId: () => newId("ans"),
    ...overrides,
  };
}

export function answerQuestion(question: string, opts: AskOptions, overrides: Partial<AskDeps> = {}): Promise<AskResult> {
  return answer(question, opts, defaultDeps(overrides));
}

/** Title of a published card for the "Asking about: …" chip. */
export async function contextCardTitle(cardId: string): Promise<{ id: string; title_en: string; title_ar: string } | null> {
  return one("select id, title_en, title_ar from cards where id=$1 and status='published'", [cardId]);
}

/** The published card behind a published heritage item (label code such as AST-7), for ?item= links. */
export async function cardIdForItem(code: string): Promise<string | null> {
  const r = await one<{ card_id: string | null }>(
    "select h.card_id from heritage_items h join cards c on c.id = h.card_id and c.status = 'published' where upper(h.item_code) = upper($1) and h.status = 'published'",
    [code.slice(0, 40)],
  );
  return r?.card_id ?? null;
}
