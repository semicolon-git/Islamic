import type { Level, Route } from "@/features/ask/types";

/** Evaluation set and results (review §9.3–9.5). Shared by the runner, the CLI and the portal page. */
export type CheckSpec =
  | { cites: string }
  | { cites_any: string[] }
  | { block: string }
  | { block_any: string[] }
  | { notice: string }
  | { notice_any: string[] }
  | { prose: string }
  | { text: string };

export interface EvalCase {
  id: string;
  bucket: "r6" | "level_d" | "red_team" | "over_refusal" | "general";
  split: "dev" | "heldout";
  lang: "en" | "ar";
  question: string;
  context_card?: string;
  expect: { level: Level; routes: Route[]; answerable: boolean; verse_top2?: string };
  must: CheckSpec[];
  must_not: CheckSpec[];
  note?: string;
}

export interface CheckOutcome {
  label: string; // human-readable spec, e.g. "must cites Q:2:144"
  ok: boolean;
}

export interface CaseResult {
  id: string;
  bucket: EvalCase["bucket"];
  split: EvalCase["split"];
  lang: EvalCase["lang"];
  question: string;
  expected: { level: Level; routes: Route[]; answerable: boolean };
  actual: { level: Level; route: Route; outcome: string; badge: string };
  pass: boolean;
  levelOk: boolean;
  routeOk: boolean;
  checks: CheckOutcome[];
  failures: string[];
  /** Integrity facts used by the metrics (computed against the database). */
  integrity: {
    hadithBlocks: number;
    hadithMismatch: number; // id missing, text or grade differs from DB
    attributionWithoutRef: boolean; // prose attributes a saying to the Prophet without an H: citation
    quoteBlocks: number; // rendered verses
    quoteExact: number; // byte-equal (NFC) to DB
    explanationBlocks: number;
    explanationCited: number; // with ≥ 1 citation that is in the evidence set
    referral: boolean;
    v7Pass: boolean;
    refused: boolean; // referral / decline / empty / clarify / hadith_none
    misquoteTop2: boolean | null; // null when the case has no verse_top2 expectation
  };
  latency_ms: number;
  trace: {
    floors: string[];
    flags: string[];
    evidence_ids: string[];
    checks: { id: string; status: string; detail?: string }[];
    retrieval: { id: string; coverage: number }[];
    blocks: string[];
    ai: { enabled: boolean; calls: number };
  };
}

export interface Metric {
  id: "fabricated_hadith" | "quote_fidelity" | "citation_coverage" | "d_recall" | "false_refusal" | "misquote_catch" | "level_accuracy" | "case_pass";
  k: number;
  n: number;
  rate: number | null;
  ci: [number, number] | null;
  target: { op: "eq" | "lte" | "gte"; value: number };
  better: "lower" | "higher";
  met: boolean | null;
}

export interface SplitSummary {
  metrics: Metric[];
  latency: { p50: number; p95: number; n: number };
  confusion: Record<string, Record<string, number>>; // expected → actual → count
  cases: number;
  passed: number;
}

export interface EvalRun {
  id: string;
  created_at: string;
  run_by: string | null;
  ai_enabled: boolean;
  dataset_version: string;
  summary: { all: SplitSummary; dev: SplitSummary; heldout: SplitSummary };
  results: CaseResult[];
}
