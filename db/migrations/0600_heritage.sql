-- Heritage items (B5). Additive changes to the core heritage tables.
-- Short codes are assigned when an item is published (registered drafts have no public code yet).
alter table heritage_items alter column item_code drop not null;

-- Bilingual metadata (the core columns date_text/origin/material hold the English text).
alter table heritage_items add column if not exists date_text_ar text;
alter table heritage_items add column if not exists origin_ar text;
alter table heritage_items add column if not exists material_ar text;
alter table heritage_items add column if not exists created_by text references users(id);
alter table heritage_items add column if not exists updated_at timestamptz not null default now();
alter table heritage_items add column if not exists published_at timestamptz;
alter table heritage_items add column if not exists sort int not null default 100;

create index if not exists heritage_items_status on heritage_items (status);
create index if not exists heritage_items_venue on heritage_items (venue_id);

-- Inscription review trail.
alter table inscriptions add column if not exists note text;
alter table inscriptions add column if not exists confirmed_at timestamptz;
create index if not exists inscriptions_item on inscriptions (item_id, created_at);
