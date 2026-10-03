-- Manuscript collaboration & understanding (B8). Additive changes on top of 0001_core.sql and 0500_manuscripts.sql.
-- See src/features/ms-collab/*.

-- ───────────── Assignments ("My work")
alter table ms_tasks add column if not exists due_at timestamptz;
alter table ms_tasks add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high'));
alter table ms_tasks add column if not exists updated_at timestamptz not null default now();
create index if not exists ms_tasks_assignee on ms_tasks (assignee_id, status);
create index if not exists ms_tasks_page on ms_tasks (page_id, status);

-- ───────────── Hard words: one row per uncertain token that goes to blind double-keying
create table if not exists ms_hard_words (
  id text primary key,
  page_id text not null references ms_pages(id) on delete cascade,
  line_id text not null references ms_lines(id) on delete cascade,
  base_version int not null,                 -- line version the token was found in (re-mapped when the line moves on)
  token_index int not null,                  -- index of the `unclear` token in that version
  token_text text not null,                  -- the uncertain reading (machine guess or a person's), hidden from keyers
  alts jsonb not null default '[]'::jsonb,
  conf int,                                  -- model score (not a probability), when the machine flagged it
  source text not null default 'machine' check (source in ('machine','person')),
  status text not null default 'open' check (status in ('open','agreed','disputed','resolved','stale')),
  final_text text,                           -- the accepted reading (null when the final decision is a gap)
  final_gap text check (final_gap in ('illegible','damage')),
  resolution text check (resolution in ('consensus','adjudicated')),
  resolved_by text references users(id),
  resolved_version int,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ms_hard_words_page on ms_hard_words (page_id, status);
create index if not exists ms_hard_words_line on ms_hard_words (line_id);

-- Keyings now belong to a hard word (a student may key several words of the same line).
alter table ms_keyings add column if not exists hard_word_id text references ms_hard_words(id) on delete cascade;
alter table ms_keyings add column if not exists cant_read text check (cant_read in ('illegible','damage'));
alter table ms_keyings drop constraint if exists ms_keyings_line_id_author_id_key;
create unique index if not exists ms_keyings_word_author on ms_keyings (hard_word_id, author_id);

-- ───────────── Suggestions: the reason and what accepting produced
alter table ms_suggestions add column if not exists reason text;
alter table ms_suggestions add column if not exists result_version int;
create index if not exists ms_suggestions_line on ms_suggestions (line_id, status);

-- ───────────── Comments: token-range anchor, @mentions, who resolved
alter table ms_comments add column if not exists anchor jsonb;              -- {from, to, text} in the line's editable string
alter table ms_comments add column if not exists mentions text[] not null default '{}';
alter table ms_comments add column if not exists resolved_by text references users(id);
alter table ms_comments add column if not exists resolved_at timestamptz;
create index if not exists ms_comments_page on ms_comments (page_id, line_id);

-- ───────────── Annotations: proposals are de-duplicated per page, and a person reviews them
alter table ms_annotations add column if not exists key text;
alter table ms_annotations add column if not exists reviewed_by text references users(id);
alter table ms_annotations add column if not exists reviewed_at timestamptz;
create unique index if not exists ms_annotations_page_key on ms_annotations (page_id, key) where key is not null;

-- ───────────── Points: awards for accepted manuscript work are idempotent (one per user, reason and ref)
create unique index if not exists points_ledger_ms_once on points_ledger (user_id, reason, ref) where reason like 'ms\_%';
