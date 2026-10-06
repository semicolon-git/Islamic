/**
 * Library seed: built-in tafsir and hadith books from prep/data/raw/library (downloaded by scripts/library/fetch.mjs).
 * Additive and idempotent: a book is (re)loaded only when its passage count differs from the source, so it is safe on
 * every server start. LIBRARY_EDITIONS=core loads only the small books (tests); =off skips the library.
 * Tafsir passages that explain several verses at once are stored once with their verse range (2:5-7).
 */
import path from "node:path";
import type { Queryable } from "../../src/lib/db";
import { normalizeArabic } from "../../src/lib/quran/normalize";
import { gradeOk, type Grade } from "../../src/features/library/grades";
import { CATALOGUE } from "../library/catalogue.mjs";
import { exists, insertMany, log, RAW, readJson } from "./util";

type Book = (typeof CATALOGUE)[number] & { core?: boolean };
type TafsirRow = { s: number; a: number; text: string };
type HadithFile = { hadiths: { hadithnumber: number | string; arabicnumber?: number | string; text: string; grades?: Grade[] }[] };

const mode = () => process.env.LIBRARY_EDITIONS || "all";

export const searchForm = (ar: string, en?: string | null) =>
  `${normalizeArabic(ar)} ${(en ?? "").toLowerCase().replace(/\s+/g, " ")}`.trim();

/** Collapse consecutive verses that carry the same passage into one range. */
export function tafsirPassages(rows: TafsirRow[]) {
  const out: { ref: string; sura: number; from: number; to: number; text: string }[] = [];
  for (const r of rows) {
    const text = r.text.trim();
    if (!text) continue;
    const last = out.at(-1);
    if (last && last.sura === r.s && last.text === text && r.a === last.to + 1) {
      last.to = r.a;
      last.ref = `${r.s}:${last.from}-${r.a}`;
    } else out.push({ ref: `${r.s}:${r.a}`, sura: r.s, from: r.a, to: r.a, text });
  }
  return out;
}

async function upsertBook(q: Queryable, b: Book, sort: number) {
  await q.query(
    `insert into books (id, kind, origin, lang, title_en, title_ar, author_en, author_ar, note_en, note_ar, source_url, licence_note, status, sort, approved_at)
     values ($1,$2,'builtin',$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved',$12, now())
     on conflict (id) do update set kind=excluded.kind, lang=excluded.lang, title_en=excluded.title_en, title_ar=excluded.title_ar,
       author_en=excluded.author_en, author_ar=excluded.author_ar, note_en=excluded.note_en, note_ar=excluded.note_ar,
       source_url=excluded.source_url, licence_note=excluded.licence_note, sort=excluded.sort, updated_at=now()`,
    [b.id, b.kind, b.lang, b.title_en, b.title_ar, b.author_en, b.author_ar, b.note_en, b.note_ar, b.source_url,
      "Mirror of a public digital edition (pinned, checksummed). Re-verify against a printed edition before relying on it.", sort],
  );
}

async function current(q: Queryable, id: string) {
  return (await q.query<{ n: number }>("select count(*)::int as n from book_passages where book_id = $1", [id])).rows[0]?.n ?? 0;
}

/** Normalised search text for the two Sahihs (rows added by the core seed). */
async function indexSahihayn(q: Queryable) {
  const rows = (await q.query<{ id: string; text_ar: string; text_en: string | null }>("select id, text_ar, text_en from hadith where search is null")).rows;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await q.query(
      "update hadith h set search = v.search from (select unnest($1::text[]) as id, unnest($2::text[]) as search) v where h.id = v.id",
      [chunk.map((r) => r.id), chunk.map((r) => searchForm(r.text_ar, r.text_en))],
    );
  }
  if (rows.length) log(`library: indexed ${rows.length} hadith of al-Bukhari / Muslim for search`);
}

export async function seed(q: Queryable) {
  await indexSahihayn(q);
  if (mode() === "off") return log("library: skipped (LIBRARY_EDITIONS=off)");
  const books = (CATALOGUE as Book[]).filter((b) => mode() !== "core" || b.core);
  let i = 0;
  for (const b of books) {
    i++;
    const file = b.kind === "tafsir" ? path.join(RAW, "library/tafsir", `${b.edition}.json`) : path.join(RAW, "library/hadith", `ara-${b.edition}.json`);
    if (!exists(file)) {
      log(`library: ${b.id} source missing (run: node scripts/library/fetch.mjs)`);
      continue;
    }
    await upsertBook(q, b, i * 10);
    if (b.kind === "tafsir") {
      const passages = tafsirPassages(readJson<TafsirRow[]>(file));
      if ((await current(q, b.id)) === passages.length) continue;
      await q.query("delete from book_passages where book_id = $1", [b.id]);
      await insertMany(q, "book_passages", ["book_id", "ref", "sura", "aya_from", "aya_to", "text"],
        passages.map((p) => [b.id, p.ref, p.sura, p.from, p.to, p.text]), "on conflict do nothing", 60);
      await q.query("update books set passages = $2 where id = $1", [b.id, passages.length]);
      log(`library: ${b.id} ${passages.length} passages`);
    } else {
      const ar = readJson<HadithFile>(file).hadiths;
      const enFile = path.join(RAW, "library/hadith", `eng-${b.edition}.json`);
      const en = exists(enFile) ? readJson<HadithFile>(enFile).hadiths : [];
      const enBy = new Map(en.map((h) => [String(h.hadithnumber), h]));
      const rows: unknown[][] = [];
      const seen = new Set<string>();
      for (const h of ar) {
        const num = String(h.hadithnumber);
        if (!h.text?.trim() || seen.has(num)) continue;
        seen.add(num);
        const e = enBy.get(num);
        const grades = (e?.grades?.length ? e.grades : h.grades) ?? [];
        rows.push([b.id, num, num, h.text.trim(), e?.text?.trim() || null, JSON.stringify(grades), gradeOk(b.edition, grades), searchForm(h.text, e?.text)]);
      }
      if ((await current(q, b.id)) === rows.length) continue;
      await q.query("delete from book_passages where book_id = $1", [b.id]);
      await insertMany(q, "book_passages", ["book_id", "ref", "number", "text", "text_en", "grades", "grade_ok", "search"], rows, "on conflict do nothing", 200);
      await q.query("update books set passages = $2 where id = $1", [b.id, rows.length]);
      log(`library: ${b.id} ${rows.length} hadith (${rows.filter((r) => r[6]).length} graded sahih/hasan)`);
    }
  }
}
