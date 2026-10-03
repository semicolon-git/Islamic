// Server code (not marked server-only so the seed can run the same workflow).
import { q, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { saveKind } from "../../manuscripts/rules";
import { normalizeTokens, plainText, sameTokens, type Tok } from "../../manuscripts/tokens";
import { canReviewSuggestion, lineAccess, pointsFor } from "../rules";
import type { SuggestionDTO } from "../types";
import { iso, isoOrNull, lineCtx, lockedByOther, pageCtx, writeVersion } from "./core";
import { award } from "./points";
import { lineNumbers } from "./tasks";

export async function createSuggestion(user: SessionUser, lineId: string, input: { base_version: number; tokens: Tok[]; reason: string }) {
  return tx((qb) => createSuggestionQ(qb, user, lineId, input));
}

export async function createSuggestionQ(qb: Queryable, user: SessionUser, lineId: string, input: { base_version: number; tokens: Tok[]; reason: string }) {
  {
    const line = await lineCtx(qb, lineId);
    const page = await pageCtx(qb, line.page_id);
    const access = lineAccess({ role: user.role, userId: user.id, status: page.status, lockedBy: lockedByOther(line, user.id) ? line.locked_by : null, ownerId: page.owner_id });
    if (access === "read") throw new HttpError(403, "forbidden", "Your role can't propose changes to this page at its current stage.");
    if (input.base_version !== line.current_version)
      throw new HttpError(409, "conflict", "The line changed while you were writing your suggestion. Your text is kept: compare it with the new version and send it again.", { current_version: line.current_version, tokens: line.tokens });
    const { tokens } = normalizeTokens(input.tokens);
    if (sameTokens(tokens, line.tokens)) throw new HttpError(400, "unchanged", "Your suggestion is the same as the current text. Change something first.");
    const id = newId("sug");
    await qb.query(
      "insert into ms_suggestions (id, line_id, base_version, tokens, plain_text, author_id, status, reason) values ($1,$2,$3,$4,$5,$6,'open',$7)",
      [id, lineId, input.base_version, JSON.stringify(tokens), plainText(tokens), user.id, input.reason.trim()],
    );
    await audit(qb, user.id, "suggestion.create", "line", lineId, null, { suggestion: id, plain_text: plainText(tokens), reason: input.reason.trim() });
    await emit(`page:${line.page_id}`, "suggestion.created", { suggestion_id: id, line_id: lineId, author_id: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar }, user.id, qb);
    return { id };
  }
}

interface SugRow {
  id: string; line_id: string; base_version: number; tokens: Tok[]; plain_text: string; reason: string | null; status: SuggestionDTO["status"];
  review_note: string | null; created_at: string; reviewed_at: string | null; author_id: string; a_en: string; a_ar: string; a_hue: number;
  r_en: string | null; r_ar: string | null; current_version: number; current_text: string | null;
}

export async function listSuggestions(user: SessionUser, pageId: string): Promise<SuggestionDTO[]> {
  return tx(async (qb) => {
    const page = await pageCtx(qb, pageId);
    const rows = await q<SugRow>(qb,
      `select s.id, s.line_id, s.base_version, s.tokens, s.plain_text, s.reason, s.status, s.review_note, s.created_at, s.reviewed_at,
              s.author_id, a.display_name_en as a_en, a.display_name_ar as a_ar, a.avatar_hue as a_hue,
              r.display_name_en as r_en, r.display_name_ar as r_ar, l.current_version, v.plain_text as current_text
         from ms_suggestions s join ms_lines l on l.id = s.line_id join users a on a.id = s.author_id
         left join users r on r.id = s.reviewer_id
         left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version
        where l.page_id = $1 order by (s.status = 'open') desc, s.created_at desc limit 100`, [pageId]);
    const nums = await lineNumbers(qb, rows.map((r) => r.line_id));
    return rows.map((r) => {
      const check = canReviewSuggestion({ role: user.role, userId: user.id, authorId: r.author_id, ownerId: page.owner_id, status: page.status });
      return {
        id: r.id, line_id: r.line_id, line_n: nums.get(r.line_id) ?? 0, base_version: r.base_version, current_version: r.current_version,
        tokens: r.tokens, plain_text: r.plain_text, current_text: r.current_text ?? "", reason: r.reason, status: r.status,
        author: { id: r.author_id, name_en: r.a_en, name_ar: r.a_ar, hue: r.a_hue },
        reviewer: r.r_en ? { name_en: r.r_en, name_ar: r.r_ar! } : null, review_note: r.review_note,
        created_at: iso(r.created_at), reviewed_at: isoOrNull(r.reviewed_at),
        can_review: r.status === "open" && check.ok, review_block: check.ok ? null : check.reason,
      };
    });
  });
}

export type SuggestionDecision = { decision: "accept" } | { decision: "accept_edit"; tokens: Tok[] } | { decision: "reject" };

/** Owner or researcher decides. Accepting writes a new line version (the suggester is the author; an edited acceptance is the reviewer's). */
export async function decideSuggestion(user: SessionUser, id: string, input: SuggestionDecision & { note?: string }) {
  return tx(async (qb) => {
    const s = (await q<{ id: string; line_id: string; base_version: number; tokens: Tok[]; author_id: string; status: string; reason: string | null }>(qb,
      "select id, line_id, base_version, tokens, author_id, status, reason from ms_suggestions where id = $1 for update", [id]))[0];
    if (!s) throw new HttpError(404, "not_found", "This suggestion no longer exists.");
    if (s.status !== "open") throw new HttpError(409, "closed", "This suggestion was already decided.");
    const line = await lineCtx(qb, s.line_id);
    const page = await pageCtx(qb, line.page_id);
    const check = canReviewSuggestion({ role: user.role, userId: user.id, authorId: s.author_id, ownerId: page.owner_id, status: page.status });
    if (!check.ok) throw new HttpError(403, "forbidden", check.reason);
    let version: number | null = null;
    if (input.decision !== "reject") {
      if (lockedByOther(line, user.id)) throw new HttpError(423, "locked", "Someone is editing this line right now. Try again in a minute.");
      const author = (await q<{ display_name_en: string }>(qb, "select display_name_en from users where id = $1", [s.author_id]))[0];
      const edited = input.decision === "accept_edit";
      version = await writeVersion(qb, {
        lineId: s.line_id, pageId: line.page_id, baseVersion: line.current_version,
        tokens: edited ? input.tokens : s.tokens,
        kind: edited ? saveKind(user.role) : "suggestion",
        authorId: edited ? user.id : s.author_id,
        note: edited
          ? `Suggestion by ${author?.display_name_en ?? "?"} accepted with edits by ${user.display_name_en}`
          : `Suggestion accepted by ${user.display_name_en}${s.reason ? `: ${s.reason}` : ""}`,
        actor: user, action: edited ? "suggestion.accept_edit" : "suggestion.accept",
      });
      await award(qb, [{ user_id: s.author_id, reason: "ms_suggestion_accepted", ref: `sg:${s.id}`, delta: pointsFor("ms_suggestion_accepted", line.zone) }]);
    }
    const status = input.decision === "reject" ? "rejected" : "accepted";
    await qb.query("update ms_suggestions set status = $2, reviewer_id = $3, review_note = $4, reviewed_at = now(), result_version = $5 where id = $1",
      [id, status, user.id, input.note?.trim() || null, version]);
    await qb.query("insert into reviews (entity_type, entity_id, version, reviewer_id, decision, note) values ('suggestion',$1,$2,$3,$4,$5)",
      [id, version, user.id, input.decision === "reject" ? "reject" : "accept", input.note?.trim() || null]);
    await audit(qb, user.id, `suggestion.${input.decision}`, "line", s.line_id, null, { suggestion: id, version, note: input.note ?? null });
    await emit(`page:${line.page_id}`, "suggestion.decided", { suggestion_id: id, line_id: s.line_id, status, version }, user.id, qb);
    return { status, version };
  });
}
