import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { one, sql, tx } from "@/lib/db";
import { newId } from "@/lib/ids";
import { HttpError } from "@/lib/http";
import { aiEnabled } from "@/lib/ai/claude";
import { normalizeArabic } from "@/lib/quran/normalize";
import type { SessionUser } from "@/lib/auth";
import { extractTextLayer, ocrPdfChunk, slicePdf, toPassages, type PageText } from "./pdf";
import { primaryGrade, gradeAr, type Grade } from "./grades";

/** The books library: built-in tafsir / hadith collections and PDFs uploaded from the portal. */

export type BookKind = "tafsir" | "hadith" | "book";
export type BookStatus = "processing" | "draft" | "approved" | "failed" | "archived";
export type BookRow = {
  id: string;
  kind: BookKind;
  origin: "builtin" | "upload";
  lang: string;
  title_en: string;
  title_ar: string;
  author_en: string;
  author_ar: string;
  note_en: string;
  note_ar: string;
  source_url: string | null;
  licence_note: string | null;
  status: BookStatus;
  file_bytes: number | null;
  pages: number | null;
  pages_done: number;
  extract_method: string | null;
  error: string | null;
  passages: number;
  created_by: string | null;
  created_by_name: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MAX_PDF_BYTES = 60 * 1024 * 1024;
export const MAX_PDF_PAGES = 800;
const OCR_CHUNK = 5;

const BOOK_COLS = `b.id, b.kind, b.origin, b.lang, b.title_en, b.title_ar, b.author_en, b.author_ar, b.note_en, b.note_ar, b.source_url,
  b.licence_note, b.status, b.file_bytes, b.pages, b.pages_done, b.extract_method, b.error, b.passages, b.created_by,
  u.display_name_en as created_by_name, b.approved_by, b.approved_at::text, b.created_at::text, b.updated_at::text`;

export async function listBooks(opts: { status?: BookStatus[] } = {}): Promise<BookRow[]> {
  return sql<BookRow>(
    `select ${BOOK_COLS} from books b left join users u on u.id = b.created_by
      ${opts.status ? "where b.status = any($1::text[])" : ""}
      order by b.origin desc, b.sort, b.created_at desc`,
    opts.status ? [opts.status] : [],
  );
}

export async function getBook(id: string): Promise<BookRow | null> {
  return one<BookRow>(`select ${BOOK_COLS} from books b left join users u on u.id = b.created_by where b.id = $1`, [id]);
}

export interface PassageRow {
  book_id: string;
  ref: string;
  sura: number | null;
  aya_from: number | null;
  aya_to: number | null;
  number: string | null;
  page: number | null;
  text: string;
  text_en: string | null;
  grades: Grade[] | null;
  grade_ok: boolean | null;
}

/** Browse or search a book's passages (portal). */
export async function bookPassages(id: string, opts: { q?: string; offset?: number; limit?: number } = {}): Promise<{ rows: PassageRow[]; total: number }> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = (opts.q ?? "").trim();
  const params: unknown[] = [id];
  let where = "book_id = $1";
  if (q) {
    const term = /[؀-ۿ]/.test(q) ? normalizeArabic(q) : q.toLowerCase();
    params.push(`%${term}%`);
    where += ` and (search like $2 or (search is null and text ilike $2))`;
  }
  const total = (await one<{ n: number }>(`select count(*)::int as n from book_passages where ${where}`, params))?.n ?? 0;
  const rows = await sql<PassageRow>(
    `select book_id, ref, sura, aya_from, aya_to, number, page, text, text_en, grades, grade_ok from book_passages where ${where}
      order by page nulls last, sura nulls last, aya_from nulls last, (case when number ~ '^[0-9]+$' then number::int end) nulls last, ref
      limit ${limit} offset ${offset}`,
    params,
  );
  return { rows, total };
}

// ── Public evidence lookups (approved books only) ──────────────────────────────────────────────────

export interface TafsirExcerpt {
  book_id: string;
  title_en: string;
  title_ar: string;
  author_en: string;
  author_ar: string;
  lang: string;
  ref: string;
  verse_key: string;
  range: string;
  text: string;
  source_url: string | null;
}

/** The passage of each approved tafsir that covers the verse, in library order. */
export async function tafsirFor(verseKey: string, opts: { books?: string[]; maxChars?: number } = {}): Promise<TafsirExcerpt[]> {
  const [s, a] = verseKey.split(":").map(Number);
  if (!s || !a) return [];
  const rows = await sql<TafsirExcerpt & { aya_from: number; aya_to: number }>(
    `select p.book_id, b.title_en, b.title_ar, b.author_en, b.author_ar, b.lang, p.ref, p.aya_from, p.aya_to, p.text, b.source_url
       from book_passages p join books b on b.id = p.book_id
      where b.kind = 'tafsir' and b.status = 'approved' and p.sura = $1 and $2 between p.aya_from and p.aya_to
        ${opts.books?.length ? "and b.id = any($3::text[])" : ""}
      order by b.sort`,
    opts.books?.length ? [s, a, opts.books] : [s, a],
  );
  return rows.map((r) => ({
    ...r,
    verse_key: verseKey,
    range: r.aya_from === r.aya_to ? `${s}:${r.aya_from}` : `${s}:${r.aya_from}-${r.aya_to}`,
    text: opts.maxChars ? excerpt(r.text, opts.maxChars) : r.text,
  }));
}

/** Cut long passages at a sentence boundary. */
export function excerpt(text: string, max: number): string {
  const t = text.replace(/\[\[[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim(); // drop editors' variant notes [[…]]
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("، "), cut.lastIndexOf("؛ "), cut.lastIndexOf(". "));
  return (stop > max * 0.6 ? cut.slice(0, stop + 1) : cut) + " …";
}

export interface LibraryHadith {
  id: string; // L:<book>:<number>
  book_id: string;
  number: string;
  title_en: string;
  title_ar: string;
  text_ar: string;
  text_en: string | null;
  grade: string | null;
  grade_ar: string | null;
  grader: string | null;
  grades: Grade[];
}

const collectionOf = (bookId: string) => bookId.replace(/^hadith-/, "");

function toLibraryHadith(r: PassageRow & { title_en: string; title_ar: string }): LibraryHadith {
  const p = primaryGrade(collectionOf(r.book_id), r.grades ?? []);
  return {
    id: `L:${r.book_id}:${r.number ?? r.ref}`,
    book_id: r.book_id,
    number: r.number ?? r.ref,
    title_en: r.title_en,
    title_ar: r.title_ar,
    text_ar: r.text,
    text_en: r.text_en,
    grade: p?.grade ?? null,
    grade_ar: p ? gradeAr(p.grade) : null,
    grader: p?.name ?? null,
    grades: r.grades ?? [],
  };
}

/** Keyword search in the approved hadith collections; only hadith graded sahih/hasan by the primary grader. */
export async function searchLibraryHadith(terms: string[], limit = 8): Promise<LibraryHadith[]> {
  const pats = terms.map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 8)
    .map((t) => `%${/[؀-ۿ]/.test(t) ? normalizeArabic(t) : t.toLowerCase()}%`);
  if (!pats.length) return [];
  const rows = await sql<PassageRow & { title_en: string; title_ar: string }>(
    `select p.*, b.title_en, b.title_ar from book_passages p join books b on b.id = p.book_id
      where b.kind = 'hadith' and b.status = 'approved' and p.grade_ok and p.search like any($1::text[])
      order by length(p.text) limit $2`,
    [pats, limit],
  );
  return rows.map(toLibraryHadith);
}

export async function getLibraryHadith(ids: string[]): Promise<LibraryHadith[]> {
  const keys = ids.map((i) => /^L:(hadith-[a-z]+):(.+)$/.exec(i)).filter((m): m is RegExpExecArray => !!m);
  if (!keys.length) return [];
  const rows = await sql<PassageRow & { title_en: string; title_ar: string }>(
    `select p.*, b.title_en, b.title_ar from book_passages p join books b on b.id = p.book_id
      where b.kind = 'hadith' and b.status = 'approved' and (p.book_id || ':' || p.ref) = any($1::text[])`,
    [keys.map((m) => `${m[1]}:${m[2]}`)],
  );
  return rows.map(toLibraryHadith);
}

export interface BookExcerpt {
  id: string; // B:<book>:<ref>
  book_id: string;
  title_en: string;
  title_ar: string;
  author_en: string;
  author_ar: string;
  page: number | null;
  text: string;
  machine_read: boolean;
}

/** Keyword search in approved uploaded books. */
export async function searchBooks(terms: string[], limit = 6): Promise<BookExcerpt[]> {
  const pats = terms.map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 8)
    .map((t) => `%${/[؀-ۿ]/.test(t) ? normalizeArabic(t) : t.toLowerCase()}%`);
  if (!pats.length) return [];
  const rows = await sql<PassageRow & { title_en: string; title_ar: string; author_en: string; author_ar: string; extract_method: string | null }>(
    `select p.*, b.title_en, b.title_ar, b.author_en, b.author_ar, b.extract_method from book_passages p join books b on b.id = p.book_id
      where b.kind = 'book' and b.status = 'approved' and p.search like any($1::text[]) limit $2`,
    [pats, limit],
  );
  return rows.map((r) => ({
    id: `B:${r.book_id}:${r.ref}`, book_id: r.book_id, title_en: r.title_en, title_ar: r.title_ar, author_en: r.author_en, author_ar: r.author_ar,
    page: r.page, text: r.text, machine_read: r.extract_method === "ai" || r.extract_method === "mixed",
  }));
}

export async function getBookExcerpts(ids: string[]): Promise<BookExcerpt[]> {
  const keys = ids.map((i) => /^B:([^:]+):(.+)$/.exec(i)).filter((m): m is RegExpExecArray => !!m).map((m) => `${m[1]}:${m[2]}`);
  if (!keys.length) return [];
  const rows = await sql<PassageRow & { title_en: string; title_ar: string; author_en: string; author_ar: string; extract_method: string | null }>(
    `select p.*, b.title_en, b.title_ar, b.author_en, b.author_ar, b.extract_method from book_passages p join books b on b.id = p.book_id
      where b.kind = 'book' and b.status = 'approved' and (p.book_id || ':' || p.ref) = any($1::text[])`,
    [keys],
  );
  return rows.map((r) => ({
    id: `B:${r.book_id}:${r.ref}`, book_id: r.book_id, title_en: r.title_en, title_ar: r.title_ar, author_en: r.author_en, author_ar: r.author_ar,
    page: r.page, text: r.text, machine_read: r.extract_method === "ai" || r.extract_method === "mixed",
  }));
}

// ── Uploads ────────────────────────────────────────────────────────────────────────────────────

export const booksDir = () => path.resolve(env.uploadDir, "books");

export interface UploadMeta {
  title_en: string;
  title_ar: string;
  author_en: string;
  author_ar: string;
  lang: "ar" | "en";
  note_en?: string;
  note_ar?: string;
  source_url?: string;
  licence_note: string;
}

export async function createUpload(user: SessionUser, file: Buffer, meta: UploadMeta): Promise<BookRow> {
  if (file.byteLength > MAX_PDF_BYTES) throw new HttpError(413, "too_large", `PDFs must be ${MAX_PDF_BYTES / 1024 / 1024} MB or smaller.`);
  if (file.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "bad_type", "This file isn't a PDF.");
  const id = newId("upl");
  await fs.mkdir(booksDir(), { recursive: true });
  const file_path = path.join(booksDir(), `${id}.pdf`);
  await fs.writeFile(file_path, file);
  await sql(
    `insert into books (id, kind, origin, lang, title_en, title_ar, author_en, author_ar, note_en, note_ar, source_url, licence_note, status, file_path, file_bytes, created_by, sort)
     values ($1,'book','upload',$2,$3,$4,$5,$6,$7,$8,$9,$10,'processing',$11,$12,$13, 500)`,
    [id, meta.lang, meta.title_en, meta.title_ar, meta.author_en, meta.author_ar, meta.note_en ?? "", meta.note_ar ?? "", meta.source_url || null, meta.licence_note, file_path, file.byteLength, user.id],
  );
  await audit(user.id, "book.upload", id, { bytes: file.byteLength, title: meta.title_en || meta.title_ar });
  queueProcessing(id);
  return (await getBook(id))!;
}

async function audit(actor: string, action: string, id: string, data: unknown) {
  await sql("insert into audit_log (actor_id, action, entity_type, entity_id, after) values ($1,$2,'book',$3,$4)", [actor, action, id, JSON.stringify(data)]).catch(() => {});
}

const g = globalThis as unknown as { __bookQueue?: Promise<void> };

/** Process uploads one at a time in the background (in-process; a restart leaves the book "processing" → Retry). */
export function queueProcessing(id: string) {
  g.__bookQueue = (g.__bookQueue ?? Promise.resolve()).then(() => processBook(id).catch((e) => console.error("[library]", id, e)));
  return g.__bookQueue;
}

/** Extract text (text layer first, Claude for scanned or garbled pages), split into passages, mark ready for review. */
export async function processBook(id: string) {
  const book = await one<{ file_path: string | null; origin: string }>("select file_path, origin from books where id = $1", [id]);
  if (!book?.file_path || book.origin !== "upload") return;
  await sql("update books set status='processing', pages_done=0, error=null, updated_at=now() where id=$1", [id]);
  try {
    const data = new Uint8Array(await fs.readFile(book.file_path));
    const { pages, numPages } = await extractTextLayer(data);
    if (!numPages) throw new Error("The PDF has no pages.");
    if (numPages > MAX_PDF_PAGES) throw new Error(`The PDF has ${numPages} pages; the limit is ${MAX_PDF_PAGES}.`);
    await sql("update books set pages=$2, updated_at=now() where id=$1", [id, numPages]);
    const byPage = new Map<number, PageText>(pages.map((p) => [p.page, p]));
    const missing = pages.filter((p) => p.method === "none").map((p) => p.page);
    let aiPages = 0;
    if (missing.length && aiEnabled()) {
      // Contiguous runs of unreadable pages, in chunks of a few pages per call.
      for (let i = 0; i < missing.length; ) {
        const from = missing[i];
        let to = from;
        while (i + 1 < missing.length && missing[i + 1] === to + 1 && to - from + 1 < OCR_CHUNK) { i++; to++; }
        i++;
        try {
          const read = await ocrPdfChunk(await slicePdf(data, from, to), from, to - from + 1);
          for (const p of read) if (p.text) { byPage.set(p.page, p); aiPages++; }
        } catch (e) {
          console.warn(`[library] ${id} pages ${from}-${to} unreadable:`, e instanceof Error ? e.message : e);
        }
        await sql("update books set pages_done=$2, updated_at=now() where id=$1", [id, numPages - missing.length + Math.min(i, missing.length)]);
      }
    }
    const textPages = [...byPage.values()].filter((p) => p.text).sort((a, b) => a.page - b.page);
    const passages = textPages.flatMap((p) => toPassages(p.page, p.text));
    if (!passages.length)
      throw new Error(aiEnabled() ? "No readable text was found in this PDF." : "This PDF has no text layer (it looks scanned). Switch on AI (ANTHROPIC_API_KEY) to read scanned pages.");
    const method = aiPages && aiPages === textPages.length ? "ai" : aiPages ? "mixed" : "text";
    await tx(async (q) => {
      await q.query("delete from book_passages where book_id = $1", [id]);
      for (let i = 0; i < passages.length; i += 200) {
        const chunk = passages.slice(i, i + 200);
        const params: unknown[] = [];
        const values = chunk.map((p) => {
          params.push(id, p.ref, p.page, p.text, searchText(p.text));
          const n = params.length;
          return `($${n - 4},$${n - 3},$${n - 2},$${n - 1},$${n})`;
        });
        await q.query(`insert into book_passages (book_id, ref, page, text, search) values ${values.join(",")}`, params);
      }
      await q.query(
        "update books set status='draft', passages=$2, pages_done=$3, extract_method=$4, error=$5, updated_at=now() where id=$1",
        [id, passages.length, numPages, method, missing.length && !aiEnabled() ? `${missing.length} scanned page(s) skipped: AI is off.` : null],
      );
    });
  } catch (e) {
    await sql("update books set status='failed', error=$2, updated_at=now() where id=$1", [id, e instanceof Error ? e.message.slice(0, 500) : "Processing failed."]);
  }
}

export const searchText = (t: string) => `${normalizeArabic(t)} ${t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ")}`.replace(/\s+/g, " ").trim();

/** Review actions. Approving needs an institution admin (or platform admin) other than the uploader. */
export async function reviewBook(user: SessionUser, id: string, action: "approve" | "archive" | "unarchive" | "retry" | "delete") {
  const book = await getBook(id);
  if (!book) throw new HttpError(404, "not_found", "This book doesn't exist.");
  const admin = user.role === "institution_admin" || user.role === "platform_admin";
  if (action === "approve") {
    if (!admin) throw new HttpError(403, "forbidden", "Only an institution admin can approve a book for public answers.");
    if (book.status !== "draft") throw new HttpError(409, "bad_state", "Only a processed book can be approved.");
    if (book.origin === "upload" && book.created_by === user.id && user.role !== "platform_admin")
      throw new HttpError(403, "four_eyes", "Someone other than the uploader must approve it (four-eyes rule).");
    await sql("update books set status='approved', approved_by=$2, approved_at=now(), updated_at=now() where id=$1", [id, user.id]);
  } else if (action === "archive") {
    if (!admin) throw new HttpError(403, "forbidden", "Only an institution admin can archive a book.");
    await sql("update books set status='archived', updated_at=now() where id=$1", [id]);
  } else if (action === "unarchive") {
    if (!admin) throw new HttpError(403, "forbidden", "Only an institution admin can restore a book.");
    await sql("update books set status=case when origin='builtin' then 'approved' else 'draft' end, updated_at=now() where id=$1", [id]);
  } else if (action === "retry") {
    if (book.origin !== "upload") throw new HttpError(409, "bad_state", "Built-in books are loaded by the seed.");
    queueProcessing(id);
  } else if (action === "delete") {
    if (book.origin !== "upload") throw new HttpError(409, "bad_state", "Built-in books can be archived, not deleted.");
    if (!admin && book.created_by !== user.id) throw new HttpError(403, "forbidden", "Only the uploader or an admin can delete it.");
    await sql("delete from books where id=$1", [id]);
    await fs.rm(path.join(booksDir(), `${id}.pdf`), { force: true });
  }
  await audit(user.id, `book.${action}`, id, {});
  return action === "delete" ? null : getBook(id);
}

/** The uploaded PDF file for download (portal only). */
export async function bookFile(id: string): Promise<{ data: Buffer; name: string } | null> {
  const b = await one<{ file_path: string | null; title_en: string }>("select file_path, title_en from books where id=$1 and origin='upload'", [id]);
  if (!b?.file_path) return null;
  const resolved = path.resolve(b.file_path);
  if (!resolved.startsWith(booksDir() + path.sep)) return null;
  return { data: await fs.readFile(resolved), name: `${id}.pdf` };
}
