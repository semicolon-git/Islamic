import { sql } from "@/lib/db";
import { answerQuestion } from "@/features/ask/server";
import type { AskDeps } from "@/features/ask/pipeline";
import type { AskResult } from "@/features/ask/types";
import { RE_HADITH_ATTRIBUTION } from "@/features/ask/validators";
import { newId } from "@/lib/ids";
import { evaluateChecks, misquoteTop2 } from "./checks";
import { summarize } from "./metrics";
import type { CaseResult, EvalCase, EvalRun } from "./types";
import dataset from "../../../data/eval/cases.json";

/**
 * Runs the evaluation set through the real pipeline, in-process, against the seeded database.
 * Traces are not persisted for eval runs; the answer cache is not used (there is none).
 */
export const CASES = (dataset as unknown as { version: string; cases: EvalCase[] }).cases;
export const DATASET_VERSION = (dataset as unknown as { version: string }).version;

const REFUSED = new Set(["refer_d", "decline_x", "empty", "clarify", "hadith_none", "invalid"]);

async function integrity(c: EvalCase, r: AskResult): Promise<CaseResult["integrity"]> {
  const verseBlocks = r.blocks.flatMap((b) => (b.type === "verses" ? b.verses : []));
  const hadithBlocks = r.blocks.flatMap((b) => (b.type === "hadith" ? [b.hadith] : []));
  const [dbVerses, dbHadith] = await Promise.all([
    verseBlocks.length ? sql<{ key: string; text_uthmani: string }>("select key, text_uthmani from quran_ayah where key = any($1::text[])", [verseBlocks.map((v) => v.key)]) : [],
    hadithBlocks.length ? sql<{ id: string; text_ar: string; text_en: string | null; grade: string }>("select id, text_ar, text_en, grade from hadith where id = any($1::text[])", [hadithBlocks.map((h) => h.id)]) : [],
  ]);
  const vmap = new Map(dbVerses.map((v) => [v.key, v.text_uthmani.normalize("NFC")]));
  const hmap = new Map(dbHadith.map((h) => [h.id, h]));
  const quoteExact = verseBlocks.filter((v) => vmap.get(v.key) === v.text_uthmani.normalize("NFC")).length;
  const hadithMismatch = hadithBlocks.filter((h) => {
    const db = hmap.get(h.id);
    return !db || db.text_ar !== h.text_ar || (db.text_en ?? null) !== (h.text_en ?? null) || db.grade !== h.grade;
  }).length;
  const expl = r.blocks.flatMap((b) => (b.type === "explanation" ? [b] : []));
  const ev = new Set(r.trace.evidence_ids);
  const attributionWithoutRef = expl.some((b) => RE_HADITH_ATTRIBUTION.test(b.text) && !b.cites.some((x) => x.startsWith("H:")));
  return {
    hadithBlocks: hadithBlocks.length,
    hadithMismatch,
    attributionWithoutRef,
    quoteBlocks: verseBlocks.length,
    quoteExact,
    explanationBlocks: expl.length,
    explanationCited: expl.filter((b) => b.cites.some((x) => ev.has(x))).length,
    referral: r.blocks.some((b) => b.type === "referral"),
    v7Pass: !r.trace.checks.some((x) => x.id === "V7" && x.status === "fail"),
    refused: REFUSED.has(r.route),
    misquoteTop2: c.expect.verse_top2 ? misquoteTop2(r, c.expect.verse_top2) : null,
  };
}

export async function runCase(c: EvalCase, overrides: Partial<AskDeps> = {}): Promise<CaseResult> {
  const r = await answerQuestion(c.question, { lang: c.lang, cardId: c.context_card ?? null, persistTrace: false }, overrides);
  const ev = evaluateChecks(c, r);
  const pass = ev.failures.length === 0;
  return {
    id: c.id,
    bucket: c.bucket,
    split: c.split,
    lang: c.lang,
    question: c.question,
    expected: { level: c.expect.level, routes: c.expect.routes, answerable: c.expect.answerable },
    actual: { level: r.level, route: r.route, outcome: r.outcome, badge: r.badge.kind },
    pass,
    levelOk: ev.levelOk,
    routeOk: ev.routeOk,
    checks: ev.checks,
    failures: ev.failures,
    integrity: await integrity(c, r),
    latency_ms: r.trace.latency_ms,
    trace: {
      floors: r.trace.floors,
      flags: r.trace.flags,
      evidence_ids: r.trace.evidence_ids,
      checks: r.trace.checks,
      retrieval: r.trace.retrieval.map((h) => ({ id: h.id, coverage: h.coverage })),
      blocks: r.blocks.map((b) => (b.type === "notice" ? `notice:${b.kind}` : b.type === "verses" ? `verses:${b.verses.map((v) => v.key).join(",")}` : b.type === "hadith" ? `hadith:${b.hadith.id}` : b.type === "referral" ? `referral:${b.reason}` : b.type)),
      ai: { enabled: r.trace.ai.enabled, calls: r.trace.ai.calls },
    },
  };
}

export async function runEval(opts: { runBy?: string | null; cases?: EvalCase[]; overrides?: Partial<AskDeps> } = {}): Promise<EvalRun> {
  const cases = opts.cases ?? CASES;
  const results: CaseResult[] = [];
  // warm-up: build the Quran index and catalogue once so the first case's latency isn't the cold start
  await answerQuestion("warm up", { lang: "en", persistTrace: false }, opts.overrides);
  for (const c of cases) results.push(await runCase(c, opts.overrides));
  return {
    id: newId("eval"),
    created_at: new Date().toISOString(),
    run_by: opts.runBy ?? null,
    ai_enabled: results.some((r) => r.trace.ai.enabled),
    dataset_version: DATASET_VERSION,
    summary: {
      all: summarize(results),
      dev: summarize(results.filter((r) => r.split === "dev")),
      heldout: summarize(results.filter((r) => r.split === "heldout")),
    },
    results,
  };
}
