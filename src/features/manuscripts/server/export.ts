import "server-only";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { orderLines, type Polygon } from "../geometry";
import { buildJson, buildJsonl, buildTei, buildTxt, type ExportDoc, type ExportPage } from "../tei";
import type { Tok } from "../tokens";
import { checkWellFormed } from "../xml";
import { getManuscript } from "./repo";

export const FORMATS = ["tei", "txt", "json", "jsonl"] as const;
export type Format = (typeof FORMATS)[number];

const ROLE_LABEL: Record<string, string> = { student: "transcription", researcher: "review and transcription", consensus: "consensus", import: "import" };

async function loadPages(pageIds: string[]): Promise<ExportPage[]> {
  if (!pageIds.length) return [];
  const pages = await sql<Omit<ExportPage, "regions" | "lines" | "image_url"> & { image_path: string }>(
    "select id, seq, label, folio, side, image_path, width, height, status, published_version, published_sha from ms_pages where id = any($1::text[]) order by seq",
    [pageIds],
  );
  const regions = await sql<{ id: string; page_id: string; type: string; polygon: Polygon; seq: number }>("select id, page_id, type, polygon, seq from ms_regions where page_id = any($1::text[])", [pageIds]);
  const lines = await sql<{ id: string; page_id: string; region_id: string | null; seq: number; polygon: Polygon; baseline: Polygon | null; status: string; version: number | null; kind: string | null; tokens: Tok[] | null; normalized_text: string | null }>(
    `select l.id, l.page_id, l.region_id, l.seq, l.polygon, l.baseline, l.status, v.version, v.kind, v.tokens, v.normalized_text
       from ms_lines l left join ms_line_versions v on v.line_id = l.id and v.version = l.current_version where l.page_id = any($1::text[])`,
    [pageIds],
  );
  return pages.map((p) => {
    const rs = regions.filter((r) => r.page_id === p.id);
    const ls = orderLines(lines.filter((l) => l.page_id === p.id), rs);
    return {
      id: p.id, seq: p.seq, label: p.label, folio: p.folio, side: p.side, width: p.width, height: p.height, status: p.status,
      published_version: p.published_version, published_sha: p.published_sha, image_url: p.image_path,
      regions: rs.map((r) => ({ id: r.id, type: r.type, polygon: r.polygon, seq: r.seq })),
      lines: ls.map((l, i) => ({ id: l.id, n: i + 1, region_id: l.region_id, polygon: l.polygon, baseline: l.baseline, status: l.status, version: l.version ?? 0, kind: l.kind, tokens: l.tokens ?? [], normalized_text: l.normalized_text })),
    };
  });
}

export async function exportDoc(msId: string, pageIds: string[] | null, baseUrl: string): Promise<ExportDoc> {
  const m = await getManuscript(msId);
  if (!m) throw new HttpError(404, "not_found", "Manuscript not found.");
  const ids = pageIds ?? (await sql<{ id: string }>("select id from ms_pages where manuscript_id = $1 order by seq", [msId])).map((r) => r.id);
  const pages = await loadPages(ids);
  const contributors = await sql<{ name: string; kind: string }>(
    `select distinct u.display_name_en as name, v.kind from ms_line_versions v join users u on u.id = v.author_id join ms_lines l on l.id = v.line_id
      where l.page_id = any($1::text[]) and v.kind <> 'machine' order by 1, 2`,
    [ids],
  );
  const engines = await sql<{ engine: string }>(
    `select distinct v.engine from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = any($1::text[]) and v.kind = 'machine' and v.engine is not null order by 1`,
    [ids],
  );
  const demo = env.demoMode && m.institution_is_demo;
  return {
    manuscript: {
      id: m.id, title_en: m.title_en, title_ar: m.title_ar, author_en: m.author_en, author_ar: m.author_ar, repository: m.repository, shelfmark: m.shelfmark,
      siglum: m.siglum, script: m.script, script_description: m.script_description, copy_date_text: m.copy_date_text, license: m.license,
      credit_line: m.credit_line, source_url: m.source_url, institution_name: m.institution_name_en ? `${m.institution_name_en}${demo ? " (demo)" : ""}` : null,
      ai_training_allowed: m.ai_training_allowed, genre: m.genre,
    },
    pages,
    contributors: contributors.map((c) => ({ name: c.name, role: ROLE_LABEL[c.kind] ?? c.kind })),
    machine_engines: engines.map((e) => e.engine),
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
  };
}

const slug = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, "_");

export function render(doc: ExportDoc, format: Format, layer: "diplomatic" | "reading", name: string): Response {
  const headers = (type: string, ext: string) => ({
    "content-type": `${type}; charset=utf-8`,
    "content-disposition": `attachment; filename="${slug(name)}${format === "txt" ? `.${layer}` : ""}.${ext}"`,
    "cache-control": "no-store",
  });
  switch (format) {
    case "tei": {
      const xml = buildTei(doc);
      const wf = checkWellFormed(xml);
      if (!wf.ok) throw new HttpError(500, "export_failed", `TEI self-check failed: ${wf.error}`);
      return new Response(xml, { headers: headers("application/tei+xml", "tei.xml") });
    }
    case "txt": return new Response(buildTxt(doc, layer), { headers: headers("text/plain", "txt") });
    case "json": return new Response(JSON.stringify(buildJson(doc), null, 2), { headers: headers("application/json", "json") });
    case "jsonl": return new Response(buildJsonl(doc), { headers: headers("application/x-ndjson", "jsonl") });
  }
}

export function baseUrlOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
