import "server-only";
import { q, tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import type { Polygon } from "../../manuscripts/geometry";
import { checkPageDecision } from "../../manuscripts/rules";
import { approveLine } from "../../manuscripts/server/lines";
import { decidePage } from "../../manuscripts/server/workflow";
import { cerParts } from "../../manuscripts/text";
import { plainText, sameTokens, type Tok } from "../../manuscripts/tokens";
import type { VersionKind } from "../../manuscripts/types";
import { canReviewPage } from "../rules";
import type { ReviewPage } from "../types";
import { lineCtx, pageCtx, writeVersion } from "./core";
import { reconcileLinePoints } from "./points";
import { readingLines } from "./understanding";

interface VRow { line_id: string; version: number; kind: VersionKind; tokens: Tok[]; created_at: string; author_en: string | null; author_ar: string | null }

/**
 * The researcher's review of a submitted page: every line as a character diff against the last approved text (or the
 * machine draft), with the change rate (CER of the current text against that baseline).
 */
export async function pageReview(user: SessionUser, pageId: string, against: "approved" | "machine"): Promise<ReviewPage> {
  return tx(async (qb) => {
    const page = await pageCtx(qb, pageId);
    const meta = (await q<{ image_path: string; width: number; height: number }>(qb, "select image_path, width, height from ms_pages where id = $1", [pageId]))[0];
    const lines = await readingLines(qb, pageId);
    const polys = await q<{ id: string; polygon: Polygon }>(qb, "select id, polygon from ms_lines where page_id = $1", [pageId]);
    const status = new Map((await q<{ id: string; status: string }>(qb, "select id, status from ms_lines where page_id = $1", [pageId])).map((r) => [r.id, r.status]));
    const versions = await q<VRow>(qb,
      `select v.line_id, v.version, v.kind, v.tokens, v.created_at, u.display_name_en as author_en, u.display_name_ar as author_ar
         from ms_line_versions v join ms_lines l on l.id = v.line_id left join users u on u.id = v.author_id where l.page_id = $1 order by v.version`, [pageId]);
    const lastApproval = (await q<{ at: string }>(qb,
      "select created_at as at from reviews where entity_type = 'page' and entity_id = $1 and decision in ('approve','publish') order by id desc limit 1", [pageId]))[0]?.at ?? null;
    const lineApprovals = await q<{ entity_id: string; version: number }>(qb,
      `select r.entity_id, max(r.version)::int as version from reviews r join ms_lines l on l.id = r.entity_id
        where r.entity_type = 'line' and r.decision in ('approve','accept') and l.page_id = $1 group by r.entity_id`, [pageId]);
    const approvedV = new Map(lineApprovals.map((r) => [r.entity_id, r.version]));
    const counts = await q<{ line_id: string; s: number; c: number }>(qb,
      `select l.id as line_id,
              (select count(*)::int from ms_suggestions s where s.line_id = l.id and s.status = 'open') as s,
              (select count(*)::int from ms_comments c where c.line_id = l.id and not c.resolved and c.parent_id is null) as c
         from ms_lines l where l.page_id = $1`, [pageId]);
    const cmap = new Map(counts.map((c) => [c.line_id, c]));
    const byLine = new Map<string, VRow[]>();
    for (const v of versions) byLine.set(v.line_id, [...(byLine.get(v.line_id) ?? []), v]);
    const hasApproved = !!lastApproval || approvedV.size > 0;
    let dist = 0, chars = 0, changed = 0;
    const out = lines.map((l) => {
      const vs = byLine.get(l.id) ?? [];
      const cur = vs.find((v) => v.version === l.version) ?? null;
      let base: VRow | null = null;
      if (against === "approved" && hasApproved) {
        const cut = lastApproval ? new Date(lastApproval).getTime() : -Infinity;
        const byTime = [...vs].reverse().find((v) => new Date(v.created_at).getTime() <= cut)?.version ?? 0;
        const want = Math.max(byTime, approvedV.get(l.id) ?? 0);
        base = vs.find((v) => v.version === want) ?? null;
      }
      if (!base) base = [...vs].reverse().find((v) => v.kind === "machine") ?? vs[0] ?? null;
      const curText = cur ? plainText(cur.tokens) : "";
      const baseText = base ? plainText(base.tokens) : "";
      const isChanged = !!cur && !!base && cur.version !== base.version && !sameTokens(cur.tokens, base.tokens);
      if (isChanged) changed++;
      let cer: number | null = null;
      if (base && baseText.trim()) {
        const p = cerParts(curText, baseText);
        dist += p.dist; chars += p.chars;
        cer = p.chars ? p.dist / p.chars : null;
      }
      return {
        id: l.id, n: l.n, zone: l.zone, status: status.get(l.id) ?? "draft",
        current: cur ? { version: cur.version, kind: cur.kind, text: curText, tokens: cur.tokens, author_en: cur.author_en, author_ar: cur.author_ar } : null,
        base: base ? { version: base.version, kind: base.kind, text: baseText, tokens: base.tokens } : null,
        changed: isChanged, cer,
        open_suggestions: cmap.get(l.id)?.s ?? 0, open_comments: cmap.get(l.id)?.c ?? 0,
      };
    });
    const submitter = (await q<{ id: string; name_en: string; name_ar: string }>(qb,
      `select u.id, u.display_name_en as name_en, u.display_name_ar as name_ar from reviews r join users u on u.id = r.reviewer_id
        where r.entity_type = 'page' and r.entity_id = $1 and r.decision = 'submit' order by r.id desc limit 1`, [pageId]))[0] ?? null;
    const authorIds = (await q<{ author_id: string }>(qb,
      "select distinct v.author_id from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.kind = 'student' and v.author_id is not null", [pageId])).map((r) => r.author_id);
    const check = checkPageDecision({
      role: user.role, userId: user.id, status: page.status, decision: "approve", flagged: page.flagged, note: "x",
      submitterId: submitter?.id ?? null, approverId: null, studentAuthors: authorIds, humanLines: lines.length, sameInstitution: true,
    });
    return {
      page_id: pageId, ms_id: page.manuscript_id, ms_title_en: page.title_en, ms_title_ar: page.title_ar, siglum: page.siglum,
      page_seq: page.seq, page_label: page.label, status: page.status,
      image: { src: meta.image_path, width: meta.width, height: meta.height },
      against: against === "approved" && hasApproved ? "approved" : "machine", has_approved: hasApproved,
      lines: out, polygons: Object.fromEntries(polys.map((p) => [p.id, p.polygon])),
      page_cer: chars ? dist / chars : null, changed, submitted_by: submitter,
      can_decide: canReviewPage(user.role) && check.ok, decide_block: canReviewPage(user.role) ? (check.ok ? null : check.reason) : "Only a researcher reviews submitted pages.",
      flagged: page.flagged,
    };
  });
}

/** Per-line decision in review: accept (approve the line) or revert it to the baseline with a reason. */
export async function decideReviewLine(user: SessionUser, lineId: string, input: { decision: "accept" | "revert"; base_version?: number; note?: string }) {
  if (!canReviewPage(user.role)) throw new HttpError(403, "forbidden", "Only a researcher reviews lines.");
  if (input.decision === "accept") {
    const r = await approveLine(user, lineId, true);
    await tx((qb) => reconcileLinePoints(qb));
    return r;
  }
  if (!input.note?.trim()) throw new HttpError(400, "note_required", "Say why the change is not accepted, so the student can learn from it.");
  return tx(async (qb) => {
    const line = await lineCtx(qb, lineId);
    const page = await pageCtx(qb, line.page_id);
    if (page.status !== "student_submitted") throw new HttpError(409, "frozen", "Lines are reverted during review of a submitted page.");
    const base = (await q<{ tokens: Tok[] }>(qb, "select tokens from ms_line_versions where line_id = $1 and version = $2", [lineId, input.base_version ?? -1]))[0];
    if (!base) throw new HttpError(404, "not_found", "The version to go back to doesn't exist.");
    const version = await writeVersion(qb, {
      lineId, pageId: line.page_id, baseVersion: line.current_version, tokens: base.tokens, kind: "researcher", authorId: user.id,
      note: `Change not accepted in review (back to v${input.base_version}): ${input.note!.trim()}`, actor: user, action: "review.revert",
    });
    await qb.query("insert into reviews (entity_type, entity_id, version, reviewer_id, decision, note) values ('line',$1,$2,$3,'reject',$4)", [lineId, version, user.id, input.note!.trim()]);
    return { line_id: lineId, version };
  });
}

/** Whole-page decision from the review screen (the Studio's four-eyes workflow), then award points for accepted lines. */
export async function decideReviewPage(user: SessionUser, pageId: string, decision: "approve" | "return", note?: string) {
  if (!canReviewPage(user.role)) throw new HttpError(403, "forbidden", "Only a researcher approves or returns a submitted page.");
  const r = await decidePage(user, pageId, decision, note);
  await tx((qb) => reconcileLinePoints(qb, pageId));
  return r;
}
