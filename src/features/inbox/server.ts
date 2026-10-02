import "server-only";
import { createHash } from "node:crypto";
import { one, q, sql, tx } from "@/lib/db";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import type { SessionUser } from "@/lib/auth";
import { buildThreadContext, waitingSince, type Consent, type ThreadContext } from "./logic";
import { plain } from "@/features/portal/plain";

export interface ThreadRow {
  id: string;
  status: "open" | "closed";
  lang: string;
  consent: Partial<Consent>;
  context: ThreadContext;
  assigned_to: string | null;
  created_at: string;
  last_message_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  sender: "visitor" | "specialist" | "system";
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface InboxThread extends ThreadRow {
  unread: number;
  waiting_since: string | null;
  last_body: string | null;
  last_sender: string | null;
  assignee_en: string | null;
  assignee_ar: string | null;
  message_count: number;
}

export const STAFF_ROLES = ["specialist", "researcher"] as const;

/** Only the sha256 of the visitor's random device token is ever stored. */
export const hashToken = (token: string) => createHash("sha256").update(`say-device:${token}`).digest("hex");

export function validToken(token: string | null | undefined): token is string {
  return !!token && /^[A-Za-z0-9_-]{24,128}$/.test(token);
}

function msgId(clientId?: string | null) {
  return clientId && /^[a-z0-9]{8,32}$/.test(clientId) ? `msg_${clientId}` : newId("msg");
}

const THREAD_COLS = "id, status, lang, consent, context, assigned_to, created_at, last_message_at, closed_at, closed_by";

/* ───────────────────────────── visitor side */

export async function startThread(input: {
  token: string;
  consent: Consent;
  question?: string | null;
  card_id?: string | null;
  lang: "en" | "ar";
}) {
  const hash = hashToken(input.token);
  // one open conversation per device: starting again resumes it
  const existing = await one<ThreadRow>(`select ${THREAD_COLS} from threads where device_hash = $1 and status = 'open' order by last_message_at desc limit 1`, [hash]);
  if (existing) return { thread: plain({ ...existing, assigned_to: null }), resumed: true };

  const card = input.card_id
    ? await one<{ id: string; title_en: string; title_ar: string }>("select id, title_en, title_ar from cards where id = $1 and status = 'published'", [input.card_id])
    : null;
  const { context, lang } = buildThreadContext(input.consent, { question: input.question, card, lang: input.lang });
  const id = newId("thr");
  const thread = await tx(async (qb) => {
    await qb.query("insert into threads (id, device_hash, topic, lang, status, consent, context) values ($1,$2,$3,$4,'open',$5,$6)", [
      id,
      hash,
      context.card_title_en ?? null,
      lang,
      JSON.stringify(input.consent),
      JSON.stringify(context),
    ]);
    if (context.question)
      await qb.query("insert into messages (id, thread_id, sender, body) values ($1,$2,'visitor',$3)", [newId("msg"), id, context.question]);
    await audit(qb, null, "thread.start", "thread", id, null, { consent: input.consent, lang });
    await emit("inbox", "thread_started", { thread_id: id, lang, consent: input.consent }, null, qb);
    return (await q<ThreadRow>(qb, `select ${THREAD_COLS} from threads where id = $1`, [id]))[0];
  });
  return { thread: plain(thread), resumed: false };
}

async function visitorThread(id: string, token: string) {
  const t = await one<ThreadRow & { device_hash: string }>(`select ${THREAD_COLS}, device_hash from threads where id = $1`, [id]);
  if (!t || t.device_hash !== hashToken(token)) throw new HttpError(404, "not_found", "We couldn't find this conversation on this device.");
  const { device_hash: _omit, ...thread } = t;
  return thread;
}

export async function messagesOf(threadId: string) {
  return plain(await sql<MessageRow>("select id, thread_id, sender, body, created_at, read_at from messages where thread_id = $1 order by created_at asc, id asc", [threadId]));
}

export async function getVisitorThread(id: string, token: string) {
  const thread = await visitorThread(id, token);
  const messages = await messagesOf(id);
  // the visitor never sees staff ids or names, only that a person replied
  return { thread: plain({ ...thread, assigned_to: null }), messages };
}

export async function postVisitorMessage(id: string, token: string, text: string, clientId?: string | null) {
  const thread = await visitorThread(id, token);
  if (thread.status !== "open") throw new HttpError(409, "closed", "This conversation has ended. You can start a new one.");
  const recent = await one<{ n: number }>("select count(*)::int as n from messages where thread_id = $1 and sender = 'visitor' and created_at > now() - interval '5 minutes'", [id]);
  if ((recent?.n ?? 0) >= 20) throw new HttpError(429, "slow_down", "Please wait a moment before sending more messages.");
  const mid = msgId(clientId);
  await tx(async (qb) => {
    const ins = await q(qb, "insert into messages (id, thread_id, sender, body) values ($1,$2,'visitor',$3) on conflict (id) do nothing returning id", [mid, id, text]);
    if (!ins.length) return; // a retried send that already arrived
    await qb.query("update threads set last_message_at = now() where id = $1", [id]);
    await emit(`thread:${id}`, "message", { message_id: mid, sender: "visitor" }, null, qb);
    await emit("inbox", "message", { thread_id: id, sender: "visitor" }, null, qb);
  });
  return { id: mid };
}

export async function closeByVisitor(id: string, token: string) {
  const thread = await visitorThread(id, token);
  if (thread.status === "closed") return { status: "closed" as const };
  await closeThread(id, "visitor", null);
  return { status: "closed" as const };
}

async function closeThread(id: string, by: string, actorId: string | null) {
  await tx(async (qb) => {
    await qb.query("update threads set status = 'closed', closed_at = now(), closed_by = $2 where id = $1", [id, by]);
    await qb.query("insert into messages (id, thread_id, sender, body) values ($1,$2,'system',$3)", [newId("msg"), id, by === "visitor" ? "closed_by_visitor" : "closed_by_specialist"]);
    await audit(qb, actorId, "thread.close", "thread", id, { status: "open" }, { status: "closed", by: by === "visitor" ? "visitor" : "specialist" });
    await emit(`thread:${id}`, "closed", { by: by === "visitor" ? "visitor" : "specialist" }, actorId, qb);
    await emit("inbox", "closed", { thread_id: id }, actorId, qb);
  });
}

/* ───────────────────────────── specialist side */

export async function listInbox(status: "open" | "closed" = "open"): Promise<InboxThread[]> {
  const rows = await sql<Omit<InboxThread, "waiting_since">>(
    `select t.id, t.status, t.lang, t.consent, t.context, t.assigned_to, t.created_at, t.last_message_at, t.closed_at, t.closed_by,
            (select count(*)::int from messages m where m.thread_id = t.id and m.sender = 'visitor' and m.read_at is null) as unread,
            (select count(*)::int from messages m where m.thread_id = t.id and m.sender <> 'system') as message_count,
            lm.body as last_body, lm.sender as last_sender,
            u.display_name_en as assignee_en, u.display_name_ar as assignee_ar
       from threads t
       left join lateral (select body, sender from messages m where m.thread_id = t.id and m.sender <> 'system' order by created_at desc, id desc limit 1) lm on true
       left join users u on u.id = t.assigned_to
      where t.status = $1
      order by t.last_message_at desc limit 200`,
    [status],
  );
  if (!rows.length) return [];
  const msgs = plain(await sql<{ thread_id: string; sender: "visitor" | "specialist" | "system"; created_at: string }>(
    "select thread_id, sender, created_at from messages where thread_id = any($1::text[]) order by created_at asc, id asc",
    [rows.map((r) => r.id)],
  ));
  const by = new Map<string, typeof msgs>();
  for (const m of msgs) by.set(m.thread_id, [...(by.get(m.thread_id) ?? []), m]);
  const out = plain(rows).map((r) => ({ ...r, waiting_since: r.status === "open" ? waitingSince(by.get(r.id) ?? []) : null }));
  // waiting visitors first (longest wait on top), then the rest by recency
  return out.sort((a, b) => {
    if (!!a.waiting_since !== !!b.waiting_since) return a.waiting_since ? -1 : 1;
    if (a.waiting_since && b.waiting_since) return a.waiting_since.localeCompare(b.waiting_since);
    return b.last_message_at.localeCompare(a.last_message_at);
  });
}

export async function getStaffThread(id: string) {
  const thread = await one<ThreadRow>(`select ${THREAD_COLS} from threads where id = $1`, [id]);
  if (!thread) throw new HttpError(404, "not_found", "This conversation doesn't exist.");
  const [messages, assignee] = await Promise.all([
    messagesOf(id),
    thread.assigned_to ? one<{ display_name_en: string; display_name_ar: string }>("select display_name_en, display_name_ar from users where id = $1", [thread.assigned_to]) : null,
  ]);
  return { thread: plain(thread), messages, assignee };
}

export async function postStaffMessage(user: SessionUser, id: string, text: string, clientId?: string | null) {
  const thread = await one<ThreadRow>(`select ${THREAD_COLS} from threads where id = $1`, [id]);
  if (!thread) throw new HttpError(404, "not_found", "This conversation doesn't exist.");
  if (thread.status !== "open") throw new HttpError(409, "closed", "This conversation is closed.");
  const mid = msgId(clientId);
  await tx(async (qb) => {
    const ins = await q(qb, "insert into messages (id, thread_id, sender, author_id, body) values ($1,$2,'specialist',$3,$4) on conflict (id) do nothing returning id", [mid, id, user.id, text]);
    if (!ins.length) return;
    await qb.query("update messages set read_at = now() where thread_id = $1 and sender = 'visitor' and read_at is null", [id]);
    await qb.query("update threads set last_message_at = now(), assigned_to = coalesce(assigned_to, $2) where id = $1", [id, user.id]);
    await audit(qb, user.id, "thread.reply", "thread", id, null, { message_id: mid });
    await emit(`thread:${id}`, "message", { message_id: mid, sender: "specialist" }, user.id, qb);
    await emit("inbox", "message", { thread_id: id, sender: "specialist", actor_en: user.display_name_en, actor_ar: user.display_name_ar }, user.id, qb);
  });
  return { id: mid };
}

export async function markRead(id: string) {
  await sql("update messages set read_at = now() where thread_id = $1 and sender = 'visitor' and read_at is null", [id]);
}

export async function closeByStaff(user: SessionUser, id: string) {
  const thread = await one<ThreadRow>(`select ${THREAD_COLS} from threads where id = $1`, [id]);
  if (!thread) throw new HttpError(404, "not_found", "This conversation doesn't exist.");
  if (thread.status === "closed") return { status: "closed" as const };
  await closeThread(id, user.id, user.id);
  return { status: "closed" as const };
}

export async function inboxCounts() {
  const rows = await listInbox("open");
  return { open: rows.length, waiting: rows.filter((r) => r.waiting_since).length, unread: rows.reduce((s, r) => s + r.unread, 0), oldestWaiting: rows.find((r) => r.waiting_since)?.waiting_since ?? null };
}
