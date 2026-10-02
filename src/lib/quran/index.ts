import { sql } from "@/lib/db";
import { buildIndex, matchQuran, type MatchResult, type QuranIndex, type VerseRow } from "./matcher";

export interface Ayah {
  key: string;
  sura: number;
  aya: number;
  text_uthmani: string;
  sura_name_ar: string;
  sura_name_en: string;
  translation?: { edition_id: string; edition_name: string; text: string } | null;
}

export const DEFAULT_EDITION = "en.saheeh";

const g = globalThis as unknown as { __quranIx?: Promise<QuranIndex> };

/** Cached matcher index over the whole Quran (built once per server process). */
export function quranIndex(): Promise<QuranIndex> {
  if (!g.__quranIx) {
    g.__quranIx = (async () => {
      const rows = await sql<VerseRow>(
        "select key, sura, aya, text_emlaey, text_uthmani, sura_name_ar, sura_name_en from quran_ayah order by sura, aya",
      );
      if (!rows.length) throw new Error("Quran table is empty — run `npm run setup`.");
      return buildIndex(rows);
    })();
    g.__quranIx.catch(() => (g.__quranIx = undefined));
  }
  return g.__quranIx;
}

export async function matchText(text: string): Promise<MatchResult> {
  return matchQuran(await quranIndex(), text);
}

const KEY_RE = /^\d{1,3}:\d{1,3}$/;
export const isVerseKey = (k: string) => KEY_RE.test(k);

/** Fetch verses by key (order preserved) with a translation. Unknown keys are omitted. */
export async function getAyat(keys: string[], edition = DEFAULT_EDITION): Promise<Ayah[]> {
  const valid = keys.filter(isVerseKey);
  if (!valid.length) return [];
  const rows = await sql<Ayah & { t_text: string | null; t_name: string | null }>(
    `select a.key, a.sura, a.aya, a.text_uthmani, a.sura_name_ar, a.sura_name_en,
            t.text as t_text, e.name as t_name
       from quran_ayah a
       left join quran_translation t on t.key = a.key and t.edition_id = $2
       left join translation_editions e on e.id = $2
      where a.key = any($1::text[])`,
    [valid, edition],
  );
  const by = new Map(rows.map((r) => [r.key, r]));
  return valid
    .map((k) => by.get(k))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(({ t_text, t_name, ...a }) => ({
      ...a,
      translation: t_text ? { edition_id: edition, edition_name: t_name ?? edition, text: t_text } : null,
    }));
}
