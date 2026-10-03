// Server code (not marked server-only so the seed can run the same workflow).
import { q, sql, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { orderLines } from "../../manuscripts/geometry";
import type { Polygon } from "../../manuscripts/geometry";
import type { Tok } from "../../manuscripts/tokens";
import { applyDecision, approxTokenBox, compareKeyings, keyingMatches, maskedContext, remapToken, unclearTokens, type CantRead, type Keying } from "../hard-words";
import { ADJUDICATION_STATUSES, KEYING_STATUSES, canDecideHardWord, canKey, pointsFor } from "../rules";
import type { AdjudicationItem, HardWordCard, KeyResult } from "../types";
import { iso, writeVersion } from "./core";
import { award } from "./points";

interface HwRow {
  id: string; page_id: string; line_id: string; base_version: number; token_index: number; token_text: string;
  alts: string[]; conf: number | null; source: "machine" | "person"; status: string;
}

/**
 * Keep the hard-word queue in step with the text: every `unclear` token in a line's current version has one item.
 * When a line moves on, open items follow their word (same text, still uncertain) or become stale (someone edited it).
 */
export async function syncHardWords(qb: Queryable, pageIds: string[]): Promise<void> {
  if (!pageIds.length) return;
  const lines = await q<{ id: string; page_id: string; current_version: number; tokens: Tok[] | null }>(qb,
    `select l.id, l.page_id, l.current_version, v.tokens from ms_lines l
       left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.page_id = any($1::text[])`, [pageIds]);
  const items = await q<HwRow>(qb, "select * from ms_hard_words where page_id = any($1::text[]) and status <> 'stale'", [pageIds]);
  const byLine = new Map<string, HwRow[]>();
  for (const it of items) byLine.set(it.line_id, [...(byLine.get(it.line_id) ?? []), it]);
  for (const l of lines) {
    const toks = l.tokens ?? [];
    const claimed = new Set<number>();
    for (const it of byLine.get(l.id) ?? []) {
      if (it.status !== "open" && it.status !== "disputed") continue;
      if (it.base_version === l.current_version) { claimed.add(it.token_index); continue; }
      const idx = remapToken(toks, it.token_text, claimed);
      if (idx < 0) await qb.query("update ms_hard_words set status = 'stale' where id = $1", [it.id]);
      else {
        claimed.add(idx);
        await qb.query("update ms_hard_words set base_version = $2, token_index = $3 where id = $1", [it.id, l.current_version, idx]);
      }
    }
    for (const u of unclearTokens(toks)) {
      if (claimed.has(u.index)) continue;
      // one item per (line, version, token); a resolved word that a person marks uncertain again starts a new item
      await qb.query(
        `insert into ms_hard_words (id, page_id, line_id, base_version, token_index, token_text, alts, conf, source)
         select $1,$2,$3,$4,$5,$6,$7,$8,$9 where not exists (select 1 from ms_hard_words where line_id = $3 and base_version = $4 and token_index = $5)`,
        [newId("hw"), l.page_id, l.id, l.current_version, u.index, u.v, JSON.stringify(u.alts), u.conf ?? null, u.person ? "person" : "machine"],
      );
      claimed.add(u.index);
    }
  }
}

async function keyingPages(qb: Queryable, statuses: string[], pageId?: string) {
  return (await q<{ id: string }>(qb, `select id from ms_pages where status = any($1::text[]) ${pageId ? "and id = $2" : ""}`, pageId ? [statuses, pageId] : [statuses])).map((r) => r.id);
}

interface CardRow extends HwRow {
  ms_id: string; title_en: string; title_ar: string; siglum: string | null; page_seq: number; page_label: string | null; image_path: string; width: number; height: number;
  polygon: Polygon; baseline: Polygon | null; tokens: Tok[]; zone: string | null; keyings: number; line_seq: number; region_seq: number | null;
}

async function lineNumber(qb: Queryable, pageId: string, lineId: string): Promise<number> {
  const regions = await q<{ id: string; seq: number }>(qb, "select id, seq from ms_regions where page_id = $1", [pageId]);
  const lines = await q<{ id: string; region_id: string | null; seq: number }>(qb, "select id, region_id, seq from ms_lines where page_id = $1", [pageId]);
  return orderLines(lines, regions).findIndex((l) => l.id === lineId) + 1;
}

const CARD_SELECT = `select h.*, p.manuscript_id as ms_id, m.title_en, m.title_ar, m.siglum, p.seq as page_seq, p.label as page_label, p.image_path, p.width, p.height,
       l.polygon, l.baseline, v.tokens, r.type as zone, l.seq as line_seq, r.seq as region_seq,
       (select count(*)::int from ms_keyings k where k.hard_word_id = h.id) as keyings
  from ms_hard_words h join ms_pages p on p.id = h.page_id join manuscripts m on m.id = p.manuscript_id
  join ms_lines l on l.id = h.line_id left join ms_regions r on r.id = l.region_id
  left join ms_line_versions v on v.line_id = l.id and v.version = h.base_version`;

async function toCard(qb: Queryable, r: CardRow, remaining: number): Promise<HardWordCard> {
  const ctx = maskedContext(r.tokens ?? [], r.token_index);
  return {
    id: r.id,
    page_id: r.page_id,
    line_id: r.line_id,
    ms_id: r.ms_id,
    ms_title_en: r.title_en,
    ms_title_ar: r.title_ar,
    siglum: r.siglum,
    page_seq: r.page_seq,
    page_label: r.page_label,
    line_n: await lineNumber(qb, r.page_id, r.line_id),
    zone: r.zone,
    image: { src: r.image_path, width: r.width, height: r.height },
    polygon: r.polygon,
    baseline: r.baseline,
    approx_box: approxTokenBox(r.polygon, r.tokens ?? [], r.token_index),
    before: ctx.before,
    after: ctx.after,
    second: r.keyings > 0,
    remaining,
  };
}

/** The next hard word for a student: words that already have one (other) reading come first, to complete pairs. */
export async function nextHardWord(user: SessionUser, opts: { pageId?: string; skip?: string[] } = {}): Promise<HardWordCard | null> {
  if (!canKey(user.role)) throw new HttpError(403, "forbidden", "Hard words are read by students; researchers decide the disputed ones.");
  return tx(async (qb) => {
    const pages = await keyingPages(qb, KEYING_STATUSES, opts.pageId);
    await syncHardWords(qb, pages);
    const skip = opts.skip?.slice(0, 200) ?? [];
    const where = `h.status = 'open' and h.page_id = any($1::text[]) and not (h.id = any($3::text[]))
      and not exists (select 1 from ms_keyings k where k.hard_word_id = h.id and k.author_id = $2)
      and (select count(*) from ms_keyings k where k.hard_word_id = h.id) < 2`;
    const remaining = (await q<{ n: number }>(qb, `select count(*)::int as n from ms_hard_words h where ${where}`, [pages, user.id, skip]))[0].n;
    const rows = await q<CardRow>(qb,
      `${CARD_SELECT} where ${where}
        order by (select count(*) from ms_keyings k where k.hard_word_id = h.id) desc,
                 exists (select 1 from ms_tasks t where t.page_id = h.page_id and t.assignee_id = $2 and t.status = 'open') desc,
                 m.siglum nulls last, p.seq, r.seq nulls last, l.seq, h.token_index limit 1`, [pages, user.id, skip]);
    return rows[0] ? toCard(qb, rows[0], remaining) : null;
  });
}

const keyingOf = (k: { plain_text: string; cant_read: CantRead | null }): Keying => (k.cant_read ? { cant_read: k.cant_read } : { reading: k.plain_text });

/** Write the decided reading into the line as a `consensus` version (never in place). Returns the new version or null if stale. */
async function writeDecision(qb: Queryable, item: HwRow, decision: { text: string } | { gap: CantRead }, actor: SessionUser, authorId: string | null, note: string, lineStatus: "agreed" | "transcribed") {
  const line = (await q<{ current_version: number; tokens: Tok[] }>(qb,
    `select l.current_version, v.tokens from ms_lines l join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.id = $1`, [item.line_id]))[0];
  if (!line) return null;
  let index = item.token_index;
  if (line.current_version !== item.base_version) index = remapToken(line.tokens, item.token_text);
  if (index < 0 || line.tokens[index]?.t !== "unclear") return null;
  const tokens = applyDecision(line.tokens, index, decision);
  return writeVersion(qb, {
    lineId: item.line_id, pageId: item.page_id, baseVersion: line.current_version, tokens, kind: "consensus", authorId, note, lineStatus, actor, action: "hardword.write",
  });
}

async function zoneOf(qb: Queryable, lineId: string) {
  return (await q<{ zone: string | null }>(qb, "select r.type as zone from ms_lines l left join ms_regions r on r.id = l.region_id where l.id = $1", [lineId]))[0]?.zone ?? null;
}

async function awardKeyers(qb: Queryable, item: HwRow, final: { text: string | null; gap: CantRead | null }) {
  const keys = await q<{ author_id: string; plain_text: string; cant_read: CantRead | null }>(qb, "select author_id, plain_text, cant_read from ms_keyings where hard_word_id = $1", [item.id]);
  const zone = await zoneOf(qb, item.line_id);
  return award(qb, keys.filter((k) => keyingMatches(keyingOf(k), final)).map((k) => ({ user_id: k.author_id, reason: "ms_keying_accepted" as const, ref: `hw:${item.id}`, delta: pointsFor("ms_keying_accepted", zone) })));
}

/** A student submits a blind reading. The second reading settles agreement or sends the word to a researcher. */
export async function submitKeying(user: SessionUser, id: string, input: Keying): Promise<KeyResult> {
  return tx((qb) => submitKeyingQ(qb, user, id, input));
}

export async function submitKeyingQ(qb: Queryable, user: SessionUser, id: string, input: Keying): Promise<KeyResult> {
  if (!canKey(user.role)) throw new HttpError(403, "forbidden", "Only students key hard words.");
  {
    const item = (await q<HwRow & { page_status: string }>(qb,
      "select h.*, p.status as page_status from ms_hard_words h join ms_pages p on p.id = h.page_id where h.id = $1 for update of h", [id]))[0];
    if (!item) throw new HttpError(404, "not_found", "This word is no longer in the queue.");
    if (!KEYING_STATUSES.includes(item.page_status as never)) throw new HttpError(409, "frozen", "This page has moved on to review; its words are no longer keyed.");
    if (item.status !== "open") throw new HttpError(409, "closed", "Two readings are already in for this word. Thank you — here is the next one.");
    const prior = await q<{ author_id: string; plain_text: string; cant_read: CantRead | null }>(qb, "select author_id, plain_text, cant_read from ms_keyings where hard_word_id = $1", [id]);
    if (prior.some((p) => p.author_id === user.id)) throw new HttpError(409, "already", "You already read this word.");
    if (prior.length >= 2) throw new HttpError(409, "closed", "Two readings are already in for this word.");
    const reading = input.cant_read ? "" : (input.reading ?? "").normalize("NFC").trim();
    if (!input.cant_read && !reading) throw new HttpError(400, "empty", "Type what you read, or choose “I can't read it”.");
    await qb.query(
      `insert into ms_keyings (id, line_id, author_id, tokens, plain_text, hard_word_id, cant_read) values ($1,$2,$3,$4,$5,$6,$7)`,
      [newId("key"), item.line_id, user.id, JSON.stringify(input.cant_read ? [{ t: "gap", reason: input.cant_read }] : [{ t: "text", v: reading }]), reading, id, input.cant_read ?? null],
    );
    await audit(qb, user.id, "hardword.key", "line", item.line_id, null, { hard_word: id, reading: reading || null, cant_read: input.cant_read ?? null });
    const mine: Keying = input.cant_read ? { cant_read: input.cant_read } : { reading };
    const base = { machine: item.token_text, alts: item.alts ?? [], conf: item.conf, source: item.source, mine };
    if (!prior.length) {
      await emit(`page:${item.page_id}`, "hardword.keyed", { hard_word_id: id, line_id: item.line_id, count: 1 }, user.id, qb);
      return { ...base, outcome: "waiting", other: null };
    }
    const other = keyingOf(prior[0]);
    const cmp = compareKeyings(other, mine);
    if (cmp.kind === "disagree") {
      await qb.query("update ms_hard_words set status = 'disputed' where id = $1", [id]);
      await qb.query("update ms_lines set status = 'disputed' where id = $1 and status <> 'approved'", [item.line_id]);
      await emit(`page:${item.page_id}`, "hardword.disputed", { hard_word_id: id, line_id: item.line_id }, user.id, qb);
      return { ...base, outcome: "disputed", other };
    }
    const decision = cmp.kind === "agree" ? { text: cmp.reading } : { gap: cmp.reason };
    const note = cmp.kind === "agree"
      ? `Consensus of two independent readings${cmp.vowelsDiffer ? " (letters agreed; vowel signs differed, kept letters only)" : ""}`
      : `Consensus: both readers could not read this word (${cmp.reason})`;
    const version = await writeDecision(qb, item, decision, user, null, note, "agreed");
    const final = cmp.kind === "agree" ? { text: cmp.reading, gap: null } : { text: null, gap: cmp.reason };
    await qb.query(
      `update ms_hard_words set status = $2, final_text = $3, final_gap = $4, resolution = 'consensus', resolved_version = $5, resolved_at = now(), note = $6 where id = $1`,
      [id, version ? "agreed" : "stale", final.text, final.gap, version, version ? note : "The line changed before the readings agreed."],
    );
    if (version) await awardKeyers(qb, item, final);
    await emit(`page:${item.page_id}`, "hardword.agreed", { hard_word_id: id, line_id: item.line_id, version }, user.id, qb);
    return { ...base, outcome: version ? "agreed" : "stale", other, final: final.text, final_gap: final.gap, vowels_differ: cmp.kind === "agree" && cmp.vowelsDiffer };
  }
}

/** Researcher view: disputed words with both readings, the machine guess and alternatives; plus recent agreements to spot-check. */
export async function adjudicationList(user: SessionUser, opts: { pageId?: string } = {}): Promise<{ disputed: AdjudicationItem[]; agreed: AdjudicationItem[] }> {
  return tx(async (qb) => {
    const pages = await keyingPages(qb, ADJUDICATION_STATUSES, opts.pageId);
    await syncHardWords(qb, pages);
    const load = async (status: string, limit: number) => {
      const rows = await q<CardRow & { resolved_at: string | null; final_text: string | null; final_gap: string | null }>(qb,
        `${CARD_SELECT} where h.status = $1 and h.page_id = any($2::text[]) order by ${status === "agreed" ? "h.resolved_at desc" : "m.siglum nulls last, p.seq, l.seq, h.token_index"} limit ${limit}`,
        [status, pages]);
      const out: AdjudicationItem[] = [];
      for (const r of rows) {
        const keys = await q<{ author_id: string; plain_text: string; cant_read: CantRead | null; name_en: string; name_ar: string; hue: number; created_at: string }>(qb,
          `select k.author_id, k.plain_text, k.cant_read, u.display_name_en as name_en, u.display_name_ar as name_ar, u.avatar_hue as hue, k.created_at
             from ms_keyings k join users u on u.id = k.author_id where k.hard_word_id = $1 order by k.created_at`, [r.id]);
        const card = await toCard(qb, r, 0);
        out.push({
          ...card,
          machine: r.token_text,
          alts: r.alts ?? [],
          conf: r.conf,
          source: r.source,
          status: r.status as AdjudicationItem["status"],
          final_text: r.final_text ?? null,
          final_gap: (r.final_gap as CantRead | null) ?? null,
          readings: keys.map((k) => ({ author_id: k.author_id, name_en: k.name_en, name_ar: k.name_ar, hue: k.hue, reading: k.plain_text || null, cant_read: k.cant_read, at: iso(k.created_at) })),
          can_decide: canDecideHardWord({ role: user.role, userId: user.id, keyers: keys.map((k) => k.author_id), status: "ai_draft" }).ok,
        });
      }
      return out;
    };
    return { disputed: await load("disputed", 60), agreed: await load("agreed", 12) };
  });
}

/** A researcher decides a disputed word (one of the readings, a machine alternative, their own reading, or a gap). */
export async function decideHardWord(user: SessionUser, id: string, decision: { text: string } | { gap: CantRead }): Promise<{ version: number }> {
  return tx((qb) => decideHardWordQ(qb, user, id, decision));
}

export async function decideHardWordQ(qb: Queryable, user: SessionUser, id: string, decision: { text: string } | { gap: CantRead }): Promise<{ version: number }> {
  {
    const item = (await q<HwRow & { page_status: string }>(qb,
      "select h.*, p.status as page_status from ms_hard_words h join ms_pages p on p.id = h.page_id where h.id = $1 for update of h", [id]))[0];
    if (!item) throw new HttpError(404, "not_found", "This word is no longer in the queue.");
    const keyers = (await q<{ author_id: string }>(qb, "select author_id from ms_keyings where hard_word_id = $1", [id])).map((k) => k.author_id);
    const check = canDecideHardWord({ role: user.role, userId: user.id, keyers, status: item.page_status as never });
    if (!check.ok) throw new HttpError(403, "forbidden", check.reason);
    if (item.status === "agreed") throw new HttpError(409, "agreed", "This word was agreed by two readers. To change it, edit the line in the workspace (the change is versioned).");
    if (item.status !== "disputed") throw new HttpError(409, "closed", "This word was already decided.");
    if ("text" in decision && !decision.text.trim()) throw new HttpError(400, "empty", "Type the reading, or choose a gap.");
    const note = "text" in decision ? `Adjudicated by ${user.display_name_en}` : `Adjudicated by ${user.display_name_en}: unreadable (${decision.gap})`;
    const version = await writeDecision(qb, item, decision, user, user.id, note, "transcribed");
    if (!version) {
      await qb.query("update ms_hard_words set status = 'stale', note = 'The line changed before the decision.' where id = $1", [id]);
      throw new HttpError(409, "stale", "The line changed since the readings were made, so this word is no longer in it. It has been removed from the queue.");
    }
    const final = "text" in decision ? { text: decision.text.normalize("NFC").trim(), gap: null } : { text: null, gap: decision.gap };
    await qb.query(
      `update ms_hard_words set status = 'resolved', final_text = $2, final_gap = $3, resolution = 'adjudicated', resolved_by = $4, resolved_version = $5, resolved_at = now(), note = $6 where id = $1`,
      [id, final.text, final.gap, user.id, version, note],
    );
    await qb.query(
      "insert into reviews (entity_type, entity_id, version, reviewer_id, decision, note) values ('line',$1,$2,$3,'accept',$4)",
      [item.line_id, version, user.id, note],
    );
    await awardKeyers(qb, item, final);
    await emit(`page:${item.page_id}`, "hardword.resolved", { hard_word_id: id, line_id: item.line_id, version }, user.id, qb);
    return { version };
  }
}

/** Counts for queues and badges. */
export async function hardWordCounts(user: SessionUser, qb0?: Queryable): Promise<{ to_key: number; disputed: number }> {
  const run = async (qb: Queryable) => {
    const keyPages = await keyingPages(qb, KEYING_STATUSES);
    const adjPages = await keyingPages(qb, ADJUDICATION_STATUSES);
    await syncHardWords(qb, adjPages);
    const toKey = canKey(user.role)
      ? (await q<{ n: number }>(qb,
          `select count(*)::int as n from ms_hard_words h where h.status = 'open' and h.page_id = any($1::text[])
             and not exists (select 1 from ms_keyings k where k.hard_word_id = h.id and k.author_id = $2)`, [keyPages, user.id]))[0].n
      : 0;
    const disputed = (await q<{ n: number }>(qb, "select count(*)::int as n from ms_hard_words where status = 'disputed' and page_id = any($1::text[])", [adjPages]))[0].n;
    return { to_key: toKey, disputed };
  };
  // never open a transaction inside another one (PGlite runs one query at a time)
  return qb0 ? run(qb0) : tx(run);
}

/** Per-line hard-word state for the workspace badges. */
export async function pageHardWords(pageId: string) {
  return sql<{ line_id: string; status: string; n: number }>(
    "select line_id, status, count(*)::int as n from ms_hard_words where page_id = $1 and status in ('open','disputed','agreed','resolved') group by line_id, status", [pageId]);
}
