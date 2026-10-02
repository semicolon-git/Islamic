import "server-only";
import { sql } from "@/lib/db";
import { DEFAULT_EDITION, isVerseKey, matchText } from "@/lib/quran";
import type { MatchResult } from "@/lib/quran/matcher";
import { keysOf, toInscriptionView, type InscriptionVerse, type InscriptionView } from "./inscription-view";

/** Verses by key from quran_ayah (KFGQPC text, unmodified) with the labelled translation. Order preserved. */
export async function versesForKeys(keys: string[], edition = DEFAULT_EDITION): Promise<InscriptionVerse[]> {
  const valid = [...new Set(keys.filter(isVerseKey))];
  if (!valid.length) return [];
  const rows = await sql<Omit<InscriptionVerse, "translation"> & { t_text: string | null; t_name: string | null }>(
    `select a.key, a.sura, a.aya, a.text_uthmani, a.text_emlaey, a.sura_name_ar, a.sura_name_en,
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
    .map(({ t_text, t_name, ...v }) => ({
      ...v,
      translation: t_text ? { edition_id: edition, edition_name: t_name ?? edition, text: t_text } : null,
    }));
}

export async function viewForMatch(m: MatchResult): Promise<InscriptionView> {
  return toInscriptionView(m, await versesForKeys(keysOf(m)));
}

/** Matcher + verses → the screen model for a piece of Arabic text. */
export async function readInscriptionText(text: string): Promise<{ match: MatchResult; view: InscriptionView }> {
  const match = await matchText(text);
  return { match, view: await viewForMatch(match) };
}
