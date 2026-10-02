/** Shared heritage types (client + server). */
import type { Status } from "@/lib/workflow";

export interface ItemImage {
  src: string;
  credit: string;
  license: string;
  source_url?: string | null;
  /** Generated illustration (not a photo of the actual object). Always labelled as such. */
  generated?: boolean;
  alt_en?: string;
  alt_ar?: string;
}

export interface ItemRow {
  id: string;
  item_code: string | null;
  institution_id: string | null;
  venue_id: string | null;
  kind: string;
  concept_id: string | null;
  title_en: string;
  title_ar: string;
  date_text: string | null;
  date_text_ar: string | null;
  origin: string | null;
  origin_ar: string | null;
  material: string | null;
  material_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  images: ItemImage[];
  card_id: string | null;
  manuscript_id: string | null;
  status: Status;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  venue_code: string | null;
  venue_name_en: string | null;
  venue_name_ar: string | null;
  institution_name_en: string | null;
  institution_name_ar: string | null;
  institution_is_demo: boolean | null;
}

export interface Venue {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  institution_id: string | null;
  institution_name_en: string | null;
  institution_name_ar: string | null;
  institution_is_demo: boolean | null;
}

export interface InscriptionRow {
  id: string;
  item_id: string;
  transcription: string;
  match: unknown;
  verse_keys: string[];
  status: "suggested" | "confirmed" | "rejected";
  note: string | null;
  author_id: string | null;
  verified_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  author_name_en: string | null;
  author_name_ar: string | null;
  verifier_name_en: string | null;
  verifier_name_ar: string | null;
  author_is_demo: boolean | null;
  verifier_is_demo: boolean | null;
  match_status: "exact" | "near" | "none" | "too_short" | null;
}

/** What the visitor app stores to remember the venue they scanned (no location, no account). */
export interface StoredVenue {
  code: string;
  name_en: string;
  name_ar: string;
}
export const VENUE_STORAGE_KEY = "say.heritage.venue";
