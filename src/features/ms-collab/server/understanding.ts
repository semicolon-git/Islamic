// Server code (not marked server-only so the seed can run the same workflow).
import crypto from "node:crypto";
import { q, sql, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import type { GlossaryTerm } from "@/lib/glossary";
import { DEFAULT_EDITION, quranIndex } from "@/lib/quran";
import type { QuranIndex } from "@/lib/quran/matcher";
import { suggestExpansions, type Genre } from "../../manuscripts/abbreviations";
import { orderLines } from "../../manuscripts/geometry";
import { canEditText, saveKind } from "../../manuscripts/rules";
import { searchForm } from "../../manuscripts/text";
import { applyMarkup, editorString, plainText, readingText, segments, type Tok } from "../../manuscripts/tokens";
import { detectQuotes, quoteDiff, type QuoteClass, type QuoteProposal } from "../quran-detect";
import { canConfirmAnnotation, canScanAnnotations } from "../rules";
import type { AbbrItem, NoteItem, PossibleAbbr, QuoteAnnotation, Understanding } from "../types";
import { iso, isoOrNull, lineCtx, lockedByOther, pageCtx, writeVersion } from "./core";

export interface ReadingLine {
  id: string;
  n: number;
  zone: string | null;
  version: number;
  tokens: Tok[];
  reading: string;
}

/** The page's lines in reading order with their current tokens (never the ground truth). */
export async function readingLines(qb: Queryable, pageId: string): Promise<ReadingLine[]> {
  const regions = await q<{ id: string; seq: number; type: string }>(qb, "select id, seq, type from ms_regions where page_id = $1", [pageId]);
  const rows = await q<{ id: string; region_id: string | null; seq: number; current_version: number; tokens: Tok[] | null; normalized_text: string | null }>(qb,
    `select l.id, l.region_id, l.seq, l.current_version, v.tokens, v.normalized_text from ms_lines l
       left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.page_id = $1`, [pageId]);
  const types = new Map(regions.map((r) => [r.id, r.type]));
  return orderLines(rows, regions).map((l, i) => ({
    id: l.id, n: i + 1, zone: l.region_id ? types.get(l.region_id) ?? null : null, version: l.current_version,
    tokens: l.tokens ?? [], reading: l.normalized_text?.trim() || readingText(l.tokens ?? []),
  }));
}

const hashLines = (lines: ReadingLine[]) => crypto.createHash("sha256").update(lines.map((l) => `${l.id}\u0001${l.reading}`).join("\u0002")).digest("hex");

/**
 * Propose Quran quotations for a page (code proposes; a researcher confirms). Re-runs only when the reading text changed.
 * Suggestions that are no longer found are withdrawn; confirmed and rejected ones are kept as people decided.
 */
export async function scanQuotes(qb: Queryable, ix: QuranIndex, pageId: string, opts: { force?: boolean } = {}): Promise<number> {
  const lines = (await readingLines(qb, pageId)).filter((l) => l.zone !== "catchword");
  const hash = hashLines(lines);
  const prev = (await q<{ data: { hash?: string } }>(qb, "select data from ms_annotations where page_id = $1 and key = 'scan:quran'", [pageId]))[0];
  if (!opts.force && prev?.data?.hash === hash) return 0;
  const proposals = detectQuotes(ix, lines.map((l) => ({ line_id: l.id, n: l.n, text: l.reading })));
  const keys = proposals.map((p) => p.key);
  await qb.query("delete from ms_annotations where page_id = $1 and kind = 'quran' and status = 'suggested' and key is not null and not (key = any($2::text[]))", [pageId, keys]);
  let added = 0;
  for (const p of proposals) {
    const r = await q<{ id: string }>(qb,
      `insert into ms_annotations (id, page_id, line_id, line_span, kind, anchor_text, data, status, key)
       values ($1,$2,$3,$4,'quran',$5,$6,'suggested',$7) on conflict (page_id, key) where key is not null do nothing returning id`,
      [newId("ann"), pageId, p.line_ids[0], JSON.stringify({ from_line: p.line_ids[0], to_line: p.line_ids[p.line_ids.length - 1] }), p.ms_text, JSON.stringify(proposalData(p)), p.key]);
    added += r.length;
  }
  await qb.query(
    `insert into ms_annotations (id, page_id, kind, data, status, key) values ($1,$2,'note',$3,'confirmed','scan:quran')
     on conflict (page_id, key) where key is not null do update set data = excluded.data`,
    [newId("ann"), pageId, JSON.stringify({ hash, at: new Date().toISOString(), found: proposals.length })]);
  return added;
}

const proposalData = (p: QuoteProposal) => ({
  verse_keys: p.verse_keys, match_status: p.match, partial: p.partial, similarity: p.similarity ?? null, cue: p.cue,
  line_ids: p.line_ids, from_n: p.from_n, to_n: p.to_n, sura_name_ar: p.sura_name_ar, sura_name_en: p.sura_name_en,
  canonical_source: "KFGQPC Hafs v18", classification: null,
});

interface AnnRow {
  id: string; status: QuoteAnnotation["status"]; anchor_text: string; reviewed_at: string | null; r_en: string | null; r_ar: string | null;
  data: { verse_keys: string[]; match_status: "exact" | "near"; partial: boolean; similarity: number | null; cue: boolean; line_ids: string[]; from_n: number; to_n: number; sura_name_ar: string; sura_name_en: string; classification: QuoteClass | null };
}

export async function quoteAnnotations(qb: Queryable, pageId: string, statuses: string[] = ["suggested", "confirmed", "rejected"]): Promise<QuoteAnnotation[]> {
  const rows = await q<AnnRow>(qb,
    `select a.id, a.status, a.anchor_text, a.data, a.reviewed_at, u.display_name_en as r_en, u.display_name_ar as r_ar
       from ms_annotations a left join users u on u.id = a.reviewed_by
      where a.page_id = $1 and a.kind = 'quran' and a.status = any($2::text[]) order by (a.data->>'from_n')::int, a.created_at`, [pageId, statuses]);
  const keys = [...new Set(rows.flatMap((r) => r.data.verse_keys ?? []))];
  const verses = keys.length ? await fetchAyat(qb, keys) : [];
  const vmap = new Map(verses.map((v) => [v.key, v]));
  const emap = new Map(verses.map((e) => [e.key, e.text_emlaey]));
  return rows.map((r) => ({
    id: r.id, status: r.status, verse_keys: r.data.verse_keys, match: r.data.match_status, partial: r.data.partial, similarity: r.data.similarity, cue: !!r.data.cue,
    line_ids: r.data.line_ids, from_n: r.data.from_n, to_n: r.data.to_n, ms_text: r.anchor_text, sura_name_ar: r.data.sura_name_ar, sura_name_en: r.data.sura_name_en,
    classification: r.data.classification ?? null,
    verses: r.data.verse_keys.map((k) => vmap.get(k)).filter((v): v is NonNullable<typeof v> => !!v).map((v) => ({
      key: v.key, aya: v.aya, text_uthmani: v.text_uthmani, sura_name_ar: v.sura_name_ar, sura_name_en: v.sura_name_en,
      translation: v.t_text ? { edition_name: v.t_name ?? DEFAULT_EDITION, text: v.t_text } : null,
    })),
    diff: quoteDiff(r.anchor_text, r.data.verse_keys.map((k) => emap.get(k) ?? "").join(" ")),
    reviewed_by: r.r_en ? { name_en: r.r_en, name_ar: r.r_ar! } : null,
  }));
}

interface AyahRow { key: string; aya: number; text_uthmani: string; text_emlaey: string; sura_name_ar: string; sura_name_en: string; t_text: string | null; t_name: string | null }

/** Verses by key from the KFGQPC table (inside a transaction), with the default labelled translation. */
export async function fetchAyat(qb: Queryable, keys: string[]): Promise<AyahRow[]> {
  return q<AyahRow>(qb,
    `select a.key, a.aya, a.text_uthmani, a.text_emlaey, a.sura_name_ar, a.sura_name_en, t.text as t_text, e.name as t_name
       from quran_ayah a left join quran_translation t on t.key = a.key and t.edition_id = $2 left join translation_editions e on e.id = $2
      where a.key = any($1::text[]) order by a.sura, a.aya`, [keys, DEFAULT_EDITION]);
}

/** Abbreviations as marked, possible abbreviations nobody marked yet, glossary terms, and the page's marks and notes. */
export async function understanding(user: SessionUser, pageId: string): Promise<Understanding> {
  const ix = await quranIndex(); // built outside the transaction (PGlite runs one query at a time)
  return tx(async (qb) => {
    const page = await pageCtx(qb, pageId);
    if (page.status !== "published" && page.status !== "archived") await scanQuotes(qb, ix, pageId);
    const lines = await readingLines(qb, pageId);
    const genre = ((await q<{ genre: string }>(qb, "select genre from manuscripts where id = $1", [page.manuscript_id]))[0]?.genre ?? "general") as Genre;
    const abbreviations: AbbrItem[] = [];
    const possible: PossibleAbbr[] = [];
    const notes: NoteItem[] = [];
    for (const l of lines) {
      l.tokens.forEach((k, i) => {
        if (k.t === "abbr") abbreviations.push({ line_id: l.id, line_n: l.n, token_index: i, base_version: l.version, written: k.v, expan: k.expan, confirmed: k.confirmed !== false });
        else if (k.t === "mark") notes.push({ line_id: l.id, line_n: l.n, kind: "mark", mark: k.kind, text: k.v, note: k.note ?? null, zone: l.zone });
        else if (k.t === "add" || k.t === "del" || k.t === "supplied") notes.push({ line_id: l.id, line_n: l.n, kind: k.t, text: k.v, note: k.t === "add" ? k.place : null, zone: l.zone });
        else if (k.t === "gap") notes.push({ line_id: l.id, line_n: l.n, kind: "gap", text: "[…]", note: k.reason, zone: l.zone });
      });
      if (l.zone === "margin" && l.reading) notes.push({ line_id: l.id, line_n: l.n, kind: "gloss", text: l.reading, note: null, zone: l.zone });
      // standalone written forms that the genre-aware lexicon knows, inside plain text only
      const str = editorString(l.tokens);
      const segs = segments(l.tokens);
      for (const m of str.matchAll(/\S+/g)) {
        const start = m.index ?? 0, end = start + m[0].length;
        const word = m[0].replace(/[.,،؛:]+$/u, "");
        const sug = suggestExpansions(word, genre, l.zone === "margin" ? "margin" : "main");
        if (!sug.some((s) => s.fits)) continue;
        const seg = segs.find((s) => s.start <= start && end <= s.end);
        if (!seg || seg.tok.t !== "text") continue;
        possible.push({
          line_id: l.id, line_n: l.n, base_version: l.version, start, end: start + word.length, written: word,
          suggestions: sug.map((s) => ({ expan: s.expan, fits: s.fits, note_en: s.noteEn, note_ar: s.noteAr, warn: !!s.warn })),
        });
      }
    }
    const terms = await q<GlossaryTerm>(qb, "select * from glossary_terms where status = 'approved' order by term_en");
    const forms = lines.map((l) => ({ n: l.n, f: ` ${searchForm(l.reading)} ` }));
    const found = terms.map((t) => {
      const needles = [t.term_ar, ...t.variants].filter((v) => /[؀-ۿ]/.test(v)).map((v) => searchForm(v)).filter((v) => v.length >= 3);
      return { id: t.id, term_ar: t.term_ar, term_en: t.term_en, rule_en: t.rule_en, rule_ar: t.rule_ar, lines: forms.filter((x) => needles.some((nd) => x.f.includes(` ${nd} `) || x.f.includes(` و${nd} `))).map((x) => x.n) };
    }).filter((t) => t.lines.length);
    const scan = (await q<{ data: { at?: string } }>(qb, "select data from ms_annotations where page_id = $1 and key = 'scan:quran'", [pageId]))[0];
    return {
      quotes: await quoteAnnotations(qb, pageId),
      abbreviations, possible: possible.slice(0, 40), terms: found, notes,
      can_confirm: canConfirmAnnotation(user.role),
      can_edit: canEditText(user.role, page.status),
      scanned_at: isoOrNull(scan?.data?.at ?? null),
    };
  });
}

export async function rescan(user: SessionUser, pageId: string) {
  if (!canScanAnnotations(user.role)) throw new HttpError(403, "forbidden", "Your role can't run the scan.");
  const ix = await quranIndex();
  return tx(async (qb) => {
    const added = await scanQuotes(qb, ix, pageId, { force: true });
    await emit(`page:${pageId}`, "annotation.changed", { scan: true }, user.id, qb);
    return { added };
  });
}

/** A researcher confirms or rejects a proposed quotation, and may classify a difference (never "error" before that). */
export async function reviewQuote(user: SessionUser, id: string, input: { status: "confirmed" | "rejected" | "suggested"; classification?: QuoteClass | null }) {
  return tx((qb) => reviewQuoteQ(qb, user, id, input));
}

export async function reviewQuoteQ(qb: Queryable, user: SessionUser, id: string, input: { status: "confirmed" | "rejected" | "suggested"; classification?: QuoteClass | null }) {
  if (!canConfirmAnnotation(user.role)) throw new HttpError(403, "forbidden", "Only a researcher confirms Quran quotations.");
  {
    const a = (await q<{ id: string; page_id: string; status: string; data: Record<string, unknown> }>(qb, "select id, page_id, status, data from ms_annotations where id = $1 and kind = 'quran'", [id]))[0];
    if (!a) throw new HttpError(404, "not_found", "This proposal no longer exists (the text may have changed).");
    const data = { ...a.data, ...(input.classification !== undefined ? { classification: input.classification } : {}) };
    await qb.query("update ms_annotations set status = $2, data = $3, reviewed_by = $4, reviewed_at = now() where id = $1", [id, input.status, JSON.stringify(data), user.id]);
    await audit(qb, user.id, `annotation.${input.status}`, "page", a.page_id, { status: a.status }, { annotation: id, status: input.status, classification: data.classification ?? null });
    await emit(`page:${a.page_id}`, "annotation.changed", { annotation_id: id, status: input.status }, user.id, qb);
    const page = (await q<{ manuscript_id: string }>(qb, "select manuscript_id from ms_pages where id = $1", [a.page_id]))[0];
    if (page) await emit(`ms:${page.manuscript_id}`, "annotation.changed", { page_id: a.page_id, annotation_id: id, status: input.status }, user.id, qb);
    return { status: input.status };
  }
}

/** Abbreviations: confirming applies to the reading layer only — the written form in the diplomatic layer never changes. */
export async function confirmAbbreviation(user: SessionUser, input: { line_id: string; base_version: number; token_index?: number; start?: number; end?: number; expan: string }) {
  return tx(async (qb) => {
    const line = await lineCtx(qb, input.line_id);
    const page = await pageCtx(qb, line.page_id);
    if (!canEditText(user.role, page.status)) throw new HttpError(403, "frozen", "This page is not open for editing at its current stage.");
    if (lockedByOther(line, user.id)) throw new HttpError(423, "locked", "Someone is editing this line right now. Try again in a minute.");
    if (line.current_version !== input.base_version) throw new HttpError(409, "conflict", "This line changed since the list was made. Reload the panel and try again.");
    let tokens: Tok[];
    const expan = input.expan.normalize("NFC").trim();
    if (!expan) throw new HttpError(400, "empty", "Choose or type the expansion.");
    if (input.token_index !== undefined) {
      const k = line.tokens[input.token_index];
      if (!k || k.t !== "abbr") throw new HttpError(409, "conflict", "This abbreviation is no longer in the line. Reload the panel.");
      tokens = line.tokens.map((x, i) => (i === input.token_index ? { t: "abbr", v: k.v, expan } as Tok : x));
    } else {
      const r = applyMarkup(line.tokens, input.start ?? 0, input.end ?? 0, { op: "abbr", expan });
      if (!r.ok) throw new HttpError(409, "conflict", "The word moved. Reload the panel and try again.");
      tokens = r.tokens;
    }
    if (plainText(tokens) !== plainText(line.tokens)) throw new HttpError(500, "invariant", "Confirming an abbreviation must not change the diplomatic text.");
    const version = await writeVersion(qb, {
      lineId: input.line_id, pageId: line.page_id, baseVersion: line.current_version, tokens, kind: saveKind(user.role), authorId: user.id,
      note: `Abbreviation confirmed: ${expan}`, actor: user, action: "abbr.confirm",
    });
    return { version };
  });
}

/** Confirmed annotations for one page (public reader and "explain this line"). */
export async function confirmedQuotes(pageId: string) {
  return tx((qb) => quoteAnnotations(qb, pageId, ["confirmed"]));
}

export async function lastScan(pageId: string) {
  const r = await sql<{ data: { at?: string } }>("select data from ms_annotations where page_id = $1 and key = 'scan:quran'", [pageId]);
  return r[0]?.data?.at ? iso(r[0].data.at) : null;
}
