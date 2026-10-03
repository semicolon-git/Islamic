// Server code (not marked server-only so the seed can run the same workflow).
import { q, sql, tx, type Queryable } from "@/lib/db";
import { pointsFor, uniqueAwards, type Award, type AwardReason } from "../rules";
import { iso } from "./core";

/**
 * Award learning points for accepted manuscript work. Idempotent: one ledger row per (user, reason, ref), enforced by a
 * partial unique index (0510) — re-running any award never double-counts. Returns the awards actually made.
 */
export async function award(qb: Queryable, awards: Award[]): Promise<Award[]> {
  const made: Award[] = [];
  for (const a of uniqueAwards(awards)) {
    const r = await q<{ id: number }>(qb,
      `insert into points_ledger (user_id, delta, reason, ref) values ($1,$2,$3,$4)
       on conflict (user_id, reason, ref) where reason like 'ms\\_%' do nothing returning id`,
      [a.user_id, a.delta, a.reason, a.ref]);
    if (r.length) {
      await qb.query("update users set points = points + $2 where id = $1", [a.user_id, a.delta]);
      made.push(a);
    }
  }
  return made;
}

export const lineAward = (userId: string, lineId: string, zone: string | null): Award =>
  ({ user_id: userId, reason: "ms_line_accepted", ref: `line:${lineId}`, delta: pointsFor("ms_line_accepted", zone) });

/**
 * Accepted lines earn their (last) student transcriber points once the researcher approved the line — whether that
 * happened in the review screen, the Studio's page approval or line by line. Safe to call any time.
 */
export async function reconcileLinePoints(qb: Queryable, pageId?: string): Promise<Award[]> {
  const rows = await q<{ line_id: string; zone: string | null; author_id: string }>(qb,
    `select l.id as line_id, r.type as zone,
            (select v.author_id from ms_line_versions v where v.line_id = l.id and v.kind = 'student' and v.author_id is not null order by v.version desc limit 1) as author_id
       from ms_lines l left join ms_regions r on r.id = l.region_id
      where l.status = 'approved' ${pageId ? "and l.page_id = $1" : ""}`, pageId ? [pageId] : []);
  return award(qb, rows.filter((r) => r.author_id).map((r) => lineAward(r.author_id, r.line_id, r.zone)));
}

export interface ProgressEntry { id: number; delta: number; reason: string; ref: string | null; created_at: string; label: string | null }
export interface Progress {
  points: number;
  by_reason: Record<AwardReason, { n: number; points: number }>;
  recent: ProgressEntry[];
  lines_checked: number;
  words_keyed: number;
}

/** A student's own progress (never anyone else's: there is no leaderboard). */
export async function myProgress(userId: string): Promise<Progress> {
  await tx((qb) => reconcileLinePoints(qb));
  const [rows, recent, lines, keyed] = await Promise.all([
    sql<{ reason: AwardReason; n: number; points: number }>(
      "select reason, count(*)::int as n, coalesce(sum(delta),0)::int as points from points_ledger where user_id = $1 and reason like 'ms\\_%' group by reason", [userId]),
    sql<ProgressEntry>(
      `select l.id::int as id, l.delta, l.reason, l.ref, l.created_at,
              coalesce(p.label, p2.label) as label
         from points_ledger l
         left join ms_lines ml on l.ref = 'line:' || ml.id
         left join ms_pages p on p.id = ml.page_id
         left join ms_hard_words h on l.ref = 'hw:' || h.id
         left join ms_pages p2 on p2.id = h.page_id
        where l.user_id = $1 and l.reason like 'ms\\_%' order by l.created_at desc, l.id desc limit 8`, [userId]),
    sql<{ n: number }>("select count(distinct v.line_id)::int as n from ms_line_versions v where v.author_id = $1 and v.kind = 'student'", [userId]),
    sql<{ n: number }>("select count(*)::int as n from ms_keyings where author_id = $1", [userId]),
  ]);
  const by = { ms_line_accepted: { n: 0, points: 0 }, ms_keying_accepted: { n: 0, points: 0 }, ms_suggestion_accepted: { n: 0, points: 0 } } as Progress["by_reason"];
  for (const r of rows) if (r.reason in by) by[r.reason] = { n: r.n, points: r.points };
  return {
    points: Object.values(by).reduce((s, x) => s + x.points, 0),
    by_reason: by,
    recent: recent.map((r) => ({ ...r, created_at: iso(r.created_at) })),
    lines_checked: lines[0]?.n ?? 0,
    words_keyed: keyed[0]?.n ?? 0,
  };
}
