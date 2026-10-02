import { describe, expect, it } from "vitest";
import { buildJson, buildJsonl, buildTei, buildTxt, type ExportDoc } from "./tei";
import { teiToTokens, type Tok } from "./tokens";
import { checkWellFormed } from "./xml";

const tokens: Tok[] = [
  { t: "hi", rend: "red", v: "فصل" },
  { t: "text", v: " الباء " },
  { t: "abbr", v: "ع", expan: "موضع" },
  { t: "mark", kind: "sahh", v: "صح" },
  { t: "text", v: " & <x>" },
];

const doc: ExportDoc = {
  manuscript: {
    id: "umich-isl-22", title_en: "al-Qāmūs al-muḥīṭ", title_ar: "القاموس المحيط", author_en: "al-Fīrūzābādī", author_ar: "الفيروزآبادي",
    repository: "University of Michigan Library", shelfmark: "Isl. Ms. 22", siglum: "أ", script: "Naskh", script_description: "Vocalised naskh & red rubrics",
    copy_date_text: null, license: "Public Domain", credit_line: "Isl. Ms. 22 <U-M>", source_url: "https://hdl.handle.net/2027/x?a=1&b=2",
    institution_name: "Al-Noor Manuscript Library (demo)", ai_training_allowed: false, genre: "lexicon",
  },
  pages: [
    {
      id: "umich-isl-22_02", seq: 2, label: "Bāb al-hamza", folio: null, side: null, image_url: "/api/ms/files/dataset/umich-isl-22/pages/umich-isl-22_02.jpg",
      width: 1332, height: 2000, status: "published", published_version: 1, published_sha: "abc",
      regions: [{ id: "umich-isl-22_02-r1", type: "main", polygon: [[0, 0], [10, 0], [10, 10]], seq: 1 }, { id: "r9", type: "catchword", polygon: [[0, 0], [5, 0], [5, 5]], seq: 2 }],
      lines: [
        { id: "umich-isl-22_02-l1", n: 1, region_id: "umich-isl-22_02-r1", polygon: [[1, 1], [9, 1], [9, 4], [1, 4]], baseline: null, status: "approved", version: 3, kind: "student", tokens, normalized_text: null },
        { id: "umich-isl-22_02-l2", n: 2, region_id: "umich-isl-22_02-r1", polygon: [[1, 5], [9, 5], [9, 8], [1, 8]], baseline: null, status: "transcribed", version: 2, kind: "student", tokens: [{ t: "text", v: "بدأ" }], normalized_text: null },
        { id: "l3", n: 3, region_id: "r9", polygon: [[1, 5], [4, 5], [4, 8]], baseline: null, status: "approved", version: 2, kind: "student", tokens: [{ t: "text", v: "وبرأ" }], normalized_text: null },
      ],
    },
  ],
  contributors: [{ name: "Sara Al-Harbi", role: "transcription" }],
  machine_engines: ["tesseract"],
  generated_at: "2026-10-02T12:00:00.000Z",
  base_url: "http://localhost:3004",
};

describe("TEI export", () => {
  const xml = buildTei(doc);
  it("is well-formed XML", () => {
    expect(checkWellFormed(xml)).toEqual({ ok: true });
  });
  it("carries licence, credit line, msDesc and the not-endorsement notice", () => {
    expect(xml).toContain("<licence>Public Domain</licence>");
    expect(xml).toContain("Isl. Ms. 22 &lt;U-M&gt;");
    expect(xml).toContain("<idno>Isl. Ms. 22</idno>");
    expect(xml).toContain('<altIdentifier type="siglum"><idno>أ</idno></altIdentifier>');
    expect(xml).toContain("publication does not imply endorsement");
    expect(xml).toContain('<revisionDesc status="published">');
    expect(xml).toContain("not permitted without the holding institution");
  });
  it("encodes facsimile zones, page and line breaks, and catchwords as fw", () => {
    expect(xml).toContain('<surface xml:id="f-umich-isl-22_02"');
    expect(xml).toContain('<zone xml:id="z-umich-isl-22_02-l1" type="line" points="1,1 9,1 9,4 1,4"/>');
    expect(xml).toContain('<pb n="Bāb al-hamza" facs="#f-umich-isl-22_02"/>');
    expect(xml).toContain('<lb n="1" facs="#z-umich-isl-22_02-l1"/>');
    expect(xml).toMatch(/<fw type="catch" place="bottom" facs="#r-r9">\s*<lb n="3"[^>]*\/>وبرأ\s*<\/fw>/);
  });
  it("keeps the token encoding lossless inside the document", () => {
    const line = xml.split("\n").find((l) => l.includes('<lb n="1"'))!;
    const inner = line.replace(/^\s*<lb[^>]*\/>/, "");
    expect(teiToTokens(inner)).toEqual(tokens);
  });
  it("detects broken XML", () => {
    expect(checkWellFormed("<a><b></a>").ok).toBe(false);
    expect(checkWellFormed("<a>x & y</a>").ok).toBe(false);
    expect(checkWellFormed('<a x="1" x="2"/>').ok).toBe(false);
    expect(checkWellFormed("<a/><b/>").ok).toBe(false);
    expect(checkWellFormed('<?xml version="1.0"?><!-- c --><a x=\'1\'><![CDATA[<>]]>&#x41;</a>').ok).toBe(true);
  });
});

describe("text, JSON and JSONL exports", () => {
  it("plain text has both layers; reading leaves out catchwords and marks", () => {
    const dip = buildTxt(doc, "diplomatic");
    expect(dip).toContain("فصل الباء ع & <x>");
    expect(dip).toContain("وبرأ");
    const rd = buildTxt(doc, "reading");
    expect(rd).toContain("فصل الباء موضع & <x>");
    expect(rd).not.toContain("وبرأ");
    expect(rd).not.toContain("صح");
  });
  it("JSON has both texts per line and absolute image URLs", () => {
    const j = buildJson(doc);
    expect(j.pages[0].lines[0].reading_text).toBe("فصل الباء موضع & <x>");
    expect(j.pages[0].image_url.startsWith("http://localhost:3004/")).toBe(true);
  });
  it("JSONL contains approved lines only, with bbox, text and licence", () => {
    const rows = buildJsonl(doc).trim().split("\n").map((r) => JSON.parse(r));
    expect(rows.map((r) => r.id)).toEqual(["umich-isl-22_02-l1", "l3"]);
    expect(rows[0]).toMatchObject({ bbox: [1, 1, 8, 3], text: "فصل الباء ع & <x>", license: "Public Domain", ai_training_allowed: false });
  });
});
