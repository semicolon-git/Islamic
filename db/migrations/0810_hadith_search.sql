-- Normalised search text for Bukhari / Muslim (filled by the library seed: Arabic without diacritics + lower-case English).
alter table hadith add column if not exists search text;
create index if not exists hadith_search_trgm on hadith using gin (search gin_trgm_ops);
