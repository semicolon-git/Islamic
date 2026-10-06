import "server-only";
import { one, sql } from "@/lib/db";

/** Muslim-science knowledge graph (curated, sourced entries in science_entries). */

export type ScienceKind = "scientist" | "work" | "instrument" | "holding" | "topic";
export interface Source { citation: string; url: string }
export interface EntryRow<T = Record<string, unknown>> { kind: ScienceKind; id: string; name_en: string; name_ar: string; data: T; status: string }

export interface Scientist {
  id: string; name_en: string; name_ar: string; dates: string; places_en: string; places_ar: string; fields: string[];
  summary_en: string; summary_ar: string; contributions: { en: string; ar: string }[]; works: string[]; instruments: string[];
  stars: string[]; concepts: string[]; sources: Source[];
}
export interface Work { id: string; title_en: string; title_ar: string; author: string; date_text: string; summary_en: string; summary_ar: string; sources: Source[] }
export interface Instrument {
  id: string; name_en: string; name_ar: string; origin_en: string; origin_ar: string; muslim_contribution_en: string; muslim_contribution_ar: string;
  how_it_works_en: string; how_it_works_ar: string; uses_en: string[]; uses_ar: string[]; scientists: string[]; concepts: string[]; stars: string[]; sources: Source[];
}
export interface Holding {
  id: string; instrument: string; object_en: string; object_ar: string; maker_en?: string; maker_ar?: string; date_text: string; place_made_en?: string;
  museum_en: string; museum_ar: string; city_en: string; city_ar: string; country_code: string; accession?: string; url: string; verified_on: string; note_en?: string; note_ar?: string;
}
export interface Topic { concept: string; note_en: string; note_ar: string; scientists: string[]; instruments: string[]; works: string[]; sources?: Source[] }

export async function entries<T>(kind: ScienceKind): Promise<T[]> {
  const rows = await sql<{ data: T }>("select data from science_entries where kind = $1 and status = 'approved' order by sort, id", [kind]);
  return rows.map((r) => r.data);
}

export async function entry<T>(kind: ScienceKind, id: string): Promise<T | null> {
  return (await one<{ data: T }>("select data from science_entries where kind = $1 and id = $2 and status = 'approved'", [kind, id]))?.data ?? null;
}

/** Names of entries by id, for link chips. */
export async function names(kind: ScienceKind, ids: string[]): Promise<{ id: string; name_en: string; name_ar: string }[]> {
  if (!ids.length) return [];
  const rows = await sql<{ id: string; name_en: string; name_ar: string }>(
    "select id, name_en, name_ar from science_entries where kind = $1 and id = any($2::text[]) and status = 'approved'",
    [kind, ids],
  );
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => by.get(i)).filter((x): x is NonNullable<typeof x> => !!x);
}

export async function holdingsFor(instrumentId: string): Promise<Holding[]> {
  const rows = await sql<{ data: Holding }>(
    "select data from science_entries where kind = 'holding' and status = 'approved' and data->>'instrument' = $1 order by data->>'city_en', sort",
    [instrumentId],
  );
  return rows.map((r) => r.data);
}

export async function topicFor(conceptId: string) {
  const t = await entry<Topic>("topic", conceptId);
  if (!t) return null;
  const [scientists, instruments, works] = await Promise.all([names("scientist", t.scientists ?? []), names("instrument", t.instruments ?? []), names("work", t.works ?? [])]);
  return { topic: t, scientists, instruments, works };
}

/** Scholars who wrote a work or are linked to an instrument (reverse links). */
export async function scientistsLinkedTo(field: "works" | "instruments", id: string) {
  return sql<{ id: string; name_en: string; name_ar: string }>(
    `select id, name_en, name_ar from science_entries where kind = 'scientist' and status = 'approved' and data->$1 ? $2 order by sort`,
    [field, id],
  );
}
