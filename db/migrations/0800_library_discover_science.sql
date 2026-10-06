-- Library (verbatim books by reference), open-world discoveries, and the Muslim-science knowledge graph.

-- ── Library ──────────────────────────────────────────────────────────────────────────────────────
-- Built-in books (tafsir, hadith collections beyond the two Sahihs) and books uploaded as PDF from the portal.
create table if not exists books (
  id            text primary key,
  kind          text not null check (kind in ('tafsir', 'hadith', 'book')),
  origin        text not null default 'builtin' check (origin in ('builtin', 'upload')),
  lang          text not null default 'ar',
  title_en      text not null,
  title_ar      text not null,
  author_en     text not null default '',
  author_ar     text not null default '',
  note_en       text not null default '',
  note_ar       text not null default '',
  source_url    text,
  licence_note  text,
  -- processing → draft (ready for review) → approved (used in public answers); failed / archived.
  status        text not null default 'draft' check (status in ('processing', 'draft', 'approved', 'failed', 'archived')),
  file_path     text,
  file_bytes    int,
  pages         int,
  pages_done    int not null default 0,
  extract_method text,
  error         text,
  passages      int not null default 0,
  sort          int not null default 100,
  created_by    text references users(id),
  approved_by   text references users(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists book_passages (
  book_id   text not null references books(id) on delete cascade,
  ref       text not null,          -- tafsir "2:5-7" · hadith "1234" · upload "p12.3"
  sura      int,
  aya_from  int,
  aya_to    int,
  number    text,                   -- hadith number
  page      int,                    -- uploaded books
  text      text not null,          -- verbatim (Arabic for tafsir-ar / hadith; the book's language otherwise)
  text_en   text,                   -- hadith English translation when the source has one
  grades    jsonb,                  -- hadith: [{name, grade}] as given by the source
  grade_ok  boolean,                -- hadith: primary grader says sahih/hasan (public answers use only these)
  search    text,                   -- normalised text for search (hadith and uploads; null for tafsir)
  primary key (book_id, ref)
);
create index if not exists book_passages_verse on book_passages (book_id, sura, aya_from, aya_to);
create index if not exists book_passages_search on book_passages using gin (search gin_trgm_ops);

-- ── Open-world discoveries ─────────────────────────────────────────────────────────────────────────
-- What a visitor photographed or searched when no approved card covers it: verified passages + a labelled AI summary.
-- Cached by a normalised key; each one shows up on the demand board so scholars can turn it into a reviewed card.
create table if not exists discoveries (
  key            text primary key,
  label_en       text not null,
  label_ar       text not null,
  category       text,
  status         text not null check (status in ('ready', 'empty', 'sensitive', 'failed')),
  result         jsonb not null,
  prompt_version text not null,
  hits           int not null default 1,
  source         text not null default 'snap',     -- snap | search
  card_id        text references cards(id),        -- set when a reviewed card is made from it
  dismissed      boolean not null default false,
  created_at     timestamptz not null default now(),
  last_hit_at    timestamptz not null default now()
);
create index if not exists discoveries_hits on discoveries (dismissed, hits desc, last_hit_at desc);

-- ── Muslim-science knowledge graph ───────────────────────────────────────────────────────────────────
-- Scientists, works, instruments, museum holdings and concept topics. `data` holds the bilingual fields and sources;
-- links are kept in `data` as id arrays. Every entry is reviewable like a card.
create table if not exists science_entries (
  kind        text not null check (kind in ('scientist', 'work', 'instrument', 'holding', 'topic')),
  id          text not null,
  name_en     text not null,
  name_ar     text not null,
  data        jsonb not null,
  status      text not null default 'approved' check (status in ('draft', 'approved', 'hidden')),
  sort        int not null default 100,
  updated_by  text references users(id),
  updated_at  timestamptz not null default now(),
  primary key (kind, id)
);

