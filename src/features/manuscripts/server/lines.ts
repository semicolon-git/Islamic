import "server-only";
import { q, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { Status } from "@/lib/workflow";
import { canApproveLine, canEditText, saveKind } from "../rules";
import { normalizeTokens, plainText, readingText, type Tok } from "../tokens";
import type { LineVersionDTO } from "../types";
import { getVersion } from "./repo";

export const LOCK_SECONDS = 60;

interface LineCtx {
  id: string;
  page_id: string;
  manuscript_id: string;
  current_version: number;
  locked_by: string | null;
  locked_until: Date | string | null;
  status: Status;
  script: string | null;
}

export async function lineContext(qb: Queryable, lineId: string): Promise<LineCtx> {
  const r = (
    await qb.query<LineCtx>(
      `select l.id, l.page_id, p.manuscript_id, l.current_version, l.locked_by, l.locked_until, p.status, m.script
         from ms_lines l join ms_pages p on p.id = l.page_id join manuscripts m on m.id = p.manuscript_id where l.id = $1`,
      [lineId],
    )
  ).rows[0];
  if (!r) throw new HttpError(404, "not_found", "This line no longer exists. The layout may have changed: reload the page.");
  return r;
}

const lockedByOther = (c: LineCtx, userId: string) =>
  !!c.locked_by && c.locked_by !== userId && !!c.locked_until && new Date(c.locked_until).getTime() > Date.now();

export interface SaveInput {
  base_version: number;
  tokens: Tok[];
  normalized_text?: string | null;
  note?: string;
}

export interface SaveResult {
  version: LineVersionDTO;
  normalized: string[];
}

/**
 * Save a line: always a new version row (nothing is overwritten). Optimistic concurrency: if the line moved past
 * `base_version`, respond 409 with their version so the client can merge.
 */
export async function saveLine(user: SessionUser, lineId: string, input: SaveInput): Promise<SaveResult> {
  return tx(async (qb) => {
    const c = await lineContext(qb, lineId);
    if (!canEditText(user.role, c.status))
      throw new HttpError(403, "frozen", user.role === "institution_admin" ? "Institution reviewers return or publish pages; they don't edit the text." : "This page is not open for editing at its current stage.");
    if (lockedByOther(c, user.id)) {
      const holder = (await q<{ display_name_en: string }>(qb, "select display_name_en from users where id=$1", [c.locked_by])).at(0);
      throw new HttpError(423, "locked", `${holder?.display_name_en ?? "Someone"} is editing this line right now.`, { locked_by: c.locked_by });
    }
    if (c.current_version !== input.base_version) {
      const theirs = await getVersion(lineId, c.current_version, qb);
      throw new HttpError(409, "conflict", "Someone saved this line while you were editing it.", { theirs, current_version: c.current_version });
    }
    const persian = /persian|farsi|nasta/i.test(c.script ?? "");
    const { tokens, changes } = normalizeTokens(input.tokens, { persianHand: persian });
    const plain = plainText(tokens);
    const reading = input.normalized_text?.trim() ? input.normalized_text.normalize("NFC").trim() : null;
    const version = c.current_version + 1;
    const kind = saveKind(user.role);
    await qb.query(
      `insert into ms_line_versions (line_id, version, tokens, plain_text, normalized_text, kind, author_id, base_version, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [lineId, version, JSON.stringify(tokens), plain, reading, kind, user.id, input.base_version, input.note ?? null],
    );
    await qb.query(
      `update ms_lines set current_version = $2, status = 'transcribed',
              locked_by = $3, locked_until = now() + interval '${LOCK_SECONDS} seconds' where id = $1`,
      [lineId, version, user.id],
    );
    await qb.query("update ms_pages set updated_at = now() where id = $1", [c.page_id]);
    await audit(qb, user.id, "line.save", "line", lineId, { version: c.current_version }, { version, kind, plain_text: plain, reading: reading ?? readingText(tokens) });
    await emit(`page:${c.page_id}`, "line.saved", { line_id: lineId, version, kind, author_id: user.id, author_name_en: user.display_name_en, author_name_ar: user.display_name_ar }, user.id, qb);
    const saved = await getVersion(lineId, version, qb);
    return { version: saved!, normalized: changes };
  });
}

export interface LockState {
  line_id: string;
  locked_by: string | null;
  locked_until: string | null;
  holder?: { id: string; name_en: string; name_ar: string; hue: number };
}

/** Soft lock: 60 s, renewed every 20 s by the editing client; others see who is editing. */
export async function lockLine(user: SessionUser, lineId: string, action: "acquire" | "renew" | "release"): Promise<LockState> {
  return tx(async (qb) => {
    const c = await lineContext(qb, lineId);
    if (action === "release") {
      if (c.locked_by === user.id) {
        await qb.query("update ms_lines set locked_by = null, locked_until = null where id = $1", [lineId]);
        await emit(`page:${c.page_id}`, "line.unlocked", { line_id: lineId, user_id: user.id }, user.id, qb);
      }
      return { line_id: lineId, locked_by: null, locked_until: null };
    }
    if (!canEditText(user.role, c.status)) throw new HttpError(403, "frozen", "This page is not open for editing at its current stage.");
    if (lockedByOther(c, user.id)) {
      const h = (await q<{ id: string; display_name_en: string; display_name_ar: string; avatar_hue: number }>(qb, "select id, display_name_en, display_name_ar, avatar_hue from users where id=$1", [c.locked_by]))[0];
      throw new HttpError(423, "locked", `${h?.display_name_en ?? "Someone"} is editing this line right now.`, {
        line_id: lineId,
        locked_by: c.locked_by,
        locked_until: new Date(c.locked_until!).toISOString(),
        holder: h ? { id: h.id, name_en: h.display_name_en, name_ar: h.display_name_ar, hue: h.avatar_hue } : undefined,
      });
    }
    const until = (await q<{ until: Date }>(qb, `update ms_lines set locked_by = $2, locked_until = now() + interval '${LOCK_SECONDS} seconds' where id = $1 returning locked_until as until`, [lineId, user.id]))[0].until;
    if (action === "acquire" || c.locked_by !== user.id)
      await emit(`page:${c.page_id}`, "line.locked", { line_id: lineId, user_id: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar, hue: user.avatar_hue, until: new Date(until).toISOString() }, user.id, qb);
    return { line_id: lineId, locked_by: user.id, locked_until: new Date(until).toISOString(), holder: { id: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar, hue: user.avatar_hue } };
  });
}

/** A researcher marks a line approved (the page approval also approves every human-checked line). */
export async function approveLine(user: SessionUser, lineId: string, approved: boolean) {
  if (!canApproveLine(user.role)) throw new HttpError(403, "forbidden", "Only a researcher can approve lines.");
  return tx(async (qb) => {
    const c = await lineContext(qb, lineId);
    if (c.status === "published" || c.status === "archived") throw new HttpError(403, "frozen", "The page is published; its text is frozen.");
    if (approved && c.current_version === 0) throw new HttpError(400, "empty", "There is no text to approve yet.");
    const status = approved ? "approved" : "transcribed";
    await qb.query("update ms_lines set status = $2 where id = $1", [lineId, status]);
    await qb.query(
      "insert into reviews (entity_type, entity_id, version, reviewer_id, decision, to_status) values ('line',$1,$2,$3,$4,$5)",
      [lineId, c.current_version, user.id, approved ? "approve" : "return", status],
    );
    await audit(qb, user.id, approved ? "line.approve" : "line.unapprove", "line", lineId, null, { version: c.current_version });
    await emit(`page:${c.page_id}`, "line.status", { line_id: lineId, status }, user.id, qb);
    return { line_id: lineId, status };
  });
}
