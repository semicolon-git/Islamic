/** DTOs shared by the collaboration API and UI. */
import type { Role } from "@/lib/auth";
import type { Status } from "@/lib/workflow";
import type { Polygon } from "../manuscripts/geometry";
import type { Tok } from "../manuscripts/tokens";
import type { VersionKind } from "../manuscripts/types";
import type { ApparatusEntry } from "./collation";
import type { CantRead, Keying } from "./hard-words";
import type { QuoteClass, WordDiff } from "./quran-detect";

// ───────────────────────────────────────────── Tasks / "My work"

export type TaskKind = "transcribe" | "verify" | "double_key" | "review";
export type Priority = "low" | "normal" | "high";

export interface TaskDTO {
  id: string;
  kind: TaskKind;
  status: "open" | "done" | "cancelled";
  priority: Priority;
  due_at: string | null;
  note: string | null;
  created_at: string;
  done_at: string | null;
  page_id: string;
  page_seq: number;
  page_label: string | null;
  page_status: Status;
  thumb: string | null;
  ms_id: string;
  ms_title_en: string;
  ms_title_ar: string;
  siglum: string | null;
  assignee: { id: string; name_en: string; name_ar: string; hue: number } | null;
  created_by: { id: string; name_en: string; name_ar: string } | null;
  /** Lines in scope (the task's lines, or the whole page). */
  total: number;
  /** Lines in scope that a person has checked (any human version). */
  touched: number;
  /** Deep link to the first line still to do, and that line's number in reading order. */
  continue_href: string;
  continue_n: number | null;
  /** The page left the student's hands (submitted, approved or published). */
  submitted: boolean;
}

export interface ReviewQueueItem {
  page_id: string;
  page_seq: number;
  page_label: string | null;
  status: Status;
  thumb: string | null;
  ms_id: string;
  ms_title_en: string;
  ms_title_ar: string;
  siglum: string | null;
  submitted_by: { name_en: string; name_ar: string; hue: number } | null;
  submitted_at: string | null;
  lines_total: number;
  lines_changed: number;
  open_suggestions: number;
  open_comments: number;
}

export interface MentionItem {
  id: string;
  page_id: string;
  ms_id: string;
  line_id: string | null;
  line_n: number | null;
  body: string;
  author_en: string;
  author_ar: string;
  created_at: string;
}

export interface SuggestionInboxItem {
  id: string;
  page_id: string;
  ms_id: string;
  line_id: string;
  line_n: number;
  author_en: string;
  author_ar: string;
  reason: string | null;
  created_at: string;
}

export interface QueueData {
  role: Role;
  user_id: string;
  tasks: TaskDTO[];
  done: TaskDTO[];
  reviews: ReviewQueueItem[];
  publish: ReviewQueueItem[];
  hard: { to_key: number; disputed: number };
  mentions: MentionItem[];
  suggestions: SuggestionInboxItem[];
}

export interface AssignablePage {
  id: string;
  seq: number;
  label: string | null;
  status: Status;
  thumb: string | null;
  lines_total: number;
  lines_human: number;
  owner: { id: string; name_en: string; name_ar: string } | null;
}

export interface AssignData {
  manuscripts: { id: string; title_en: string; title_ar: string; siglum: string | null; shelfmark: string | null; pages: AssignablePage[] }[];
  students: { id: string; name_en: string; name_ar: string; hue: number; open_tasks: number }[];
  open: TaskDTO[];
}

// ───────────────────────────────────────────── Hard words

export interface HardWordCard {
  id: string;
  page_id: string;
  line_id: string;
  ms_id: string;
  ms_title_en: string;
  ms_title_ar: string;
  siglum: string | null;
  page_seq: number;
  page_label: string | null;
  line_n: number;
  zone: string | null;
  image: { src: string; width: number; height: number };
  polygon: Polygon;
  baseline: Polygon | null;
  /** Estimated position of the word in the line (approximate; null for vertical glosses). */
  approx_box: { x: number; y: number; w: number; h: number } | null;
  /** Line text before and after the masked word. */
  before: string;
  after: string;
  /** Someone else already read this word (yours completes the pair). */
  second: boolean;
  remaining: number;
}

export interface KeyResult {
  outcome: "waiting" | "agreed" | "disputed" | "stale";
  mine: Keying;
  other: Keying | null;
  machine: string;
  alts: string[];
  conf: number | null;
  source: "machine" | "person";
  final?: string | null;
  final_gap?: CantRead | null;
  vowels_differ?: boolean;
}

export interface AdjudicationItem extends HardWordCard {
  machine: string;
  alts: string[];
  conf: number | null;
  source: "machine" | "person";
  status: "open" | "agreed" | "disputed" | "resolved" | "stale";
  final_text: string | null;
  final_gap: CantRead | null;
  readings: { author_id: string; name_en: string; name_ar: string; hue: number; reading: string | null; cant_read: CantRead | null; at: string }[];
  can_decide: boolean;
}

// ───────────────────────────────────────────── Workspace collaboration

export interface SuggestionDTO {
  id: string;
  line_id: string;
  line_n: number;
  base_version: number;
  current_version: number;
  tokens: Tok[];
  plain_text: string;
  current_text: string;
  reason: string | null;
  status: "open" | "accepted" | "rejected" | "superseded";
  author: { id: string; name_en: string; name_ar: string; hue: number };
  reviewer: { name_en: string; name_ar: string } | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  can_review: boolean;
  review_block: string | null;
}

export interface CommentDTO {
  id: string;
  line_id: string | null;
  parent_id: string | null;
  anchor: { from: number; to: number; text: string } | null;
  body: string;
  mentions: string[];
  resolved: boolean;
  author: { id: string; name_en: string; name_ar: string; hue: number; role: Role };
  resolved_by: { name_en: string; name_ar: string } | null;
  created_at: string;
  can_resolve: boolean;
}

export interface PresenceUser {
  id: string;
  name_en: string;
  name_ar: string;
  hue: number;
  role: Role;
  line_id: string | null;
  at: string;
}

export interface QuoteAnnotation {
  id: string;
  status: "suggested" | "confirmed" | "rejected";
  verse_keys: string[];
  match: "exact" | "near";
  partial: boolean;
  similarity: number | null;
  cue: boolean;
  line_ids: string[];
  from_n: number;
  to_n: number;
  ms_text: string;
  sura_name_ar: string;
  sura_name_en: string;
  classification: QuoteClass | null;
  verses: { key: string; aya: number; text_uthmani: string; sura_name_ar: string; sura_name_en: string; translation: { edition_name: string; text: string } | null }[];
  diff: WordDiff[];
  reviewed_by: { name_en: string; name_ar: string } | null;
}

export interface AbbrItem {
  line_id: string;
  line_n: number;
  token_index: number;
  base_version: number;
  written: string;
  expan: string;
  confirmed: boolean;
}

export interface PossibleAbbr {
  line_id: string;
  line_n: number;
  base_version: number;
  start: number;
  end: number;
  written: string;
  suggestions: { expan: string; fits: boolean; note_en: string; note_ar: string; warn: boolean }[];
}

export interface NoteItem {
  line_id: string;
  line_n: number;
  kind: "mark" | "add" | "del" | "gap" | "supplied" | "gloss";
  mark?: string;
  text: string;
  note: string | null;
  zone: string | null;
}

export interface Understanding {
  quotes: QuoteAnnotation[];
  abbreviations: AbbrItem[];
  possible: PossibleAbbr[];
  terms: { id: string; term_ar: string; term_en: string; rule_en: string; rule_ar: string; lines: number[] }[];
  notes: NoteItem[];
  can_confirm: boolean;
  can_edit: boolean;
  scanned_at: string | null;
}

export interface CollabOverview {
  page_id: string;
  comments: Record<string, { open: number; total: number }>;
  page_comments: { open: number; total: number };
  suggestions: Record<string, number>;
  open_suggestions: number;
  hard: Record<string, { open: number; disputed: number; agreed: number }>;
  quotes: Record<string, { status: string; verse_keys: string[] }[]>;
  owner: { id: string; name_en: string; name_ar: string } | null;
  presence: PresenceUser[];
}

export interface ExplainResult {
  line_id: string;
  line_n: number;
  reading: string;
  diplomatic: string;
  tokens: Tok[];
  abbreviations: { written: string; expan: string; confirmed: boolean }[];
  quotes: { verse_keys: string[]; sura_name_ar: string; sura_name_en: string; ms_text: string }[];
  hadith: { id: string; collection: string; number: string; grade: string }[];
  terms: { term_ar: string; term_en: string; rule_en: string; rule_ar: string }[];
  uncertain: number;
  ai: { available: boolean; gloss_en?: string; gloss_ar?: string; model?: string; failure?: string } ;
}

// ───────────────────────────────────────────── Page review

export interface ReviewLine {
  id: string;
  n: number;
  zone: string | null;
  status: string;
  current: { version: number; kind: VersionKind; text: string; tokens: Tok[]; author_en: string | null; author_ar: string | null } | null;
  base: { version: number; kind: VersionKind; text: string; tokens: Tok[] } | null;
  changed: boolean;
  cer: number | null;
  open_suggestions: number;
  open_comments: number;
}

export interface ReviewPage {
  page_id: string;
  ms_id: string;
  ms_title_en: string;
  ms_title_ar: string;
  siglum: string | null;
  page_seq: number;
  page_label: string | null;
  status: Status;
  image: { src: string; width: number; height: number };
  against: "approved" | "machine";
  has_approved: boolean;
  lines: ReviewLine[];
  polygons: Record<string, Polygon>;
  page_cer: number | null;
  changed: number;
  submitted_by: { id: string; name_en: string; name_ar: string } | null;
  can_decide: boolean;
  decide_block: string | null;
  flagged: boolean;
}

// ───────────────────────────────────────────── Collation

export interface CollationWitness {
  ms_id: string;
  siglum: string;
  shelfmark: string | null;
  page_id: string;
  page_seq: number;
  image: { src: string; width: number; height: number };
  lines: string[];
  polygons: Record<string, Polygon>;
  agreement: number;
  near_identical_reference: boolean;
}

export interface CollationPassage {
  base_page_id: string;
  base_page_seq: number;
  base_image: { src: string; width: number; height: number };
  base_polygons: Record<string, Polygon>;
  base_words: { w: string; line_id: string; n: number }[];
  witnesses: CollationWitness[];
  apparatus: ApparatusEntry[];
}

export interface CollationView {
  base: { id: string; siglum: string | null; title_en: string; title_ar: string; shelfmark: string | null };
  copies: { id: string; siglum: string | null; shelfmark: string | null; repository: string | null }[];
  passages: CollationPassage[];
  caveat: boolean;
}

// ───────────────────────────────────────────── Public reader

export interface PublishedLine {
  line_id: string;
  n: number;
  zone: string | null;
  tokens: Tok[];
  plain_text: string;
  reading_text: string;
  polygon: Polygon | null;
}

export interface PublishedPage {
  page_id: string;
  seq: number;
  label: string | null;
  version: number;
  sha: string;
  published_at: string;
  image: { src: string; width: number; height: number };
  lines: PublishedLine[];
  quotes: {
    id: string; verse_keys: string[]; line_ids: string[]; from_n: number; to_n: number; ms_text: string; sura_name_ar: string; sura_name_en: string;
    verses: { key: string; aya: number; text_uthmani: string; sura_name_ar: string; sura_name_en: string; translation: { edition_name: string; text: string } | null }[];
  }[];
  credits: { role: "transcription" | "hard_words" | "review" | "approval"; names: { en: string; ar: string; demo: boolean }[] }[];
  machine: { engines: string[]; date: string | null };
  institution_demo: boolean;
}

export interface PublishedManuscript {
  id: string;
  title_en: string;
  title_ar: string;
  author_en: string | null;
  author_ar: string | null;
  siglum: string | null;
  repository: string | null;
  holding_library_ar: string | null;
  shelfmark: string | null;
  license: string | null;
  credit_line: string | null;
  source_url: string | null;
  institution_en: string | null;
  institution_ar: string | null;
  institution_demo: boolean;
  thumb: string | null;
  pages: number;
  last_published: string | null;
}
