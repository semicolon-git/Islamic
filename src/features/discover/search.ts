import "server-only";
import { sql } from "@/lib/db";
import { DEFAULT_EDITION } from "@/lib/quran";
import { normalizeArabic } from "@/lib/quran/normalize";
import { arabicWordMatcher, englishWordMatcher, termsIn } from "./words";

/** Lexical candidate search over the whole Quran (in memory) and the hadith collections (SQL, normalised text). */

interface VerseLex { key: string; sura: number; aya: number; ar: string[]; en: string }
const g = globalThis as unknown as { __discoverQuran?: Promise<VerseLex[]> };

function quranLex(): Promise<VerseLex[]> {
  if (!g.__discoverQuran) {
    g.__discoverQuran = (async () => {
      const rows = await sql<{ key: string; sura: number; aya: number; text_emlaey: string; t: string | null }>(
        `select a.key, a.sura, a.aya, a.text_emlaey, t.text as t from quran_ayah a
           left join quran_translation t on t.key = a.key and t.edition_id = $1 order by a.sura, a.aya`,
        [DEFAULT_EDITION],
      );
      return rows.map((r) => ({ key: r.key, sura: r.sura, aya: r.aya, ar: normalizeArabic(r.text_emlaey).split(" "), en: (r.t ?? "").toLowerCase() }));
    })();
    g.__discoverQuran.catch(() => (g.__discoverQuran = undefined));
  }
  return g.__discoverQuran;
}

export interface LexHit { key: string; score: number; ar: number; en: number; terms: string[] }

/** Verses that contain the subject's words: Arabic word forms weigh 3, English translation words 1. */
export async function searchQuranWords(termsAr: string[], termsEn: string[], limit = 24, opts: { strict?: boolean } = {}): Promise<LexHit[]> {
  const arM = termsAr.map((t) => [t, arabicWordMatcher(t, opts)] as const).filter((x): x is readonly [string, (t: string) => boolean] => !!x[1]);
  const enM = termsEn.map((t) => [t, englishWordMatcher(t)] as const).filter((x): x is readonly [string, (t: string) => boolean] => !!x[1]);
  if (!arM.length && !enM.length) return [];
  const hits: LexHit[] = [];
  for (const v of await quranLex()) {
    const terms: string[] = [];
    let ar = 0;
    for (const [t, m] of arM) if (v.ar.some(m)) { ar++; terms.push(t); }
    let en = 0;
    for (const [t, m] of enM) if (m(v.en)) { en++; terms.push(t); }
    if (ar || en) hits.push({ key: v.key, ar, en, score: ar * 3 + en, terms });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

const pattern = (t: string) => {
  const s = /[؀-ۿ]/.test(t) ? normalizeArabic(t).replace(/^ال(?=..)/, "") : t.toLowerCase().trim();
  return s.length >= 3 ? `%${s}%` : null;
};

export interface SahihHit { id: string; collection: "bukhari" | "muslim"; number: string; text_ar: string; text_en: string | null; grade: string; grader: string; numbering_scheme: string; source_url: string | null; matched: number; terms: string[] }

/**
 * Bukhari / Muslim hadith containing the subject's words: a fast substring pre-filter in SQL, then a word-level check
 * (Arabic word forms, whole English words) so "cup" never matches "cupping". Most matched words first.
 */
export async function searchSahihayn(terms: string[], limit = 10, opts: { strict?: boolean } = {}): Promise<SahihHit[]> {
  const pats = [...new Set(terms.map(pattern).filter((p): p is string => !!p))].slice(0, 10);
  if (!pats.length) return [];
  const rows = await sql<Omit<SahihHit, "matched" | "terms">>(
    `select id, collection, number, text_ar, text_en, grade, grader, numbering_scheme, source_url
       from hadith h where h.search like any($1::text[]) order by length(text_ar) asc limit 400`,
    [pats],
  );
  return rows
    .map((r) => {
      const found = [...new Set([...termsIn(r.text_ar, terms.filter((t) => /[\u0600-\u06FF]/.test(t)), opts), ...termsIn(r.text_en ?? "", terms.filter((t) => !/[\u0600-\u06FF]/.test(t)))])];
      return { ...r, matched: found.length, terms: found };
    })
    .filter((r) => r.matched > 0)
    .sort((a, b) => b.matched - a.matched || a.text_ar.length - b.text_ar.length)
    .slice(0, limit);
}
