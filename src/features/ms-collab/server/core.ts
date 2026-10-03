// Server code (not marked server-only so the seed can run the same workflow).
import { q, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { Status } from "@/lib/workflow";
import { normalizeTokens, plainText, type Tok } from "../../manuscripts/tokens";
import type { VersionKind } from "../../manuscripts/types";
import type { Participant } from "../rules";

export const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : d ? new Date(String(d)).toISOString() : "");
export const isoOrNull = (d: unknown) => (d ? iso(d) : null);

export interface PageCtx {
  id: string;
  manuscript_id: string;
  status: Status;
  seq: number;
  label: string | null;
  flagged: boolean;
  institution_id: string | null;
  title_en: string;
  title_ar: string;
  siglum: string | null;
  script: string | null;
  /** Student who holds the open transcription task for this page, if any. */
  owner_id: string | null;
}

export async function pageCtx(qb: Queryable, pageId: string): Promise<PageCtx> {
  const r = (await q<PageCtx>(qb,
    `select p.id, p.manuscript_id, p.status, p.seq, p.label, p.flagged, m.institution_id, m.title_en, m.title_ar, m.siglum, m.script,
            (select t.assignee_id from ms_tasks t where t.page_id = p.id and t.status = 'open' and t.kind = 'transcribe' order by t.created_at desc limit 1) as owner_id
       from ms_pages p join manuscripts m on m.id = p.manuscript_id where p.id = $1`, [pageId]))[0];
  if (!r) throw new HttpError(404, "not_found", "This page doesn't exist (it may have been removed).");
  return r;
}

export interface LineCtx {
  id: string;
  page_id: string;
  current_version: number;
  status: string;
  locked_by: string | null;
  locked_until: string | Date | null;
  zone: string | null;
  tokens: Tok[];
}

export async function lineCtx(qb: Queryable, lineId: string): Promise<LineCtx> {
  const r = (await q<LineCtx>(qb,
    `select l.id, l.page_id, l.current_version, l.status, l.locked_by, l.locked_until, r.type as zone, coalesce(v.tokens, '[]'::jsonb) as tokens
       from ms_lines l left join ms_regions r on r.id = l.region_id
       left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version
      where l.id = $1`, [lineId]))[0];
  if (!r) throw new HttpError(404, "not_found", "This line no longer exists. The layout may have changed: reload the page.");
  return r;
}

export const lockedByOther = (l: Pick<LineCtx, "locked_by" | "locked_until">, userId: string) =>
  !!l.locked_by && l.locked_by !== userId && !!l.locked_until && new Date(l.locked_until).getTime() > Date.now();

export interface WriteInput {
  lineId: string;
  pageId: string;
  baseVersion: number;
  tokens: Tok[];
  kind: VersionKind;
  authorId: string | null;
  note: string;
  /** Line status after the write (default 'transcribed'). */
  lineStatus?: "transcribed" | "agreed" | "disputed";
  actor: SessionUser | null;
  /** Audit action name. */
  action: string;
}

/**
 * Write a new line version through the normal versioning: nothing is overwritten, the base version must still be the
 * current one (409 otherwise), text gets the same Unicode hygiene as a transcriber's save, and the page hears about it
 * (`line.saved`), so open workspaces update.
 */
export async function writeVersion(qb: Queryable, w: WriteInput): Promise<number> {
  const cur = (await q<{ current_version: number }>(qb, "select current_version from ms_lines where id = $1 for update", [w.lineId]))[0];
  if (!cur) throw new HttpError(404, "not_found", "This line no longer exists.");
  if (cur.current_version !== w.baseVersion)
    throw new HttpError(409, "conflict", "This line changed since you opened it. Reload to see the current text, then decide again.", { current_version: cur.current_version });
  const { tokens } = normalizeTokens(w.tokens);
  const plain = plainText(tokens);
  const version = cur.current_version + 1;
  await qb.query(
    `insert into ms_line_versions (line_id, version, tokens, plain_text, normalized_text, kind, author_id, base_version, note)
     values ($1,$2,$3,$4,null,$5,$6,$7,$8)`,
    [w.lineId, version, JSON.stringify(tokens), plain, w.kind, w.authorId, w.baseVersion, w.note.slice(0, 500)],
  );
  await qb.query("update ms_lines set current_version = $2, status = $3 where id = $1", [w.lineId, version, w.lineStatus ?? "transcribed"]);
  await qb.query("update ms_pages set updated_at = now() where id = $1", [w.pageId]);
  await audit(qb, w.actor?.id ?? null, w.action, "line", w.lineId, { version: cur.current_version }, { version, kind: w.kind, plain_text: plain, author_id: w.authorId });
  const author = w.authorId ? (await q<{ display_name_en: string; display_name_ar: string }>(qb, "select display_name_en, display_name_ar from users where id = $1", [w.authorId]))[0] : null;
  await emit(`page:${w.pageId}`, "line.saved", {
    line_id: w.lineId, version, kind: w.kind, author_id: w.authorId,
    author_name_en: author?.display_name_en ?? w.actor?.display_name_en ?? "", author_name_ar: author?.display_name_ar ?? w.actor?.display_name_ar ?? "",
  }, w.actor?.id ?? null, qb);
  return version;
}

/** People involved with a page: transcribers, keyers, commenters, assignees, reviewers (for @mentions). */
export async function participants(qb: Queryable, pageId: string): Promise<Participant[]> {
  return q<Participant>(qb,
    `select u.id, u.display_name_en as name_en, u.display_name_ar as name_ar from users u where u.id in (
        select v.author_id from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.author_id is not null
        union select c.author_id from ms_comments c where c.page_id = $1
        union select t.assignee_id from ms_tasks t where t.page_id = $1 and t.assignee_id is not null
        union select t.created_by from ms_tasks t where t.page_id = $1 and t.created_by is not null
        union select k.author_id from ms_keyings k join ms_lines l on l.id = k.line_id where l.page_id = $1
        union select r.reviewer_id from reviews r where r.entity_type = 'page' and r.entity_id = $1 and r.reviewer_id is not null
        union select s.author_id from ms_suggestions s join ms_lines l on l.id = s.line_id where l.page_id = $1
        union select r.id from users r where r.role = 'researcher')
      order by u.display_name_en`, [pageId]);
}
