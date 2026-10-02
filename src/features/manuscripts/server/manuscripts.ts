import "server-only";
import type { z } from "zod";
import { q, sql, tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { canCreateManuscript } from "../rules";
import type { manuscriptCreateSchema } from "../schema";
import { cerParts } from "../text";
import { plainText, type Tok } from "../tokens";
import { autoSegment } from "./layout";
import { processUpload, saveUpload } from "./images";

export async function createManuscript(user: SessionUser, input: z.infer<typeof manuscriptCreateSchema>) {
  if (!canCreateManuscript(user.role)) throw new HttpError(403, "forbidden", "Researchers and institution staff can add manuscripts.");
  const institution = user.institution_id ?? (await sql<{ id: string }>("select id from institutions where kind = 'library' order by id limit 1"))[0]?.id ?? null;
  const id = newId("ms");
  return tx(async (qb) => {
    await qb.query(
      `insert into manuscripts (id, institution_id, title_en, title_ar, author_en, author_ar, repository, shelfmark, script, genre, license, credit_line,
         source_url, siglum, work_id, copy_date_text, status, created_by, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'ai_draft',$17,false)`,
      [id, institution, input.title_en, input.title_ar, input.author_en || null, input.author_ar || null, input.repository, input.shelfmark,
        input.script || null, input.genre, input.license, input.credit_line, input.source_url || null, input.siglum || null, input.work_id || null,
        input.copy_date_text || null, user.id],
    );
    await audit(qb, user.id, "manuscript.create", "manuscript", id, null, input);
    await emit("manuscripts", "manuscript.created", { id }, user.id, qb);
    return { id };
  });
}

export interface UploadedPage { id: string; lines: number; segmented: boolean; error?: string }

/** Add uploaded page images: process with sharp (≤ 2400 px, thumbnail, no EXIF), store, optionally auto-segment. */
export async function addPages(user: SessionUser, msId: string, files: { name: string; type: string; data: Buffer }[], segment: boolean): Promise<UploadedPage[]> {
  if (user.role === "specialist") throw new HttpError(403, "forbidden", "Your role can't add pages.");
  const ms = (await sql<{ id: string }>("select id from manuscripts where id = $1", [msId]))[0];
  if (!ms) throw new HttpError(404, "not_found", "This manuscript doesn't exist.");
  if (!files.length) throw new HttpError(400, "no_files", "Choose at least one page image.");
  if (files.length > 20) throw new HttpError(400, "too_many", "Upload up to 20 pages at a time.");
  const out: UploadedPage[] = [];
  for (const f of files) {
    const img = await processUpload(f.data, f.type);
    const id = newId("pg");
    const paths = saveUpload(msId, id, img);
    await tx(async (qb) => {
      const seq = (await q<{ n: number }>(qb, "select coalesce(max(seq), 0)::int + 1 as n from ms_pages where manuscript_id = $1", [msId]))[0].n;
      await qb.query(
        `insert into ms_pages (id, manuscript_id, seq, label, image_path, thumb_path, width, height, status, draft_engine, layout_source, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'ai_draft','none',null,$9)`,
        [id, msId, seq, f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120), paths.image_path, paths.thumb_path, img.width, img.height,
          JSON.stringify({ kind: "upload", original_name: f.name, uploaded_by: user.id })],
      );
      await audit(qb, user.id, "page.upload", "page", id, null, { msId, width: img.width, height: img.height });
      await emit(`ms:${msId}`, "page.added", { page_id: id }, user.id, qb);
    });
    let lines = 0, segmented = false, error: string | undefined;
    if (segment) {
      try {
        lines = (await autoSegment(user, id)).lines;
        segmented = true;
      } catch (e) {
        error = e instanceof Error ? e.message : "Segmentation failed";
      }
    }
    out.push({ id, lines, segmented, error });
  }
  return out;
}

export interface EvalLine {
  id: string;
  n: number;
  gt_text: string | null;
  gt_status: string | null;
  machine_text: string | null;
  machine_engine: string | null;
  current_text: string | null;
  current_kind: string | null;
  machine_cer: number | null;
  current_cer: number | null;
}

/** Evaluation against the dataset ground truth (researchers/admins only; never shown as a contribution). */
export async function pageEvaluation(pageId: string, orderedIds: string[]) {
  const rows = await sql<{ id: string; gt_text: string | null; gt_status: string | null; cur_tokens: Tok[] | null; cur_kind: string | null; m_tokens: Tok[] | null; m_engine: string | null }>(
    `select l.id, l.gt_text, l.gt_status,
            cv.tokens as cur_tokens, cv.kind as cur_kind,
            mv.tokens as m_tokens, mv.engine as m_engine
       from ms_lines l
       left join ms_line_versions cv on cv.line_id = l.id and cv.version = l.current_version
       left join lateral (select tokens, engine from ms_line_versions v where v.line_id = l.id and v.kind = 'machine' order by v.version desc limit 1) mv on true
      where l.page_id = $1`,
    [pageId],
  );
  const order = new Map(orderedIds.map((id, i) => [id, i + 1]));
  const tot = { m: { dist: 0, chars: 0 }, c: { dist: 0, chars: 0 }, mf: { dist: 0, chars: 0 }, cf: { dist: 0, chars: 0 }, gtLines: 0, humanLines: 0 };
  const lines: EvalLine[] = rows.map((r) => {
    const mt = r.m_tokens ? plainText(r.m_tokens) : "";
    const ct = r.cur_tokens ? plainText(r.cur_tokens) : "";
    let mc: number | null = null, cc: number | null = null;
    if (r.gt_text) {
      tot.gtLines++;
      const a = cerParts(mt, r.gt_text), b = cerParts(ct, r.gt_text);
      const af = cerParts(mt, r.gt_text, true), bf = cerParts(ct, r.gt_text, true);
      if (a.chars) {
        mc = a.dist / a.chars;
        cc = b.dist / b.chars;
        tot.m.dist += a.dist; tot.m.chars += a.chars;
        tot.c.dist += b.dist; tot.c.chars += b.chars;
        tot.mf.dist += af.dist; tot.mf.chars += af.chars;
        tot.cf.dist += bf.dist; tot.cf.chars += bf.chars;
      }
      if (r.cur_kind && r.cur_kind !== "machine") tot.humanLines++;
    }
    return { id: r.id, n: order.get(r.id) ?? 0, gt_text: r.gt_text, gt_status: r.gt_status, machine_text: r.m_tokens ? mt : null, machine_engine: r.m_engine, current_text: r.cur_tokens ? ct : null, current_kind: r.cur_kind, machine_cer: mc, current_cer: cc };
  });
  lines.sort((a, b) => a.n - b.n);
  const ratio = (x: { dist: number; chars: number }) => (x.chars ? x.dist / x.chars : null);
  return {
    lines,
    page: {
      machine_cer: ratio(tot.m),
      current_cer: ratio(tot.c),
      machine_cer_folded: ratio(tot.mf),
      current_cer_folded: ratio(tot.cf),
      gt_lines: tot.gtLines,
      human_lines: tot.humanLines,
      gt_chars: tot.m.chars,
    },
  };
}
