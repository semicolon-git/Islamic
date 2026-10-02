import "server-only";
import fs from "node:fs";
import path from "node:path";
import { one, sql } from "@/lib/db";
import { normalizeCode } from "./codes";
import type { InscriptionRow, ItemRow, Venue } from "./types";
import manifest from "../../../data/content/concept_images.json";

const ITEM_SELECT = `
  select h.*, v.code as venue_code, v.name_en as venue_name_en, v.name_ar as venue_name_ar,
         i.name_en as institution_name_en, i.name_ar as institution_name_ar, i.is_demo as institution_is_demo
    from heritage_items h
    left join venues v on v.id = h.venue_id
    left join institutions i on i.id = h.institution_id`;

const CODE_SQL = "upper(regexp_replace(coalesce(h.item_code,''), '[^A-Za-z0-9]', '', 'g'))";

/** Published items (optionally only those at one venue), newest arrangement first. */
export async function publishedItems(venueCode?: string | null): Promise<ItemRow[]> {
  const params: unknown[] = [];
  let where = "h.status = 'published'";
  if (venueCode) {
    params.push(normalizeCode(venueCode));
    where += ` and upper(v.code) = $1`;
  }
  return sql<ItemRow>(`${ITEM_SELECT} where ${where} order by h.sort asc, h.published_at desc nulls last, h.title_en asc`, params);
}

/** A published item by a forgivingly typed code ("ast7" → AST-7). */
export async function publishedItemByCode(code: string): Promise<ItemRow | null> {
  const n = normalizeCode(code);
  if (!n) return null;
  return one<ItemRow>(`${ITEM_SELECT} where h.status = 'published' and ${CODE_SQL} = $1`, [n]);
}

export async function venueByCode(code: string): Promise<Venue | null> {
  const n = normalizeCode(code);
  if (!n) return null;
  return one<Venue>(
    `select v.id, v.code, v.name_en, v.name_ar, v.institution_id,
            i.name_en as institution_name_en, i.name_ar as institution_name_ar, i.is_demo as institution_is_demo
       from venues v left join institutions i on i.id = v.institution_id
      where upper(regexp_replace(v.code, '[^A-Za-z0-9]', '', 'g')) = $1`,
    [n],
  );
}

export async function allVenues(): Promise<Venue[]> {
  return sql<Venue>(
    `select v.id, v.code, v.name_en, v.name_ar, v.institution_id,
            i.name_en as institution_name_en, i.name_ar as institution_name_ar, i.is_demo as institution_is_demo
       from venues v left join institutions i on i.id = v.institution_id order by v.name_en`,
  );
}

const INSCRIPTION_SELECT = `
  select n.*, n.match->>'status' as match_status,
         a.display_name_en as author_name_en, a.display_name_ar as author_name_ar, a.is_demo as author_is_demo,
         r.display_name_en as verifier_name_en, r.display_name_ar as verifier_name_ar, r.is_demo as verifier_is_demo
    from inscriptions n
    left join users a on a.id = n.author_id
    left join users r on r.id = n.verified_by`;

export async function itemInscriptions(itemId: string, confirmedOnly = false): Promise<InscriptionRow[]> {
  return sql<InscriptionRow>(
    `${INSCRIPTION_SELECT} where n.item_id = $1 ${confirmedOnly ? "and n.status = 'confirmed'" : ""} order by n.created_at asc`,
    [itemId],
  );
}

export async function inscriptionById(id: string): Promise<InscriptionRow | null> {
  return one<InscriptionRow>(`${INSCRIPTION_SELECT} where n.id = $1`, [id]);
}

export interface ArtConcept {
  id: string;
  label_en: string;
  label_ar: string;
  blurb_en: string | null;
  blurb_ar: string | null;
  image: string | null;
  has_card: boolean;
}

/** Art & architecture concepts (track 'art'), with whether an approved card exists. */
export async function artConcepts(): Promise<ArtConcept[]> {
  return sql<ArtConcept>(
    `select c.id, c.label_en, c.label_ar, c.blurb_en, c.blurb_ar, c.image,
            exists (select 1 from cards k where k.concept_id = c.id and k.status = 'published') as has_card
       from concepts c where c.track = 'art' and c.enabled order by c.sort, c.label_en`,
  );
}

export interface PublishedManuscript {
  id: string;
  title_en: string;
  title_ar: string;
  author_en: string | null;
  author_ar: string | null;
  repository: string | null;
  shelfmark: string | null;
  pages: number;
  thumb: string | null;
}

/** Manuscripts that have at least one published page (visitors only ever see published pages). */
export async function publishedManuscripts(): Promise<PublishedManuscript[]> {
  const rows = await sql<PublishedManuscript>(
    `select m.id, m.title_en, m.title_ar, m.author_en, m.author_ar, m.repository, m.shelfmark,
            count(p.id)::int as pages,
            (array_agg(coalesce(p.thumb_path, p.image_path) order by p.seq))[1] as thumb
       from manuscripts m join ms_pages p on p.manuscript_id = m.id and p.status = 'published'
      group by m.id order by m.title_en`,
  );
  return rows.map((r) => ({ ...r, thumb: r.thumb && /^(\/|https?:)/.test(r.thumb) ? r.thumb : null }));
}

export async function manuscriptTitle(id: string): Promise<{ id: string; title_en: string; title_ar: string; has_published: boolean } | null> {
  return one(
    `select m.id, m.title_en, m.title_ar,
            exists (select 1 from ms_pages p where p.manuscript_id = m.id and p.status='published') as has_published
       from manuscripts m where m.id = $1`,
    [id],
  );
}

/** Decorative concept image: a vendored local file if present, else the generated-image CDN URL from the manifest. */
export function conceptImage(id: string): string | null {
  for (const ext of ["webp", "jpg", "png"]) {
    if (fs.existsSync(path.join(process.cwd(), "public/images/concepts", `${id}.${ext}`))) return `/images/concepts/${id}.${ext}`;
  }
  return (manifest.images as Record<string, string>)[id] ?? null;
}
