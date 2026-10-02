-- Signs Around You — core schema (authoritative). See docs/architecture/SPEC.md §4.
create extension if not exists pg_trgm;

-- ───────────────────────── People & institutions
create table institutions (
  id text primary key,
  slug text unique not null,
  name_en text not null,
  name_ar text not null,
  kind text not null check (kind in ('library','university','dawah','museum')),
  review_policy jsonb not null default '{}'::jsonb,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id text primary key,
  display_name_en text not null,
  display_name_ar text not null,
  role text not null check (role in ('student','researcher','institution_admin','specialist','platform_admin')),
  institution_id text references institutions(id),
  title_en text, title_ar text,
  avatar_hue int not null default 200,
  points int not null default 0,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Realtime + audit
create table events (
  id bigserial primary key,
  scope text not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id text,
  created_at timestamptz not null default now()
);
create index events_scope_id on events (scope, id);

create table audit_log (
  id bigserial primary key,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity on audit_log (entity_type, entity_id);

create table reviews (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('card','page','line','item','suggestion')),
  entity_id text not null,
  version int,
  reviewer_id text references users(id),
  from_status text, to_status text,
  decision text not null check (decision in ('submit','approve','return','publish','archive','reject','accept')),
  note text,
  created_at timestamptz not null default now()
);
create index reviews_entity on reviews (entity_type, entity_id);

create table points_ledger (
  id bigserial primary key,
  user_id text not null references users(id),
  delta int not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Knowledge base (read-mostly)
create table quran_ayah (
  key text primary key,            -- '10:5'
  sura int not null, aya int not null,
  text_uthmani text not null,      -- KFGQPC aya_text (display, unmodified)
  text_emlaey text not null,       -- KFGQPC aya_text_emlaey (matching)
  sura_name_ar text not null, sura_name_en text not null,
  page int, juz int
);
create index quran_sura_aya on quran_ayah (sura, aya);

create table translation_editions (
  id text primary key,             -- 'en.saheeh'
  lang text not null,
  name text not null,
  translator text not null,
  source text not null,            -- where the text came from
  status_note text                 -- e.g. 'mirror — pin to Quranpedia 1947 before launch'
);
create table quran_translation (
  edition_id text not null references translation_editions(id),
  key text not null references quran_ayah(key),
  text text not null,
  primary key (edition_id, key)
);

create table hadith (
  id text primary key,             -- 'bukhari:1042'
  collection text not null check (collection in ('bukhari','muslim')),
  number text not null,            -- Bukhari: Fath al-Bari numbering; Muslim: Abd al-Baqi (arabicnumber)
  numbering_scheme text not null,
  text_ar text not null,
  text_en text,
  grade text not null,             -- 'Sahih (in Sahih al-Bukhari)'
  grader text not null,
  source_url text,
  verified_by text, verified_at timestamptz
);
create index hadith_text_trgm on hadith using gin (text_ar gin_trgm_ops);
create index hadith_en_trgm on hadith using gin (text_en gin_trgm_ops);

create table glossary_terms (
  id text primary key,             -- 'tawhid'
  term_ar text not null,
  term_en text not null,
  rule_en text not null,
  rule_ar text not null,
  variants text[] not null default '{}',          -- user phrasings to detect
  banned_renderings text[] not null default '{}', -- e.g. 'holy war'
  source text not null,            -- 'R8' or URL
  status text not null default 'approved'
);

create table concepts (
  id text primary key,             -- 'moon'
  track text not null check (track in ('nature','art','heritage')),
  label_en text not null, label_ar text not null,
  blurb_en text, blurb_ar text,
  image text,                      -- /images/concepts/moon.webp
  visual_hints text,               -- for the vision prompt
  qac_lemmas text[] not null default '{}',
  count_tokens int, count_verses int, count_rule text,
  sensitivity text,
  sort int not null default 100,
  enabled boolean not null default true
);

-- ───────────────────────── Cards (approved content units)
create table cards (
  id text primary key,             -- 'card:moon', 'answer:kaaba'
  kind text not null check (kind in ('concept','answer','item','art')),
  concept_id text references concepts(id),
  level text not null default 'A' check (level in ('A','B','C','D')),
  certainty text not null default 'established' check (certainty in ('established','disputed','ijma')),
  title_en text not null, title_ar text not null,
  match_phrases text[] not null default '{}',   -- retrieval phrasings (EN/AR) for answers
  status text not null default 'ai_draft' check (status in ('ai_draft','student_submitted','researcher_approved','published','returned','archived')),
  current_version int not null default 1,
  published_version int,
  institution_id text references institutions(id),
  created_by text references users(id),
  assigned_to text references users(id),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index cards_concept on cards (concept_id);
create index cards_status on cards (status);

-- content jsonb (CardContent): see src/lib/cards/types.ts
create table card_versions (
  card_id text not null references cards(id) on delete cascade,
  version int not null,
  content jsonb not null,
  content_sha text not null,
  author_id text references users(id),
  note text,
  created_at timestamptz not null default now(),
  primary key (card_id, version)
);

create table card_requests (
  id text primary key,
  concept_id text references concepts(id),
  topic text,                      -- free-text topic (from Ask "request this topic")
  item_code text,
  device_hash text not null,
  status text not null default 'open' check (status in ('open','fulfilled','dismissed')),
  fulfilled_card_id text references cards(id),
  created_at timestamptz not null default now()
);
create index card_requests_concept on card_requests (concept_id, status);

-- ───────────────────────── Ask pipeline traces (no user identifiers)
create table answer_traces (
  id text primary key,
  created_at timestamptz not null default now(),
  lang text not null,
  question text not null,          -- PII-redacted
  level text, intent text,
  route text not null,             -- 'approved_card' | 'composed' | 'glossary' | 'misquote' | 'hadith_none' | 'refer_d' | 'decline_x' | 'empty' | ...
  flags jsonb not null default '[]'::jsonb,
  evidence_ids text[] not null default '{}',
  blocks jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  outcome text not null,           -- 'pass' | 'revised' | 'sources_only' | 'referred' | 'declined' | 'empty'
  latency_ms int,
  ai jsonb                         -- {enabled, models, usage}
);

-- ───────────────────────── Talk to a person
create table threads (
  id text primary key,
  device_hash text not null,
  topic text,
  lang text not null default 'en',
  status text not null default 'open' check (status in ('open','closed')),
  consent jsonb not null default '{}'::jsonb,     -- what the visitor chose to share
  context jsonb not null default '{}'::jsonb,     -- e.g. {card_id, question} if shared
  assigned_to text references users(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table messages (
  id text primary key,
  thread_id text not null references threads(id) on delete cascade,
  sender text not null check (sender in ('visitor','specialist','system')),
  author_id text references users(id),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_thread on messages (thread_id, created_at);

-- ───────────────────────── Heritage
create table venues (
  id text primary key,
  institution_id text references institutions(id),
  name_en text not null, name_ar text not null,
  code text unique not null
);
create table heritage_items (
  id text primary key,
  item_code text unique not null,  -- short code printed on labels, e.g. 'AST-7'
  institution_id text references institutions(id),
  venue_id text references venues(id),
  kind text not null,              -- 'astrolabe' | 'lamp' | 'folio' | 'textile' | ...
  concept_id text references concepts(id),
  title_en text not null, title_ar text not null,
  date_text text, origin text, material text,
  description_en text, description_ar text,
  images jsonb not null default '[]'::jsonb,     -- [{src, credit, license, source_url}]
  card_id text references cards(id),
  manuscript_id text,                            -- if the item is a manuscript
  status text not null default 'ai_draft' check (status in ('ai_draft','student_submitted','researcher_approved','published','returned','archived')),
  created_at timestamptz not null default now()
);
create table inscriptions (
  id text primary key,
  item_id text references heritage_items(id) on delete cascade,
  bbox jsonb,
  transcription text not null,
  match jsonb,                     -- matcher output
  verse_keys text[] not null default '{}',
  author_id text references users(id),
  verified_by text references users(id),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Manuscript Studio
create table manuscripts (
  id text primary key,
  institution_id text references institutions(id),
  title_en text not null, title_ar text not null,
  author_en text, author_ar text,
  copyist text, copy_date_text text,
  script text,
  repository text, shelfmark text,
  license text, license_confidence text, credit_line text, source_url text,
  notes text,
  work_id text,                    -- groups copies of the same work for collation
  siglum text,                     -- copy siglum for collation, e.g. 'أ', 'ب'
  status text not null default 'ai_draft',
  created_at timestamptz not null default now()
);

create table ms_pages (
  id text primary key,
  manuscript_id text not null references manuscripts(id) on delete cascade,
  seq int not null,
  folio_label text,
  image_path text not null, thumb_path text,
  width int not null, height int not null,
  status text not null default 'ai_draft' check (status in ('ai_draft','student_submitted','researcher_approved','published','returned','archived')),
  draft_engine text,               -- 'tesseract' | 'claude' | 'none'
  draft_cer real,                  -- vs ground truth when known (dataset pages)
  layout_source text,              -- 'dataset' | 'auto' | 'manual'
  consensus_mode boolean not null default false,
  published_version int, published_at timestamptz, published_by text references users(id),
  created_at timestamptz not null default now()
);
create index ms_pages_ms on ms_pages (manuscript_id, seq);

create table ms_regions (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  type text not null check (type in ('main','margin','title','rubric','catchword','colophon','seal','illustration','other')),
  polygon jsonb not null,          -- [[x,y],...] in image pixels
  rotation int not null default 0,
  seq int not null default 0,
  source text not null default 'manual',
  created_by text references users(id)
);

create table ms_lines (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  region_id text references ms_regions(id) on delete set null,
  seq int not null,
  polygon jsonb not null,
  baseline jsonb,
  status text not null default 'draft' check (status in ('draft','transcribed','agreed','disputed','approved')),
  current_version int not null default 0,
  gt_text text,                    -- dataset ground truth (evaluation only; never shown as a contribution)
  assigned_to text references users(id),
  locked_by text references users(id),
  locked_until timestamptz
);
create index ms_lines_page on ms_lines (page_id, seq);

create table ms_line_versions (
  line_id text not null references ms_lines(id) on delete cascade,
  version int not null,
  tokens jsonb not null,
  plain_text text not null,
  normalized_text text,
  kind text not null check (kind in ('machine','student','researcher','suggestion','consensus','import')),
  engine text,                     -- for machine: 'tesseract' | 'claude:<model>'
  author_id text references users(id),
  note text,
  created_at timestamptz not null default now(),
  primary key (line_id, version)
);

create table ms_suggestions (
  id text primary key,
  line_id text not null references ms_lines(id) on delete cascade,
  base_version int not null,
  tokens jsonb not null,
  plain_text text not null,
  author_id text not null references users(id),
  status text not null default 'open' check (status in ('open','accepted','rejected','superseded')),
  reviewer_id text references users(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table ms_keyings (                -- independent (blind) transcriptions for double-keying consensus
  id text primary key,
  line_id text not null references ms_lines(id) on delete cascade,
  author_id text not null references users(id),
  tokens jsonb not null,
  plain_text text not null,
  created_at timestamptz not null default now(),
  unique (line_id, author_id)
);

create table ms_comments (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  line_id text references ms_lines(id) on delete cascade,
  region_id text references ms_regions(id) on delete cascade,
  parent_id text references ms_comments(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table ms_annotations (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  line_id text references ms_lines(id) on delete cascade,
  line_span jsonb,                 -- {from_line, to_line} for multi-line quotes
  kind text not null check (kind in ('quran','hadith','term','person','place','book','abbreviation','mark','variant','note')),
  anchor_text text,                -- the manuscript text covered
  data jsonb not null default '{}'::jsonb,   -- e.g. {verse_keys, match_status, differences} | {term_id} | {note_en, note_ar}
  author_id text references users(id),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  created_at timestamptz not null default now()
);

create table ms_tasks (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  kind text not null check (kind in ('transcribe','verify','double_key','inscription','review')),
  line_ids text[] not null default '{}',
  assignee_id text references users(id),
  created_by text references users(id),
  status text not null default 'open' check (status in ('open','done','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

-- ───────────────────────── Configuration
create table agent_configs (
  agent text primary key,          -- 'vision' | 'router' | 'composer' | 'verifier' | 'draft'
  model_id text not null,
  prompt_version text not null,
  updated_at timestamptz not null default now()
);
