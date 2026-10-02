# Prep kit: data for Signs Around You (آيات حولك)

This folder holds data preparation for the Oct 3 prep day. It contains no app code, which keeps it inside the S9 prep scope ("sources, concept list, synthetic test data").

## Quick start

```bash
./prep/fetch_sources.sh                                  # pinned raw sources -> prep/data/raw/ (sha256-checked, not committed)
python3 prep/scripts/count_moon.py                       # 27 tokens in 26 verses (QAC lemma qamar), plus the exact-form counts
python3 prep/scripts/build_concepts.py                   # -> data/concepts_verified.json, data/concept_counts.csv
python3 prep/scripts/make_example_card.py                # -> data/card_example_moon.json (all text inserted by code)
python3 prep/scripts/verify_card.py prep/data/card_example_moon.json   # pre-publish gate, exit 1 on any FAIL
```

Tested on 2026-10-02: a fresh fetch reproduces `concepts_verified.json`, `concept_counts.csv` and `card_example_moon.json` byte for byte, and the moon card passes 14/14 checks.

## What's here

| File | What it is | Status |
|---|---|---|
| `data/concepts_verified.json`, `data/concepts_table.md`, `data/concept_counts.csv` | The closed concept list for the nature track. Each concept has QAC lemma sets, occurrence and verse counts, candidate verse keys with KFGQPC text, camera and demo notes, and a sensitivity level. | Lexically verified only: the key exists, QAC tags the lemma in that verse, and the keyword is in the KFGQPC text. **Mahmoud must sign off on whether each verse suits its card.** |
| `data/hadith_seed_verified.json` | 15 Bukhari/Muslim seed hadith mapped to concepts | Text verified in a mirror only. **Check each on dorar.net/hadith** and record the grade, grader and URL. |
| `data/card_example_moon.json` | A complete example card (10:5, 41:37, 36:39, a count with its rule, a Tabari excerpt, hadith, a civilisational note with source) | `auto_draft`. Pin the translation to Quranpedia edition 1947 and re-fetch the tafsir from an approved source before publishing. |
| `data/moon_count_output.txt` | The fact-check of the slide's "27 times" claim across three text editions plus QAC | 27 is correct as a lemma count (27 tokens, 26 verses). The exact form «القمر» alone gives 5. |
| `data/sources_probe_2026-10-02.tsv`, `scripts/source_urls.txt`, `scripts/probe_sources.sh` | Which source endpoints answered from a cloud sandbox | Many approved sites (dorar, quranenc, quranpedia, dawa.center) were blocked there. Re-probe from a normal network. |

## Rules baked into the scripts

- **Quran text** comes only from KFGQPC Hafs v18. Display `aya_text`; match user input on `aya_text_emlaey`.
- **Counts are code.** Counting rule `qac-lemma-word-token@0.4`: a concept is an explicit set of QAC lemmas, never a root. Always show occurrences and verses together, and never attach significance to a number.
- **Muslim numbering trap.** In the fawazahmed0 mirror, `hadithnumber` is sequential. Use `arabicnumber` (Abd al-Baqi). For example, 2699 is stored as 6853.
- **Banned framing**, which `verify_card.py` checks: "scientific miracle", "science proves", إعجاز علمي, أثبت العلم, and numerical-miracle claims.

## Known gaps

- `verify_card.py` checks the Quran text and the count, but not the translation, hadith or tafsir text against pinned sources. Extend it to hash those too.
- Still to do by hand on Oct 3:
  - tafsir excerpts from dorar.net/tafseer;
  - the dawa.center/file/7937 Q&A file;
  - about 20 Al-Jamhara glossary terms with their URLs.

## Licences (raw files are downloaded, not redistributed here)

| Source | Licence and terms |
|---|---|
| KFGQPC Hafs text and font | KFGQPC terms; use unmodified |
| Quranic Arabic Corpus 0.4 | GPL; verbatim copies only |
| fawazahmed0 quran-api / hadith-api | Mirrors. Publish from the approved sources named in the reference pack (R3). |
| spa5k tafsir_api | Mirror; re-fetch from an approved source |
