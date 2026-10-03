/**
 * Manuscript collaboration seed (idempotent). Runs the real workflow with the demo personas, so the portal and the
 * public reader are not empty:
 *  - assignments ("My work") for Sara and Omar on the BnF copy;
 *  - one page (BnF Arabe 5341, p. 03) checked line by line by Sara, submitted, approved by Dr Huda (researcher),
 *    and published by Khalid (holding institution) — four eyes respected, frozen and hashed like the Studio does;
 *  - Quran-quotation proposals found by the matcher (Q 43:15 on that page and on Michigan p. 02) — left for a
 *    researcher to confirm;
 *  - a little collaboration on other BnF pages: a comment thread with an @mention, a suggestion, and hard words
 *    (one agreed, one disputed, one waiting for a second reader).
 * The texts are the seeded machine drafts; no ground truth is ever used as anyone's contribution.
 * Demo personas are marked "(demo)" in the UI.
 */
import crypto from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import type { SessionUser } from "../../src/lib/auth";
import { buildIndex, type VerseRow } from "../../src/lib/quran/matcher";
import { orderLines } from "../../src/features/manuscripts/geometry";
import { canonicalJson } from "../../src/features/manuscripts/rules";
import { acceptAlternative, plainText, readingText, type Tok } from "../../src/features/manuscripts/tokens";
import { addCommentQ } from "../../src/features/ms-collab/server/comments";
import { syncHardWords, submitKeyingQ } from "../../src/features/ms-collab/server/hardwords";
import { reconcileLinePoints } from "../../src/features/ms-collab/server/points";
import { createSuggestionQ } from "../../src/features/ms-collab/server/suggestions";
import { assignQ } from "../../src/features/ms-collab/server/tasks";
import { scanQuotes } from "../../src/features/ms-collab/server/understanding";
import { log } from "./util";

const PUBLISHED = "bnf-arabe-5341_03";
const SARA_PAGE = "bnf-arabe-5341_01";
const OMAR_PAGE = "bnf-arabe-5341_02";
const KEY_PAGE = "bnf-arabe-5341_04";
const SCAN_PAGES = [PUBLISHED, "umich-isl-22_02"];

async function persona(q: Queryable, id: string): Promise<SessionUser | null> {
  return (await q.query<SessionUser>(
    `select u.id, u.role, u.display_name_en, u.display_name_ar, u.title_en, u.title_ar, u.institution_id,
            i.name_en as institution_name_en, i.name_ar as institution_name_ar, u.avatar_hue, u.points, u.is_demo
       from users u left join institutions i on i.id = u.institution_id where u.id = $1`, [id])).rows[0] ?? null;
}

const one = async <T,>(q: Queryable, text: string, params: unknown[] = []) => (await q.query<T>(text, params)).rows[0] ?? null;

/** Lines of a page in reading order with their current version (as the Studio orders them). */
async function lines(q: Queryable, pageId: string) {
  const regions = (await q.query<{ id: string; seq: number; type: string }>("select id, seq, type from ms_regions where page_id = $1", [pageId])).rows;
  const rows = (await q.query<{ id: string; region_id: string | null; seq: number; polygon: unknown; current_version: number; tokens: Tok[] | null; kind: string | null; author_id: string | null; normalized_text: string | null }>(
    `select l.id, l.region_id, l.seq, l.polygon, l.current_version, v.tokens, v.kind, v.author_id, v.normalized_text
       from ms_lines l left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.page_id = $1`, [pageId])).rows;
  const types = new Map(regions.map((r) => [r.id, r.type]));
  return orderLines(rows, regions).map((l, i) => ({ ...l, n: i + 1, zone: l.region_id ? types.get(l.region_id) ?? null : null }));
}

/** The same frozen snapshot the Studio publishes (src/features/manuscripts/server/workflow.ts pageSnapshot). */
async function snapshot(q: Queryable, pageId: string) {
  const ls = (await lines(q, pageId)).map((l, i) => ({
    n: i + 1, line_id: l.id, zone: l.zone, version: l.current_version ?? 0, kind: l.kind, author_id: l.author_id,
    tokens: l.tokens ?? [], plain_text: plainText(l.tokens ?? []), reading_text: l.normalized_text ?? readingText(l.tokens ?? []),
  }));
  const contributors = (await q.query<{ author_id: string; kind: string }>(
    `select distinct v.author_id, v.kind from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.author_id is not null order by 1, 2`, [pageId])).rows;
  const engines = (await q.query<{ engine: string }>(
    `select distinct v.engine from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.kind = 'machine' and v.engine is not null order by 1`, [pageId])).rows;
  const content = { page_id: pageId, lines: ls, contributors, machine_draft: engines.map((e) => e.engine) };
  return { content, sha: crypto.createHash("sha256").update(canonicalJson(content)).digest("hex") };
}

async function review(q: Queryable, pageId: string, by: string, from: string, to: string, decision: string, note: string | null, version: number | null = null) {
  await q.query(
    "insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note) values ('page',$1,$2,$3,$4,$5,$6,$7)",
    [pageId, version, by, from, to, decision, note]);
  await q.query("insert into audit_log (actor_id, action, entity_type, entity_id, before, after) values ($1,$2,'page',$3,$4,$5)",
    [by, `page.${decision}`, pageId, JSON.stringify({ status: from }), JSON.stringify({ status: to, note })]);
  await q.query("update ms_pages set status = $2, updated_at = now() where id = $1", [pageId, to]);
}

/** Sara checks every line against the image (a student version), submits; Huda approves; Khalid publishes. */
async function publishDemoPage(q: Queryable, sara: SessionUser, huda: SessionUser, khalid: SessionUser) {
  const page = await one<{ status: string; published_version: number | null }>(q, "select status, published_version from ms_pages where id = $1", [PUBLISHED]);
  if (!page || page.published_version || page.status !== "ai_draft") return false;
  for (const l of await lines(q, PUBLISHED)) {
    if (!l.tokens?.length || l.kind !== "machine") continue;
    const v = l.current_version + 1;
    await q.query(
      `insert into ms_line_versions (line_id, version, tokens, plain_text, kind, author_id, base_version, note) values ($1,$2,$3,$4,'student',$5,$6,$7)`,
      [l.id, v, JSON.stringify(l.tokens), plainText(l.tokens), sara.id, l.current_version, "Checked against the image (demo seed)"]);
    await q.query("update ms_lines set current_version = $2, status = 'transcribed' where id = $1", [l.id, v]);
  }
  await review(q, PUBLISHED, sara.id, "ai_draft", "student_submitted", "submit", "All lines checked against the image; uncertain words kept as uncertain.");
  // four eyes: the reviewer is not the transcriber
  await q.query(`update ms_lines l set status = 'approved' where l.page_id = $1 and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')`, [PUBLISHED]);
  await review(q, PUBLISHED, huda.id, "student_submitted", "researcher_approved", "approve", null);
  await reconcileLinePoints(q, PUBLISHED);
  // four eyes: the publisher is not the approving researcher, and belongs to the holding institution
  const snap = await snapshot(q, PUBLISHED);
  await q.query("insert into ms_page_publications (page_id, version, content, content_sha, published_by, approved_by) values ($1,1,$2,$3,$4,$5)",
    [PUBLISHED, JSON.stringify(snap.content), snap.sha, khalid.id, huda.id]);
  await q.query("update ms_pages set published_version = 1, published_at = now(), published_by = $2, published_sha = $3 where id = $1", [PUBLISHED, khalid.id, snap.sha]);
  await review(q, PUBLISHED, khalid.id, "researcher_approved", "published", "publish", null, 1);
  return true;
}

export async function seed(q: Queryable) {
  const [sara, omar, huda, khalid] = await Promise.all(["u_sara", "u_omar", "u_huda", "u_khalid"].map((id) => persona(q, id)));
  if (!sara || !omar || !huda || !khalid) return log("ms-collab: demo personas missing, skipped");
  const pages = (await q.query<{ id: string }>("select id from ms_pages where id = any($1::text[])", [[PUBLISHED, SARA_PAGE, OMAR_PAGE, KEY_PAGE]])).rows.map((r) => r.id);
  if (pages.length < 4) return log("ms-collab: BnF demo pages missing, skipped");
  const out: string[] = [];

  // 1) Assignments
  if (!(await one(q, "select 1 from ms_tasks limit 1"))) {
    const day = 86_400_000;
    await assignQ(q, huda, { page_ids: [SARA_PAGE], assignee_id: sara.id, kind: "transcribe", priority: "high", due_at: new Date(Date.now() + 3 * day).toISOString(), note: "ابدئي بالأسطر الأولى، وانتبهي للنقط في الكلمات المظلّلة." });
    await assignQ(q, huda, { page_ids: [OMAR_PAGE], assignee_id: omar.id, kind: "transcribe", priority: "normal", due_at: new Date(Date.now() + 7 * day).toISOString() });
    await assignQ(q, huda, { page_ids: [KEY_PAGE], assignee_id: sara.id, kind: "double_key", priority: "low" });
    out.push("3 assignments");
  }

  // 2) A published page, through the real workflow
  if (await publishDemoPage(q, sara, huda, khalid)) out.push(`${PUBLISHED} published (v1)`);

  // 3) Quran-quote proposals (the matcher on the reading text; a researcher confirms later)
  const verses = (await q.query<VerseRow>("select key, sura, aya, text_emlaey, text_uthmani, sura_name_ar, sura_name_en from quran_ayah order by sura, aya")).rows;
  if (verses.length) {
    const ix = buildIndex(verses);
    let n = 0;
    for (const p of SCAN_PAGES) if ((await one(q, "select 1 from ms_pages where id = $1", [p]))) n += await scanQuotes(q, ix, p);
    if (n) out.push(`${n} Quran-quote proposals`);
  }

  // 4) Collaboration on Sara's page: a question with an @mention and a reply, and Omar's suggestion (Sara owns the page)
  if (!(await one(q, "select 1 from ms_comments where page_id = $1", [SARA_PAGE]))) {
    const ls = await lines(q, SARA_PAGE);
    const target = ls.find((l) => (l.tokens ?? []).some((k) => k.t === "unclear")) ?? ls[2];
    if (target) {
      const c = await addCommentQ(q, huda, SARA_PAGE, { line_id: target.id, body: `@${sara.display_name_ar} الكلمة المظلّلة في هذا السطر تحتاج نظرًا في النقط؛ كبّري الصورة قبل الحكم عليها.` });
      await addCommentQ(q, sara, SARA_PAGE, { parent_id: c.id, body: "سأراجعها في الصورة المكبّرة اليوم إن شاء الله." });
      out.push("1 comment thread");
    }
    const withAlt = ls.find((l) => l.id !== target?.id && (l.tokens ?? []).some((k) => k.t === "unclear" && (k.alts?.length ?? 0) > 0));
    if (withAlt) {
      const idx = withAlt.tokens!.findIndex((k) => k.t === "unclear" && (k.alts?.length ?? 0) > 0);
      const alt = (withAlt.tokens![idx] as Extract<Tok, { t: "unclear" }>).alts![0];
      await createSuggestionQ(q, omar, withAlt.id, { base_version: withAlt.current_version, tokens: acceptAlternative(withAlt.tokens!, idx, alt), reason: "في الصورة المكبّرة تظهر النقط كما في القراءة البديلة." });
      out.push("1 suggestion");
    }
  }

  // 5) Hard words on Omar's page: one agreed, one disputed, one waiting for a second reader
  if (!(await one(q, "select 1 from ms_keyings limit 1"))) {
    await syncHardWords(q, [OMAR_PAGE]);
    const items = (await q.query<{ id: string; token_text: string; alts: string[] }>(
      "select h.id, h.token_text, h.alts from ms_hard_words h join ms_lines l on l.id = h.line_id where h.page_id = $1 and h.status = 'open' order by l.seq, h.token_index limit 3", [OMAR_PAGE])).rows;
    if (items[0]) {
      await submitKeyingQ(q, sara, items[0].id, { reading: items[0].token_text });
      await submitKeyingQ(q, omar, items[0].id, { reading: items[0].token_text });
    }
    if (items[1]) {
      await submitKeyingQ(q, sara, items[1].id, { reading: items[1].token_text });
      await submitKeyingQ(q, omar, items[1].id, { cant_read: "illegible" });
    }
    if (items[2]) await submitKeyingQ(q, omar, items[2].id, { reading: items[2].token_text });
    if (items.length) out.push(`${items.length} hard words keyed (agreed / disputed / waiting)`);
  }

  log(`ms-collab: ${out.length ? out.join(" · ") : "already seeded"}`);
}
