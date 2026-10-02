import "server-only";
import crypto from "node:crypto";
import { q, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { Decision, Status } from "@/lib/workflow";
import { orderLines } from "../geometry";
import { canResolveFlag, canonicalJson, checkPageDecision } from "../rules";
import { plainText, readingText, type Tok } from "../tokens";

interface PageRow { id: string; manuscript_id: string; status: Status; flagged: boolean; institution_id: string | null; published_version: number | null }

async function pageRow(qb: Queryable, pageId: string): Promise<PageRow> {
  const r = (await q<PageRow>(qb, `select p.id, p.manuscript_id, p.status, p.flagged, m.institution_id, p.published_version
       from ms_pages p join manuscripts m on m.id = p.manuscript_id where p.id = $1`, [pageId]))[0];
  if (!r) throw new HttpError(404, "not_found", "This page doesn't exist.");
  return r;
}

const latestReviewer = async (qb: Queryable, pageId: string, decision: string) =>
  (await q<{ reviewer_id: string }>(qb, "select reviewer_id from reviews where entity_type='page' and entity_id=$1 and decision=$2 order by id desc limit 1", [pageId, decision]))[0]?.reviewer_id ?? null;

/** Frozen snapshot of the page's current text (what an institution publishes), with a sha256 content hash. */
export async function pageSnapshot(qb: Queryable, pageId: string) {
  const regions = await q<{ id: string; type: string; seq: number }>(qb, "select id, type, seq from ms_regions where page_id=$1", [pageId]);
  const rows = await q<{ id: string; region_id: string | null; seq: number; polygon: unknown; version: number | null; tokens: Tok[] | null; kind: string | null; author_id: string | null; normalized_text: string | null }>(
    qb,
    `select l.id, l.region_id, l.seq, l.polygon, v.version, v.tokens, v.kind, v.author_id, v.normalized_text
       from ms_lines l left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.page_id = $1`,
    [pageId],
  );
  const types = new Map(regions.map((r) => [r.id, r.type]));
  const lines = orderLines(rows, regions).map((l, i) => ({
    n: i + 1,
    line_id: l.id,
    zone: l.region_id ? types.get(l.region_id) ?? null : null,
    version: l.version ?? 0,
    kind: l.kind,
    author_id: l.author_id,
    tokens: l.tokens ?? [],
    plain_text: plainText(l.tokens ?? []),
    reading_text: l.normalized_text ?? readingText(l.tokens ?? []),
  }));
  const contributors = await q<{ author_id: string; kind: string }>(qb,
    `select distinct v.author_id, v.kind from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.author_id is not null order by 1, 2`, [pageId]);
  const engines = await q<{ engine: string }>(qb,
    `select distinct v.engine from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.kind = 'machine' and v.engine is not null order by 1`, [pageId]);
  const content = { page_id: pageId, lines, contributors, machine_draft: engines.map((e) => e.engine) };
  const sha = crypto.createHash("sha256").update(canonicalJson(content)).digest("hex");
  return { content, sha };
}

export async function decidePage(user: SessionUser, pageId: string, decision: Decision, note?: string) {
  return tx(async (qb) => {
    const p = await pageRow(qb, pageId);
    const studentAuthors = (await q<{ author_id: string }>(qb,
      `select distinct v.author_id from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.kind = 'student' and v.author_id is not null`, [pageId])).map((r) => r.author_id);
    const humanLines = (await q<{ n: number }>(qb,
      `select count(distinct l.id)::int as n from ms_lines l join ms_line_versions v on v.line_id = l.id where l.page_id = $1 and v.kind <> 'machine'`, [pageId]))[0].n;
    const check = checkPageDecision({
      role: user.role, userId: user.id, status: p.status, decision, flagged: p.flagged, note,
      submitterId: await latestReviewer(qb, pageId, "submit"),
      approverId: await latestReviewer(qb, pageId, "approve"),
      studentAuthors, humanLines, sameInstitution: !!user.institution_id && user.institution_id === p.institution_id,
    });
    if (!check.ok) throw new HttpError(check.code === "not_allowed" ? 403 : 409, check.code, check.reason);
    const to = check.to;
    let version: number | null = null;
    let sha: string | null = null;
    if (decision === "approve") {
      // the researcher's approval covers every line a person has checked
      await qb.query(`update ms_lines l set status = 'approved' where l.page_id = $1 and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')`, [pageId]);
    }
    if (decision === "publish") {
      const snap = await pageSnapshot(qb, pageId);
      version = (p.published_version ?? 0) + 1;
      sha = snap.sha;
      const approver = await latestReviewer(qb, pageId, "approve");
      await qb.query(
        "insert into ms_page_publications (page_id, version, content, content_sha, published_by, approved_by) values ($1,$2,$3,$4,$5,$6)",
        [pageId, version, JSON.stringify(snap.content), sha, user.id, approver],
      );
      await qb.query("update ms_pages set published_version=$2, published_at=now(), published_by=$3, published_sha=$4 where id=$1", [pageId, version, user.id, sha]);
    }
    await qb.query("update ms_pages set status = $2, updated_at = now() where id = $1", [pageId, to]);
    await qb.query(
      "insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note) values ('page',$1,$2,$3,$4,$5,$6,$7)",
      [pageId, version, user.id, p.status, to, decision, note?.trim() || null],
    );
    await audit(qb, user.id, `page.${decision}`, "page", pageId, { status: p.status }, { status: to, version, sha, note: note ?? null });
    await emit(`page:${pageId}`, "page.status", { status: to, decision, by: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar }, user.id, qb);
    await emit(`ms:${p.manuscript_id}`, "page.status", { page_id: pageId, status: to }, user.id, qb);
    return { status: to, published_version: version, published_sha: sha };
  });
}

/** "Problematic / يحتاج نقاش": anyone working on the page may raise it; a researcher resolves it. */
export async function flagPage(user: SessionUser, pageId: string, flagged: boolean, reason?: string) {
  return tx(async (qb) => {
    const p = await pageRow(qb, pageId);
    if (user.role === "specialist") throw new HttpError(403, "forbidden", "Your role can't change this page.");
    if (flagged && !reason?.trim()) throw new HttpError(400, "reason_required", "Say what needs discussion so a researcher can resolve it.");
    if (!flagged && !canResolveFlag(user.role)) throw new HttpError(403, "forbidden", "A researcher resolves problematic pages.");
    await qb.query(
      "update ms_pages set flagged=$2, flag_reason=$3, flagged_by=$4, flagged_at=case when $2 then now() else null end, updated_at=now() where id=$1",
      [pageId, flagged, flagged ? reason!.trim() : null, flagged ? user.id : null],
    );
    await audit(qb, user.id, flagged ? "page.flag" : "page.unflag", "page", pageId, { flagged: p.flagged }, { flagged, reason: reason ?? null });
    await emit(`page:${pageId}`, "page.flag", { flagged, reason: reason ?? null, by: user.id }, user.id, qb);
    return { flagged, reason: flagged ? reason!.trim() : null };
  });
}
