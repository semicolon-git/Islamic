/** DTOs shared by the Studio API and UI. */
import type { Role } from "@/lib/auth";
import type { Status } from "@/lib/workflow";
import type { Polygon } from "./geometry";
import type { Tok } from "./tokens";
import type { RegionType } from "./schema";

export type LineStatus = "draft" | "transcribed" | "agreed" | "disputed" | "approved";
export type VersionKind = "machine" | "student" | "researcher" | "suggestion" | "consensus" | "import";

export interface MsSummary {
  id: string;
  title_en: string;
  title_ar: string;
  author_en: string | null;
  author_ar: string | null;
  repository: string | null;
  holding_library_ar: string | null;
  shelfmark: string | null;
  script: string | null;
  script_description: string | null;
  license: string | null;
  license_confidence: string | null;
  license_note: string | null;
  credit_line: string | null;
  source_url: string | null;
  catalogue_url: string | null;
  copy_date_text: string | null;
  copy_date_note: string | null;
  siglum: string | null;
  work_id: string | null;
  genre: string;
  gt_reliability: string | null;
  gt_note: string | null;
  publish_scope: string;
  ai_training_allowed: boolean;
  institution_id: string | null;
  institution_name_en: string | null;
  institution_name_ar: string | null;
  institution_is_demo: boolean;
  status: string;
  thumb: string | null;
  pages: number;
  lines_total: number;
  lines_human: number;
  lines_approved: number;
  pages_published: number;
  created_at: string;
}

export interface PageSummary {
  id: string;
  manuscript_id: string;
  seq: number;
  label: string | null;
  folio: number | null;
  side: "a" | "b" | null;
  image_path: string;
  thumb_path: string | null;
  width: number;
  height: number;
  status: Status;
  draft_engine: string | null;
  draft_cer: number | null;
  layout_source: string | null;
  flagged: boolean;
  flag_reason: string | null;
  lines_total: number;
  lines_human: number;
  lines_approved: number;
  published_version: number | null;
  published_at: string | null;
  published_sha: string | null;
}

export interface LineVersionDTO {
  line_id: string;
  version: number;
  tokens: Tok[];
  plain_text: string;
  normalized_text: string | null;
  kind: VersionKind;
  engine: string | null;
  author_id: string | null;
  author_name_en: string | null;
  author_name_ar: string | null;
  author_hue: number | null;
  base_version: number | null;
  note: string | null;
  created_at: string;
}

export interface RegionDTO {
  id: string;
  type: RegionType;
  polygon: Polygon;
  seq: number;
  source: string;
}

export interface LineDTO {
  id: string;
  region_id: string | null;
  seq: number;
  n: number;
  polygon: Polygon;
  baseline: Polygon | null;
  status: LineStatus;
  current_version: number;
  source: string;
  locked_by: string | null;
  locked_until: string | null;
  lock_name_en: string | null;
  lock_name_ar: string | null;
  lock_hue: number | null;
  has_human: boolean;
  version: LineVersionDTO | null;
}

export interface Viewer {
  id: string;
  role: Role;
  name_en: string;
  name_ar: string;
  hue: number;
  canEdit: boolean;
  canLayout: boolean;
  canEval: boolean;
  canDraft: boolean;
}

export interface PageReview {
  decision: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  reviewer_id: string | null;
  reviewer_name_en: string | null;
  reviewer_name_ar: string | null;
  created_at: string;
}

export interface PageDetail {
  page: PageSummary;
  manuscript: MsSummary;
  regions: RegionDTO[];
  lines: LineDTO[];
  neighbours: { prev: string | null; next: string | null; index: number; total: number };
  reviews: PageReview[];
  viewer: Viewer;
  ai: boolean;
  demo: boolean;
}
