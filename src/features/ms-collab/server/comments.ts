// Server code (not marked server-only so the seed can run the same workflow).
import { q, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { canComment, canResolveComment, extractMentions, type Participant } from "../rules";
import type { CommentDTO } from "../types";
import { iso, pageCtx, participants } from "./core";

interface Row {
  id: string; line_id: string | null; parent_id: string | null; anchor: CommentDTO["anchor"]; body: string; mentions: string[]; resolved: boolean; created_at: string;
  author_id: string; a_en: string; a_ar: string; a_hue: number; a_role: CommentDTO["author"]["role"]; r_en: string | null; r_ar: string | null;
}

export async function listComments(user: SessionUser, pageId: string): Promise<{ comments: CommentDTO[]; participants: Participant[] }> {
  return tx(async (qb) => {
    await pageCtx(qb, pageId);
    const rows = await q<Row>(qb,
      `select c.id, c.line_id, c.parent_id, c.anchor, c.body, c.mentions, c.resolved, c.created_at, c.author_id,
              a.display_name_en as a_en, a.display_name_ar as a_ar, a.avatar_hue as a_hue, a.role as a_role,
              r.display_name_en as r_en, r.display_name_ar as r_ar
         from ms_comments c join users a on a.id = c.author_id left join users r on r.id = c.resolved_by
        where c.page_id = $1 order by c.created_at`, [pageId]);
    return {
      comments: rows.map((r) => ({
        id: r.id, line_id: r.line_id, parent_id: r.parent_id, anchor: r.anchor, body: r.body, mentions: r.mentions ?? [], resolved: r.resolved,
        author: { id: r.author_id, name_en: r.a_en, name_ar: r.a_ar, hue: r.a_hue, role: r.a_role },
        resolved_by: r.r_en ? { name_en: r.r_en, name_ar: r.r_ar! } : null,
        created_at: iso(r.created_at),
        can_resolve: !r.parent_id && canResolveComment(user.role, user.id, r.author_id),
      })),
      participants: await participants(qb, pageId),
    };
  });
}

export interface CommentInput {
  line_id?: string | null;
  parent_id?: string | null;
  body: string;
  anchor?: { from: number; to: number; text: string } | null;
}

/** A comment never changes the text. Mentions are limited to the page's participants. */
export async function addComment(user: SessionUser, pageId: string, input: CommentInput): Promise<{ id: string }> {
  return tx((qb) => addCommentQ(qb, user, pageId, input));
}

export async function addCommentQ(qb: Queryable, user: SessionUser, pageId: string, input: CommentInput): Promise<{ id: string }> {
  if (!canComment(user.role)) throw new HttpError(403, "forbidden", "Your role can't comment on manuscript pages.");
  {
    await pageCtx(qb, pageId);
    let lineId = input.line_id ?? null;
    if (input.parent_id) {
      const parent = (await q<{ id: string; line_id: string | null; page_id: string; parent_id: string | null }>(qb, "select id, line_id, page_id, parent_id from ms_comments where id = $1", [input.parent_id]))[0];
      if (!parent || parent.page_id !== pageId) throw new HttpError(404, "not_found", "The comment you replied to no longer exists.");
      if (parent.parent_id) throw new HttpError(400, "nested", "Reply to the thread's first comment.");
      lineId = parent.line_id;
      // a reply re-opens a resolved thread
      await qb.query("update ms_comments set resolved = false, resolved_by = null, resolved_at = null where id = $1", [parent.id]);
    } else if (lineId) {
      const l = (await q<{ page_id: string }>(qb, "select page_id from ms_lines where id = $1", [lineId]))[0];
      if (!l || l.page_id !== pageId) throw new HttpError(404, "not_found", "This line no longer exists.");
    }
    const body = input.body.normalize("NFC").trim();
    if (!body) throw new HttpError(400, "empty", "Write something first.");
    const mentions = extractMentions(body, await participants(qb, pageId)).filter((id) => id !== user.id);
    const id = newId("cmt");
    await qb.query(
      "insert into ms_comments (id, page_id, line_id, parent_id, author_id, body, anchor, mentions) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, pageId, lineId, input.parent_id ?? null, user.id, body, input.anchor ? JSON.stringify(input.anchor) : null, mentions],
    );
    await audit(qb, user.id, "comment.add", "page", pageId, null, { comment: id, line_id: lineId, mentions });
    for (const m of mentions) await emit(`user:${m}`, "comment.mention", { comment_id: id, page_id: pageId, line_id: lineId }, user.id, qb);
    await emit(`page:${pageId}`, "comment.added", { comment_id: id, line_id: lineId, parent_id: input.parent_id ?? null, author_id: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar }, user.id, qb);
    return { id };
  }
}

export async function resolveComment(user: SessionUser, id: string, resolved: boolean): Promise<{ resolved: boolean }> {
  return tx(async (qb) => {
    const c = (await q<{ id: string; page_id: string; line_id: string | null; author_id: string; parent_id: string | null }>(qb, "select id, page_id, line_id, author_id, parent_id from ms_comments where id = $1", [id]))[0];
    if (!c) throw new HttpError(404, "not_found", "This comment no longer exists.");
    if (c.parent_id) throw new HttpError(400, "reply", "Resolve the whole thread from its first comment.");
    if (!canResolveComment(user.role, user.id, c.author_id)) throw new HttpError(403, "forbidden", "Only the author or a researcher can resolve this thread.");
    await qb.query("update ms_comments set resolved = $2, resolved_by = case when $2 then $3 else null end, resolved_at = case when $2 then now() else null end where id = $1", [id, resolved, user.id]);
    await audit(qb, user.id, resolved ? "comment.resolve" : "comment.reopen", "page", c.page_id, null, { comment: id });
    await emit(`page:${c.page_id}`, "comment.resolved", { comment_id: id, line_id: c.line_id, resolved }, user.id, qb);
    return { resolved };
  });
}
