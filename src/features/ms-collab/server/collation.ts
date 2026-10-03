import "server-only";
import fs from "node:fs";
import path from "node:path";
import { q, tx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { Polygon } from "../../manuscripts/geometry";
import { agreement, alignWords, buildApparatus, wordsOf, type AlignOp, type Word } from "../collation";
import type { CollationPassage, CollationView, CollationWitness } from "../types";
import { readingLines, type ReadingLine } from "./understanding";

interface PairSide { page_id: string; manuscript_id: string; from_line: string; to_line: string }
interface Pair { a: PairSide; b: PairSide; shared_words: number; word_agreement: number; gt_identical_incl_diacritics: number }

/** Which pages overlap (same lexicon entries) comes from the corpus build (data/manuscripts/collation.json). */
function overlapPairs(): Pair[] {
  try {
    const f = path.join(process.cwd(), "data/manuscripts/collation.json");
    return (JSON.parse(fs.readFileSync(f, "utf8")) as { pairs: Pair[] }).pairs ?? [];
  } catch {
    return [];
  }
}

/** Reference transcriptions this similar were copied from one another (see data/manuscripts/README: Berlin GT). */
const NEAR_IDENTICAL = 0.97;
const TEXT_ZONES = new Set([null, "main", "title", "rubric", "colophon", "other"]);

const lid = (page: string, l: string) => `${page}-${l}`;

function slice(lines: ReadingLine[], page: string, from: string, to: string): ReadingLine[] {
  const a = lines.findIndex((l) => l.id === lid(page, from));
  const b = lines.findIndex((l) => l.id === lid(page, to));
  if (a < 0 || b < 0) return [];
  return lines.slice(Math.min(a, b), Math.max(a, b) + 1).filter((l) => TEXT_ZONES.has(l.zone as never));
}

const toWords = (lines: ReadingLine[]): Word[] => lines.flatMap((l) => wordsOf(l.reading, l.id, l.n));

export async function collationView(msId: string): Promise<CollationView> {
  return tx(async (qb) => {
    const base = (await q<{ id: string; siglum: string | null; title_en: string; title_ar: string; shelfmark: string | null; work_id: string | null }>(qb,
      "select id, siglum, title_en, title_ar, shelfmark, work_id from manuscripts where id = $1", [msId]))[0];
    if (!base) throw new HttpError(404, "not_found", "Manuscript not found.");
    const copies = base.work_id
      ? await q<{ id: string; siglum: string | null; shelfmark: string | null; repository: string | null }>(qb,
          "select id, siglum, shelfmark, repository from manuscripts where work_id = $1 order by siglum nulls last", [base.work_id])
      : [{ id: base.id, siglum: base.siglum, shelfmark: base.shelfmark, repository: null }];
    const sig = new Map(copies.map((c) => [c.id, c]));
    const pages = await q<{ id: string; manuscript_id: string; seq: number; image_path: string; width: number; height: number }>(qb,
      "select id, manuscript_id, seq, image_path, width, height from ms_pages where manuscript_id = any($1::text[]) order by seq", [copies.map((c) => c.id)]);
    const pmap = new Map(pages.map((p) => [p.id, p]));
    const pairs = overlapPairs().filter((p) => (p.a.manuscript_id === msId || p.b.manuscript_id === msId) && pmap.has(p.a.page_id) && pmap.has(p.b.page_id) && sig.has(p.a.manuscript_id) && sig.has(p.b.manuscript_id));
    const cache = new Map<string, ReadingLine[]>();
    const linesOf = async (pageId: string) => {
      if (!cache.has(pageId)) cache.set(pageId, await readingLines(qb, pageId));
      return cache.get(pageId)!;
    };
    const polygonsOf = async (pageId: string, ids: string[]) =>
      Object.fromEntries((await q<{ id: string; polygon: Polygon }>(qb, "select id, polygon from ms_lines where id = any($1::text[])", [ids])).map((r) => [r.id, r.polygon]));

    const passages: CollationPassage[] = [];
    for (const bp of pages.filter((p) => p.manuscript_id === msId)) {
      const mine = pairs.map((p) => (p.a.page_id === bp.id ? { base: p.a, wit: p.b, pair: p } : p.b.page_id === bp.id ? { base: p.b, wit: p.a, pair: p } : null)).filter((x): x is NonNullable<typeof x> => !!x);
      if (!mine.length) continue;
      const bl = await linesOf(bp.id);
      // the base passage is the union of every witness's overlap on this page
      const idx = (l: string) => bl.findIndex((x) => x.id === lid(bp.id, l));
      const from = Math.min(...mine.map((m) => Math.min(idx(m.base.from_line), idx(m.base.to_line))).filter((i) => i >= 0));
      const to = Math.max(...mine.map((m) => Math.max(idx(m.base.from_line), idx(m.base.to_line))));
      if (!Number.isFinite(from) || to < 0) continue;
      const unionLines = bl.slice(from, to + 1).filter((l) => TEXT_ZONES.has(l.zone as never));
      const baseWords = toWords(unionLines);
      const witnesses: CollationWitness[] = [];
      const forApparatus: { siglum: string; ms_id: string; ops: AlignOp[] }[] = [];
      for (const m of mine) {
        const subBase = slice(bl, bp.id, m.base.from_line, m.base.to_line);
        const subIds = new Set(subBase.map((l) => l.id));
        const start = baseWords.findIndex((w) => subIds.has(w.line_id));
        const subWords = baseWords.filter((w) => subIds.has(w.line_id));
        const wl = slice(await linesOf(m.wit.page_id), m.wit.page_id, m.wit.from_line, m.wit.to_line);
        const ww = toWords(wl);
        if (!subWords.length || !ww.length) continue;
        const ops = alignWords(subWords, ww);
        const s = sig.get(m.wit.manuscript_id)!;
        const wp = pmap.get(m.wit.page_id)!;
        witnesses.push({
          ms_id: s.id, siglum: s.siglum ?? "?", shelfmark: s.shelfmark, page_id: wp.id, page_seq: wp.seq,
          image: { src: wp.image_path, width: wp.width, height: wp.height }, lines: wl.map((l) => l.id),
          polygons: await polygonsOf(wp.id, wl.map((l) => l.id)), agreement: agreement(ops),
          near_identical_reference: (m.pair.gt_identical_incl_diacritics ?? 0) >= NEAR_IDENTICAL,
        });
        forApparatus.push({ siglum: s.siglum ?? "?", ms_id: s.id, ops: start > 0 ? [{ op: "equal", a: baseWords.slice(0, start), b: baseWords.slice(0, start) }, ...ops] : ops });
      }
      if (!witnesses.length) continue;
      witnesses.sort((x, y) => x.siglum.localeCompare(y.siglum, "ar"));
      passages.push({
        base_page_id: bp.id, base_page_seq: bp.seq, base_image: { src: bp.image_path, width: bp.width, height: bp.height },
        base_polygons: await polygonsOf(bp.id, unionLines.map((l) => l.id)),
        base_words: baseWords, witnesses, apparatus: buildApparatus(baseWords, forApparatus),
      });
    }
    return {
      base: { id: base.id, siglum: base.siglum, title_en: base.title_en, title_ar: base.title_ar, shelfmark: base.shelfmark },
      copies, passages, caveat: passages.some((p) => p.witnesses.some((w) => w.near_identical_reference)),
    };
  });
}

