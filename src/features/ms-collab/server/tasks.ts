// Server code (not marked server-only so the seed can run the same workflow).
import { q, sql, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { orderLines } from "../../manuscripts/geometry";
import { canAssign } from "../rules";
import type { AssignData, MentionItem, QueueData, ReviewQueueItem, SuggestionInboxItem, TaskDTO, TaskKind, Priority } from "../types";
import { iso, isoOrNull } from "./core";
import { hardWordCounts } from "./hardwords";
import { reconcileLinePoints } from "./points";

const SUBMITTED = new Set(["student_submitted", "researcher_approved", "published", "archived"]);

interface TaskRow {
  id: string; kind: TaskKind; status: "open" | "done" | "cancelled"; priority: Priority; due_at: string | null; note: string | null; created_at: string; done_at: string | null;
  page_id: string; line_ids: string[]; page_seq: number; page_label: string | null; page_status: TaskDTO["page_status"]; thumb: string | null;
  ms_id: string; ms_title_en: string; ms_title_ar: string; siglum: string | null;
  a_id: string | null; a_en: string | null; a_ar: string | null; a_hue: number | null; c_id: string | null; c_en: string | null; c_ar: string | null;
}

const TASK_SELECT = `select t.id, t.kind, t.status, t.priority, t.due_at, t.note, t.created_at, t.done_at, t.page_id, t.line_ids,
    p.seq as page_seq, p.label as page_label, p.status as page_status, p.thumb_path as thumb,
    m.id as ms_id, m.title_en as ms_title_en, m.title_ar as ms_title_ar, m.siglum,
    a.id as a_id, a.display_name_en as a_en, a.display_name_ar as a_ar, a.avatar_hue as a_hue,
    c.id as c_id, c.display_name_en as c_en, c.display_name_ar as c_ar
  from ms_tasks t join ms_pages p on p.id = t.page_id join manuscripts m on m.id = p.manuscript_id
  left join users a on a.id = t.assignee_id left join users c on c.id = t.created_by`;

/** Lines in reading order with whether a person has checked them (for progress and "Continue"). */
async function pageLineState(qb: Queryable, pageIds: string[]) {
  if (!pageIds.length) return new Map<string, { id: string; human: boolean }[]>();
  const regions = await q<{ id: string; page_id: string; seq: number }>(qb, "select id, page_id, seq from ms_regions where page_id = any($1::text[])", [pageIds]);
  const lines = await q<{ id: string; page_id: string; region_id: string | null; seq: number; human: boolean }>(qb,
    `select l.id, l.page_id, l.region_id, l.seq, exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine') as human
       from ms_lines l where l.page_id = any($1::text[])`, [pageIds]);
  const out = new Map<string, { id: string; human: boolean }[]>();
  for (const pid of pageIds) out.set(pid, orderLines(lines.filter((l) => l.page_id === pid), regions.filter((r) => r.page_id === pid)).map((l) => ({ id: l.id, human: !!l.human })));
  return out;
}

async function toTasks(qb: Queryable, rows: TaskRow[]): Promise<TaskDTO[]> {
  const state = await pageLineState(qb, [...new Set(rows.map((r) => r.page_id))]);
  return rows.map((r) => {
    const all = state.get(r.page_id) ?? [];
    const scope = r.line_ids?.length ? all.filter((l) => r.line_ids.includes(l.id)) : all;
    const next = scope.find((l) => !l.human) ?? scope[0];
    const base = `/portal/manuscripts/${r.ms_id}/pages/${r.page_id}`;
    return {
      id: r.id, kind: r.kind, status: r.status, priority: r.priority, due_at: isoOrNull(r.due_at), note: r.note, created_at: iso(r.created_at), done_at: isoOrNull(r.done_at),
      page_id: r.page_id, page_seq: r.page_seq, page_label: r.page_label, page_status: r.page_status, thumb: r.thumb,
      ms_id: r.ms_id, ms_title_en: r.ms_title_en, ms_title_ar: r.ms_title_ar, siglum: r.siglum,
      assignee: r.a_id ? { id: r.a_id, name_en: r.a_en!, name_ar: r.a_ar!, hue: r.a_hue ?? 200 } : null,
      created_by: r.c_id ? { id: r.c_id, name_en: r.c_en!, name_ar: r.c_ar! } : null,
      total: scope.length,
      touched: scope.filter((l) => l.human).length,
      continue_n: next ? all.findIndex((l) => l.id === next.id) + 1 : null,
      continue_href: r.kind === "double_key" ? `/portal/manuscripts/queue/hard-words?page=${encodeURIComponent(r.page_id)}` : next ? `${base}?line=${encodeURIComponent(next.id)}` : base,
      submitted: SUBMITTED.has(r.page_status),
    };
  });
}

/** A transcription task is done once its page leaves the student's hands (submitted for review). */
async function reconcileTasks(qb: Queryable) {
  await qb.query(
    `update ms_tasks t set status = 'done', done_at = now(), updated_at = now()
      from ms_pages p where p.id = t.page_id and t.status = 'open' and t.kind in ('transcribe','verify')
        and p.status in ('student_submitted','researcher_approved','published','archived')`,
  );
}

const PRIORITY_ORDER = "case t.priority when 'high' then 0 when 'normal' then 1 else 2 end";

export async function myQueue(user: SessionUser): Promise<QueueData> {
  return tx(async (qb) => {
    await reconcileTasks(qb);
    await reconcileLinePoints(qb);
    const open = await q<TaskRow>(qb, `${TASK_SELECT} where t.assignee_id = $1 and t.status = 'open' order by ${PRIORITY_ORDER}, t.due_at nulls last, t.created_at`, [user.id]);
    const done = await q<TaskRow>(qb, `${TASK_SELECT} where t.assignee_id = $1 and t.status = 'done' order by t.done_at desc limit 6`, [user.id]);
    const reviewer = user.role === "researcher" || user.role === "platform_admin";
    const publisher = user.role === "institution_admin" || user.role === "platform_admin";
    const reviews = reviewer ? await reviewQueue(qb, "student_submitted") : [];
    const publish = publisher ? await reviewQueue(qb, "researcher_approved", user.role === "platform_admin" ? null : user.institution_id) : [];
    const mentions = await q<MentionItem & { line_id: string | null }>(qb,
      `select c.id, c.page_id, p.manuscript_id as ms_id, c.line_id, null::int as line_n, c.body, u.display_name_en as author_en, u.display_name_ar as author_ar, c.created_at
         from ms_comments c join ms_pages p on p.id = c.page_id join users u on u.id = c.author_id
        where $1 = any(c.mentions) and not c.resolved order by c.created_at desc limit 6`, [user.id]);
    const suggestions = await q<SuggestionInboxItem>(qb,
      `select s.id, l.page_id, p.manuscript_id as ms_id, s.line_id, 0 as line_n, u.display_name_en as author_en, u.display_name_ar as author_ar, s.reason, s.created_at
         from ms_suggestions s join ms_lines l on l.id = s.line_id join ms_pages p on p.id = l.page_id join users u on u.id = s.author_id
        where s.status = 'open' and s.author_id <> $1 and p.status not in ('published','archived')
          and ($2 or exists (select 1 from ms_tasks t where t.page_id = p.id and t.assignee_id = $1 and t.status = 'open' and t.kind = 'transcribe'))
        order by s.created_at limit 8`, [user.id, reviewer]);
    const nums = await lineNumbers(qb, [...mentions.filter((m) => m.line_id).map((m) => m.line_id!), ...suggestions.map((s) => s.line_id)]);
    return {
      role: user.role,
      user_id: user.id,
      tasks: await toTasks(qb, open),
      done: await toTasks(qb, done),
      reviews,
      publish,
      hard: await hardWordCounts(user, qb),
      mentions: mentions.map((m) => ({ ...m, line_n: m.line_id ? nums.get(m.line_id) ?? null : null, created_at: iso(m.created_at) })),
      suggestions: suggestions.map((s) => ({ ...s, line_n: nums.get(s.line_id) ?? 0, created_at: iso(s.created_at) })),
    };
  });
}

/** Reading-order line numbers for a set of lines. */
export async function lineNumbers(qb: Queryable, lineIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!lineIds.length) return out;
  const pages = (await q<{ page_id: string }>(qb, "select distinct page_id from ms_lines where id = any($1::text[])", [lineIds])).map((r) => r.page_id);
  const regions = await q<{ id: string; page_id: string; seq: number }>(qb, "select id, page_id, seq from ms_regions where page_id = any($1::text[])", [pages]);
  const lines = await q<{ id: string; page_id: string; region_id: string | null; seq: number }>(qb, "select id, page_id, region_id, seq from ms_lines where page_id = any($1::text[])", [pages]);
  for (const p of pages) orderLines(lines.filter((l) => l.page_id === p), regions.filter((r) => r.page_id === p)).forEach((l, i) => out.set(l.id, i + 1));
  return out;
}

async function reviewQueue(qb: Queryable, status: string, institutionId?: string | null): Promise<ReviewQueueItem[]> {
  const params: unknown[] = [status];
  const inst = institutionId ? (params.push(institutionId), ` and m.institution_id = $${params.length}`) : "";
  const rows = await q<ReviewQueueItem & { s_en: string | null; s_ar: string | null; s_hue: number | null }>(qb,
    `select p.id as page_id, p.seq as page_seq, p.label as page_label, p.status, p.thumb_path as thumb, m.id as ms_id, m.title_en as ms_title_en, m.title_ar as ms_title_ar, m.siglum,
            sr.display_name_en as s_en, sr.display_name_ar as s_ar, sr.avatar_hue as s_hue, rv.created_at as submitted_at,
            (select count(*)::int from ms_lines l where l.page_id = p.id) as lines_total,
            (select count(*)::int from ms_lines l where l.page_id = p.id and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')) as lines_changed,
            (select count(*)::int from ms_suggestions s join ms_lines l on l.id = s.line_id where l.page_id = p.id and s.status = 'open') as open_suggestions,
            (select count(*)::int from ms_comments c where c.page_id = p.id and not c.resolved) as open_comments
       from ms_pages p join manuscripts m on m.id = p.manuscript_id
       left join lateral (select r.reviewer_id, r.created_at from reviews r where r.entity_type = 'page' and r.entity_id = p.id
                            and r.decision = (case when $1::text = 'student_submitted' then 'submit' else 'approve' end) order by r.id desc limit 1) rv on true
       left join users sr on sr.id = rv.reviewer_id
      where p.status = $1::text${inst} order by rv.created_at nulls last, m.siglum, p.seq`, params);
  return rows.map(({ s_en, s_ar, s_hue, ...r }) => ({ ...r, submitted_at: isoOrNull(r.submitted_at), submitted_by: s_en ? { name_en: s_en, name_ar: s_ar!, hue: s_hue ?? 200 } : null }));
}

export async function assignData(user: SessionUser): Promise<AssignData> {
  if (!canAssign(user.role)) throw new HttpError(403, "forbidden", "Researchers and institution admins assign pages.");
  return tx(async (qb) => {
    await reconcileTasks(qb);
    const ms = await q<{ id: string; title_en: string; title_ar: string; siglum: string | null; shelfmark: string | null }>(qb,
      "select id, title_en, title_ar, siglum, shelfmark from manuscripts order by work_id nulls last, siglum nulls last, created_at");
    const pages = await q<{ id: string; manuscript_id: string; seq: number; label: string | null; status: AssignData["manuscripts"][number]["pages"][number]["status"]; thumb: string | null; lines_total: number; lines_human: number; o_id: string | null; o_en: string | null; o_ar: string | null }>(qb,
      `select p.id, p.manuscript_id, p.seq, p.label, p.status, p.thumb_path as thumb,
              (select count(*)::int from ms_lines l where l.page_id = p.id) as lines_total,
              (select count(*)::int from ms_lines l where l.page_id = p.id and exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine')) as lines_human,
              o.id as o_id, o.display_name_en as o_en, o.display_name_ar as o_ar
         from ms_pages p
         left join lateral (select t.assignee_id from ms_tasks t where t.page_id = p.id and t.status = 'open' and t.kind = 'transcribe' order by t.created_at desc limit 1) ot on true
         left join users o on o.id = ot.assignee_id
        order by p.seq`);
    const students = await q<{ id: string; name_en: string; name_ar: string; hue: number; open_tasks: number }>(qb,
      `select u.id, u.display_name_en as name_en, u.display_name_ar as name_ar, u.avatar_hue as hue,
              (select count(*)::int from ms_tasks t where t.assignee_id = u.id and t.status = 'open') as open_tasks
         from users u where u.role = 'student' order by u.display_name_en`);
    const open = await q<TaskRow>(qb, `${TASK_SELECT} where t.status = 'open' order by t.created_at desc limit 40`);
    return {
      manuscripts: ms.map((m) => ({
        ...m,
        pages: pages.filter((p) => p.manuscript_id === m.id).map((p) => ({
          id: p.id, seq: p.seq, label: p.label, status: p.status, thumb: p.thumb, lines_total: p.lines_total, lines_human: p.lines_human,
          owner: p.o_id ? { id: p.o_id, name_en: p.o_en!, name_ar: p.o_ar! } : null,
        })),
      })),
      students,
      open: await toTasks(qb, open),
    };
  });
}

export interface AssignInput {
  page_ids: string[];
  assignee_id: string;
  kind: TaskKind;
  priority: Priority;
  due_at?: string | null;
  note?: string;
  line_ids?: string[];
}

export async function assign(user: SessionUser, input: AssignInput): Promise<{ ids: string[] }> {
  return tx((qb) => assignQ(qb, user, input));
}

export async function assignQ(qb: Queryable, user: SessionUser, input: AssignInput): Promise<{ ids: string[] }> {
  if (!canAssign(user.role)) throw new HttpError(403, "forbidden", "Researchers and institution admins assign pages.");
  {
    const who = (await q<{ id: string; role: string; display_name_en: string; display_name_ar: string }>(qb, "select id, role, display_name_en, display_name_ar from users where id = $1", [input.assignee_id]))[0];
    if (!who) throw new HttpError(404, "not_found", "That person doesn't exist.");
    if (who.role !== "student") throw new HttpError(400, "not_student", "Pages are assigned to students; researchers review them.");
    const ids: string[] = [];
    for (const pageId of input.page_ids) {
      const p = (await q<{ id: string; manuscript_id: string; status: string }>(qb, "select id, manuscript_id, status from ms_pages where id = $1", [pageId]))[0];
      if (!p) throw new HttpError(404, "not_found", "One of the pages doesn't exist.");
      if (input.kind !== "review" && !["ai_draft", "returned"].includes(p.status))
        throw new HttpError(409, "frozen", "This page is past transcription (submitted, approved or published), so it can't be assigned for transcription.");
      let lineIds: string[] = [];
      if (input.line_ids?.length) {
        lineIds = (await q<{ id: string }>(qb, "select id from ms_lines where page_id = $1 and id = any($2::text[])", [pageId, input.line_ids])).map((r) => r.id);
      }
      if (input.kind === "transcribe") {
        // one owner per page: an earlier open transcription task is handed over
        await qb.query("update ms_tasks set status = 'cancelled', updated_at = now(), note = coalesce(note || ' · ', '') || 'Reassigned' where page_id = $1 and kind = 'transcribe' and status = 'open'", [pageId]);
      }
      const id = newId("task");
      await qb.query(
        `insert into ms_tasks (id, page_id, kind, line_ids, assignee_id, created_by, status, note, due_at, priority) values ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9)`,
        [id, pageId, input.kind, lineIds, who.id, user.id, input.note?.trim() || null, input.due_at || null, input.priority],
      );
      await audit(qb, user.id, "task.assign", "page", pageId, null, { task: id, assignee: who.id, kind: input.kind, priority: input.priority, due_at: input.due_at ?? null });
      await emit(`ms:${p.manuscript_id}`, "task.assigned", { task_id: id, page_id: pageId, assignee_id: who.id }, user.id, qb);
      await emit(`page:${pageId}`, "task.assigned", { task_id: id, assignee_id: who.id, name_en: who.display_name_en, name_ar: who.display_name_ar }, user.id, qb);
      await emit(`user:${who.id}`, "task.assigned", { task_id: id, page_id: pageId }, user.id, qb);
      ids.push(id);
    }
    return { ids };
  }
}

export async function updateTask(user: SessionUser, id: string, action: "done" | "cancel" | "reopen"): Promise<{ status: string }> {
  return tx(async (qb) => {
    const t = (await q<{ id: string; assignee_id: string | null; created_by: string | null; page_id: string; status: string; kind: string }>(qb, "select id, assignee_id, created_by, page_id, status, kind from ms_tasks where id = $1", [id]))[0];
    if (!t) throw new HttpError(404, "not_found", "This task no longer exists.");
    const mine = t.assignee_id === user.id;
    if (action === "done" && !mine && !canAssign(user.role)) throw new HttpError(403, "forbidden", "Only the assignee can mark this task done.");
    if (action !== "done" && !canAssign(user.role)) throw new HttpError(403, "forbidden", "Only researchers and institution admins can cancel or reopen tasks.");
    const status = action === "done" ? "done" : action === "cancel" ? "cancelled" : "open";
    await qb.query("update ms_tasks set status = $2, done_at = case when $2 = 'done' then now() else null end, updated_at = now() where id = $1", [id, status]);
    await audit(qb, user.id, `task.${action}`, "page", t.page_id, { status: t.status }, { status, task: id });
    await emit(`page:${t.page_id}`, "task.updated", { task_id: id, status }, user.id, qb);
    return { status };
  });
}

/** Dashboard card counts. */
export async function dashboardCounts(user: SessionUser) {
  const [tasks] = await sql<{ open: number; due_soon: number }>(
    `select count(*)::int as open, count(*) filter (where due_at is not null and due_at < now() + interval '3 days')::int as due_soon
       from ms_tasks t join ms_pages p on p.id = t.page_id where t.assignee_id = $1 and t.status = 'open' and p.status in ('ai_draft','returned')`, [user.id]);
  const [reviews] = await sql<{ n: number }>("select count(*)::int as n from ms_pages where status = 'student_submitted'");
  const [mentions] = await sql<{ n: number }>("select count(*)::int as n from ms_comments where $1 = any(mentions) and not resolved", [user.id]);
  const hard = await hardWordCounts(user);
  return { tasks: tasks?.open ?? 0, due_soon: tasks?.due_soon ?? 0, reviews: reviews?.n ?? 0, mentions: mentions?.n ?? 0, ...hard };
}
