import { createHash } from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import { CardContent } from "../../src/lib/cards/types";
import { serializeVersion, stableStringify, type VersionMeta } from "../../src/features/cards/version";
import { log } from "./util";

/**
 * Demo workflow states for the portal (B3). Never touches the published content cards from data/content.
 * Real verse keys and hadith ids only; every id below was checked against the seeded KFGQPC and hadith tables.
 * They use enabled concepts the reviewed content set does not cover yet, so no concept ever shows two cards.
 *   card:demo-fig          student draft (Sara) — Arabic explanation still missing
 *   card:demo-clouds       submitted by Omar, awaiting a researcher
 *   card:demo-ant          returned to Sara with a note (uses "scientific miracle" framing the lint flags)
 *   card:demo-pomegranate  approved by Dr. Huda, awaiting the institution's publication (+15 points to Omar)
 * Plus visitor requests (card_requests) for the demand board. Idempotent.
 */

const H = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();
const sha = (meta: VersionMeta, content: CardContent) => createHash("sha256").update(stableStringify(serializeVersion({ meta, content }))).digest("hex").slice(0, 16);

interface DemoCard {
  id: string;
  kind: "concept" | "answer";
  concept_id: string;
  author: string;
  createdH: number;
  status: "ai_draft" | "student_submitted" | "returned" | "researcher_approved";
  meta: VersionMeta;
  versions: { content: Partial<CardContent>; note: string; h: number }[];
  reviews: { decision: "submit" | "approve" | "return"; by: string; note?: string; h: number; from: string; to: string }[];
  points?: { user: string; delta: number };
}

const meta = (title_en: string, title_ar: string, concept_id: string): VersionMeta => ({ title_en, title_ar, level: "A", certainty: "established", concept_id, match_phrases: [] });

const CARDS: DemoCard[] = [
  {
    id: "card:demo-fig",
    kind: "concept",
    concept_id: "fig",
    author: "u_sara",
    createdH: 20,
    status: "ai_draft",
    meta: meta("The Fig", "التين", "fig"),
    versions: [
      {
        h: 20,
        note: "Created",
        content: { verses: [{ key: "95:1", role: "primary" }, { key: "95:2", role: "supporting" }, { key: "95:3", role: "supporting" }] },
      },
      {
        h: 3,
        note: "Draft explanation",
        content: {
          verses: [{ key: "95:1", role: "primary" }, { key: "95:2", role: "supporting" }, { key: "95:3", role: "supporting" }],
          explanation: {
            en: "Surat at-Tin opens with an oath: “By the fig and the olive” (95:1), followed by Mount Sinai (95:2) and “this secure city”, Makkah (95:3). In the Quran an oath draws attention to what is sworn by, so an everyday fruit is set beside places where revelation came.",
            ar: "",
          },
        },
      },
    ],
    reviews: [],
  },
  {
    id: "card:demo-clouds",
    kind: "concept",
    concept_id: "clouds",
    author: "u_omar",
    createdH: 50,
    status: "student_submitted",
    meta: meta("The Clouds", "السحاب", "clouds"),
    versions: [
      {
        h: 30,
        note: "Ready for review",
        content: {
          verses: [{ key: "24:43", role: "primary" }, { key: "30:48", role: "supporting" }],
          hadith: [{ id: "bukhari:3206" }],
          explanation: {
            en: "The Quran asks the reader to notice how Allah drives the clouds, gathers them into a mass and brings rain out from within them (24:43). It describes the winds that stir the clouds and spread them across the sky until rain falls, and people rejoice when it reaches them (30:48). Aisha reported that when the Prophet ﷺ saw a cloud, concern showed on his face until it rained (al-Bukhari 3206).",
            ar: "يدعو القرآن القارئ إلى التأمل في أن الله يزجي السحاب ثم يؤلّف بينه ثم يجعله ركامًا فيخرج المطر من خلاله (النور ٤٣). ويصف الرياح التي تثير السحاب وتبسطه في السماء حتى ينزل المطر، فيستبشر به الناس (الروم ٤٨). وذكرت عائشة رضي الله عنها أن النبي ﷺ كان إذا رأى سحابًا عُرف ذلك في وجهه حتى يمطر (البخاري ٣٢٠٦).",
          },
          show_count: true,
        },
      },
    ],
    reviews: [{ decision: "submit", by: "u_omar", note: "Ready for review.", h: 26, from: "ai_draft", to: "student_submitted" }],
  },
  {
    id: "card:demo-ant",
    kind: "concept",
    concept_id: "ant",
    author: "u_sara",
    createdH: 72,
    status: "returned",
    meta: meta("The Ant", "النملة", "ant"),
    versions: [
      {
        h: 70,
        note: "Created",
        content: { verses: [{ key: "27:18", role: "primary" }, { key: "27:19", role: "supporting" }] },
      },
      {
        h: 48,
        note: "Explanation",
        content: {
          verses: [{ key: "27:18", role: "primary" }, { key: "27:19", role: "supporting" }],
          explanation: {
            en: "In Surat an-Naml, an ant warns the other ants to enter their dwellings so that Solomon and his soldiers do not crush them unknowingly (27:18). Solomon smiles at her words and asks Allah to help him be grateful (27:19). Modern science confirms that this verse foresaw how ants communicate.",
            ar: "",
          },
        },
      },
    ],
    reviews: [
      { decision: "submit", by: "u_sara", h: 46, from: "ai_draft", to: "student_submitted" },
      {
        decision: "return",
        by: "u_huda",
        h: 20,
        from: "student_submitted",
        to: "returned",
        note: "Please remove the “modern science confirms” sentence: we don't use scientific-miracle framing, and the passage is about Solomon's gratitude, not about biology. Then add the Arabic explanation.",
      },
    ],
  },
  {
    id: "card:demo-pomegranate",
    kind: "concept",
    concept_id: "pomegranate",
    author: "u_omar",
    createdH: 96,
    status: "researcher_approved",
    meta: meta("The Pomegranate", "الرمان", "pomegranate"),
    versions: [
      {
        h: 90,
        note: "Created",
        content: { verses: [{ key: "6:99", role: "primary" }] },
      },
      {
        h: 60,
        note: "Added supporting verses",
        content: {
          verses: [{ key: "6:99", role: "primary" }, { key: "6:141", role: "supporting" }, { key: "55:68", role: "supporting" }],
          explanation: {
            en: "The Quran names the pomegranate among the fruits that rain brings out, “similar yet varied”, and invites people to look at the fruit as it ripens, for in that are signs (6:99). It mentions pomegranates again among the gardens Allah causes to grow, with the instruction to give their due on harvest day (6:141), and among the fruits of Paradise (55:68).",
            ar: "يذكر القرآن الرمان من الثمار التي يخرجها الله بالمطر «مشتبهًا وغير متشابه»، ويدعو إلى النظر إلى ثمره إذا أثمر وينعه، فإن في ذلك آيات (الأنعام ٩٩). ويذكره مرة أخرى في الجنات التي أنشأها الله مع الأمر بإيتاء حقه يوم حصاده (الأنعام ١٤١)، ومن فاكهة الجنة (الرحمن ٦٨).",
          },
          show_count: true,
          related_cards: [],
        },
      },
    ],
    reviews: [
      { decision: "submit", by: "u_omar", h: 50, from: "ai_draft", to: "student_submitted" },
      { decision: "approve", by: "u_huda", note: "Checked the verse keys. Ready for the institution.", h: 8, from: "student_submitted", to: "researcher_approved" },
    ],
    points: { user: "u_omar", delta: 15 },
  },
];

// visitor requests for the demand board: [concept_id | null, topic | null, count, status, hoursAgo of the latest]
const REQUESTS: [string | null, string | null, number, "open" | "fulfilled", number][] = [
  ["horse", null, 5, "open", 2],
  ["pomegranate", null, 4, "open", 5],
  ["ant", null, 3, "open", 26],
  ["fig", null, 2, "open", 30],
  ["grapes", null, 1, "open", 70],
  [null, "Why is the Quran in Arabic?", 2, "open", 9],
  ["moon", null, 3, "fulfilled", 120],
];

export async function seed(q: Queryable) {
  const users = new Set((await q.query<{ id: string }>("select id from users")).rows.map((r) => r.id));
  const concepts = new Set((await q.query<{ id: string }>("select id from concepts")).rows.map((r) => r.id));
  const verses = new Set((await q.query<{ key: string }>("select key from quran_ayah")).rows.map((r) => r.key));
  const hadithIds = new Set(
    (await q.query<{ id: string }>("select id from hadith where id = any($1::text[])", [CARDS.flatMap((c) => c.versions.flatMap((v) => (v.content.hadith ?? []).map((h) => h.id)))])).rows.map((r) => r.id),
  );

  let n = 0;
  for (const c of CARDS) {
    if (!users.has(c.author) || !concepts.has(c.concept_id)) continue;
    if ((await q.query("select 1 from cards where id = $1", [c.id])).rows.length) continue;
    // fail loudly if a reference ever stops existing (never seed fabricated references)
    for (const v of c.versions) {
      for (const r of v.content.verses ?? []) if (!verses.has(r.key)) throw new Error(`${c.id}: unknown verse ${r.key}`);
      for (const h of v.content.hadith ?? []) if (!hadithIds.has(h.id)) throw new Error(`${c.id}: unknown hadith ${h.id}`);
    }
    const last = c.versions.length;
    await q.query(
      `insert into cards (id, kind, concept_id, level, certainty, title_en, title_ar, match_phrases, status, current_version, institution_id, created_by, assigned_to, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'inst_uni',$11,$11,$12,$13)`,
      [c.id, c.kind, c.concept_id, c.meta.level, c.meta.certainty, c.meta.title_en, c.meta.title_ar, c.meta.match_phrases, c.status, last, c.author, ago(c.createdH), ago(Math.min(...[...c.versions.map((v) => v.h), ...c.reviews.map((r) => r.h)]))],
    );
    for (const [i, v] of c.versions.entries()) {
      const content = CardContent.parse(v.content);
      await q.query("insert into card_versions (card_id, version, content, content_sha, author_id, note, created_at) values ($1,$2,$3,$4,$5,$6,$7)", [
        c.id, i + 1, JSON.stringify(serializeVersion({ meta: c.meta, content })), sha(c.meta, content), c.author, v.note, ago(v.h),
      ]);
    }
    await q.query("insert into audit_log (actor_id, action, entity_type, entity_id, before, after, created_at) values ($1,'card.create','card',$2,null,$3,$4)", [
      c.author, c.id, JSON.stringify({ kind: c.kind, concept_id: c.concept_id }), ago(c.createdH),
    ]);
    for (const r of c.reviews) {
      if (!users.has(r.by)) continue;
      await q.query(
        "insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note, created_at) values ('card',$1,$2,$3,$4,$5,$6,$7,$8)",
        [c.id, last, r.by, r.from, r.to, r.decision, r.note ?? null, ago(r.h)],
      );
      await q.query("insert into audit_log (actor_id, action, entity_type, entity_id, before, after, created_at) values ($1,$2,'card',$3,$4,$5,$6)", [
        r.by, `card.${r.decision}`, c.id, JSON.stringify({ status: r.from }), JSON.stringify({ status: r.to, version: last, note: r.note ?? null }), ago(r.h),
      ]);
    }
    if (c.points && users.has(c.points.user)) {
      const ref = `${c.id}@v${last}`;
      const has = (await q.query("select 1 from points_ledger where user_id = $1 and reason = 'card_approved' and ref = $2", [c.points.user, ref])).rows.length;
      if (!has) {
        await q.query("insert into points_ledger (user_id, delta, reason, ref, created_at) values ($1,$2,'card_approved',$3,$4)", [c.points.user, c.points.delta, ref, ago(8)]);
        await q.query("update users set points = points + $2 where id = $1", [c.points.user, c.points.delta]);
      }
    }
    n++;
  }
  log(`${n} demo workflow cards`);

  // Learning points for approved student submissions of seeded content (same rule as the live workflow: +15 per approval).
  const approved = (
    await q.query<{ card_id: string; version: number | null; submitter: string; at: string }>(
      `select a.entity_id as card_id, a.version, s.reviewer_id as submitter, a.created_at as at
         from reviews a
         join lateral (select reviewer_id from reviews s where s.entity_type = 'card' and s.entity_id = a.entity_id and s.decision = 'submit' and s.created_at <= a.created_at order by s.created_at desc limit 1) s on true
         join users u on u.id = s.reviewer_id and u.role = 'student'
        where a.entity_type = 'card' and a.decision = 'approve'`,
    )
  ).rows;
  let p = 0;
  for (const a of approved) {
    const ref = `${a.card_id}@v${a.version ?? 1}`;
    if ((await q.query("select 1 from points_ledger where user_id = $1 and reason = 'card_approved' and ref = $2", [a.submitter, ref])).rows.length) continue;
    await q.query("insert into points_ledger (user_id, delta, reason, ref, created_at) values ($1,15,'card_approved',$2,$3)", [a.submitter, ref, a.at]);
    await q.query("update users set points = points + 15 where id = $1", [a.submitter]);
    p++;
  }
  if (p) log(`${p} learning-point awards backfilled`);

  let r = 0;
  const moonCard = (await q.query<{ id: string }>("select id from cards where id = 'card:moon' and status = 'published'")).rows[0]?.id ?? null;
  for (const [ci, [concept, topic, count, status, h]] of REQUESTS.entries()) {
    if (concept && !concepts.has(concept)) continue;
    const fulfilled = status === "fulfilled" ? (concept === "moon" ? moonCard : null) : null;
    for (let i = 0; i < count; i++) {
      const id = `req_demo_${ci}_${i}`;
      const res = await q.query(
        `insert into card_requests (id, concept_id, topic, device_hash, status, fulfilled_card_id, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing returning id`,
        [id, concept, topic, createHash("sha256").update(`seed-demo-visitor-${ci}-${i}`).digest("hex"), fulfilled ? "fulfilled" : "open", fulfilled, ago(h + i * 19)],
      );
      r += res.rows.length;
    }
  }
  log(`${r} visitor requests`);
}
