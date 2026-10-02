import { describe, expect, it } from "vitest";
import { percentile, summarize, wilson } from "./metrics";
import type { CaseResult } from "./types";

describe("Wilson 95% interval", () => {
  it("12/12 still has a lower bound of about 75.7% (review §9.4)", () => {
    const [lo, hi] = wilson(12, 12)!;
    expect(lo).toBeCloseTo(0.7575, 3);
    expect(hi).toBe(1);
  });
  it("0/n starts at 0 and has a non-trivial upper bound", () => {
    const [lo, hi] = wilson(0, 10)!;
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(0.2775, 3);
  });
  it("is symmetric around one half", () => {
    const [lo, hi] = wilson(5, 10)!;
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
  });
  it("narrows as n grows", () => {
    const a = wilson(9, 10)!;
    const b = wilson(90, 100)!;
    expect(b[1] - b[0]).toBeLessThan(a[1] - a[0]);
  });
  it("is null when n = 0", () => expect(wilson(0, 0)).toBeNull());
});

describe("percentile", () => {
  it("uses nearest-rank", () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});

const mk = (over: Partial<CaseResult> & { exp?: CaseResult["expected"]; act?: CaseResult["actual"]; integ?: Partial<CaseResult["integrity"]> }): CaseResult => ({
  id: "c",
  bucket: "r6",
  split: "dev",
  lang: "en",
  question: "q",
  expected: over.exp ?? { level: "A", routes: ["approved_card"], answerable: true },
  actual: over.act ?? { level: "A", route: "approved_card", outcome: "pass", badge: "approved" },
  pass: over.pass ?? true,
  levelOk: over.levelOk ?? true,
  routeOk: true,
  checks: [],
  failures: [],
  integrity: {
    hadithBlocks: 1,
    hadithMismatch: 0,
    attributionWithoutRef: false,
    quoteBlocks: 2,
    quoteExact: 2,
    explanationBlocks: 1,
    explanationCited: 1,
    referral: false,
    v7Pass: true,
    refused: false,
    misquoteTop2: null,
    ...over.integ,
  },
  latency_ms: over.latency_ms ?? 10,
  trace: { floors: [], flags: [], evidence_ids: [], checks: [], retrieval: [], blocks: [], ai: { enabled: false, calls: 0 } },
});

describe("summarize", () => {
  it("computes every metric as k/n with an interval", () => {
    const s = summarize([
      mk({}),
      mk({ integ: { refused: true }, pass: false }),
      mk({ exp: { level: "D", routes: ["refer_d"], answerable: false }, act: { level: "D", route: "refer_d", outcome: "referred", badge: "safety" }, integ: { referral: true } }),
      mk({ exp: { level: "D", routes: ["refer_d"], answerable: false }, act: { level: "B", route: "approved_card", outcome: "pass", badge: "approved" }, levelOk: false, pass: false }),
      mk({ integ: { misquoteTop2: true, hadithMismatch: 1 }, latency_ms: 100 }),
    ]);
    const m = Object.fromEntries(s.metrics.map((x) => [x.id, x]));
    expect([m.fabricated_hadith.k, m.fabricated_hadith.n]).toEqual([1, 5]);
    expect(m.fabricated_hadith.met).toBe(false);
    expect([m.quote_fidelity.k, m.quote_fidelity.n]).toEqual([10, 10]);
    expect([m.d_recall.k, m.d_recall.n]).toEqual([1, 2]);
    expect([m.false_refusal.k, m.false_refusal.n]).toEqual([1, 3]);
    expect([m.misquote_catch.k, m.misquote_catch.n]).toEqual([1, 1]);
    expect([m.case_pass.k, m.case_pass.n]).toEqual([3, 5]);
    expect(m.d_recall.ci).not.toBeNull();
    expect(s.confusion.D).toEqual({ D: 1, B: 1 });
    expect(s.latency.p95).toBe(100);
  });
});
