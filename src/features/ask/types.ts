/**
 * Ask pipeline types — shared by the server pipeline, the API and the client UI.
 * Nothing here imports server code.
 *
 * Evidence ids:  Q:<sura>:<aya> · H:<collection>:<number> · C:<card id> · G:<glossary id> · F:count:<concept> · T:<source>:<verse>
 */
export type Lang = "en" | "ar";
export type Level = "A" | "B" | "C" | "D" | "X";

export type Route =
  | "approved_card" // a published card answers the question (no model)
  | "composed" // AI composer, verified
  | "sources_only" // verifier degraded: only approved sources, no prose
  | "glossary" // deterministic glossary answer (R8 term-lock)
  | "verse" // exact Quran quote found → show the verse
  | "misquote" // near Quran quote → "The verse reads…"
  | "not_in_quran" // asked whether a text is a verse; it is not
  | "hadith_found" // an approved card cites a hadith that states the claim
  | "hadith_none" // no authentic hadith in our sources states this
  | "term_correction" // culturally loaded term corrected with evidence
  | "claim_check" // science-miracle / number-pattern bait: no confirmation
  | "refer_d" // level D: general info + "not a ruling on your case" + referral
  | "decline_x" // out of scope: judging people or groups, private disputes
  | "clarify" // context-dependent question with no context
  | "empty" // no verified reference yet
  | "invalid"; // empty / too long

export type Outcome = "pass" | "revised" | "sources_only" | "referred" | "declined" | "empty";

export type CheckId = "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10" | "L1" | "L2";
export interface Check {
  id: CheckId;
  status: "pass" | "fail" | "warn" | "skip";
  detail?: string;
}

/** Blocks produced by the composer (AI) or by deterministic routes, before rendering. */
export type ComposedBlock =
  | { type: "quote"; ref: string }
  | { type: "hadith"; ref: string }
  | { type: "fact"; ref: string }
  | { type: "explanation"; text: string; cites: string[] }
  | { type: "disagreement"; views: { text: string; cites: string[] }[] }
  | { type: "referral"; reason: string };

export interface VerseView {
  key: string;
  sura: number;
  aya: number;
  text_uthmani: string;
  sura_name_ar: string;
  sura_name_en: string;
  translation?: { edition_id: string; edition_name: string; text: string } | null;
}

export interface HadithView {
  id: string;
  collection: "bukhari" | "muslim";
  collection_en: string;
  collection_ar: string;
  number: string;
  numbering_scheme: string;
  text_ar: string;
  text_en: string | null;
  grade: string;
  grader: string;
  source_url: string | null;
}

export type NoticeKind =
  | "not_ruling"
  | "decline_x"
  | "no_hadith"
  | "no_hadith_unverified"
  | "known_unsupported"
  | "not_in_quran"
  | "verse_found"
  | "misquote"
  | "empty"
  | "framing_science"
  | "framing_numbers"
  | "clarify"
  | "disagreement_intro"
  | "related_card"
  | "false_premise"
  | "sources_only"
  | "length"
  | "context_card"
  | "ruling_general"
  | "consensus_card"
  | "no_consensus_record";

/** Rendered blocks: every Quran/hadith text here comes from the database. */
export type AnswerBlock =
  | { type: "verses"; verses: VerseView[]; role: "primary" | "supporting" }
  | { type: "hadith"; hadith: HadithView }
  | { type: "explanation"; text: string; lang: Lang; cites: string[]; source: "card" | "ai" | "glossary" | "rule" }
  | { type: "tafsir"; book_en: string; book_ar: string; author_en: string; author_ar: string; verse_key: string; excerpt_ar: string; excerpt_en?: string; url?: string }
  | { type: "civilizational"; text: string; lang: Lang; sources: { citation: string; url?: string }[] }
  | { type: "disagreement"; intro: boolean; text?: string; lang: Lang; views: { text: string; cites: string[] }[] }
  | { type: "fact"; label_en: string; label_ar: string; tokens: number; verses: number; rule: string }
  | { type: "glossary"; term: { id: string; term_ar: string; term_en: string; rule_en: string; rule_ar: string; source: string } }
  | { type: "term_lock"; term: string; correction_en: string; correction_ar: string; cites: string[] }
  | { type: "misquote"; input: string; candidates: { verses: string[]; similarity: number; differences: { op: string; given: string; quran: string }[] }[] }
  | { type: "notice"; kind: NoticeKind; tone: "neutral" | "warn" | "ok" | "accent" | "violet"; vars?: Record<string, string> }
  | { type: "referral"; reason: "level_d" | "level_c" | "x" | "sensitive" | "empty" | "ruling"; official: boolean }
  | { type: "help_topics"; topics: string[] }
  | { type: "card_link"; card: { id: string; title_en: string; title_ar: string; kind: string } };

export interface EvidenceChip {
  id: string; // Q:10:5 · H:bukhari:1042 · C:card:moon · G:tawhid
  kind: "quran" | "hadith" | "card" | "glossary" | "fact" | "tafsir";
  label_en: string;
  label_ar: string;
  href?: string;
}

export type Badge =
  | { kind: "approved"; card_id: string; institution_en: string; institution_ar: string; is_demo: boolean }
  | { kind: "ai" }
  | { kind: "glossary"; source: string }
  | { kind: "safety" }
  | { kind: "sources" };

export interface Stage {
  name: "prechecks" | "router" | "retrieve" | "compose" | "verify" | "render";
  ms: number;
}

export interface AskTrace {
  level: Level;
  route: Route;
  intent: string;
  floors: string[]; // which deterministic floors fired (never lowered)
  flags: string[];
  evidence_ids: string[];
  dropped_ids: string[]; // ids proposed by the router that were not in the catalogue
  checks: Check[];
  retrieval: { id: string; score: number; coverage: number }[];
  stages: Stage[];
  latency_ms: number;
  ai: { enabled: boolean; models: string[]; calls: number; usage?: { input_tokens: number; output_tokens: number } ; error?: string };
  revised: boolean;
  composed?: ComposedBlock[]; // raw composer blocks (AI path)
}

export interface AskResult {
  id: string;
  question: string; // PII-redacted
  lang: Lang;
  level: Level;
  intent: string;
  route: Route;
  outcome: Outcome;
  badge: Badge;
  title?: { en: string; ar: string } | null; // e.g. the approved card's question
  related: boolean; // the card answers a closely related question, not exactly this one
  blocks: AnswerBlock[];
  evidence: EvidenceChip[];
  card?: { id: string; title_en: string; title_ar: string; kind: string } | null;
  canRequestTopic: boolean;
  trace: AskTrace;
}

export interface AskOptions {
  lang: Lang; // UI language (used when the question has no letters to detect from)
  cardId?: string | null; // "Asking about: …" context
  persistTrace?: boolean; // default true; the evaluator turns it off
  /** Called as each stage completes (honest progress for the UI stream). */
  onStage?: (stage: Stage["name"]) => void;
}

export const LEVEL_ORDER: Record<Exclude<Level, "X">, number> = { A: 0, B: 1, C: 2, D: 3 };
