import type { z } from "zod";
import type { StructuredCall, StructuredResult } from "@/lib/ai/claude";
import type { QuranIndex } from "@/lib/quran/matcher";
import { lintCard } from "@/features/cards/lint";
import { detectQuotes } from "@/features/ms-collab/quran-detect";
import {
  citedIds, DISCOVER_PROMPT_VERSION, JUDGE_SYSTEM, JudgeOut, PROPOSE_SYSTEM, ProposeOut, renderCandidates, REWRITE_SYSTEM, RewriteOut, stripCitations, VERIFY_SYSTEM, VerifyOut,
} from "./ai";
import type {
  DiscoverInput, DiscoverStage, DiscoveryBook, DiscoveryHadith, DiscoveryResult, DiscoveryScience, Reason, Relation,
} from "./types";
import { subjectKey } from "./words";

/** Open-world discovery pipeline (pure orchestration; all I/O comes in through `deps`, so it is unit-testable). */

export type CallFn = <S extends z.ZodType>(req: StructuredCall<S>) => Promise<StructuredResult<z.infer<S>>>;

export interface AyahLite { key: string; sura: number; aya: number; text_uthmani: string; sura_name_ar: string; sura_name_en: string; translation?: { edition_id: string; edition_name: string; text: string } | null }
export interface SahihLite { id: string; collection: "bukhari" | "muslim"; number: string; text_ar: string; text_en: string | null; grade: string; grader: string; numbering_scheme: string; source_url: string | null }
export interface LibHadithLite { id: string; book_id: string; number: string; title_en: string; title_ar: string; text_ar: string; text_en: string | null; grade: string | null; grade_ar: string | null; grader: string | null }
export interface BookLite { id: string; book_id: string; title_en: string; title_ar: string; author_en: string; author_ar: string; page: number | null; text: string; machine_read: boolean }
export interface TafsirLite { book_id: string; title_en: string; title_ar: string; author_en: string; author_ar: string; range: string; text: string }
export interface ScienceLite { kind: DiscoveryScience["kind"]; id: string; name_en: string; name_ar: string }

export interface DiscoverDeps {
  ai: boolean;
  call: CallFn;
  searchQuran(termsAr: string[], termsEn: string[], opts?: { strict?: boolean }): Promise<{ key: string; ar: number; en: number; terms: string[] }[]>;
  getAyat(keys: string[]): Promise<AyahLite[]>;
  searchSahihayn(terms: string[], opts?: { strict?: boolean }): Promise<(SahihLite & { matched: number; terms: string[] })[]>;
  getHadith(ids: string[]): Promise<SahihLite[]>;
  searchLibraryHadith(terms: string[]): Promise<LibHadithLite[]>;
  searchBooks(terms: string[]): Promise<BookLite[]>;
  tafsirFor(verseKey: string): Promise<TafsirLite | null>;
  science(): Promise<ScienceLite[]>;
  quranIndex(): Promise<QuranIndex | null>;
  onStage?: (s: DiscoverStage) => void;
}

const COLL = { bukhari: { en: "Sahih al-Bukhari", ar: "صحيح البخاري" }, muslim: { en: "Sahih Muslim", ar: "صحيح مسلم" } } as const;
const LIMITS = { verses: 5, thematicVerses: 2, hadith: 4, thematicHadith: 2, books: 2, candVerses: 14, candHadith: 10, candBooks: 3 };

/** Terms to search with: the vision step's words plus the label itself (one- or two-word labels). */
export function searchTerms(input: DiscoverInput): { ar: string[]; en: string[] } {
  const ar = new Set((input.search_terms_ar ?? []).map((t) => t.trim()).filter(Boolean));
  const en = new Set((input.search_terms_en ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const la = input.label_ar.trim();
  if (la && la.split(/\s+/).length <= 2) la.split(/\s+/).forEach((w) => ar.add(w));
  const le = input.label_en.trim().toLowerCase().replace(/^(?:a|an|the)\s+/, "");
  if (le && le.split(/\s+/).length <= 2) le.split(/\s+/).forEach((w) => en.add(w));
  return { ar: [...ar].slice(0, 10), en: [...en].slice(0, 8) };
}

/** Deterministic reason: the words actually found (Arabic first). */
const reasonWords = (terms: string[]): Reason => {
  const ar = terms.filter((t) => /[\u0600-\u06FF]/.test(t));
  const en = terms.filter((t) => !/[\u0600-\u06FF]/.test(t));
  const shown = ar.length ? ar.map((w) => `«${w}»`) : en.map((w) => `“${w}”`);
  return { en: `Contains the word ${shown.slice(0, 2).join(" / ")}.`, ar: `ورد فيه لفظ ${(ar.length ? ar : en).slice(0, 2).map((w) => `«${w}»`).join(" / ")}.` };
};

const sahihView = (h: SahihLite, relation: Relation, reason: Reason): DiscoveryHadith => ({
  id: h.id.startsWith("H:") ? h.id : `H:${h.id}`, collection_en: COLL[h.collection].en, collection_ar: COLL[h.collection].ar, number: h.number,
  numbering_scheme: h.numbering_scheme, text_ar: h.text_ar, text_en: h.text_en, grade: h.grade || "Sahih", grade_ar: "صحيح", grader: h.grader || COLL[h.collection].en,
  relation, reason, source_url: h.source_url,
});

const libView = (h: LibHadithLite, relation: Relation, reason: Reason): DiscoveryHadith => ({
  id: h.id, collection_en: h.title_en, collection_ar: h.title_ar, number: h.number, numbering_scheme: null, text_ar: h.text_ar, text_en: h.text_en,
  grade: h.grade ?? "", grade_ar: h.grade_ar ?? h.grade ?? "", grader: h.grader ?? "", relation, reason,
});

export async function discover(input: DiscoverInput, deps: DiscoverDeps): Promise<DiscoveryResult> {
  const t0 = Date.now();
  let tPrev = t0;
  const stage = (s: DiscoverStage) => {
    const now = Date.now();
    timings.push(`${s}@${now - t0}ms(+${now - tPrev})`);
    tPrev = now;
    deps.onStage?.(s);
  };
  const timings: string[] = [];
  const checks: DiscoveryResult["checks"] = [];
  let label_en = input.label_en.trim();
  let label_ar = input.label_ar.trim();
  const base = (): DiscoveryResult => ({
    key: subjectKey(input.label_en, input.label_ar), label_en, label_ar, category: input.category ?? null, status: "empty", tier: "none",
    verses: [], hadith: [], books: [], summary: null, no_direct_mention: true, science: [], card: null, ai: deps.ai, model: null,
    prompt_version: DISCOVER_PROMPT_VERSION, generated_at: new Date().toISOString(), checks,
  });

  // People are never searched or described.
  if (input.category === "person") return { ...base(), status: "sensitive" };

  stage("search");
  const terms = searchTerms(input);
  const allTerms = [...terms.ar, ...terms.en];
  const proposeP = deps.ai
    ? deps.call({ agent: "router", system: PROPOSE_SYSTEM, user: `Subject: ${label_en || "—"} / ${label_ar || "—"}${input.category ? ` (category: ${input.category})` : ""}`, schema: ProposeOut, effort: "low", maxTokens: 600, timeoutMs: 25_000 })
        .catch((e: unknown) => { checks.push({ id: "propose", status: "skip", detail: e instanceof Error ? e.message : "failed" }); return null; })
    : Promise.resolve(null);
  const strict = !deps.ai; // without a judge, only exact word forms count
  const [lex, sahih, lib, books, proposal, scienceList] = await Promise.all([
    deps.searchQuran(terms.ar, terms.en, { strict }),
    deps.searchSahihayn(allTerms, { strict }),
    deps.searchLibraryHadith(allTerms),
    deps.searchBooks(allTerms),
    proposeP,
    deps.science(),
  ]);

  // Candidate verses: model proposals first (validated by fetching), then the strongest lexical hits.
  const proposedKeys = (proposal?.data.quran ?? []).filter((k) => /^\d{1,3}:\d{1,3}$/.test(k));
  const lexKeys = lex.map((h) => h.key);
  const verseKeys = [...new Set([...proposedKeys, ...lexKeys])].slice(0, LIMITS.candVerses);
  const ayat = await deps.getAyat(verseKeys);
  const lexBy = new Map(lex.map((h) => [h.key, h]));
  const proposedHadith = (proposal?.data.hadith ?? []).map((r) => r.trim().toLowerCase()).filter((r) => /^(bukhari|muslim):\d+[a-z]?$/.test(r));
  const fetchedProposed = await deps.getHadith(proposedHadith);
  const sahihCands = [...new Map([...fetchedProposed.map((h) => ({ ...h, matched: 0, terms: [] as string[] })), ...sahih].map((h) => [h.id, h])).values()].slice(0, LIMITS.candHadith - Math.min(lib.length, 3));
  const libCands = lib.slice(0, 3);
  const bookCands = books.slice(0, LIMITS.candBooks);
  checks.push({ id: "candidates", status: "pass", detail: `${ayat.length} verses, ${sahihCands.length + libCands.length} hadith, ${bookCands.length} excerpts (${proposedKeys.length} verse refs proposed)` });

  const result = base();

  if (!deps.ai) {
    // Deterministic: only passages that literally contain the subject's word (said plainly, no relevance claim beyond that).
    // Arabic words decide when the subject has an Arabic name; the English translation alone is not enough.
    const hasAr = terms.ar.length > 0;
    // Words of a multi-word label only count together («شهد العسل» must not match «فمن شهد منكم»);
    // the single-word search terms from the vision step count on their own.
    const single = new Set([...(input.search_terms_ar ?? []), ...(input.search_terms_en ?? []).map((t) => t.toLowerCase())]);
    const labelWords = [input.label_ar, input.label_en.toLowerCase().replace(/^(?:a|an|the)\s+/, "")].map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((w) => w.length > 1);
    const counts = (found: string[]) =>
      found.some((t) => single.has(t) || !labelWords.some((ws) => ws.includes(t))) || labelWords.some((ws) => ws.every((w) => found.includes(w)));
    result.verses = ayat
      .filter((a) => { const h = lexBy.get(a.key); return !!h && (hasAr ? h.ar > 0 : h.en > 0) && counts(h.terms); })
      .slice(0, LIMITS.verses)
      .map((a) => ({ id: `Q:${a.key}`, verse: a, relation: "direct" as const, reason: reasonWords(lexBy.get(a.key)!.terms) }));
    result.hadith = sahih
      .filter((h) => (hasAr ? h.terms.some((t) => /[\u0600-\u06FF]/.test(t)) : h.matched > 0) && counts(h.terms))
      .slice(0, 3)
      .map((h) => sahihView(h, "direct", reasonWords(h.terms)));
    checks.push({ id: "judge", status: "skip", detail: "AI is off: passages that contain the word only" });
  } else {
    stage("check");
    const candidates = [
      ...ayat.map((a) => ({ id: `Q:${a.key}`, label: `Quran ${a.key} (Surah ${a.sura_name_en})`, ar: a.text_uthmani, en: a.translation?.text ?? null })),
      ...sahihCands.map((h) => ({ id: h.id.startsWith("H:") ? h.id : `H:${h.id}`, label: `${COLL[h.collection].en} ${h.number}`, ar: h.text_ar, en: h.text_en })),
      ...libCands.map((h) => ({ id: h.id, label: `${h.title_en} ${h.number} (graded ${h.grade} by ${h.grader})`, ar: h.text_ar, en: h.text_en })),
      ...bookCands.map((b) => ({ id: b.id, label: `${b.title_en}${b.page != null ? `, page ${b.page}` : ""}`, ar: b.text, en: null })),
    ];
    if (!candidates.length) {
      checks.push({ id: "judge", status: "skip", detail: "no candidates" });
    } else {
      const sci = scienceList.slice(0, 120).map((s) => `${s.id} (${s.kind}): ${s.name_en}`).join("\n");
      let judged: JudgeOut | null = null;
      try {
        const r = await deps.call({
          agent: "composer",
          system: JUDGE_SYSTEM,
          user: [
            `Subject: ${label_en || "—"} / ${label_ar || "—"}${input.category ? ` (category: ${input.category})` : ""}${input.sensitive ? " — handle with care: no summary beyond what passages state." : ""}`,
            "", "Candidate passages:", renderCandidates(candidates),
            "", "Muslim-science list (id (kind): name):", sci || "(empty)",
          ].join("\n"),
          schema: JudgeOut,
          effort: "low",
          maxTokens: 3000,
          timeoutMs: 60_000,
        });
        judged = r.data;
        result.model = r.model;
        checks.push({ id: "judge", status: "pass" });
      } catch (e) {
        checks.push({ id: "judge", status: "fail", detail: e instanceof Error ? e.message : "failed" });
      }
      if (judged) {
        if (judged.label_en?.trim()) label_en = judged.label_en.trim().slice(0, 60);
        if (judged.label_ar?.trim()) label_ar = judged.label_ar.trim().slice(0, 60);
        const verdict = new Map(judged.items.filter((i) => i.relation !== "unrelated").map((i) => [i.id, i]));
        const reason = (id: string): Reason => ({ en: (verdict.get(id)?.reason_en ?? "").trim().slice(0, 240), ar: (verdict.get(id)?.reason_ar ?? "").trim().slice(0, 240) });
        const rel = (id: string) => verdict.get(id)?.relation as Relation | undefined;
        const order = (a: { relation: Relation }, b: { relation: Relation }) => (a.relation === b.relation ? 0 : a.relation === "direct" ? -1 : 1);

        const verses = ayat.filter((a) => rel(`Q:${a.key}`)).map((a) => ({ id: `Q:${a.key}`, verse: a, relation: rel(`Q:${a.key}`)!, reason: reason(`Q:${a.key}`) })).sort(order);
        const direct = verses.filter((v) => v.relation === "direct");
        result.verses = [...direct, ...verses.filter((v) => v.relation === "thematic").slice(0, direct.length ? LIMITS.thematicVerses : 3)].slice(0, LIMITS.verses);
        const hadith = [
          ...sahihCands.map((h) => ({ h, id: h.id.startsWith("H:") ? h.id : `H:${h.id}` })).filter((x) => rel(x.id)).map((x) => sahihView(x.h, rel(x.id)!, reason(x.id))),
          ...libCands.filter((h) => rel(h.id)).map((h) => libView(h, rel(h.id)!, reason(h.id))),
        ].sort(order);
        const directH = hadith.filter((h) => h.relation === "direct");
        result.hadith = [...directH, ...hadith.filter((h) => h.relation === "thematic").slice(0, LIMITS.thematicHadith)].slice(0, LIMITS.hadith);
        result.books = bookCands.filter((b) => rel(b.id)).map((b): DiscoveryBook => ({ ...b, relation: rel(b.id)!, reason: reason(b.id) })).sort(order).slice(0, LIMITS.books);

        const scienceById = new Map(scienceList.map((s) => [s.id, s]));
        result.science = judged.science
          .filter((s) => scienceById.has(s.id))
          .map((s) => {
            const e = scienceById.get(s.id)!;
            return { kind: e.kind, id: e.id, name_en: e.name_en, name_ar: e.name_ar, note: { en: s.reason_en.slice(0, 240), ar: s.reason_ar.slice(0, 240) }, href: `/science/${e.kind}/${e.id}` };
          });

        // Summary: only with kept passages, citations limited to them, deterministic lint, no Quran text in prose.
        const kept = new Set([...result.verses, ...result.hadith, ...result.books].map((x) => x.id));
        let summary: DiscoveryResult["summary"] = null;
        const en = stripCitations(judged.summary_en ?? "", kept);
        const ar = stripCitations(judged.summary_ar ?? "", kept);
        const cites = [...new Set([...citedIds(en), ...citedIds(ar)])];
        const rawCites = [...new Set([...citedIds(judged.summary_en ?? ""), ...citedIds(judged.summary_ar ?? "")])];
        const dropped = rawCites.filter((id) => !kept.has(id));
        if (dropped.length && (en || ar)) checks.push({ id: "summary", status: "fail", detail: `cites passages that are not shown: ${dropped.join(", ")}` });
        else if (input.sensitive) checks.push({ id: "summary", status: "skip", detail: "sensitive subject: sources only" });
        else if (!kept.size || !en || !ar) checks.push({ id: "summary", status: "skip", detail: "nothing to summarise" });
        else if (!cites.length) checks.push({ id: "summary", status: "fail", detail: "summary cites no kept passage" });
        else {
          const problemsOf = async (en: string, ar: string): Promise<string[]> => {
            const lint = lintCard({
              level: "B", certainty: "established",
              hadithIds: result.hadith.filter((h) => h.id.startsWith("H:")).map((h) => h.id.slice(2)),
              explanation: { en: en.replace(/\[[^\]]+\]/g, ""), ar: ar.replace(/\[[^\]]+\]/g, "") },
            })
              .filter((w) => w.rule !== "hadith_attribution" || !result.hadith.length)
              // «موضوع» is also the everyday word for "topic": not a grade claim in a summary.
              .filter((w) => !(w.rule === "grade_words" && /^(?:ال)?موضوع/.test(w.match)));
            const ix = await deps.quranIndex();
            const quote = ix ? detectQuotes(ix, [{ line_id: "s", n: 1, text: ar.replace(/\[[^\]]+\]/g, "") }]).find((p) => p.match === "exact") : undefined;
            return [...lint.map((w) => `${w.rule}: «${w.match}»`), ...(quote ? [`Quran wording in the Arabic summary: «${quote.ms_text}» (${quote.verse_keys.join(", ")})`] : [])];
          };
          let cur = { en, ar };
          let problems = await problemsOf(en, ar);
          if (problems.length) {
            checks.push({ id: "lint", status: "fail", detail: problems.join("; ") });
            try {
              const fixed = await deps.call({ agent: "composer", system: REWRITE_SYSTEM, user: `Problems:\n- ${problems.join("\n- ")}\n\nSummary (en): ${en}\nSummary (ar): ${ar}`, schema: RewriteOut, effort: "low", maxTokens: 1200, timeoutMs: 30_000 });
              cur = { en: stripCitations(fixed.data.summary_en, kept), ar: stripCitations(fixed.data.summary_ar, kept) };
              problems = cur.en && cur.ar ? await problemsOf(cur.en, cur.ar) : ["empty after rewrite"];
              checks.push({ id: "rewrite", status: problems.length ? "fail" : "pass", detail: problems.join("; ") || undefined });
            } catch (e) {
              checks.push({ id: "rewrite", status: "fail", detail: e instanceof Error ? e.message : "failed" });
            }
          } else checks.push({ id: "lint", status: "pass" });
          if (!problems.length) {
            const c2 = [...new Set([...citedIds(cur.en), ...citedIds(cur.ar)])];
            if (c2.length) summary = { en: cur.en, ar: cur.ar, cites: c2 };
          }
        }

        if (summary) {
          stage("verify");
          const passages = renderCandidates(candidates.filter((c) => kept.has(c.id)));
          try {
            const v = await deps.call({ agent: "verifier", system: VERIFY_SYSTEM, user: `Passages:\n${passages}\n\nSummary (en): ${summary.en}\nSummary (ar): ${summary.ar}`, schema: VerifyOut, effort: "low", maxTokens: 800, timeoutMs: 30_000 });
            if (v.data.supported) checks.push({ id: "verify", status: "pass" });
            else {
              checks.push({ id: "verify", status: "fail", detail: v.data.problems.join(" | ").slice(0, 500) });
              summary = null;
            }
          } catch (e) {
            checks.push({ id: "verify", status: "fail", detail: e instanceof Error ? e.message : "failed" });
            summary = null; // unverified prose is never shown
          }
        }
        result.summary = summary;
      }
    }
  }

  // Tafsir for each kept verse (verbatim, approved books).
  stage("compose");
  const tafsir = await Promise.all(result.verses.map((v) => deps.tafsirFor(v.verse.key).catch(() => null)));
  result.verses = result.verses.map((v, i) => ({ ...v, tafsir: tafsir[i] }));

  result.label_en = label_en;
  result.label_ar = label_ar;
  result.no_direct_mention = ![...result.verses, ...result.hadith, ...result.books].some((x) => x.relation === "direct");
  const any = result.verses.length + result.hadith.length + result.books.length > 0;
  result.status = input.sensitive && any ? "sensitive" : any ? "ready" : "empty";
  result.tier = any ? "sources" : "none";
  stage("done");
  checks.push({ id: "timing", status: "pass", detail: timings.join(" ") });
  return result;
}
