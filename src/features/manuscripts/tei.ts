/**
 * Exports (pure): TEI P5 documents, plain text (diplomatic / reading), JSON and a JSONL training set.
 * Token mapping lives in tokens.ts (tokensToTei, lossless). Zones map to TEI as:
 *   main/title/rubric/colophon/seal/illustration/other → <ab type>, margin → <note type="gloss" place="margin">,
 *   catchword → <fw type="catch" place="bottom"> (never part of the running reading text).
 */
import { bbox, toPoints, type Polygon } from "./geometry";
import { plainText, readingText, tokensToTei, xmlEscape, type Tok } from "./tokens";

export interface ExportLine { id: string; n: number; region_id: string | null; polygon: Polygon; baseline: Polygon | null; status: string; version: number; kind: string | null; tokens: Tok[]; normalized_text: string | null }
export interface ExportRegion { id: string; type: string; polygon: Polygon; seq: number }
export interface ExportPage {
  id: string; seq: number; label: string | null; folio: number | null; side: string | null; image_url: string; width: number; height: number;
  status: string; published_version: number | null; published_sha: string | null; regions: ExportRegion[]; lines: ExportLine[];
}
export interface ExportManuscript {
  id: string; title_en: string; title_ar: string; author_en: string | null; author_ar: string | null; repository: string | null; shelfmark: string | null;
  siglum: string | null; script: string | null; script_description: string | null; copy_date_text: string | null; license: string | null;
  credit_line: string | null; source_url: string | null; institution_name: string | null; ai_training_allowed: boolean; genre: string;
}
export interface ExportDoc {
  manuscript: ExportManuscript;
  pages: ExportPage[];
  contributors: { name: string; role: string }[];
  machine_engines: string[];
  generated_at: string;
  base_url: string;
}

export const ENDORSEMENT_EN = "A historical text transcribed as it appears in the manuscript for documentation and research; publication does not imply endorsement of its content.";
export const ENDORSEMENT_AR = "نصٌّ تاريخيّ نُقل كما ورد في المخطوط لأغراض التوثيق والبحث، ونشرُه لا يعني تبنّي ما فيه.";

const id = (prefix: string, s: string) => `${prefix}-${s.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
const e = xmlEscape;

function zoneElement(type: string): { open: (facs: string) => string; close: string } {
  if (type === "margin") return { open: (f) => `<note type="gloss" place="margin" facs="#${f}">`, close: "</note>" };
  if (type === "catchword") return { open: (f) => `<fw type="catch" place="bottom" facs="#${f}">`, close: "</fw>" };
  return { open: (f) => `<ab type="${e(type)}" facs="#${f}">`, close: "</ab>" };
}

function pageBody(p: ExportPage, indent: string): string {
  const out: string[] = [];
  const types = new Map(p.regions.map((r) => [r.id, r.type]));
  out.push(`${indent}<pb n="${e(p.label ?? String(p.seq))}" facs="#${id("f", p.id)}"/>`);
  let i = 0;
  while (i < p.lines.length) {
    const region = p.lines[i].region_id;
    const type = region ? types.get(region) ?? "other" : "unassigned";
    const z = zoneElement(type);
    const group: ExportLine[] = [];
    while (i < p.lines.length && p.lines[i].region_id === region) group.push(p.lines[i++]);
    out.push(`${indent}${z.open(region ? id("r", region) : id("f", p.id))}`);
    for (const l of group) out.push(`${indent}  <lb n="${l.n}" facs="#${id("z", l.id)}"/>${tokensToTei(l.tokens)}`);
    out.push(`${indent}${z.close}`);
  }
  return out.join("\n");
}

function facsimile(p: ExportPage, base: string): string {
  const zones = [
    ...p.regions.map((r) => `      <zone xml:id="${id("r", r.id)}" type="${e(r.type)}" points="${toPoints(r.polygon)}"/>`),
    ...p.lines.map((l) => `      <zone xml:id="${id("z", l.id)}" type="line" points="${toPoints(l.polygon)}"/>`),
  ];
  return `    <surface xml:id="${id("f", p.id)}" ulx="0" uly="0" lrx="${p.width}" lry="${p.height}">
      <graphic url="${e(base + p.image_url)}" width="${p.width}px" height="${p.height}px"/>
${zones.join("\n")}
    </surface>`;
}

export function buildTei(d: ExportDoc): string {
  const m = d.manuscript;
  const published = d.pages.length > 0 && d.pages.every((p) => p.status === "published");
  const resp = [
    ...d.contributors.map((c) => `        <respStmt><resp>${e(c.role)}</resp><name>${e(c.name)}</name></respStmt>`),
    ...d.machine_engines.map((x) => `        <respStmt><resp>machine draft (a starting point, not a reading)</resp><name>${e(x)}</name></respStmt>`),
  ];
  const changes = d.pages
    .filter((p) => p.published_version)
    .map((p) => `      <change when="${d.generated_at.slice(0, 10)}" status="published" n="${p.published_version}">Page ${e(p.label ?? String(p.seq))} published, content sha256 ${e(p.published_sha ?? "")}</change>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:lang="ar">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title xml:lang="ar">${e(m.title_ar)}</title>
        <title xml:lang="en">${e(m.title_en)}</title>
${m.author_ar ? `        <author xml:lang="ar">${e(m.author_ar)}</author>\n` : ""}${m.author_en ? `        <author xml:lang="en">${e(m.author_en)}</author>\n` : ""}${resp.join("\n")}
      </titleStmt>
      <publicationStmt>
        <publisher>${e(m.institution_name ?? "Signs Around You")}</publisher>
        <date when="${d.generated_at.slice(0, 10)}"/>
        <availability status="restricted">
          <licence>${e(m.license ?? "Rights not recorded")}</licence>
          <p>${e(m.credit_line ?? "")}</p>
          <p xml:lang="en">${e(ENDORSEMENT_EN)}</p>
          <p xml:lang="ar">${e(ENDORSEMENT_AR)}</p>
          <p>Model training on these images: ${m.ai_training_allowed ? "permitted by the holding institution" : "not permitted without the holding institution's explicit permission"}.</p>
        </availability>
      </publicationStmt>
      <sourceDesc>
        <msDesc xml:id="${id("ms", m.id)}">
          <msIdentifier>
            <repository>${e(m.repository ?? "")}</repository>
            <idno>${e(m.shelfmark ?? "")}</idno>${m.siglum ? `\n            <altIdentifier type="siglum"><idno>${e(m.siglum)}</idno></altIdentifier>` : ""}
          </msIdentifier>
          <msContents>
            <msItem>
              <author>${e(m.author_ar ?? m.author_en ?? "")}</author>
              <title>${e(m.title_ar)}</title>
            </msItem>
          </msContents>
          <physDesc>
            <handDesc><handNote scope="major">${e([m.script, m.script_description].filter(Boolean).join(". "))}</handNote></handDesc>
          </physDesc>
          <history><origin><origDate>${e(m.copy_date_text ?? "Not verified")}</origDate></origin></history>
          <additional><surrogates><bibl><ref target="${e(m.source_url ?? "")}">${e(m.credit_line ?? "")}</ref></bibl></surrogates></additional>
        </msDesc>
      </sourceDesc>
    </fileDesc>
    <encodingDesc>
      <editorialDecl>
        <p>Reviewed diplomatic transcription (نسخ مُراجَع), not a critical edition. The text is recorded as written in the manuscript and never corrected; expansions of abbreviations appear only inside choice/expan after human confirmation.</p>
        <p>unclear/@n holds a machine model score (0–100); it is not a probability. Manuscript marks (صح، خ، بلغ، كذا …) are encoded as metamark, never as text. Catchwords are encoded as fw and are not part of the running text.</p>
      </editorialDecl>
    </encodingDesc>
    <revisionDesc status="${published ? "published" : "draft"}">
${changes.length ? changes.join("\n") : `      <change when="${d.generated_at.slice(0, 10)}">Working transcription exported (not yet published).</change>`}
    </revisionDesc>
  </teiHeader>
  <facsimile>
${d.pages.map((p) => facsimile(p, d.base_url)).join("\n")}
  </facsimile>
  <text>
    <body>
      <div type="transcription">
${d.pages.map((p) => pageBody(p, "        ")).join("\n")}
      </div>
    </body>
  </text>
</TEI>
`;
}

/** Plain text, one line per manuscript line. The reading layer leaves catchwords out of the running text. */
export function buildTxt(d: ExportDoc, layer: "diplomatic" | "reading"): string {
  const out: string[] = [`# ${d.manuscript.title_ar} — ${d.manuscript.shelfmark ?? ""}${d.manuscript.siglum ? ` (${d.manuscript.siglum})` : ""}`, `# ${layer === "diplomatic" ? "As written in the manuscript (diplomatic)" : "Reading text (normalised)"} · ${d.manuscript.credit_line ?? ""}`];
  for (const p of d.pages) {
    const types = new Map(p.regions.map((r) => [r.id, r.type]));
    out.push("", `## ${p.label ?? `Page ${p.seq}`}`);
    for (const l of p.lines) {
      const type = l.region_id ? types.get(l.region_id) : undefined;
      if (layer === "reading" && type === "catchword") continue;
      out.push(layer === "diplomatic" ? plainText(l.tokens) : l.normalized_text ?? readingText(l.tokens));
    }
  }
  return out.join("\n") + "\n";
}

export function buildJson(d: ExportDoc) {
  return {
    manuscript: d.manuscript,
    generated_at: d.generated_at,
    contributors: d.contributors,
    machine_engines: d.machine_engines,
    notice: { en: ENDORSEMENT_EN, ar: ENDORSEMENT_AR },
    pages: d.pages.map((p) => ({
      ...p,
      image_url: d.base_url + p.image_url,
      lines: p.lines.map((l) => ({ ...l, plain_text: plainText(l.tokens), reading_text: l.normalized_text ?? readingText(l.tokens) })),
    })),
  };
}

/** HTR training set: approved lines only, each with its crop box and the image licence. */
export function buildJsonl(d: ExportDoc): string {
  const rows: string[] = [];
  for (const p of d.pages)
    for (const l of p.lines) {
      if (l.status !== "approved" || !l.tokens.length) continue;
      const b = bbox(l.polygon);
      rows.push(JSON.stringify({
        id: l.id,
        manuscript_id: d.manuscript.id,
        page_id: p.id,
        image: d.base_url + p.image_url,
        bbox: [b.x, b.y, b.w, b.h],
        polygon: l.polygon,
        baseline: l.baseline,
        text: plainText(l.tokens),
        reading: l.normalized_text ?? readingText(l.tokens),
        version: l.version,
        license: d.manuscript.license,
        credit_line: d.manuscript.credit_line,
        ai_training_allowed: d.manuscript.ai_training_allowed,
      }));
    }
  return rows.join("\n") + (rows.length ? "\n" : "");
}
