-- Visitor-facing plain meaning of each glossary term. rule_en/rule_ar stay the editors' translation rule.
alter table glossary_terms add column if not exists meaning_en text;
alter table glossary_terms add column if not exists meaning_ar text;
