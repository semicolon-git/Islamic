/**
 * Manuscript Studio seed (idempotent): the real demo corpus in data/manuscripts — three copies of al-Qāmūs al-muḥīṭ,
 * ten pages — with layout (regions, line polygons, baselines), ground truth (evaluation only, never a contribution)
 * and a v1 machine draft per line.
 *
 * Machine draft source, per page:
 *  - data/manuscripts/<ms>/drafts/<page_id>.claude.json if present ({page_id, engine, generated_at, lines:[{line_id, tokens, plain_text}]});
 *  - otherwise the Tesseract draft stored in the page JSON (words with conf < 60 → `unclear` with the model score).
 */
import fs from "node:fs";
import path from "node:path";
import type { Queryable } from "../../src/lib/db";
import { fromWords, normalizeTokens, plainText, type Tok } from "../../src/features/manuscripts/tokens";
import { tokSchema } from "../../src/features/manuscripts/schema";
import { cerParts } from "../../src/features/manuscripts/text";
import { ROOT, log, readJson } from "./util";

const DIR = path.join(ROOT, "data/manuscripts");
const INSTITUTION = "inst_lib";
const WORK_ID = "work:qamus-muhit";
const SIGLA: Record<string, string> = { "umich-isl-22": "أ", "sbb-or-fol-215": "ب", "bnf-arabe-5341": "ج" };
const SCRIPT: Record<string, string> = { "umich-isl-22": "Naskh (vocalised)", "sbb-or-fol-215": "Naskh (vocalised)", "bnf-arabe-5341": "Naskh-type cursive (unvocalised)" };
const REGION_TYPES = new Set(["main", "margin", "title", "rubric", "catchword", "colophon", "seal", "illustration", "other"]);

interface IndexMs {
  id: string; title_ar: string; title_en: string; author_ar: string; author_en: string;
  gt_reliability: string; gt_note: string; holding_library: string; holding_library_ar: string; shelfmark: string;
  copy_date: string | null; copy_date_note: string; script_description: string; licence: string; licence_confidence: string;
  licence_note: string; credit_line: string; source_url: string; catalogue_url: string;
  pages: { page_id: string; label: string; json: string; width: number; height: number }[];
}
interface PageJson {
  page_id: string; label: string; width: number; height: number; source: Record<string, unknown>;
  gt_source: Record<string, unknown>; draft: Record<string, unknown>;
  regions: { id: string; type: string; polygon: [number, number][]; source_type: string }[];
  lines: { id: string; region_id: string | null; order: number; polygon: [number, number][]; baseline: [number, number][] | null; gt_text: string | null; gt_status: string; draft_words: { t: string; conf: number }[] }[];
}
interface ClaudeDraft { page_id: string; engine?: string; generated_at?: string; lines: { line_id: string; tokens: unknown[]; plain_text?: string }[] }

const pageImage = (ms: string, page: string) => `/api/ms/files/dataset/${ms}/pages/${page}.jpg`;
const pageThumb = (ms: string, page: string) => `/api/ms/files/dataset/${ms}/thumbs/${page}.jpg`;
export const lineId = (page: string, l: string) => `${page}-${l}`;
export const regionId = (page: string, r: string) => `${page}-${r}`;

function loadClaudeDraft(ms: string, page: string): ClaudeDraft | null {
  const f = path.join(DIR, ms, "drafts", `${page}.claude.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(f, "utf8")) as ClaudeDraft;
    return Array.isArray(d.lines) ? d : null;
  } catch (e) {
    log(`skipping unreadable Claude draft ${f}: ${(e as Error).message}`);
    return null;
  }
}

function parseTokens(raw: unknown[]): Tok[] | null {
  const out: Tok[] = [];
  for (const r of raw) {
    const p = tokSchema.safeParse(r);
    if (!p.success) return null;
    out.push(p.data as Tok);
  }
  return normalizeTokens(out).tokens;
}

export async function seed(q: Queryable) {
  const index = readJson<{ manuscripts: IndexMs[] }>(path.join(DIR, "index.json"));
  const stats = readJson<{ pages: Record<string, { cer: number }> }>(path.join(DIR, "stats.json"));
  const inst = (await q.query<{ n: number }>("select count(*)::int as n from institutions where id=$1", [INSTITUTION])).rows[0].n;
  if (!inst) {
    log("manuscripts: institution inst_lib missing, skipped");
    return;
  }
  let pagesNew = 0, linesNew = 0, versionsNew = 0, claudePages = 0;

  for (const m of index.manuscripts) {
    await q.query(
      `insert into manuscripts (id, institution_id, title_en, title_ar, author_en, author_ar, copy_date_text, copy_date_note, script, script_description,
         repository, holding_library_ar, shelfmark, license, license_confidence, license_note, credit_line, source_url, catalogue_url,
         work_id, siglum, genre, gt_reliability, gt_note, status, publish_scope, ai_training_allowed, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'lexicon',$22,$23,'ai_draft','archive_only',false,true)
       on conflict (id) do update set title_en=excluded.title_en, title_ar=excluded.title_ar, author_en=excluded.author_en, author_ar=excluded.author_ar,
         copy_date_note=excluded.copy_date_note, script=excluded.script, script_description=excluded.script_description, repository=excluded.repository,
         holding_library_ar=excluded.holding_library_ar, shelfmark=excluded.shelfmark, license=excluded.license, license_confidence=excluded.license_confidence,
         license_note=excluded.license_note, credit_line=excluded.credit_line, source_url=excluded.source_url, catalogue_url=excluded.catalogue_url,
         work_id=excluded.work_id, siglum=excluded.siglum, gt_reliability=excluded.gt_reliability, gt_note=excluded.gt_note`,
      [m.id, INSTITUTION, m.title_en, m.title_ar, m.author_en, m.author_ar, m.copy_date, m.copy_date_note, SCRIPT[m.id] ?? null, m.script_description,
        m.holding_library, m.holding_library_ar, m.shelfmark, m.licence, m.licence_confidence, m.licence_note, m.credit_line, m.source_url, m.catalogue_url,
        WORK_ID, SIGLA[m.id] ?? null, m.gt_reliability, m.gt_note],
    );

    for (const [i, pRef] of m.pages.entries()) {
      const page = readJson<PageJson>(path.join(DIR, pRef.json));
      const claude = loadClaudeDraft(m.id, page.page_id);
      const exists = (await q.query<{ n: number }>("select count(*)::int as n from ms_pages where id=$1", [page.page_id])).rows[0].n > 0;
      if (!exists) {
        await q.query(
          `insert into ms_pages (id, manuscript_id, seq, folio, label, image_path, thumb_path, width, height, status, draft_engine, draft_cer, layout_source, source)
           values ($1,$2,$3,null,$4,$5,$6,$7,$8,'ai_draft',$9,$10,'dataset',$11)`,
          [page.page_id, m.id, i + 1, page.label, pageImage(m.id, page.page_id), pageThumb(m.id, page.page_id), page.width, page.height,
            claude ? "claude" : "tesseract", stats.pages[page.page_id]?.cer ?? null,
            JSON.stringify({ kind: "dataset", ...page.source, gt_source: page.gt_source, draft: page.draft })],
        );
        pagesNew++;
        // Region seq follows the dataset's reading order (title, main, catchword, margins, unassigned).
        const firstOrder = new Map<string, number>();
        for (const l of page.lines) if (l.region_id && !firstOrder.has(l.region_id)) firstOrder.set(l.region_id, l.order);
        for (const r of page.regions)
          await q.query(
            `insert into ms_regions (id, page_id, type, polygon, seq, source) values ($1,$2,$3,$4,$5,'dataset') on conflict (id) do nothing`,
            [regionId(page.page_id, r.id), page.page_id, REGION_TYPES.has(r.type) ? r.type : "other", JSON.stringify(r.polygon), firstOrder.get(r.id) ?? 999],
          );
        for (const l of page.lines) {
          await q.query(
            `insert into ms_lines (id, page_id, region_id, seq, polygon, baseline, status, current_version, gt_text, gt_status, source)
             values ($1,$2,$3,$4,$5,$6,'draft',0,$7,$8,'dataset') on conflict (id) do nothing`,
            [lineId(page.page_id, l.id), page.page_id, l.region_id ? regionId(page.page_id, l.region_id) : null, l.order,
              JSON.stringify(l.polygon), l.baseline ? JSON.stringify(l.baseline) : null, l.gt_text, l.gt_status],
          );
          linesNew++;
        }
      }

      // v1 machine draft for lines that have no version yet (or only a Tesseract draft when a Claude draft arrived).
      const claudeLines = new Map((claude?.lines ?? []).map((x) => [x.line_id, x]));
      let usedClaude = false;
      let dist = 0, chars = 0;
      for (const l of page.lines) {
        const id = lineId(page.page_id, l.id);
        const cur = (await q.query<{ n: number; machine_only: boolean; engine: string | null }>(
          `select count(*)::int as n, coalesce(bool_and(kind='machine'), true) as machine_only, max(engine) as engine from ms_line_versions where line_id=$1`,
          [id],
        )).rows[0];
        const c = claudeLines.get(l.id) ?? claudeLines.get(id);
        const cTokens = c ? parseTokens(c.tokens) : null;
        const engine = cTokens ? claude!.engine || "claude" : "tesseract";
        const tokens = cTokens ?? fromWords(l.draft_words ?? []);
        if (cTokens) usedClaude = true;
        if (l.gt_text) {
          const parts = cerParts(plainText(tokens), l.gt_text);
          dist += parts.dist;
          chars += parts.chars;
        }
        if (cur.n === 0) {
          if (!tokens.length) continue;
          await q.query(
            `insert into ms_line_versions (line_id, version, tokens, plain_text, kind, engine, base_version, note) values ($1,1,$2,$3,'machine',$4,0,$5)
             on conflict do nothing`,
            [id, JSON.stringify(tokens), plainText(tokens), engine, cTokens ? "Claude vision draft (transcription only)" : "Tesseract (open-source OCR) draft"],
          );
          await q.query("update ms_lines set current_version=1 where id=$1 and current_version=0", [id]);
          versionsNew++;
        } else if (cTokens && cur.n === 1 && cur.machine_only && cur.engine === "tesseract") {
          await q.query("update ms_line_versions set tokens=$2, plain_text=$3, engine=$4, note=$5 where line_id=$1 and version=1", [
            id, JSON.stringify(cTokens), plainText(cTokens), engine, "Claude vision draft (transcription only)",
          ]);
          versionsNew++;
        }
      }
      if (usedClaude) {
        claudePages++;
        await q.query("update ms_pages set draft_engine='claude', draft_cer=$2 where id=$1", [page.page_id, chars ? Math.round((dist / chars) * 10000) / 10000 : null]);
      }
    }
  }
  log(`manuscripts: ${index.manuscripts.length} copies · ${pagesNew} new pages · ${linesNew} new lines · ${versionsNew} machine versions${claudePages ? ` · ${claudePages} pages with Claude drafts` : ""}`);
}
