-- Contribution chains («سلاسل الإسهام»): how documented contributions of Muslim scholars sit in the history of the science
-- behind an everyday object (a TV → optics → Ibn al-Haytham …). Curated and sourced like the other science entries; the
-- discovery pipeline only selects chain ids, it never writes their text. `data.review` records the scholarly review.
alter table science_entries drop constraint if exists science_entries_kind_check;
alter table science_entries add constraint science_entries_kind_check check (kind in ('scientist', 'work', 'instrument', 'holding', 'topic', 'chain'));

-- Chains are reviewed in the portal like cards: a researcher approves, a different institution admin signs off.
alter table reviews drop constraint if exists reviews_entity_type_check;
alter table reviews add constraint reviews_entity_type_check check (entity_type in ('card','page','line','item','suggestion','chain'));
