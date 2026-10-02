import "server-only";
import { createHash } from "node:crypto";
import { one, q, sql, tx, type Queryable } from "@/lib/db";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";
import type { Decision, Status } from "@/lib/workflow";
import { CardContent } from "@/lib/cards/types";
import { getAyat, isVerseKey, quranIndex, matchText, type Ayah } from "@/lib/quran";
import { skeleton, hasArabic } from "@/lib/quran/normalize";
import { getHadith, searchHadith, COLLECTION_NAMES, type Hadith } from "@/lib/hadith";
import type { GlossaryTerm } from "@/lib/glossary";
import { newId } from "@/lib/ids";
import { lintCard, type LintWarning } from "./lint";
import { validateCard, checklistPasses, type CheckItem } from "./validate";
import { diffVersions, type VersionDoc } from "./diff";
import { effectiveStatus, isEditable, planTransition } from "./transition";
import { CardMetaSchema, parseVersion, serializeVersion, stableStringify, type VersionMeta } from "./version";
import { plain } from "@/features/portal/plain";

/* ───────────────────────────── types */

export interface CardRecord {
  id: string;
  kind: "concept" | "answer" | "item" | "art";
  concept_id: string | null;
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  title_en: string;
  title_ar: string;
  match_phrases: string[];
  status: Status;
  revision_status: Status | null;
  current_version: number;
  published_version: number | null;
  institution_id: string | null;
  created_by: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface CardListItem {
  id: string;
  kind: CardRecord["kind"];
  concept_id: string | null;
  concept_en: string | null;
  concept_ar: string | null;
  track: string | null;
  level: CardRecord["level"];
  title_en: string;
  title_ar: string;
  status: Status;
  stage: Status;
  current_version: number;
  published_version: number | null;
  updated_at: string;
  author_en: string | null;
  author_ar: string | null;
}

export interface VersionInfo {
  version: number;
  content_sha: string;
  note: string | null;
  created_at: string;
  author_id: string | null;
  author_en: string | null;
  author_ar: string | null;
}

export interface ReviewInfo {
  id: number;
  version: number | null;
  decision: Decision;
  from_status: Status | null;
  to_status: Status | null;
  note: string | null;
  created_at: string;
  reviewer_id: string | null;
  reviewer_en: string | null;
  reviewer_ar: string | null;
  reviewer_role: string | null;
  is_demo: boolean | null;
}

export interface CardDetail {
  card: CardRecord;
  stage: Status;
  doc: VersionDoc;
  versions: VersionInfo[];
  reviews: ReviewInfo[];
  institution: { id: string; name_en: string; name_ar: string; is_demo: boolean } | null;
  author: { id: string; name_en: string; name_ar: string } | null;
}

export type FilterInput = { stage?: string; kind?: string; track?: string; concept?: string; q?: string; mine?: boolean };

/* ───────────────────────────── helpers */

const STAGE_SQL = "(case when c.status = 'published' and c.revision_status is not null then c.revision_status else c.status end)";

export const shaOf = (doc: VersionDoc) => createHash("sha256").update(stableStringify(serializeVersion(doc))).digest("hex").slice(0, 16);

const metaOf = (c: CardRecord): VersionMeta => ({
  title_en: c.title_en,
  title_ar: c.title_ar,
  level: c.level,
  certainty: c.certainty,
  concept_id: c.concept_id,
  match_phrases: c.match_phrases ?? [],
});

/** Visibility: own institution (and institution-less cards); platform admins see everything. */
function scope(user: SessionUser, params: unknown[], alias = "c") {
  if (user.role === "platform_admin") return "true";
  params.push(user.institution_id);
  return `(${alias}.institution_id is null or ${alias}.institution_id = $${params.length})`;
}

export function canSeeCard(user: SessionUser, card: Pick<CardRecord, "institution_id" | "status">) {
  if (user.role === "platform_admin" || !card.institution_id || card.institution_id === user.institution_id) return true;
  return user.role === "specialist" && card.status === "published";
}

async function getCardRow(id: string, qb?: Queryable, lock = false): Promise<CardRecord | null> {
  const text = `select * from cards where id = $1${lock ? " for update" : ""}`;
  if (qb) return (await q<CardRecord>(qb, text, [id]))[0] ?? null;
  return one<CardRecord>(text, [id]);
}

async function versionDoc(card: CardRecord, version: number, qb?: Queryable): Promise<VersionDoc> {
  const text = "select content from card_versions where card_id = $1 and version = $2";
  const row = qb ? (await q<{ content: unknown }>(qb, text, [card.id, version]))[0] : await one<{ content: unknown }>(text, [card.id, version]);
  return parseVersion(row?.content ?? {}, metaOf(card));
}

/* ───────────────────────────── reads */

export async function listCards(user: SessionUser, f: FilterInput = {}) {
  const params: unknown[] = [];
  const where: string[] = [scope(user, params)];
  if (f.kind && ["concept", "answer", "item", "art"].includes(f.kind)) {
    params.push(f.kind);
    where.push(`c.kind = $${params.length}`);
  }
  if (f.track && ["nature", "art", "heritage"].includes(f.track)) {
    params.push(f.track);
    where.push(`k.track = $${params.length}`);
  }
  if (f.concept) {
    params.push(f.concept);
    where.push(`c.concept_id = $${params.length}`);
  }
  if (f.mine) {
    params.push(user.id);
    where.push(`c.created_by = $${params.length}`);
  }
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(c.id) like ${p} or lower(coalesce(v.content->'_meta'->>'title_en', c.title_en)) like ${p} or coalesce(v.content->'_meta'->>'title_ar', c.title_ar) like ${p} or lower(coalesce(k.label_en,'')) like ${p} or coalesce(k.label_ar,'') like ${p})`,
    );
  }
  const base = `from cards c
      left join card_versions v on v.card_id = c.id and v.version = c.current_version
      left join concepts k on k.id = c.concept_id
      left join users u on u.id = c.created_by
     where ${where.join(" and ")}`;
  const counts = await sql<{ stage: Status; n: number }>(`select ${STAGE_SQL} as stage, count(*)::int as n ${base} group by 1`, params);
  const stageParams = [...params];
  let stageWhere = "";
  if (f.stage && f.stage !== "all") {
    stageParams.push(f.stage);
    stageWhere = ` and ${STAGE_SQL} = $${stageParams.length}`;
  }
  const items = await sql<CardListItem>(
    `select c.id, c.kind, c.concept_id, k.label_en as concept_en, k.label_ar as concept_ar, k.track,
            coalesce(v.content->'_meta'->>'level', c.level) as level,
            coalesce(nullif(v.content->'_meta'->>'title_en',''), c.title_en) as title_en,
            coalesce(nullif(v.content->'_meta'->>'title_ar',''), c.title_ar) as title_ar,
            c.status, ${STAGE_SQL} as stage, c.current_version, c.published_version, c.updated_at,
            u.display_name_en as author_en, u.display_name_ar as author_ar
       ${base}${stageWhere}
      order by c.updated_at desc limit 300`,
    stageParams,
  );
  const byStage: Record<string, number> = {};
  let all = 0;
  for (const r of counts) {
    byStage[r.stage] = r.n;
    all += r.n;
  }
  return plain({ items, counts: { all, ...byStage } as Record<string, number> });
}

export async function getCardDetail(user: SessionUser, id: string): Promise<CardDetail> {
  const card = await getCardRow(id);
  if (!card || !canSeeCard(user, card)) throw new HttpError(404, "not_found", "We couldn't find this card.");
  const [doc, versions, reviews, institution, author] = await Promise.all([
    versionDoc(card, card.current_version),
    sql<VersionInfo>(
      `select v.version, v.content_sha, v.note, v.created_at, v.author_id, u.display_name_en as author_en, u.display_name_ar as author_ar
         from card_versions v left join users u on u.id = v.author_id where v.card_id = $1 order by v.version desc`,
      [id],
    ),
    sql<ReviewInfo>(
      `select r.id::int as id, r.version, r.decision, r.from_status, r.to_status, r.note, r.created_at, r.reviewer_id,
              u.display_name_en as reviewer_en, u.display_name_ar as reviewer_ar, u.role as reviewer_role, u.is_demo
         from reviews r left join users u on u.id = r.reviewer_id
        where r.entity_type = 'card' and r.entity_id = $1 order by r.created_at asc, r.id asc`,
      [id],
    ),
    card.institution_id ? one<CardDetail["institution"]>("select id, name_en, name_ar, is_demo from institutions where id = $1", [card.institution_id]) : null,
    card.created_by ? one<CardDetail["author"]>("select id, display_name_en as name_en, display_name_ar as name_ar from users where id = $1", [card.created_by]) : null,
  ]);
  return plain({ card, stage: effectiveStatus(card), doc, versions, reviews, institution, author });
}

export async function getVersionDoc(user: SessionUser, id: string, version: number) {
  const card = await getCardRow(id);
  if (!card || !canSeeCard(user, card)) throw new HttpError(404, "not_found", "We couldn't find this card.");
  const row = await one<{ content: unknown }>("select content from card_versions where card_id = $1 and version = $2", [id, version]);
  if (!row) throw new HttpError(404, "no_version", "That version doesn't exist.");
  return parseVersion(row.content, metaOf(card));
}

export async function diffCardVersions(user: SessionUser, id: string, a: number, b: number) {
  const [da, db] = await Promise.all([getVersionDoc(user, id, a), getVersionDoc(user, id, b)]);
  return diffVersions(da, db);
}

/* ───────────────────────────── evidence lookups (verse / hadith pickers, preview) */

export interface VerseHit {
  key: string;
  sura: number;
  aya: number;
  sura_name_en: string;
  sura_name_ar: string;
  text_uthmani: string;
  translation: string | null;
  edition: string | null;
  match?: "exact" | "near" | "contains" | "translation" | "key";
  similarity?: number;
}

const g = globalThis as unknown as { __verseSkeletons?: Map<string, string> };

async function verseSkeletons() {
  if (!g.__verseSkeletons) {
    const ix = await quranIndex();
    g.__verseSkeletons = new Map(ix.verses.map((v) => [v.key, skeleton(v.text_emlaey)]));
  }
  return g.__verseSkeletons;
}

const toHit = (a: Ayah, match: VerseHit["match"], similarity?: number): VerseHit => ({
  key: a.key,
  sura: a.sura,
  aya: a.aya,
  sura_name_en: a.sura_name_en,
  sura_name_ar: a.sura_name_ar,
  text_uthmani: a.text_uthmani,
  translation: a.translation?.text ?? null,
  edition: a.translation?.edition_name ?? null,
  match,
  similarity,
});

/** Parse "10:5", "10:5-7" or "10:5, 36:39" into verse keys (ranges capped at 20 verses). */
export function parseVerseQuery(input: string): string[] | null {
  const parts = input.split(/[,\s،]+/).filter(Boolean);
  if (!parts.length) return null;
  const keys: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?$/);
    if (!m) return null;
    const s = Number(m[1]), a = Number(m[2]), b = m[3] ? Number(m[3]) : a;
    for (let i = a; i <= Math.min(b, a + 19); i++) keys.push(`${s}:${i}`);
  }
  return [...new Set(keys)];
}

export async function searchVerses(query: string): Promise<{ mode: "key" | "arabic" | "english"; status?: string; hits: VerseHit[] }> {
  const text = query.trim().slice(0, 400);
  if (!text) return { mode: "english", hits: [] };
  const keys = parseVerseQuery(text);
  if (keys) return { mode: "key", hits: (await getAyat(keys)).map((a) => toHit(a, "key")) };

  if (hasArabic(text)) {
    const res = await matchText(text);
    let ordered: { key: string; match: VerseHit["match"]; sim?: number }[] = [];
    if (res.status === "exact") ordered = res.locations.flatMap((l) => l.verses.map((k) => ({ key: k, match: "exact" as const })));
    else if (res.status === "near") ordered = res.candidates.flatMap((c) => c.verses.map((k) => ({ key: k, match: "near" as const, sim: c.similarity })));
    if (!ordered.length) {
      const needle = skeleton(text);
      if (needle.replace(/ /g, "").length >= 2) {
        for (const [k, s] of await verseSkeletons()) {
          if (s.includes(needle)) ordered.push({ key: k, match: "contains" });
          if (ordered.length >= 25) break;
        }
      }
    }
    const uniq = [...new Map(ordered.map((o) => [o.key, o])).values()].slice(0, 25);
    const ayat = new Map((await getAyat(uniq.map((u) => u.key))).map((a) => [a.key, a]));
    return { mode: "arabic", status: res.status, hits: uniq.filter((u) => ayat.has(u.key)).map((u) => toHit(ayat.get(u.key)!, u.match, u.sim)) };
  }

  const words = text.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2).slice(0, 6);
  if (!words.length) return { mode: "english", hits: [] };
  const conds = words.map((_, i) => `lower(t.text) like $${i + 1}`).join(" and ");
  const rows = await sql<{ key: string }>(
    `select t.key from quran_translation t join quran_ayah a on a.key = t.key where t.edition_id = 'en.saheeh' and ${conds} order by a.sura, a.aya limit 25`,
    words.map((w) => `%${w}%`),
  );
  return { mode: "english", hits: (await getAyat(rows.map((r) => r.key))).map((a) => toHit(a, "translation")) };
}

export interface HadithHit extends Hadith {
  collection_en: string;
  collection_ar: string;
}

const toHadithHit = (h: Hadith): HadithHit => ({ ...h, collection_en: COLLECTION_NAMES[h.collection].en, collection_ar: COLLECTION_NAMES[h.collection].ar });

export async function lookupHadith(query: string): Promise<{ mode: "id" | "search"; hits: HadithHit[] }> {
  const text = query.trim().slice(0, 300);
  const m = text.toLowerCase().match(/^(bukhari|muslim|البخاري|مسلم)\s*[:# ]\s*([0-9٠-٩]+[a-z]?)$/);
  if (m) {
    const coll = m[1] === "البخاري" ? "bukhari" : m[1] === "مسلم" ? "muslim" : m[1];
    const num = m[2].replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    return { mode: "id", hits: (await getHadith([`${coll}:${num}`])).map(toHadithHit) };
  }
  return { mode: "search", hits: (await searchHadith(text, 12)).map(toHadithHit) };
}

export interface ResolvedDraft {
  verses: VerseHit[];
  hadith: HadithHit[];
  terms: GlossaryTerm[];
  count: { tokens: number; verses: number; rule: string; label_en: string; label_ar: string } | null;
  concept: { id: string; label_en: string; label_ar: string; track: string; image: string | null } | null;
  missing: { verses: string[]; hadith: string[] };
}

/** resolveCard()-like resolution of unsaved editor content, for the live preview and the checklist. */
export async function resolveDraft(input: { verses: string[]; hadith: string[]; glossary_terms: string[]; concept_id: string | null; show_count: boolean }): Promise<ResolvedDraft> {
  const vkeys = input.verses.filter(isVerseKey).slice(0, 60);
  const [ayat, hadith, terms, concept] = await Promise.all([
    getAyat(vkeys),
    getHadith(input.hadith.slice(0, 40)),
    input.glossary_terms.length ? sql<GlossaryTerm>("select * from glossary_terms where id = any($1::text[])", [input.glossary_terms]) : Promise.resolve([]),
    input.concept_id
      ? one<{ id: string; label_en: string; label_ar: string; track: string; image: string | null; count_tokens: number | null; count_verses: number | null; count_rule: string | null }>(
          "select id, label_en, label_ar, track, image, count_tokens, count_verses, count_rule from concepts where id = $1",
          [input.concept_id],
        )
      : Promise.resolve(null),
  ]);
  const found = new Set(ayat.map((a) => a.key));
  const foundH = new Set(hadith.map((h) => h.id));
  return {
    verses: ayat.map((a) => toHit(a, "key")),
    hadith: hadith.map(toHadithHit),
    terms,
    count:
      input.show_count && concept?.count_tokens
        ? { tokens: concept.count_tokens, verses: concept.count_verses ?? 0, rule: concept.count_rule ?? "qac-lemma-word-token@0.4", label_en: concept.label_en, label_ar: concept.label_ar }
        : null,
    concept: concept ? { id: concept.id, label_en: concept.label_en, label_ar: concept.label_ar, track: concept.track, image: concept.image } : null,
    missing: { verses: input.verses.filter((k) => !found.has(k)), hadith: input.hadith.filter((h) => !foundH.has(h)) },
  };
}

/* ───────────────────────────── checklist (server-side truth) */

export async function bannedRenderings(qb?: Queryable): Promise<{ term: string; rendering: string }[]> {
  const text = "select id, banned_renderings from glossary_terms where status = 'approved'";
  const rows = qb ? await q<{ id: string; banned_renderings: string[] }>(qb, text) : await sql<{ id: string; banned_renderings: string[] }>(text);
  return rows.flatMap((r) => (r.banned_renderings ?? []).map((b) => ({ term: r.id, rendering: b })));
}

export async function checklistFor(kind: CardRecord["kind"], doc: VersionDoc, lintAcknowledged: boolean, qb?: Queryable): Promise<{ items: CheckItem[]; lint: LintWarning[] }> {
  const vkeys = doc.content.verses.map((v) => v.key);
  const hids = doc.content.hadith.map((h) => h.id);
  const run = <T,>(text: string, params: unknown[]) => (qb ? q<T>(qb, text, params) : sql<T>(text, params));
  const [kv, kh, banned] = await Promise.all([
    vkeys.length ? run<{ key: string }>("select key from quran_ayah where key = any($1::text[])", [vkeys]) : Promise.resolve([]),
    hids.length ? run<{ id: string }>("select id from hadith where id = any($1::text[])", [hids]) : Promise.resolve([]),
    bannedRenderings(qb),
  ]);
  const lint = lintCard({
    level: doc.meta.level,
    certainty: doc.meta.certainty,
    hadithIds: hids,
    explanation: doc.content.explanation,
    civilizational_note: doc.content.civilizational_note,
    disagreement_note: doc.content.disagreement_note,
    bannedRenderings: banned,
  });
  const items = validateCard({
    meta: { ...doc.meta, kind },
    content: doc.content,
    knownVerseKeys: kv.map((r) => r.key),
    knownHadithIds: kh.map((r) => r.id),
    lint,
    lintAcknowledged,
  });
  return { items, lint };
}

/* ───────────────────────────── mutations */

const AUTHOR_ROLES = ["student", "researcher", "institution_admin", "platform_admin"] as const;

function slug(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

export async function createCard(
  user: SessionUser,
  input: { kind: "concept" | "answer"; concept_id: string | null; title_en: string; title_ar: string },
) {
  if (!(AUTHOR_ROLES as readonly string[]).includes(user.role)) throw new HttpError(403, "forbidden", "Your role can't create cards.");
  if (input.concept_id) {
    const c = await one("select 1 from concepts where id = $1", [input.concept_id]);
    if (!c) throw new HttpError(400, "bad_concept", "That concept doesn't exist.");
  }
  const prefix = input.kind === "answer" ? "answer" : "card";
  const base = slug(input.title_en) || input.concept_id || "untitled";
  const id = `${prefix}:${base}-${newId("x").slice(2, 7)}`;
  const meta: VersionMeta = CardMetaSchema.parse({ title_en: input.title_en, title_ar: input.title_ar, concept_id: input.concept_id });
  const doc: VersionDoc = { meta, content: CardContent.parse({}) };
  await tx(async (qb) => {
    await qb.query(
      `insert into cards (id, kind, concept_id, level, certainty, title_en, title_ar, match_phrases, status, current_version, institution_id, created_by, assigned_to)
       values ($1,$2,$3,'A','established',$4,$5,'{}','ai_draft',1,$6,$7,$7)`,
      [id, input.kind, input.concept_id, input.title_en, input.title_ar, user.institution_id, user.id],
    );
    await qb.query("insert into card_versions (card_id, version, content, content_sha, author_id, note) values ($1,1,$2,$3,$4,$5)", [
      id,
      JSON.stringify(serializeVersion(doc)),
      shaOf(doc),
      user.id,
      "Created",
    ]);
    await audit(qb, user.id, "card.create", "card", id, null, { kind: input.kind, concept_id: input.concept_id, title_en: input.title_en });
    await emit("cards", "created", { card_id: id, title_en: input.title_en, title_ar: input.title_ar, actor_en: user.display_name_en, actor_ar: user.display_name_ar }, user.id, qb);
  });
  return { id };
}

export async function saveCard(user: SessionUser, id: string, input: { base_version: number; meta: VersionMeta; content: CardContent; note?: string | null }) {
  if (!(AUTHOR_ROLES as readonly string[]).includes(user.role)) throw new HttpError(403, "forbidden", "Your role can't edit cards.");
  return tx(async (qb) => {
    const card = await getCardRow(id, qb, true);
    if (!card || !canSeeCard(user, card) || (card.institution_id && user.role !== "platform_admin" && card.institution_id !== user.institution_id))
      throw new HttpError(404, "not_found", "We couldn't find this card.");
    const stage = effectiveStatus(card);
    if (!isEditable(stage, user.role)) throw new HttpError(409, "locked", "This card is in review. It can be edited again after it is returned.", { stage });
    if (input.base_version !== card.current_version) {
      const theirs = await versionDoc(card, card.current_version, qb);
      const who = (await q<{ display_name_en: string; display_name_ar: string }>(qb, "select u.display_name_en, u.display_name_ar from card_versions v join users u on u.id = v.author_id where v.card_id = $1 and v.version = $2", [id, card.current_version]))[0];
      throw new HttpError(409, "conflict", "Someone saved a newer version while you were editing.", { current_version: card.current_version, doc: theirs, author: who ?? null });
    }
    if (input.meta.concept_id) {
      const c = (await q(qb, "select 1 from concepts where id = $1", [input.meta.concept_id]))[0];
      if (!c) throw new HttpError(400, "bad_concept", "That concept doesn't exist.");
    }
    const doc: VersionDoc = { meta: input.meta, content: input.content };
    const sha = shaOf(doc);
    const cur = (await q<{ content_sha: string }>(qb, "select content_sha from card_versions where card_id = $1 and version = $2", [id, card.current_version]))[0];
    if (cur?.content_sha === sha) return { version: card.current_version, sha, unchanged: true, stage };

    const version = card.current_version + 1;
    await qb.query("insert into card_versions (card_id, version, content, content_sha, author_id, note) values ($1,$2,$3,$4,$5,$6)", [
      id,
      version,
      JSON.stringify(serializeVersion(doc)),
      sha,
      user.id,
      input.note?.slice(0, 300) || null,
    ]);
    const startRevision = card.status === "published" && !card.revision_status;
    if (card.published_version == null) {
      // never published: the working meta is the card's meta
      await qb.query(
        `update cards set current_version = $2, updated_at = now(), title_en = $3, title_ar = $4, level = $5, certainty = $6, concept_id = $7, match_phrases = $8 where id = $1`,
        [id, version, doc.meta.title_en || card.title_en, doc.meta.title_ar || card.title_ar, doc.meta.level, doc.meta.certainty, doc.meta.concept_id, doc.meta.match_phrases],
      );
    } else {
      // published: live meta changes only on the next publish
      await qb.query(`update cards set current_version = $2, updated_at = now()${startRevision ? ", revision_status = 'ai_draft'" : ""} where id = $1`, [id, version]);
    }
    await audit(qb, user.id, "card.save", "card", id, { version: card.current_version }, { version, sha });
    await emit(`card:${id}`, "saved", { card_id: id, version, author_id: user.id }, user.id, qb);
    if (startRevision)
      await emit("cards", "revision", { card_id: id, title_en: doc.meta.title_en, title_ar: doc.meta.title_ar, actor_en: user.display_name_en, actor_ar: user.display_name_ar }, user.id, qb);
    return { version, sha, unchanged: false, stage: startRevision ? ("ai_draft" as Status) : stage };
  });
}

export interface TransitionResult {
  stage: Status;
  status: Status;
  published_version: number | null;
  awarded: { userId: string; delta: number; name_en: string | null; name_ar: string | null } | null;
  fulfilled: number;
}

export async function transitionCard(
  user: SessionUser,
  id: string,
  input: { decision: Decision; note?: string | null; ack_lint?: boolean; version?: number },
): Promise<TransitionResult> {
  return tx(async (qb) => {
    const card = await getCardRow(id, qb, true);
    if (!card || !canSeeCard(user, card)) throw new HttpError(404, "not_found", "We couldn't find this card.");
    if (input.version && input.version !== card.current_version)
      throw new HttpError(409, "stale", "This card changed since you opened it. Reload to review the latest version.", { current_version: card.current_version });
    const stage = effectiveStatus(card);
    const doc = await versionDoc(card, card.current_version, qb);
    const check = await checklistFor(card.kind, doc, !!input.ack_lint, qb);

    const submitter = (
      await q<{ id: string; role: SessionUser["role"] }>(
        qb,
        `select u.id, u.role from reviews r join users u on u.id = r.reviewer_id
          where r.entity_type = 'card' and r.entity_id = $1 and r.decision = 'submit' order by r.created_at desc, r.id desc limit 1`,
        [id],
      )
    )[0];
    const approver = (
      await q<{ reviewer_id: string }>(
        qb,
        `select reviewer_id from reviews where entity_type = 'card' and entity_id = $1 and decision = 'approve' and version = $2 order by created_at desc, id desc limit 1`,
        [id, card.current_version],
      )
    )[0];

    const plan = planTransition({
      actor: { id: user.id, role: user.role, institution_id: user.institution_id },
      card: { status: stage, institution_id: card.institution_id },
      decision: input.decision,
      note: input.note,
      submitter: submitter ?? null,
      approverId: approver?.reviewer_id ?? null,
      checklistOk: checklistPasses(check.items),
    });
    if (!plan.ok) throw new HttpError(plan.status, plan.code, plan.reason, plan.code === "checklist" ? { checklist: check.items, lint: check.lint } : undefined);

    const to = plan.to;
    const isRevision = card.status === "published" && !!card.revision_status;
    const before = { status: card.status, revision_status: card.revision_status, published_version: card.published_version };
    let after: Record<string, unknown>;
    if (to === "published") {
      await qb.query(
        `update cards set status = 'published', revision_status = null, published_version = current_version, published_at = now(), updated_at = now(),
                title_en = $2, title_ar = $3, level = $4, certainty = $5, concept_id = $6, match_phrases = $7 where id = $1`,
        [id, doc.meta.title_en || card.title_en, doc.meta.title_ar || card.title_ar, doc.meta.level, doc.meta.certainty, doc.meta.concept_id, doc.meta.match_phrases],
      );
      after = { status: "published", revision_status: null, published_version: card.current_version };
    } else if (isRevision && to !== "archived") {
      await qb.query("update cards set revision_status = $2, updated_at = now() where id = $1", [id, to]);
      after = { status: card.status, revision_status: to };
    } else {
      await qb.query("update cards set status = $2, updated_at = now() where id = $1", [id, to]);
      after = { status: to };
    }

    const note = input.note?.trim().slice(0, 1000) || null;
    await qb.query(
      "insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note) values ('card',$1,$2,$3,$4,$5,$6,$7)",
      [id, card.current_version, user.id, stage, to, input.decision, note],
    );
    await audit(qb, user.id, `card.${input.decision}`, "card", id, before, { ...after, version: card.current_version, note, lint_acknowledged: check.lint.length ? check.lint.map((w) => `${w.ref}:${w.match}`) : undefined });

    let awarded: TransitionResult["awarded"] = null;
    if (plan.award) {
      const ref = `${id}@v${card.current_version}`;
      const exists = (await q(qb, "select 1 from points_ledger where user_id = $1 and reason = $2 and ref = $3", [plan.award.userId, plan.award.reason, ref]))[0];
      if (!exists) {
        await qb.query("insert into points_ledger (user_id, delta, reason, ref) values ($1,$2,$3,$4)", [plan.award.userId, plan.award.delta, plan.award.reason, ref]);
        await qb.query("update users set points = points + $2 where id = $1", [plan.award.userId, plan.award.delta]);
        const who = (await q<{ display_name_en: string; display_name_ar: string }>(qb, "select display_name_en, display_name_ar from users where id = $1", [plan.award.userId]))[0];
        awarded = { userId: plan.award.userId, delta: plan.award.delta, name_en: who?.display_name_en ?? null, name_ar: who?.display_name_ar ?? null };
      }
    }

    const payload = {
      card_id: id,
      decision: input.decision,
      to,
      version: card.current_version,
      title_en: doc.meta.title_en,
      title_ar: doc.meta.title_ar,
      actor_en: user.display_name_en,
      actor_ar: user.display_name_ar,
    };
    let fulfilled = 0;
    if (to === "published") {
      await emit(`card:${id}`, "published", payload, user.id, qb);
      if (doc.meta.concept_id) await emit(`concept:${doc.meta.concept_id}`, "published", { ...payload, concept_id: doc.meta.concept_id }, user.id, qb);
      await emit("cards", "published", payload, user.id, qb);
      const phrases = doc.meta.match_phrases.map((p) => p.trim().toLowerCase()).filter(Boolean);
      const rows = await q<{ id: string }>(
        qb,
        `update card_requests set status = 'fulfilled', fulfilled_card_id = $1
          where status = 'open' and ((concept_id is not null and concept_id = $2) or (topic is not null and lower(trim(topic)) = any($3::text[])))
          returning id`,
        [id, doc.meta.concept_id, phrases],
      );
      fulfilled = rows.length;
      if (fulfilled) {
        await audit(qb, user.id, "demand.fulfil", "card", id, null, { requests: rows.map((r) => r.id) });
        await emit("demand", "fulfilled", { card_id: id, concept_id: doc.meta.concept_id, count: fulfilled, title_en: doc.meta.title_en, title_ar: doc.meta.title_ar, actor_en: user.display_name_en, actor_ar: user.display_name_ar }, user.id, qb);
      }
    } else {
      await emit(`card:${id}`, "transition", payload, user.id, qb);
      await emit("cards", "transition", payload, user.id, qb);
    }
    const fresh = (await q<CardRecord>(qb, "select * from cards where id = $1", [id]))[0];
    return { stage: effectiveStatus(fresh), status: fresh.status, published_version: fresh.published_version, awarded, fulfilled };
  });
}

/** Published cards (for "related cards" and the inbox's "insert an approved card"). */
export async function publishedCards(search = "", limit = 30) {
  const p = `%${search.trim().toLowerCase()}%`;
  return sql<{ id: string; kind: string; concept_id: string | null; title_en: string; title_ar: string; institution_en: string | null; institution_ar: string | null }>(
    `select c.id, c.kind, c.concept_id, c.title_en, c.title_ar, i.name_en as institution_en, i.name_ar as institution_ar
       from cards c left join institutions i on i.id = c.institution_id
      where c.status = 'published' and c.published_version is not null
        and ($1 = '%%' or lower(c.title_en) like $1 or c.title_ar like $1 or lower(c.id) like $1)
      order by c.published_at desc nulls last limit $2`,
    [p, limit],
  );
}
