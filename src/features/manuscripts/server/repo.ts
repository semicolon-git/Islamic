import "server-only";
import { one, sql, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/claude";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { orderLines } from "../geometry";
import { canEditLayout, canEditText, canRunDraft, canSeeEvaluation } from "../rules";
import type { LineDTO, LineVersionDTO, MsSummary, PageDetail, PageReview, PageSummary, RegionDTO } from "../types";

export const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : d ? new Date(String(d)).toISOString() : "");
const isoOrNull = (d: unknown) => (d ? iso(d) : null);

const MS_COLS = `m.id, m.title_en, m.title_ar, m.author_en, m.author_ar, m.repository, m.holding_library_ar, m.shelfmark, m.script, m.script_description,
  m.license, m.license_confidence, m.license_note, m.credit_line, m.source_url, m.catalogue_url, m.copy_date_text, m.copy_date_note, m.siglum, m.work_id,
  m.genre, m.gt_reliability, m.gt_note, m.publish_scope, m.ai_training_allowed, m.institution_id, i.name_en as institution_name_en,
  i.name_ar as institution_name_ar, coalesce(i.is_demo, false) as institution_is_demo, m.status, m.created_at,
  (select p.thumb_path from ms_pages p where p.manuscript_id = m.id order by p.seq limit 1) as thumb,
  (select count(*)::int from ms_pages p where p.manuscript_id = m.id) as pages,
  (select count(*)::int from ms_pages p where p.manuscript_id = m.id and p.status = 'published') as pages_published,
  (select count(*)::int from ms_lines l join ms_pages p on p.id = l.page_id where p.manuscript_id = m.id) as lines_total,
  (select count(*)::int from ms_lines l join ms_pages p on p.id = l.page_id where p.manuscript_id = m.id
      and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')) as lines_human,
  (select count(*)::int from ms_lines l join ms_pages p on p.id = l.page_id where p.manuscript_id = m.id and l.status = 'approved') as lines_approved`;

const toMs = (r: MsSummary): MsSummary => ({ ...r, created_at: iso(r.created_at) });

export async function listManuscripts(): Promise<MsSummary[]> {
  const rows = await sql<MsSummary>(`select ${MS_COLS} from manuscripts m left join institutions i on i.id = m.institution_id order by m.work_id nulls last, m.siglum nulls last, m.created_at`);
  return rows.map(toMs);
}

export async function getManuscript(id: string): Promise<MsSummary | null> {
  const r = await one<MsSummary>(`select ${MS_COLS} from manuscripts m left join institutions i on i.id = m.institution_id where m.id = $1`, [id]);
  return r ? toMs(r) : null;
}

const PAGE_COLS = `p.id, p.manuscript_id, p.seq, p.label, p.folio, p.side, p.image_path, p.thumb_path, p.width, p.height, p.status, p.draft_engine,
  p.draft_cer, p.layout_source, p.flagged, p.flag_reason, p.published_version, p.published_at, p.published_sha,
  (select count(*)::int from ms_lines l where l.page_id = p.id) as lines_total,
  (select count(*)::int from ms_lines l where l.page_id = p.id and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')) as lines_human,
  (select count(*)::int from ms_lines l where l.page_id = p.id and l.status = 'approved') as lines_approved`;

const toPage = (r: PageSummary): PageSummary => ({ ...r, published_at: isoOrNull(r.published_at), draft_cer: r.draft_cer == null ? null : Number(r.draft_cer) });

export async function listPages(msId: string): Promise<PageSummary[]> {
  return (await sql<PageSummary>(`select ${PAGE_COLS} from ms_pages p where p.manuscript_id = $1 order by p.seq`, [msId])).map(toPage);
}

export async function getPage(pageId: string, qb?: Queryable): Promise<PageSummary | null> {
  const text = `select ${PAGE_COLS} from ms_pages p where p.id = $1`;
  const r = qb ? (await qb.query<PageSummary>(text, [pageId])).rows[0] : await one<PageSummary>(text, [pageId]);
  return r ? toPage(r) : null;
}

export const VERSION_COLS = `v.line_id, v.version, v.tokens, v.plain_text, v.normalized_text, v.kind, v.engine, v.author_id, v.base_version, v.note, v.created_at,
  u.display_name_en as author_name_en, u.display_name_ar as author_name_ar, u.avatar_hue as author_hue`;

export const toVersion = (r: LineVersionDTO): LineVersionDTO => ({ ...r, created_at: iso(r.created_at) });

export async function lineVersions(lineId: string): Promise<LineVersionDTO[]> {
  return (await sql<LineVersionDTO>(`select ${VERSION_COLS} from ms_line_versions v left join users u on u.id = v.author_id where v.line_id = $1 order by v.version desc`, [lineId])).map(toVersion);
}

export async function getVersion(lineId: string, version: number, qb?: Queryable): Promise<LineVersionDTO | null> {
  const text = `select ${VERSION_COLS} from ms_line_versions v left join users u on u.id = v.author_id where v.line_id = $1 and v.version = $2`;
  const r = qb ? (await qb.query<LineVersionDTO>(text, [lineId, version])).rows[0] : await one<LineVersionDTO>(text, [lineId, version]);
  return r ? toVersion(r) : null;
}

type LineRow = Omit<LineDTO, "n" | "version"> & { v_version: number | null } & Record<string, unknown>;

/** Lines of a page in reading order with their current version (never the ground truth). */
export async function pageLines(pageId: string, regions: RegionDTO[]): Promise<LineDTO[]> {
  const rows = await sql<LineRow>(
    `select l.id, l.region_id, l.seq, l.polygon, l.baseline, l.status, l.current_version, l.source, l.locked_by, l.locked_until,
            lu.display_name_en as lock_name_en, lu.display_name_ar as lock_name_ar, lu.avatar_hue as lock_hue,
            exists (select 1 from ms_line_versions hv where hv.line_id = l.id and hv.kind <> 'machine') as has_human,
            v.version as v_version, v.tokens as v_tokens, v.plain_text as v_plain_text, v.normalized_text as v_normalized_text, v.kind as v_kind,
            v.engine as v_engine, v.author_id as v_author_id, v.base_version as v_base_version, v.note as v_note, v.created_at as v_created_at,
            vu.display_name_en as v_author_name_en, vu.display_name_ar as v_author_name_ar, vu.avatar_hue as v_author_hue
       from ms_lines l
       left join users lu on lu.id = l.locked_by
       left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version
       left join users vu on vu.id = v.author_id
      where l.page_id = $1`,
    [pageId],
  );
  const now = Date.now();
  const lines = orderLines(rows, regions).map((r, i): LineDTO => {
    const lockLive = r.locked_by && r.locked_until && new Date(String(r.locked_until)).getTime() > now;
    return {
      id: r.id,
      region_id: r.region_id,
      seq: r.seq,
      n: i + 1,
      polygon: r.polygon,
      baseline: r.baseline,
      status: r.status,
      current_version: r.current_version,
      source: r.source,
      locked_by: lockLive ? r.locked_by : null,
      locked_until: lockLive ? iso(r.locked_until) : null,
      lock_name_en: lockLive ? r.lock_name_en : null,
      lock_name_ar: lockLive ? r.lock_name_ar : null,
      lock_hue: lockLive ? r.lock_hue : null,
      has_human: !!r.has_human,
      version: r.v_version
        ? {
            line_id: r.id,
            version: r.v_version,
            tokens: r.v_tokens as LineVersionDTO["tokens"],
            plain_text: String(r.v_plain_text ?? ""),
            normalized_text: (r.v_normalized_text as string | null) ?? null,
            kind: r.v_kind as LineVersionDTO["kind"],
            engine: (r.v_engine as string | null) ?? null,
            author_id: (r.v_author_id as string | null) ?? null,
            author_name_en: (r.v_author_name_en as string | null) ?? null,
            author_name_ar: (r.v_author_name_ar as string | null) ?? null,
            author_hue: (r.v_author_hue as number | null) ?? null,
            base_version: (r.v_base_version as number | null) ?? null,
            note: (r.v_note as string | null) ?? null,
            created_at: iso(r.v_created_at),
          }
        : null,
    };
  });
  return lines;
}

export async function pageRegions(pageId: string): Promise<RegionDTO[]> {
  return sql<RegionDTO>("select id, type, polygon, seq, source from ms_regions where page_id = $1 order by seq, id", [pageId]);
}

export async function pageReviews(pageId: string): Promise<PageReview[]> {
  const rows = await sql<PageReview>(
    `select r.decision, r.from_status, r.to_status, r.note, r.reviewer_id, u.display_name_en as reviewer_name_en, u.display_name_ar as reviewer_name_ar, r.created_at
       from reviews r left join users u on u.id = r.reviewer_id where r.entity_type = 'page' and r.entity_id = $1 order by r.id desc limit 30`,
    [pageId],
  );
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at) }));
}

export async function getPageDetail(pageId: string, user: SessionUser): Promise<PageDetail> {
  const page = await getPage(pageId);
  if (!page) throw new HttpError(404, "not_found", "This page doesn't exist (it may have been removed).");
  const manuscript = await getManuscript(page.manuscript_id);
  if (!manuscript) throw new HttpError(404, "not_found", "Manuscript not found.");
  const regions = await pageRegions(pageId);
  const [lines, reviews, siblings] = await Promise.all([
    pageLines(pageId, regions),
    pageReviews(pageId),
    sql<{ id: string }>("select id from ms_pages where manuscript_id = $1 order by seq", [page.manuscript_id]),
  ]);
  const idx = siblings.findIndex((s) => s.id === pageId);
  return {
    page,
    manuscript,
    regions,
    lines,
    reviews,
    neighbours: { prev: siblings[idx - 1]?.id ?? null, next: siblings[idx + 1]?.id ?? null, index: idx + 1, total: siblings.length },
    viewer: {
      id: user.id,
      role: user.role,
      name_en: user.display_name_en,
      name_ar: user.display_name_ar,
      hue: user.avatar_hue,
      canEdit: canEditText(user.role, page.status),
      canLayout: canEditLayout(user.role, page.status),
      canEval: canSeeEvaluation(user.role),
      canDraft: canRunDraft(user.role, page.status),
    },
    ai: aiEnabled(),
    demo: env.demoMode,
  };
}
