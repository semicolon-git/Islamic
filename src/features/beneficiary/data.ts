import "server-only";
import fs from "node:fs";
import path from "node:path";
import { one, sql } from "@/lib/db";
import type { ConceptSummary, Track } from "./labels";

const CONCEPT_COLS = `c.id, c.track, c.label_en, c.label_ar, c.image,
  (select k.id from cards k where k.concept_id = c.id and k.status = 'published' and k.kind in ('concept','art')
    order by k.published_at desc nulls last limit 1) as card_id`;

type ConceptRow = Omit<ConceptSummary, "has_card">;
const withCard = (r: ConceptRow): ConceptSummary => ({ ...r, has_card: !!r.card_id });

/** Enabled concepts (optionally for one track), in curated order. */
export async function listConcepts(track?: Track): Promise<ConceptSummary[]> {
  const rows = await sql<ConceptRow>(
    `select ${CONCEPT_COLS} from concepts c where c.enabled = true ${track ? "and c.track = $1" : ""} order by c.sort, c.id`,
    track ? [track] : [],
  );
  return rows.map(withCard);
}

export interface ConceptDetail extends ConceptSummary {
  blurb_en: string | null;
  blurb_ar: string | null;
  visual_hints: string | null;
  qac_lemmas: string[];
}

export async function getConcept(id: string): Promise<ConceptDetail | null> {
  const r = await one<ConceptRow & Omit<ConceptDetail, keyof ConceptSummary>>(
    `select ${CONCEPT_COLS}, c.blurb_en, c.blurb_ar, c.visual_hints, c.qac_lemmas from concepts c where c.id = $1 and c.enabled = true`,
    [id],
  );
  return r ? ({ ...withCard(r), blurb_en: r.blurb_en, blurb_ar: r.blurb_ar, visual_hints: r.visual_hints, qac_lemmas: r.qac_lemmas ?? [] } as ConceptDetail) : null;
}

/** Concepts for the vision prompt (closed list). */
export async function visionConcepts() {
  return sql<{ id: string; label_en: string; track: string; visual_hints: string | null }>(
    "select id, label_en, track, visual_hints from concepts where enabled = true order by sort, id",
  );
}

export interface RecentCard {
  id: string;
  kind: string;
  concept_id: string | null;
  title_en: string;
  title_ar: string;
  published_at: string;
  institution_en: string | null;
  institution_ar: string | null;
  institution_demo: boolean | null;
  image: string | null;
  track: string | null;
}

export async function recentApproved(limit = 6): Promise<RecentCard[]> {
  return sql<RecentCard>(
    `select k.id, k.kind, k.concept_id, k.title_en, k.title_ar, k.published_at,
            i.name_en as institution_en, i.name_ar as institution_ar, i.is_demo as institution_demo,
            coalesce(c.image, null) as image, c.track
       from cards k
       left join institutions i on i.id = k.institution_id
       left join concepts c on c.id = k.concept_id
      where k.status = 'published'
      order by k.published_at desc nulls last, k.id
      limit $1`,
    [limit],
  );
}

export async function publishedTitles(ids: string[]) {
  if (!ids.length) return [];
  const rows = await sql<{ id: string; kind: string; concept_id: string | null; title_en: string; title_ar: string }>(
    "select id, kind, concept_id, title_en, title_ar from cards where id = any($1::text[]) and status = 'published'",
    [ids],
  );
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => by.get(i)).filter((r): r is NonNullable<typeof r> => !!r);
}

export async function institutionsList() {
  return sql<{ id: string; name_en: string; name_ar: string; kind: string; is_demo: boolean }>(
    "select id, name_en, name_ar, kind, is_demo from institutions order by name_en",
  );
}

export async function lemmasFor(conceptId: string | null) {
  if (!conceptId) return [];
  const r = await one<{ qac_lemmas: string[] }>("select qac_lemmas from concepts where id = $1", [conceptId]);
  return r?.qac_lemmas ?? [];
}

export async function conceptImage(conceptId: string | null) {
  if (!conceptId) return null;
  const r = await one<{ image: string | null; track: string }>("select image, track from concepts where id = $1", [conceptId]);
  return r;
}

let heroCache: Record<string, string> | null = null;
/** Decorative hero image (local vendored copy preferred, else the CDN URL from the manifest). Null if unavailable. */
export function heroImage(name = "hero_home"): string | null {
  for (const ext of ["webp", "jpg", "png"]) {
    if (fs.existsSync(path.join(process.cwd(), "public/images/concepts", `${name}.${ext}`))) return `/images/concepts/${name}.${ext}`;
  }
  try {
    heroCache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/content/concept_images.json"), "utf8")).images ?? {};
  } catch {
    heroCache = {};
  }
  return heroCache?.[name] ?? null;
}
