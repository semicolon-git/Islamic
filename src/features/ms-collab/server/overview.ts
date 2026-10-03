import "server-only";
import { sql } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { CollabOverview, PresenceUser } from "../types";
import { iso } from "./core";

export const PRESENCE_SECONDS = 45;

/** Heartbeat: "I am on this page (on this line)". Light: one event, no table of its own. */
export async function heartbeat(user: SessionUser, pageId: string, lineId: string | null, leaving = false) {
  const p = await sql<{ id: string }>("select id from ms_pages where id = $1", [pageId]);
  if (!p.length) throw new HttpError(404, "not_found", "This page doesn't exist.");
  await emit(`page:${pageId}`, leaving ? "presence.leave" : "presence.ping", {
    user_id: user.id, name_en: user.display_name_en, name_ar: user.display_name_ar, hue: user.avatar_hue, role: user.role, line_id: lineId,
  }, user.id);
  return { ok: true };
}

/** Who is on the page now: the latest heartbeat or lock per person within the presence window, minus those who left. */
export async function presence(pageId: string): Promise<PresenceUser[]> {
  const rows = await sql<{ type: string; payload: Record<string, unknown>; actor_id: string | null; created_at: string; role: string | null }>(
    `select e.type, e.payload, e.actor_id, e.created_at, u.role from events e left join users u on u.id = e.actor_id
      where e.scope = $1 and e.type in ('presence.ping','presence.leave','line.locked') and e.created_at > now() - interval '${PRESENCE_SECONDS} seconds'
      order by e.id`, [`page:${pageId}`]);
  const by = new Map<string, PresenceUser | null>();
  for (const r of rows) {
    const id = (r.payload.user_id as string) ?? r.actor_id;
    if (!id) continue;
    if (r.type === "presence.leave") { by.set(id, null); continue; }
    const prev = by.get(id);
    by.set(id, {
      id,
      name_en: String(r.payload.name_en ?? prev?.name_en ?? ""),
      name_ar: String(r.payload.name_ar ?? prev?.name_ar ?? ""),
      hue: Number(r.payload.hue ?? prev?.hue ?? 200),
      role: (r.payload.role as PresenceUser["role"]) ?? (r.role as PresenceUser["role"]) ?? prev?.role ?? "student",
      line_id: (r.payload.line_id as string | null) ?? null,
      at: iso(r.created_at),
    });
  }
  return [...by.values()].filter((x): x is PresenceUser => !!x);
}

export async function overview(pageId: string): Promise<CollabOverview> {
  const [comments, pageComments, suggestions, hard, quotes, owner, who] = await Promise.all([
    sql<{ line_id: string; open: number; total: number }>(
      `select line_id, count(*) filter (where not resolved)::int as open, count(*)::int as total from ms_comments
        where page_id = $1 and line_id is not null and parent_id is null group by line_id`, [pageId]),
    sql<{ open: number; total: number }>("select count(*) filter (where not resolved)::int as open, count(*)::int as total from ms_comments where page_id = $1 and parent_id is null", [pageId]),
    sql<{ line_id: string; n: number }>(
      "select s.line_id, count(*)::int as n from ms_suggestions s join ms_lines l on l.id = s.line_id where l.page_id = $1 and s.status = 'open' group by s.line_id", [pageId]),
    sql<{ line_id: string; status: string; n: number }>(
      "select line_id, status, count(*)::int as n from ms_hard_words where page_id = $1 and status in ('open','disputed','agreed') group by line_id, status", [pageId]),
    sql<{ status: string; data: { verse_keys: string[]; line_ids: string[] } }>(
      "select status, data from ms_annotations where page_id = $1 and kind = 'quran' and status in ('suggested','confirmed')", [pageId]),
    sql<{ id: string; name_en: string; name_ar: string }>(
      `select u.id, u.display_name_en as name_en, u.display_name_ar as name_ar from ms_tasks t join users u on u.id = t.assignee_id
        where t.page_id = $1 and t.status = 'open' and t.kind = 'transcribe' order by t.created_at desc limit 1`, [pageId]),
    presence(pageId),
  ]);
  const hardMap: CollabOverview["hard"] = {};
  for (const h of hard) {
    const e = (hardMap[h.line_id] ??= { open: 0, disputed: 0, agreed: 0 });
    if (h.status === "open") e.open += h.n;
    else if (h.status === "disputed") e.disputed += h.n;
    else e.agreed += h.n;
  }
  const qmap: CollabOverview["quotes"] = {};
  for (const qa of quotes) for (const l of qa.data.line_ids ?? []) (qmap[l] ??= []).push({ status: qa.status, verse_keys: qa.data.verse_keys });
  return {
    page_id: pageId,
    comments: Object.fromEntries(comments.map((c) => [c.line_id, { open: c.open, total: c.total }])),
    page_comments: pageComments[0] ?? { open: 0, total: 0 },
    suggestions: Object.fromEntries(suggestions.map((s) => [s.line_id, s.n])),
    open_suggestions: suggestions.reduce((a, s) => a + s.n, 0),
    hard: hardMap,
    quotes: qmap,
    owner: owner[0] ?? null,
    presence: who,
  };
}
