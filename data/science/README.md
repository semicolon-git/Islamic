# Muslim-science knowledge base («من إسهامات علماء المسلمين»)

Curated seed data for the Muslim-science layer described in
[`docs/roadmap/open-world-snap-and-science-heritage.md` §3](../../docs/roadmap/open-world-snap-and-science-heritage.md).
It is **data only**: no app code reads it yet. Every entry still needs the same scholar review as a card before it is shown to the public.

**Date verified:** 2026-10-06 (`verified_on` on every holding).

## Files

| File | Entries | What it holds |
|---|---|---|
| `scientists.json` | 25 | Scholars: names (EN/AR), dates (CE, and AH where commonly cited), places, fields, a 2–4 sentence summary, 2–4 contributions, and links to works, instruments, IAU star names and platform concept ids. |
| `works.json` | 19 | Books and tables, each with one `author` (a scientist id). Group works (the Toledan Tables, the Zij-i Sultani) say so in the summary. |
| `instruments.json` | 11 | Astrolabe, universal astrolabe, spherical astrolabe, quadrant, celestial globe, armillary sphere, sundial, kamal, water clock, qibla indicator, monumental meridian instrument. Each has an honest `origin_*` (for example, the astrolabe is Hellenistic), the Muslim contribution, how it works, and uses. |
| `holdings.json` | 28 | Museum objects with the museum's own object or catalogue URL: History of Science Museum Oxford (8), Museum of Islamic Art Doha (4), British Museum (3), Royal Museums Greenwich (3), Museo Galileo (3), The Met (2), Khalili Collections (2), Museum für Islamische Kunst Berlin (1), V&A (1), Smithsonian NMAH (1). |
| `topics.json` | 37 | Links from the platform's concept ids to scholars, works and instruments, with a 1–2 sentence note in each language and its sources. |

Validation: `src/features/science/data.test.ts` (run `npx vitest run src/features/science/data.test.ts`). It checks the schemas strictly, unique ids, every cross-reference, that concept ids come from the platform list, that every entity has at least one http(s) source, that bilingual fields are filled in both languages (Arabic fields must contain Arabic script), and that the astrolabe's origin is given as Hellenistic/Greek.

## How it was verified, and the limitation

- **The sandbox blocked direct page loads.** WebFetch and curl were refused by the network egress policy for every source host tried (museum sites, Wikipedia, Britannica, McGill RASI, MacTutor, Iranica). Every fact was therefore checked through **web-search extracts of the cited page** on 2026-10-06, and each `url` is the page that search returned for that fact. No URL was guessed. Before public launch, **a person should open each holding URL once** and confirm the object, date and accession number; this is quick (28 pages).
- Preferred sources: museum catalogues, the *Biographical Encyclopedia of Astronomers* (McGill RASI copies), MacTutor, Britannica, Encyclopaedia Iranica, the Filaha Texts Project. Wikipedia is used only as a labelled secondary source.
- Wording rules followed: "developed / refined / described / built", never "Muslims invented X" unless that is the consensus; no unsourced superlatives (where a museum makes a superlative claim, the text says "described by the museum as …"); no "scientific miracle" framing and no claim that the Quran predicted science.
- "On display": only stated where the museum's page said so, always as "listed as on view when checked" (The Met 63.166a–j and 91.1.535a–h, V&A M.827-1928). RMG says its 1813 astrolabe is *not* on display.

## Corrections to the roadmap and to common claims

- **al-Sufi's star count.** The roadmap says "1,017 stars in 48 constellations". The sources disagree (1,017 / 1,018 / 1,022); the BEA says al-Sufi critiqued each of the ~1,025 stars of Ptolemy's catalogue. The data says "roughly a thousand" and gives Ptolemy's 1,025.
- **al-Zarqali's universal plate "used by navigators until the 16th century".** This comes from Wikipedia. The History of Science Museum, Oxford, says the projection was known in medieval Europe but **little used until Gemma Frisius revived it** in the 16th century. The data follows the museum.
- **Bodleian MS Marsh 144** (al-Sufi) is dated 1009–10 in its colophon, but some scholars think it was copied more than 150 years later; both are stated.
- **Ibn Majid and Vasco da Gama.** The data says modern historians reject the story; the pilot was most likely a Gujarati provided at Malindi.
- **Ibn al-Haytham and twilight (19°).** Often attributed to him, but the Latin twilight treatise is by Ibn Muʿadh, and *Mizan al-hikma* is al-Khazini's. Left out.
- **"Muslims invented the polar-axis (inclined) gnomon"** (in Britannica's sundial article): not included pending specialist review.
- **Honey in Ibn Sina's Canon.** Could not confirm a specific passage on honey, so `honey_bee` links to Ibn al-ʿAwwam's beekeeping chapter and al-Dinawari instead.
- **Abu al-Wafa's treatise for artisans** is attributed to him, but some scholars think the surviving text is a student's record of his teaching; this is stated.
- **Kamal** dates ("invented in the 9th century") come from popular accounts; the data says the origin is uncertain.
- **al-ʿIjliyya**: the first name "Mariam" is a modern attribution not found in Ibn al-Nadim, the only source; the data uses al-ʿIjliyya bint al-ʿIjli.

## Open questions

1. **Saudi holdings: none verifiable at object level.** No astrolabe or other instrument record with an accession number could be found for Ithra (Dhahran) or the National Museum (Riyadh). The **Red Sea Museum in Historic Jeddah** (Bab al-Bunt building) is reported by Asharq Al-Awsat and al-Madina to display **more than 20 historical navigational instruments: qibla indicators, compasses and sundials, some over 400 years old** (17th–20th centuries). No object-level page or accession number was found, so nothing is listed in `holdings.json`. Recommended: ask the Red Sea Museum (Museums Commission) for object records, and ask Ithra and the National Museum directly. Sources: <https://english.aawsat.com/culture/5289593-red-sea-museum-showcases-centuries-islamic-maritime-navigation-heritage>, <https://www.al-madina.com/article/994959>.
2. **Candidates not listed because no museum page was found:** the universal astrolabe of Ibn al-Sarraj, Benaki Museum Athens (acc. 13178, cited in a Springer chapter); the universal astrolabe by Ibrahim al-Dimashqi, British Museum 1890,0315.3 (only a dealer's page found); Louvre OA 11952 (al-Andijani, 1821/22); Adler Planetarium astrolabes (collection confirmed, no object pages found); Museum of Islamic Art, Cairo (reported astrolabes, no object pages); HSM Oxford qibla indicators 48472, 53791 and 34566 (found only on a test domain, odp-test.hsm.ox.ac.uk); the original fragments of Ibn al-Shatir's sundial (reported to be in the Damascus museum).
3. **Missing accession numbers:** Qatar Museums (except MW.146.1999, from the Bodleian's Savage-Smith archive catalogue), RMG and NMAH pages did not show accession numbers in the extracts; the notes say so. The Qatar URL slugs (`si51999`, `mw3362007`, …) look like accession numbers but were not used as such.
4. **Museo Galileo inv. 1113** was matched to `PlaneAstrolabe_n02.html` from search results; re-check.
5. **Star lists are partial.** The astrolabe's `stars` (Aldebaran, Altair, Arcturus, Vega) are the ones seen in the Oxford catalogue's rete star lists; a fuller list (Kunitzsch & Smart) is a separate task.
6. **Concepts skipped** because no honest, sourced link was found: pen (the Quranic al-Qalam is better served by the card itself; `pen_and_ink` covers paper), rain_water, birds, milk, clouds, pearl_coral, ant, fish, lightning, stone, iron, salt_fresh, mosque_lamp, arabesque, illuminated_mushaf, kiswa_textile.
7. `pen_and_ink` has no scientist link (paper making was a craft, not one scholar's work); its note and sources stand on their own.
