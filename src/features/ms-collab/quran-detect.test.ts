import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIndex, type QuranIndex } from "@/lib/quran/matcher";
import { orderLines } from "../manuscripts/geometry";
import { readingText, type Tok } from "../manuscripts/tokens";
import { detectQuotes, quoteDiff, type PageLineText } from "./quran-detect";

/**
 * Detection on the seeded lines: the machine draft every page starts from (data/manuscripts/<ms>/drafts) — the same
 * reading layer the Studio shows — against the pinned KFGQPC Ḥafṣ text (prep/data/raw, see BUILDERS.md setup).
 */
const ROOT = process.cwd();
let ix: QuranIndex;

beforeAll(() => {
  const raw = path.join(ROOT, "prep/data/raw/quran_kfgqpc_hafs_v18.json");
  if (!fs.existsSync(raw)) throw new Error("Missing prep/data/raw — copy the pinned sources first (BUILDERS.md §0).");
  const rows = JSON.parse(fs.readFileSync(raw, "utf8")) as { sora: number; aya_no: number; aya_text: string; aya_text_emlaey: string; sora_name_ar: string; sora_name_en: string }[];
  ix = buildIndex(rows.map((r) => ({ key: `${r.sora}:${r.aya_no}`, sura: r.sora, aya: r.aya_no, text_emlaey: r.aya_text_emlaey, text_uthmani: r.aya_text, sura_name_ar: r.sora_name_ar, sura_name_en: r.sora_name_en })));
});

/** A seeded page's lines in reading order (as the seed and the Studio order them), with the draft's reading text. */
function seededPage(ms: string, page: string): PageLineText[] {
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, "data/manuscripts", ms, "pages", `${page}.json`), "utf8")) as {
    regions: { id: string }[]; lines: { id: string; region_id: string | null; order: number }[];
  };
  const draft = JSON.parse(fs.readFileSync(path.join(ROOT, "data/manuscripts", ms, "drafts", `${page}.claude.json`), "utf8")) as { lines: { line_id: string; tokens: Tok[] }[] };
  const toks = new Map(draft.lines.map((l) => [l.line_id, l.tokens]));
  const first = new Map<string, number>();
  for (const l of pj.lines) if (l.region_id && !first.has(l.region_id)) first.set(l.region_id, l.order);
  const regions = pj.regions.map((r) => ({ id: r.id, seq: first.get(r.id) ?? 999 }));
  const lines = orderLines(pj.lines.map((l) => ({ ...l, seq: l.order })), regions);
  return lines.map((l, i) => ({ line_id: `${page}-${l.id}`, n: i + 1, text: readingText(toks.get(l.id) ?? []) }));
}

describe("Quran-quote detection on seeded lines", () => {
  it("finds Q 43:15 inside the entry جزأ in the BnF copy (page 03, line l26) — and nothing else", () => {
    const found = detectQuotes(ix, seededPage("bnf-arabe-5341", "bnf-arabe-5341_03"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ verse_keys: ["43:15"], match: "exact", partial: true, line_ids: ["bnf-arabe-5341_03-l26"] });
    expect(found[0].ms_text).toContain("وجعلوا له من عباده");
  });

  it("finds the same verse in the Michigan copy (page 02, line l33)", () => {
    const found = detectQuotes(ix, seededPage("umich-isl-22", "umich-isl-22_02"));
    expect(found.map((f) => [f.verse_keys.join(), f.line_ids.join()])).toEqual([["43:15", "umich-isl-22_02-l33"]]);
  });

  it("finds it in the Berlin copy too (page 03), on the reading text joined across line breaks", () => {
    const found = detectQuotes(ix, seededPage("sbb-or-fol-215", "sbb-or-fol-215_03"));
    expect(found).toHaveLength(1);
    expect(found[0].verse_keys).toEqual(["43:15"]);
    expect(found[0].line_ids[0]).toBe("sbb-or-fol-215_03-l12");
  });

  it("finds no quotation on a page without one (no false positives)", () => {
    expect(detectQuotes(ix, seededPage("bnf-arabe-5341", "bnf-arabe-5341_01"))).toEqual([]);
  });

  it("joins a quote that runs over a line break into one proposal", () => {
    const found = detectQuotes(ix, [
      { line_id: "x-1", n: 1, text: "قال تعالى وجعلوا له" },
      { line_id: "x-2", n: 2, text: "من عباده جزءا أي إناثا" },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ verse_keys: ["43:15"], line_ids: ["x-1", "x-2"], from_n: 1, to_n: 2, cue: true });
  });

  it("does not treat liturgical formulae as quotations", () => {
    expect(detectQuotes(ix, [{ line_id: "f", n: 1, text: "بسم الله الرحمن الرحيم الحمد لله على نعمه" }])).toEqual([]);
  });
});

describe("neutral diff against the standard text", () => {
  const std = "وجعلوا له من عباده جزءا إن الإنسان لكفور مبين";
  it("compares only the quoted part; vowel signs are not differences", () => {
    const d = quoteDiff("وَجَعَلُوا لَهُ مِنْ عِبَادِهِ جُزْءًا", std);
    expect(d.map((x) => x.op)).toEqual(["same", "same", "same", "same", "same"]);
  });

  it("labels spelling (hamza/alef) apart from real differences — never 'error'", () => {
    const d = quoteDiff("وجعلوا لهو من عبيده جزأ", std);
    expect(d.map((x) => x.op)).toEqual(["same", "differs", "same", "differs", "spelling"]);
    expect(d[1]).toEqual({ op: "differs", ms: "لهو", std: "له" });
  });

  it("reports missing and extra words", () => {
    const d = quoteDiff("وجعلوا من عباده جزءا", std);
    expect(d.filter((x) => x.op !== "same")).toEqual([{ op: "missing", ms: "", std: "له" }]);
  });
});
