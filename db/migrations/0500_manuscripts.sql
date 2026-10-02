-- Manuscript Studio (B4). Additive changes on top of 0001_core.sql. See src/features/manuscripts/README.md.

-- ───────────── Manuscript (codex-level) metadata
alter table manuscripts add column if not exists holding_library_ar text;
alter table manuscripts add column if not exists license_note text;
alter table manuscripts add column if not exists catalogue_url text;
alter table manuscripts add column if not exists script_description text;
alter table manuscripts add column if not exists copy_date_note text;
alter table manuscripts add column if not exists genre text not null default 'general';      -- drives abbreviation suggestions: hadith | rijal | fiqh | lexicon | general
alter table manuscripts add column if not exists gt_reliability text;                         -- dataset ground-truth reliability (evaluation only)
alter table manuscripts add column if not exists gt_note text;
alter table manuscripts add column if not exists publish_scope text not null default 'archive_only'
  check (publish_scope in ('archive_only','eligible_for_cards'));
alter table manuscripts add column if not exists ai_training_allowed boolean not null default false;
alter table manuscripts add column if not exists created_by text references users(id);
alter table manuscripts add column if not exists is_demo boolean not null default false;

-- ───────────── Page (folio side)
alter table ms_pages add column if not exists label text;
alter table ms_pages add column if not exists folio int;
alter table ms_pages add column if not exists side text check (side in ('a','b'));
alter table ms_pages add column if not exists flagged boolean not null default false;          -- "Problematic / يحتاج نقاش": pauses the workflow
alter table ms_pages add column if not exists flag_reason text;
alter table ms_pages add column if not exists flagged_by text references users(id);
alter table ms_pages add column if not exists flagged_at timestamptz;
alter table ms_pages add column if not exists published_sha text;
alter table ms_pages add column if not exists source jsonb not null default '{}'::jsonb;       -- provenance of image + layout
alter table ms_pages add column if not exists updated_at timestamptz not null default now();

-- ───────────── Line
alter table ms_lines add column if not exists gt_status text;                                   -- transcribed | reference_unverified | untranscribed (evaluation only)
alter table ms_lines add column if not exists source text not null default 'manual';            -- dataset | auto | manual

-- ───────────── Line versions: the base each save was made against (optimistic concurrency audit)
alter table ms_line_versions add column if not exists base_version int;
create index if not exists ms_line_versions_author on ms_line_versions (author_id);

create index if not exists ms_regions_page on ms_regions (page_id, seq);
create index if not exists manuscripts_work on manuscripts (work_id);

-- ───────────── Frozen, hashed publications (one row per published version of a page)
create table if not exists ms_page_publications (
  page_id text not null references ms_pages(id) on delete cascade,
  version int not null,
  content jsonb not null,          -- canonical snapshot: lines + tokens + versions + credits
  content_sha text not null,       -- sha256 of the canonical JSON
  published_by text references users(id),
  approved_by text references users(id),
  created_at timestamptz not null default now(),
  primary key (page_id, version)
);
