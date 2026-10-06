import "server-only";
import { one, sql } from "@/lib/db";
import { aiEnabled, callStructured } from "@/lib/ai/claude";
import { getAyat, quranIndex } from "@/lib/quran";
import { getHadith } from "@/lib/hadith";
import { normalizeArabic } from "@/lib/quran/normalize";
import { searchBooks, searchLibraryHadith, tafsirFor } from "@/features/library/server";
import { discover, type DiscoverDeps, type ScienceLite } from "./pipeline";
import { searchQuranWords, searchSahihayn } from "./search";
import { DISCOVER_PROMPT_VERSION } from "./ai";
import type { DiscoverInput, DiscoverStage, DiscoveryResult } from "./types";
import { subjectKey } from "./words";

/** Server entry: cache, card lookup, persistence (the demand board reads `discoveries`). */

const MAX_AGE_DAYS = 30;
const g = globalThis as unknown as { __discoverInflight?: Map<string, Promise<DiscoveryResult>> };
const inflight = (g.__discoverInflight ??= new Map());

/** A published card whose concept or match phrases name the subject. */
export async function cardForSubject(label_en: string, label_ar: string): Promise<DiscoveryResult["card"]> {
  const en = label_en.toLowerCase().replace(/^(?:a|an|the)\s+/, "").trim();
  const ar = normalizeArabic(label_ar).replace(/^ال/, "").trim();
  if (!en && !ar) return null;
  const rows = await sql<{ id: string; concept_id: string | null; title_en: string; title_ar: string; label_en: string | null; label_ar: string | null; match_phrases: string[] | null }>(
    `select c.id, c.concept_id, c.title_en, c.title_ar, k.label_en, k.label_ar, c.match_phrases
       from cards c left join concepts k on k.id = c.concept_id
      where c.status = 'published' and c.kind = 'concept'`,
  );
  const words = (s: string) => s.toLowerCase().replace(/[^a-z؀-ۿ ]+/g, " ").split(/\s+/).filter(Boolean);
  for (const r of rows) {
    const enNames = [r.label_en ?? "", ...(r.match_phrases ?? [])].flatMap((s) => s.split(/[&,/]| and /i)).map((s) => s.toLowerCase().replace(/^(?:a|an|the)\s+/, "").trim()).filter(Boolean);
    const arNames = [r.label_ar ?? "", r.title_ar].flatMap((s) => s.split(/[،,و]\s/)).map((s) => normalizeArabic(s).replace(/^ال/, "").trim()).filter(Boolean);
    const singular = (w: string) => w.replace(/(?:ies)$/, "y").replace(/(?:es|s)$/, "");
    if (en && enNames.some((n) => n === en || singular(n) === singular(en) || words(n).includes(en))) return { id: r.id, concept_id: r.concept_id, title_en: r.title_en, title_ar: r.title_ar };
    if (ar && arNames.some((n) => n === ar)) return { id: r.id, concept_id: r.concept_id, title_en: r.title_en, title_ar: r.title_ar };
  }
  return null;
}

async function scienceList(): Promise<ScienceLite[]> {
  return sql<ScienceLite>(
    "select kind, id, name_en, name_ar from science_entries where status = 'approved' and kind in ('scientist','instrument','work') order by sort, id",
  ).catch(() => []);
}

export function defaultDeps(onStage?: (s: DiscoverStage) => void): DiscoverDeps {
  return {
    ai: aiEnabled(),
    call: callStructured,
    searchQuran: (ar, en, opts) => searchQuranWords(ar, en, 24, opts),
    getAyat: (keys) => getAyat(keys),
    searchSahihayn: (terms, opts) => searchSahihayn(terms, 10, opts),
    getHadith: async (ids) => (await getHadith(ids)).map((h) => ({ ...h, collection: h.collection })),
    searchLibraryHadith: (terms) => searchLibraryHadith(terms, 6),
    searchBooks: (terms) => searchBooks(terms, 4),
    tafsirFor: async (key) => (await tafsirFor(key, { maxChars: 700 }))[0] ?? null,
    science: scienceList,
    quranIndex: () => quranIndex().catch(() => null),
    onStage,
  };
}

/**
 * Discover a subject: serve the cached result when it is fresh, otherwise run the pipeline once (concurrent requests
 * for the same subject share the run) and store it. Every run and hit is counted for the demand board.
 */
export async function discoverSubject(input: DiscoverInput, opts: { onStage?: (s: DiscoverStage) => void; fresh?: boolean } = {}): Promise<DiscoveryResult> {
  const key = subjectKey(input.label_en, input.label_ar);
  if (!key) throw new Error("empty subject");
  const card = await cardForSubject(input.label_en, input.label_ar);

  if (!opts.fresh) {
    const row = await one<{ result: DiscoveryResult; prompt_version: string; age_days: number; ai: boolean }>(
      `select result, prompt_version, extract(epoch from now() - created_at) / 86400 as age_days, (result->>'ai')::boolean as ai from discoveries where key = $1`,
      [key],
    );
    // A cached no-AI result is refreshed once AI is available.
    if (row && row.prompt_version === DISCOVER_PROMPT_VERSION && row.age_days < MAX_AGE_DAYS && (row.ai || !aiEnabled()) && row.result.status !== "failed") {
      await sql("update discoveries set hits = hits + 1, last_hit_at = now() where key = $1", [key]);
      opts.onStage?.("done");
      return { ...row.result, card, cached: true };
    }
  }

  const running = inflight.get(key);
  if (running) return { ...(await running), card };
  const run = (async () => {
    const result = await discover(input, defaultDeps(opts.onStage));
    result.key = key;
    await sql(
      `insert into discoveries (key, label_en, label_ar, category, status, result, prompt_version, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (key) do update set label_en = excluded.label_en, label_ar = excluded.label_ar, category = excluded.category, status = excluded.status,
         result = excluded.result, prompt_version = excluded.prompt_version, hits = discoveries.hits + 1, created_at = now(), last_hit_at = now()`,
      [key, result.label_en, result.label_ar, result.category, result.status, JSON.stringify(result), DISCOVER_PROMPT_VERSION, input.source],
    );
    return result;
  })();
  inflight.set(key, run);
  try {
    return { ...(await run), card };
  } finally {
    inflight.delete(key);
  }
}

export interface DiscoveryRow {
  key: string;
  label_en: string;
  label_ar: string;
  category: string | null;
  status: string;
  hits: number;
  source: string;
  card_id: string | null;
  verses: number;
  hadith: number;
  has_summary: boolean;
  last_hit_at: string;
}

/** Recent discoveries for the demand board: what visitors explored that no reviewed card covers yet. */
export async function discoveryBoard(limit = 40): Promise<DiscoveryRow[]> {
  return sql<DiscoveryRow>(
    `select key, label_en, label_ar, category, status, hits, source, card_id,
            coalesce(jsonb_array_length(result->'verses'), 0) as verses, coalesce(jsonb_array_length(result->'hadith'), 0) as hadith,
            (result->'summary') is not null and (result->'summary') <> 'null'::jsonb as has_summary, last_hit_at::text
       from discoveries where not dismissed and status <> 'sensitive' order by hits desc, last_hit_at desc limit $1`,
    [limit],
  );
}

export async function getDiscovery(key: string): Promise<DiscoveryResult | null> {
  const row = await one<{ result: DiscoveryResult }>("select result from discoveries where key = $1", [key]);
  return row?.result ?? null;
}

export async function dismissDiscovery(key: string) {
  await sql("update discoveries set dismissed = true where key = $1", [key]);
}
