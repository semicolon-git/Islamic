import "server-only";
import { q, tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/claude";
import { quranIndex } from "@/lib/quran";
import type { QuranIndex } from "@/lib/quran/matcher";
import type { GlossaryTerm } from "@/lib/glossary";
import { searchForm } from "../../manuscripts/text";
import { plainText, type Tok } from "../../manuscripts/tokens";
import { aiGloss } from "../explain-ai";
import type { ExplainResult } from "../types";
import { lineCtx, pageCtx } from "./core";
import { readingLines } from "./understanding";

/** Reading text with uncertain words marked [?] (for the AI prompt only). */
const markedReading = (toks: Tok[]) =>
  toks.map((k) => (k.t === "unclear" ? `${k.v}[?]` : k.t === "gap" ? "[…]" : k.t === "mark" || k.t === "del" ? "" : k.t === "abbr" ? (k.confirmed === false ? k.v : k.expan) : k.v)).join("").replace(/\s+/g, " ").trim();

/**
 * "Explain this line": the deterministic parts always (reading layer, confirmed Quran/hadith references, abbreviation
 * expansions, glossary terms); an AI gloss only when asked and a key is configured — labelled "AI draft — not reviewed".
 */
export async function explainLine(_user: SessionUser, lineId: string, wantAi: boolean): Promise<ExplainResult> {
  let ix: QuranIndex | null = null;
  if (wantAi) ix = await quranIndex().catch(() => null);
  const base = await tx(async (qb) => {
    const line = await lineCtx(qb, lineId);
    const page = await pageCtx(qb, line.page_id);
    const lines = await readingLines(qb, line.page_id);
    const i = lines.findIndex((l) => l.id === lineId);
    const me = lines[i];
    const ms = (await q<{ genre: string; title_en: string }>(qb, "select genre, title_en from manuscripts where id = $1", [page.manuscript_id]))[0];
    const quotes = await q<{ data: { verse_keys: string[]; line_ids: string[]; sura_name_ar: string; sura_name_en: string }; anchor_text: string }>(qb,
      "select data, anchor_text from ms_annotations where page_id = $1 and kind = 'quran' and status = 'confirmed'", [line.page_id]);
    const hadith = await q<{ data: { hadith_id?: string } }>(qb, "select data from ms_annotations where line_id = $1 and kind = 'hadith' and status = 'confirmed'", [lineId]);
    const hadithRows = hadith.length
      ? await q<{ id: string; collection: string; number: string; grade: string }>(qb, "select id, collection, number, grade from hadith where id = any($1::text[])", [hadith.map((h) => h.data.hadith_id).filter(Boolean)])
      : [];
    const terms = await q<GlossaryTerm>(qb, "select * from glossary_terms where status = 'approved'");
    const form = ` ${searchForm(me.reading)} `;
    return {
      line, page, me, prev: lines[i - 1], next: lines[i + 1], ms,
      quotes: quotes.filter((x) => (x.data.line_ids ?? []).includes(lineId)),
      hadith: hadithRows,
      terms: terms.filter((t) => [t.term_ar, ...t.variants].filter((v) => /[؀-ۿ]/.test(v)).some((v) => searchForm(v).length >= 3 && form.includes(` ${searchForm(v)} `))),
    };
  });
  const toks = base.me.tokens;
  const abbreviations = toks.filter((k): k is Extract<Tok, { t: "abbr" }> => k.t === "abbr").map((k) => ({ written: k.v, expan: k.expan, confirmed: k.confirmed !== false }));
  const verseKeys = [...new Set(base.quotes.flatMap((x) => x.data.verse_keys))];
  const ai = wantAi
    ? await aiGloss({
        reading: markedReading(toks), genre: base.ms?.genre ?? "general", work: base.ms?.title_en ?? "",
        abbreviations: abbreviations.filter((a) => a.confirmed), verseKeys,
        prevLine: base.prev ? markedReading(base.prev.tokens) : undefined, nextLine: base.next ? markedReading(base.next.tokens) : undefined,
      }, ix)
    : { available: false as const };
  return {
    line_id: lineId,
    line_n: base.me.n,
    reading: base.me.reading,
    diplomatic: plainText(toks),
    tokens: toks,
    abbreviations,
    quotes: base.quotes.map((x) => ({ verse_keys: x.data.verse_keys, sura_name_ar: x.data.sura_name_ar, sura_name_en: x.data.sura_name_en, ms_text: x.anchor_text })),
    hadith: base.hadith,
    terms: base.terms.map((t) => ({ term_ar: t.term_ar, term_en: t.term_en, rule_en: t.rule_en, rule_ar: t.rule_ar })),
    uncertain: toks.filter((k) => k.t === "unclear").length,
    ai: "failure" in ai ? { available: true, failure: ai.failure } : ai.available ? { available: true, gloss_en: ai.gloss_en, gloss_ar: ai.gloss_ar, model: ai.model } : { available: aiEnabled() },
  };
}
