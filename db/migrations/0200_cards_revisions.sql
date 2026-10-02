-- Cards (B3): an in-progress revision of a PUBLISHED card has its own workflow stage.
-- cards.status stays 'published' (public pages keep reading published_version, untouched) while
-- revision_status walks ai_draft → student_submitted → researcher_approved → published (then resets to null).
alter table cards add column if not exists revision_status text
  check (revision_status in ('ai_draft','student_submitted','researcher_approved','returned'));
create index if not exists cards_revision_status on cards (revision_status);
create index if not exists cards_institution on cards (institution_id);
create index if not exists reviews_card_decision on reviews (entity_id, decision) where entity_type = 'card';
