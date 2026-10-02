import { createHash } from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import { CardContent } from "../../src/lib/cards/types";
import { serializeVersion, stableStringify, type VersionMeta } from "../../src/features/cards/version";
import { log } from "./util";

/**
 * Demo workflow states for the portal (B3). Never touches the published content cards from data/content.
 * Real verse keys and hadith ids only; every id below was checked against the seeded KFGQPC and hadith tables.
 *   card:demo-stars       student draft (Sara) — Arabic explanation still missing
 *   card:demo-rain        submitted by Omar, awaiting a researcher
 *   card:demo-honey       returned to Sara with a note (uses "scientific miracle" framing the lint flags)
 *   card:demo-date-palm   approved by Dr. Huda, awaiting the institution's publication (+15 points to Omar)
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
    id: "card:demo-stars",
    kind: "concept",
    concept_id: "stars",
    author: "u_sara",
    createdH: 20,
    status: "ai_draft",
    meta: meta("The Stars", "النجوم", "stars"),
    versions: [
      {
        h: 20,
        note: "Created",
        content: { verses: [{ key: "6:97", role: "primary" }, { key: "16:16", role: "supporting" }] },
      },
      {
        h: 3,
        note: "Draft explanation",
        content: {
          verses: [{ key: "6:97", role: "primary" }, { key: "16:16", role: "supporting" }],
          explanation: {
            en: "The Quran presents the stars as a sign and a gift for travellers: Allah placed them so that people can find their way through the darkness of land and sea (6:97), and by the stars they are guided (16:16).",
            ar: "",
          },
        },
      },
    ],
    reviews: [],
  },
  {
    id: "card:demo-rain",
    kind: "concept",
    concept_id: "rain_water",
    author: "u_omar",
    createdH: 50,
    status: "student_submitted",
    meta: meta("Rain from the sky", "المطر النازل من السماء", "rain_water"),
    versions: [
      {
        h: 30,
        note: "Ready for review",
        content: {
          verses: [{ key: "50:9", role: "primary" }, { key: "30:48", role: "supporting" }],
          hadith: [{ id: "bukhari:1032" }],
          explanation: {
            en: "The Quran describes rain as a blessing sent down from the sky that brings gardens and harvests to life (50:9). It describes Allah sending the winds that stir the clouds and spread them across the sky until rain falls, and people rejoice when it reaches them (30:48). When the Prophet ﷺ saw rain, he would pray for it to be a beneficial rain (al-Bukhari 1032).",
            ar: "يصف القرآن المطر بأنه ماء مبارك ينزل من السماء فتنبت به الجنات وحبّ الحصيد (ق ٩). ويذكر أن الله يرسل الرياح فتثير السحاب ويبسطه في السماء كيف يشاء، فينزل المطر ويستبشر به الناس (الروم ٤٨). وكان النبي ﷺ إذا رأى المطر دعا أن يكون صيّبًا نافعًا (البخاري ١٠٣٢).",
          },
          show_count: true,
        },
      },
    ],
    reviews: [{ decision: "submit", by: "u_omar", note: "Ready for review.", h: 26, from: "ai_draft", to: "student_submitted" }],
  },
  {
    id: "card:demo-honey",
    kind: "concept",
    concept_id: "honey_bee",
    author: "u_sara",
    createdH: 72,
    status: "returned",
    meta: meta("The Bee and Honey", "النحل والعسل", "honey_bee"),
    versions: [
      {
        h: 70,
        note: "Created",
        content: { verses: [{ key: "16:68", role: "primary" }, { key: "16:69", role: "supporting" }] },
      },
      {
        h: 48,
        note: "Explanation and hadith",
        content: {
          verses: [{ key: "16:68", role: "primary" }, { key: "16:69", role: "supporting" }],
          hadith: [{ id: "bukhari:5684" }],
          explanation: {
            en: "The Quran says Allah inspired the bee to make its homes in the mountains, in the trees and in what people build (16:68), and that from its belly comes a drink of varying colours in which there is healing for people (16:69). Modern science confirms that honey heals every illness.",
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
        note: "Please remove the “modern science confirms” sentence: we don't use scientific-miracle framing, and 16:69 speaks of “healing”, not of healing every illness. Then add the Arabic explanation.",
      },
    ],
  },
  {
    id: "card:demo-date-palm",
    kind: "concept",
    concept_id: "date_palm",
    author: "u_omar",
    createdH: 96,
    status: "researcher_approved",
    meta: meta("The Date Palm", "النخلة", "date_palm"),
    versions: [
      {
        h: 90,
        note: "Created",
        content: { verses: [{ key: "6:99", role: "primary" }] },
      },
      {
        h: 60,
        note: "Added supporting verses and hadith",
        content: {
          verses: [{ key: "6:99", role: "primary" }, { key: "55:11", role: "supporting" }, { key: "80:29", role: "supporting" }],
          hadith: [{ id: "bukhari:61" }],
          explanation: {
            en: "The Quran mentions the date palm among the signs of Allah's care: rain brings out gardens, grain, and palm trees with clusters of dates hanging low (6:99). Palm trees bearing sheathed fruit are named among His gifts (55:11), alongside the olive (80:29). The Prophet ﷺ compared a Muslim to the date palm, a tree whose leaves do not fall (al-Bukhari 61).",
            ar: "يذكر القرآن النخل في سياق آيات الله ونعمه: فبالمطر تخرج الجنات والحبّ، ومن النخل قنوان دانية (الأنعام ٩٩)، والنخل ذات الأكمام من نعمه (الرحمن ١١)، ومعه الزيتون (عبس ٢٩). وشبّه النبي ﷺ المسلمَ بالنخلة، شجرةٍ لا يسقط ورقها (البخاري ٦١).",
          },
          show_count: true,
          related_cards: [],
        },
      },
    ],
    reviews: [
      { decision: "submit", by: "u_omar", h: 50, from: "ai_draft", to: "student_submitted" },
      { decision: "approve", by: "u_huda", note: "Checked the verse keys and the hadith number. Ready for the institution.", h: 8, from: "student_submitted", to: "researcher_approved" },
    ],
    points: { user: "u_omar", delta: 15 },
  },
];

// visitor requests for the demand board: [concept_id | null, topic | null, count, status, hoursAgo of the latest]
const REQUESTS: [string | null, string | null, number, "open" | "fulfilled", number][] = [
  ["mountain", null, 5, "open", 2],
  ["date_palm", null, 4, "open", 5],
  ["honey_bee", null, 3, "open", 26],
  ["stars", null, 2, "open", 30],
  ["sea", null, 1, "open", 70],
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
