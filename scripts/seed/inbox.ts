import { createHash } from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import { log } from "./util";

/**
 * Demo conversations for the specialist inbox (B3): one visitor waiting, one closed exchange. Idempotent.
 * Visitors are anonymous: only a hash stands in for their device.
 */
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const hash = (s: string) => createHash("sha256").update(`say-device:${s}`).digest("hex");

export async function seed(q: Queryable) {
  const moon = (await q.query<{ id: string; title_en: string; title_ar: string }>("select id, title_en, title_ar from cards where id = 'card:moon' and status = 'published'")).rows[0];
  const yusuf = (await q.query("select 1 from users where id = 'u_yusuf'")).rows.length > 0;
  let n = 0;

  const waitingQ = "Hello — I was reading the card about the moon. Do Muslims believe the moon itself has any power? A friend told me it is worshipped.";
  const ins = await q.query(
    `insert into threads (id, device_hash, topic, lang, status, consent, context, created_at, last_message_at)
     values ('thr_demo_waiting', $1, $2, 'en', 'open', $3, $4, $5, $5) on conflict (id) do nothing returning id`,
    [
      hash("seed-demo-visitor-waiting"),
      moon?.title_en ?? null,
      JSON.stringify({ question: true, card: !!moon, lang: true }),
      JSON.stringify({ question: waitingQ, ...(moon ? { card_id: moon.id, card_title_en: moon.title_en, card_title_ar: moon.title_ar } : {}) }),
      ago(25),
    ],
  );
  if (ins.rows.length) {
    await q.query("insert into messages (id, thread_id, sender, body, created_at) values ('msg_demo_w1','thr_demo_waiting','visitor',$1,$2) on conflict do nothing", [waitingQ, ago(25)]);
    await q.query("insert into audit_log (actor_id, action, entity_type, entity_id, after, created_at) values (null,'thread.start','thread','thr_demo_waiting',$1,$2)", [JSON.stringify({ lang: "en" }), ago(25)]);
    n++;
  }

  if (yusuf) {
    const ins2 = await q.query(
      `insert into threads (id, device_hash, lang, status, consent, context, assigned_to, created_at, last_message_at, closed_at, closed_by)
       values ('thr_demo_closed', $1, 'ar', 'closed', $2, '{}', 'u_yusuf', $3, $4, $4, 'visitor') on conflict (id) do nothing returning id`,
      [hash("seed-demo-visitor-closed"), JSON.stringify({ question: false, card: false, lang: true }), ago(60 * 26), ago(60 * 25)],
    );
    if (ins2.rows.length) {
      const msgs: [string, string, string | null, string, number][] = [
        ["msg_demo_c1", "visitor", null, "السلام عليكم، ما معنى كلمة «التوحيد»؟", 60 * 26],
        ["msg_demo_c2", "specialist", "u_yusuf", "وعليكم السلام ورحمة الله. التوحيد هو إفراد الله بالعبادة، والإيمان بأنه وحده الخالق المدبّر، ووصفه بما وصف به نفسه. هذه بطاقة معتمدة قد تفيدك: /card/answer%3Akaaba", 60 * 25.6],
        ["msg_demo_c3", "visitor", null, "شكرًا جزيلًا، هذا واضح.", 60 * 25.2],
        ["msg_demo_c4", "system", null, "closed_by_visitor", 60 * 25],
      ];
      for (const [id, sender, author, body, m] of msgs)
        await q.query("insert into messages (id, thread_id, sender, author_id, body, created_at, read_at) values ($1,'thr_demo_closed',$2,$3,$4,$5,$5) on conflict do nothing", [id, sender, author, body, ago(m)]);
      n++;
    }
  }
  log(`${n} demo conversations`);
}
