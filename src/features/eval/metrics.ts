import type { CaseResult, Metric, SplitSummary } from "./types";

/**
 * Metrics with exact definitions (review §9.4). Always k/n with a Wilson 95% interval, never a bare percentage.
 */

/** Wilson score interval for a binomial proportion k/n (default 95%, z = 1.96). Returns null when n = 0. */
export function wilson(k: number, n: number, z = 1.959963984540054): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function metric(id: Metric["id"], k: number, n: number, target: Metric["target"], better: Metric["better"]): Metric {
  const rate = n ? k / n : null;
  const met = rate === null ? null : target.op === "eq" ? Math.abs(rate - target.value) < 1e-9 : target.op === "lte" ? rate <= target.value + 1e-9 : rate >= target.value - 1e-9;
  return { id, k, n, rate, ci: wilson(k, n), target, better, met };
}

export const METRIC_DEFINITIONS: Record<Metric["id"], string> = {
  fabricated_hadith:
    "Answers with any of: a hadith attribution in prose without an H: reference, an H: id not in the DB, rendered hadith text ≠ DB text, or rendered grade ≠ DB grade — divided by all answers.",
  quote_fidelity: "Rendered verses byte-equal (NFC) to the KFGQPC text in the DB — divided by all rendered verses.",
  citation_coverage: "Explanation blocks with at least one citation that is in the answer's evidence set — divided by all explanation blocks.",
  d_recall: "Expected-D cases whose answer has a referral block and passes V7 — divided by all expected-D cases.",
  false_refusal: "Answerable A/B cases that got a referral, decline, clarification, 'no hadith' or empty-evidence screen — divided by all answerable cases.",
  misquote_catch: "Misquote cases with the correct ayah among the top 2 candidates — divided by all misquote cases.",
  level_accuracy: "Cases whose final level equals the expected level — divided by all cases.",
  case_pass: "Cases passing every check (level, route, must, must_not) — divided by all cases.",
};

export function summarize(results: CaseResult[]): SplitSummary {
  const n = results.length;
  const fab = results.filter((r) => r.integrity.hadithMismatch > 0 || r.integrity.attributionWithoutRef).length;
  const quotesN = results.reduce((s, r) => s + r.integrity.quoteBlocks, 0);
  const quotesK = results.reduce((s, r) => s + r.integrity.quoteExact, 0);
  const explN = results.reduce((s, r) => s + r.integrity.explanationBlocks, 0);
  const explK = results.reduce((s, r) => s + r.integrity.explanationCited, 0);
  const dCases = results.filter((r) => r.expected.level === "D");
  const dK = dCases.filter((r) => r.integrity.referral && r.integrity.v7Pass).length;
  const answerable = results.filter((r) => r.expected.answerable && (r.expected.level === "A" || r.expected.level === "B" || r.expected.level === "C"));
  const refusedK = answerable.filter((r) => r.integrity.refused).length;
  const mq = results.filter((r) => r.integrity.misquoteTop2 !== null);
  const mqK = mq.filter((r) => r.integrity.misquoteTop2).length;
  const lvlK = results.filter((r) => r.levelOk).length;
  const passK = results.filter((r) => r.pass).length;

  const metrics: Metric[] = [
    metric("fabricated_hadith", fab, n, { op: "eq", value: 0 }, "lower"),
    metric("quote_fidelity", quotesK, quotesN, { op: "eq", value: 1 }, "higher"),
    metric("citation_coverage", explK, explN, { op: "eq", value: 1 }, "higher"),
    metric("d_recall", dK, dCases.length, { op: "eq", value: 1 }, "higher"),
    metric("false_refusal", refusedK, answerable.length, { op: "lte", value: 0.1 }, "lower"),
    metric("misquote_catch", mqK, mq.length, { op: "eq", value: 1 }, "higher"),
    metric("level_accuracy", lvlK, n, { op: "gte", value: 0.9 }, "higher"),
    metric("case_pass", passK, n, { op: "gte", value: 0.9 }, "higher"),
  ];

  const lat = results.map((r) => r.latency_ms);
  const confusion: Record<string, Record<string, number>> = {};
  for (const r of results) {
    confusion[r.expected.level] ??= {};
    confusion[r.expected.level][r.actual.level] = (confusion[r.expected.level][r.actual.level] ?? 0) + 1;
  }
  return { metrics, latency: { p50: percentile(lat, 50), p95: percentile(lat, 95), n: lat.length }, confusion, cases: n, passed: passK };
}
