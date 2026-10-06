/**
 * Open-world discovery: what the verified sources say about something a visitor photographed or searched for
 * when no approved card covers it. Shared by the server pipeline, the API and the UI (no server imports here).
 *
 * Evidence ids:  Q:<sura>:<aya> · H:<bukhari|muslim>:<number> · L:<hadith-book>:<number> · B:<book>:<ref>
 */
import type { VerseView } from "@/components/ui/quran";

export type Relation = "direct" | "thematic";
export type DiscoveryStatus = "ready" | "empty" | "sensitive" | "failed";
export type SubjectCategory = "plant" | "animal" | "food" | "sky" | "landscape" | "water" | "weather" | "object" | "building" | "art" | "text" | "person" | "other";

export interface DiscoverInput {
  label_en: string;
  label_ar: string;
  category?: SubjectCategory | null;
  search_terms_en?: string[];
  search_terms_ar?: string[];
  sensitive?: boolean;
  source: "snap" | "search";
}

export interface Reason { en: string; ar: string }

export interface DiscoveryVerse {
  id: string; // Q:s:a
  verse: VerseView & { sura: number };
  relation: Relation;
  reason: Reason;
  tafsir?: { book_id: string; title_en: string; title_ar: string; author_en: string; author_ar: string; range: string; text: string } | null;
}

export interface DiscoveryHadith {
  id: string; // H:… or L:…
  collection_en: string;
  collection_ar: string;
  number: string;
  numbering_scheme?: string | null;
  text_ar: string;
  text_en: string | null;
  grade: string;
  grade_ar: string;
  grader: string;
  relation: Relation;
  reason: Reason;
  source_url?: string | null;
}

export interface DiscoveryBook {
  id: string; // B:book:ref
  book_id: string;
  title_en: string;
  title_ar: string;
  author_en: string;
  author_ar: string;
  page: number | null;
  text: string;
  machine_read: boolean;
  relation: Relation;
  reason: Reason;
}

export interface DiscoveryScience {
  kind: "scientist" | "instrument" | "work" | "topic";
  id: string;
  name_en: string;
  name_ar: string;
  note: Reason;
  href: string;
}

export interface DiscoveryResult {
  key: string;
  label_en: string;
  label_ar: string;
  category: SubjectCategory | null;
  status: DiscoveryStatus;
  /** What the visitor sees as the trust level: sources found (not yet reviewed), or nothing we'd stand behind. */
  tier: "sources" | "none";
  verses: DiscoveryVerse[];
  hadith: DiscoveryHadith[];
  books: DiscoveryBook[];
  summary: (Reason & { cites: string[] }) | null;
  /** Nothing in the sources names the subject directly (thematic links at most). */
  no_direct_mention: boolean;
  science: DiscoveryScience[];
  /** A published card that covers the subject (the UI links to it). */
  card: { id: string; concept_id: string | null; title_en: string; title_ar: string } | null;
  ai: boolean;
  model: string | null;
  prompt_version: string;
  generated_at: string;
  checks: { id: string; status: "pass" | "fail" | "skip"; detail?: string }[];
  cached?: boolean;
}

export type DiscoverStage = "identify" | "search" | "check" | "compose" | "verify" | "done";
