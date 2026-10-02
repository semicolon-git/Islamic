import "server-only";
import { one, sql } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { inboxCounts, listInbox } from "@/features/inbox/server";
import { activityFromAudit, isFeedWorthy, pickNextTask, type ActivityItem, type AuditRowLike, type NextTask, type TaskCounts } from "./logic";
import { plain } from "@/features/portal/plain";

const STAGE = "(case when c.status = 'published' and c.revision_status is not null then c.revision_status else c.status end)";

export interface QueueItem {
  id: string;
  title_en: string;
  title_ar: string;
  at: string;
  who_en: string | null;
  who_ar: string | null;
  href: string;
}
export interface Queue {
  key: "returned" | "drafts" | "submitted" | "approved" | "waiting" | "requests";
  count: number;
  href: string;
  items: QueueItem[];
}

export interface Dashboard {
  next: NextTask;
  queues: Queue[];
  stats: { published: number; requests: number; requestsWeek: number; conversations: number; waiting: number; points: number };
  manuscripts: { toTranscribe: number; toReview: number; toApprove: number; published: number } | null;
  activity: ActivityItem[];
  topRequest: { concept_id: string | null; label_en: string | null; label_ar: string | null; open: number } | null;
}

function instScope(user: SessionUser, params: unknown[]) {
  if (user.role === "platform_admin") return "true";
  params.push(user.institution_id);
  return `(c.institution_id is null or c.institution_id = $${params.length})`;
}

async function cardQueue(user: SessionUser, stage: string, mine: boolean): Promise<{ count: number; items: QueueItem[] }> {
  const params: unknown[] = [stage];
  let where = `${STAGE} = $1 and ${instScope(user, params)}`;
  if (mine) {
    params.push(user.id);
    where += ` and c.created_by = $${params.length}`;
  }
  const rows = await sql<QueueItem & { n: number }>(
    `select c.id, coalesce(nullif(v.content->'_meta'->>'title_en',''), c.title_en) as title_en,
            coalesce(nullif(v.content->'_meta'->>'title_ar',''), c.title_ar) as title_ar, c.updated_at as at,
            u.display_name_en as who_en, u.display_name_ar as who_ar, count(*) over ()::int as n
       from cards c left join card_versions v on v.card_id = c.id and v.version = c.current_version
       left join users u on u.id = c.created_by
      where ${where} order by c.updated_at ${stage === "ai_draft" ? "desc" : "asc"} limit 4`,
    params,
  );
  return { count: rows[0]?.n ?? 0, items: plain(rows).map(({ n: _n, ...r }) => ({ ...r, href: `/portal/cards/${encodeURIComponent(r.id)}` })) };
}

export async function recentActivity(user: SessionUser, limit = 18): Promise<ActivityItem[]> {
  const params: unknown[] = [];
  const scope = user.role === "platform_admin" ? "true" : (params.push(user.institution_id), `(a.entity_type <> 'card' or c.institution_id is null or c.institution_id = $${params.length})`);
  const rows = await sql<AuditRowLike>(
    `select a.id::int as id, a.action, a.entity_type, a.entity_id, a.created_at,
            u.display_name_en as actor_en, u.display_name_ar as actor_ar,
            coalesce(c.title_en, k.label_en, r.topic) as title_en, coalesce(c.title_ar, k.label_ar, r.topic) as title_ar
       from audit_log a
       left join users u on u.id = a.actor_id
       left join cards c on a.entity_type = 'card' and c.id = a.entity_id
       left join card_requests r on a.entity_type = 'card_request' and r.id = a.entity_id
       left join concepts k on k.id = r.concept_id
      where a.action not in ('card.save') and ${scope}
      order by a.created_at desc, a.id desc limit ${Number(limit) * 2}`,
    params,
  );
  return plain(rows).filter((r) => isFeedWorthy(r.action)).slice(0, limit).map(activityFromAudit);
}

export async function getDashboard(user: SessionUser): Promise<Dashboard> {
  const isAuthor = ["student", "researcher", "institution_admin", "platform_admin"].includes(user.role);
  const empty = { count: 0, items: [] as QueueItem[] };
  const [returned, drafts, submitted, approved] = isAuthor
    ? await Promise.all([
        cardQueue(user, "returned", user.role === "student" || user.role === "researcher"),
        cardQueue(user, "ai_draft", user.role !== "platform_admin"),
        cardQueue(user, "student_submitted", false),
        cardQueue(user, "researcher_approved", false),
      ])
    : [empty, empty, empty, empty];

  const params: unknown[] = [];
  const scope = instScope(user, params);
  const [pub, req, inbox, points, ms, top, activity, firstThread] = await Promise.all([
    one<{ n: number }>(`select count(*)::int as n from cards c where c.status = 'published' and ${scope}`, params),
    one<{ open: number; week: number }>(
      "select count(*) filter (where status = 'open')::int as open, count(*) filter (where created_at > now() - interval '7 days')::int as week from card_requests",
    ),
    inboxCounts(),
    user.role === "platform_admin"
      ? one<{ n: number }>("select coalesce(sum(points),0)::int as n from users")
      : one<{ n: number }>("select coalesce(sum(points),0)::int as n from users where institution_id = $1", [user.institution_id]),
    msCounts(user),
    one<{ concept_id: string | null; label_en: string | null; label_ar: string | null; open: number }>(
      `select r.concept_id, k.label_en, k.label_ar, count(*)::int as open from card_requests r left join concepts k on k.id = r.concept_id
        where r.status = 'open' and r.concept_id is not null group by r.concept_id, k.label_en, k.label_ar order by count(*) desc, max(r.created_at) desc limit 1`,
    ),
    recentActivity(user),
    listInbox("open").then((rows) => rows.filter((r) => r.waiting_since)),
  ]);

  const counts: TaskCounts = {
    myReturned: returned.count,
    myDrafts: drafts.count,
    submitted: submitted.count,
    approved: approved.count,
    waiting: inbox.waiting,
    openRequests: req?.open ?? 0,
  };
  const next = pickNextTask(user.role, counts, {
    returned: returned.items[0]?.id,
    draft: drafts.items[0]?.id,
    submitted: submitted.items[0]?.id,
    approved: approved.items[0]?.id,
    thread: firstThread[0]?.id,
    topConcept: top?.concept_id,
  });

  const waitingItems: QueueItem[] = firstThread.slice(0, 4).map((t) => ({
    id: t.id,
    title_en: t.context?.question || t.context?.card_title_en || t.last_body || "",
    title_ar: t.context?.question || t.context?.card_title_ar || t.last_body || "",
    at: t.waiting_since ?? t.last_message_at,
    who_en: null,
    who_ar: null,
    href: `/portal/inbox/${t.id}`,
  }));
  const q = (key: Queue["key"], data: { count: number; items: QueueItem[] }, href: string): Queue => ({ key, href, ...data });
  const byRole: Record<string, Queue[]> = {
    student: [q("returned", returned, "/portal/cards?stage=returned&mine=1"), q("drafts", drafts, "/portal/cards?stage=ai_draft&mine=1"), q("submitted", submitted, "/portal/cards?stage=student_submitted")],
    researcher: [q("submitted", submitted, "/portal/cards?stage=student_submitted"), q("returned", returned, "/portal/cards?stage=returned"), q("drafts", drafts, "/portal/cards?stage=ai_draft&mine=1"), q("waiting", { count: inbox.waiting, items: waitingItems }, "/portal/inbox")],
    institution_admin: [q("approved", approved, "/portal/cards?stage=researcher_approved"), q("submitted", submitted, "/portal/cards?stage=student_submitted"), q("returned", returned, "/portal/cards?stage=returned")],
    specialist: [q("waiting", { count: inbox.waiting, items: waitingItems }, "/portal/inbox")],
    platform_admin: [q("approved", approved, "/portal/cards?stage=researcher_approved"), q("submitted", submitted, "/portal/cards?stage=student_submitted"), q("waiting", { count: inbox.waiting, items: waitingItems }, "/portal/inbox")],
  };
  return {
    next,
    queues: byRole[user.role] ?? [],
    stats: { published: pub?.n ?? 0, requests: req?.open ?? 0, requestsWeek: req?.week ?? 0, conversations: inbox.open, waiting: inbox.waiting, points: points?.n ?? 0 },
    manuscripts: ms,
    activity,
    topRequest: top,
  };
}

/** Manuscript Studio pages in the user's queue (the Studio itself is another builder's area; this only counts). */
async function msCounts(user: SessionUser) {
  try {
    const params: unknown[] = [];
    const scope = user.role === "platform_admin" ? "true" : (params.push(user.institution_id), `m.institution_id = $${params.length}`);
    const r = await one<{ a: number; b: number; c: number; d: number }>(
      `select count(*) filter (where p.status in ('ai_draft','returned'))::int as a,
              count(*) filter (where p.status = 'student_submitted')::int as b,
              count(*) filter (where p.status = 'researcher_approved')::int as c,
              count(*) filter (where p.status = 'published')::int as d
         from ms_pages p join manuscripts m on m.id = p.manuscript_id where ${scope}`,
      params,
    );
    return r ? { toTranscribe: r.a, toReview: r.b, toApprove: r.c, published: r.d } : null;
  } catch {
    return null;
  }
}

/* ───────────────────────────── people */

export interface PersonRow {
  id: string;
  role: SessionUser["role"];
  display_name_en: string;
  display_name_ar: string;
  title_en: string | null;
  title_ar: string | null;
  avatar_hue: number;
  points: number;
  is_demo: boolean;
  institution_id: string | null;
  institution_en: string | null;
  institution_ar: string | null;
  cards_created: number;
  approved_contributions: number;
  reviews_done: number;
}

export interface Contribution {
  id: number;
  user_id: string;
  role: string;
  display_name_en: string;
  display_name_ar: string;
  delta: number;
  reason: string;
  ref: string | null;
  title_en: string | null;
  title_ar: string | null;
  created_at: string;
}

export async function getPeople(user: SessionUser) {
  const params: unknown[] = [];
  const own = user.role === "student";
  const where = own ? (params.push(user.id), `u.id = $${params.length}`) : "true";
  const people = await sql<PersonRow>(
    `select u.id, u.role, u.display_name_en, u.display_name_ar, u.title_en, u.title_ar, u.avatar_hue, u.points, u.is_demo, u.institution_id,
            i.name_en as institution_en, i.name_ar as institution_ar,
            (select count(*)::int from cards c where c.created_by = u.id) as cards_created,
            (select count(*)::int from points_ledger l where l.user_id = u.id and l.delta > 0) as approved_contributions,
            (select count(*)::int from reviews r where r.reviewer_id = u.id and r.decision in ('approve','return','publish')) as reviews_done
       from users u left join institutions i on i.id = u.institution_id
      where ${where}
      order by u.points desc, u.display_name_en`,
    params,
  );
  const contributions = await sql<Contribution>(
    `select l.id::int as id, l.user_id, u.role, u.display_name_en, u.display_name_ar, l.delta, l.reason, l.ref, l.created_at,
            c.title_en, c.title_ar
       from points_ledger l join users u on u.id = l.user_id
       left join cards c on c.id = split_part(l.ref, '@', 1)
      where ${own ? "l.user_id = $1" : "true"}
      order by l.created_at desc, l.id desc limit 20`,
    own ? [user.id] : [],
  );
  const institutions = own
    ? []
    : await sql<{ id: string; name_en: string; name_ar: string; kind: string; is_demo: boolean }>("select id, name_en, name_ar, kind, is_demo from institutions order by name_en");
  return plain({ people, contributions, institutions, ownOnly: own });
}
