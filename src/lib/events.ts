import { sql, type Queryable } from "@/lib/db";

export interface AppEvent {
  id: number;
  scope: string;
  type: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

/** Emit a realtime event. Pass the transaction handle when inside tx() so the event commits atomically. */
export async function emit(
  scope: string,
  type: string,
  payload: Record<string, unknown> = {},
  actorId: string | null = null,
  qb?: Queryable,
) {
  const text = "insert into events(scope, type, payload, actor_id) values ($1,$2,$3,$4)";
  const params = [scope, type, JSON.stringify(payload), actorId];
  if (qb) await qb.query(text, params);
  else await sql(text, params);
}

export async function eventsAfter(scopes: string[], afterId: number, limit = 200): Promise<AppEvent[]> {
  if (!scopes.length) return [];
  return sql<AppEvent>(
    `select id::int as id, scope, type, payload, actor_id, created_at from events
      where id > $1 and scope = any($2::text[]) order by id asc limit $3`,
    [afterId, scopes, limit],
  );
}

export async function latestEventId(): Promise<number> {
  const rows = await sql<{ id: number }>("select coalesce(max(id),0)::int as id from events");
  return rows[0]?.id ?? 0;
}

export async function audit(
  qb: Queryable,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await qb.query(
    "insert into audit_log(actor_id, action, entity_type, entity_id, before, after) values ($1,$2,$3,$4,$5,$6)",
    [actorId, action, entityType, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  );
}
