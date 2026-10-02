import { sql } from "@/lib/db";

export interface Hadith {
  id: string;
  collection: "bukhari" | "muslim";
  number: string;
  numbering_scheme: string;
  text_ar: string;
  text_en: string | null;
  grade: string;
  grader: string;
  source_url: string | null;
  verified_by: string | null;
}

export const COLLECTION_NAMES = {
  bukhari: { en: "Sahih al-Bukhari", ar: "صحيح البخاري" },
  muslim: { en: "Sahih Muslim", ar: "صحيح مسلم" },
} as const;

export async function getHadith(ids: string[]): Promise<Hadith[]> {
  if (!ids.length) return [];
  const rows = await sql<Hadith>("select * from hadith where id = any($1::text[])", [ids]);
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => by.get(i)).filter((h): h is Hadith => !!h);
}

/** Keyword search over Bukhari/Muslim (Arabic trigram or English ILIKE). Returns candidates only — callers must still check the hadith actually states the claim. */
export async function searchHadith(query: string, limit = 8): Promise<Hadith[]> {
  const q = query.trim();
  if (!q) return [];
  if (/[؀-ۿ]/.test(q)) {
    return sql<Hadith>(
      "select * from hadith where text_ar % $1 order by similarity(text_ar, $1) desc limit $2",
      [q, limit],
    );
  }
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 6);
  if (!words.length) return [];
  const conds = words.map((_, i) => `lower(text_en) like $${i + 1}`).join(" and ");
  return sql<Hadith>(`select * from hadith where ${conds} limit ${Number(limit)}`, words.map((w) => `%${w}%`));
}
