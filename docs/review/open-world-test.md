# Open-world Snap, library and Muslim science: live test report

Tested on 2026-10-06 against the real Claude API (`claude-opus-5-5`), Postgres 16, a production build, and the production Docker image.

## Summary

| Area | What was tested | Result |
|---|---|---|
| Any photo → sources | 30 real photos (ImageNet samples) through `/api/snap` → `/api/discover` | Every photo got a subject label except the person, who was correctly not described. 27 found verified sources, 25 with a verified summary, 13 with a Muslim-science link. **0 fabricated references:** by construction, only keys and numbers that exist were fetched |
| Safety | People, pork and butchers, forced links | The person was never searched. The warthog and the butcher's stall were treated as sensitive: sources only, no summary. A copper dome was first linked to "molten copper" verses; the rule was tightened and a re-run now says honestly that nothing applies |
| Checks | Judge, lint, rewrite, independent verifier | Several summaries were dropped for unsupported claims, for example adding "Paradise" when the verse text does not say it, or describing a hadith that was not shown. Only verified prose reaches visitors |
| Latency | First discovery of a subject | 20 s on average, 29 s worst case, streamed as 4 visible steps. Repeats are served from the cache in under 0.2 s |
| Library | 5 tafsir and 7 hadith collections | Loaded in about 25 s. 15,732 hadith are graded sahih or hasan by the primary grader |
| PDF upload | Arabic text PDF (garbled text layer), Arabic scan, English text PDF | Garbled and scanned pages were read by Claude exactly as printed (4–6 s per call). The English PDF was read from its text layer. Approval follows the four-eyes rule |
| Flywheel | Demand board → "Draft a card" | Produces a draft card with verses, Sahihayn hadith, Muyassar tafsir excerpts and a draft explanation; all of the card editor's checks pass |
| Deploy | Production image on a fresh database, and the upgrade of an existing one | A fresh boot seeds everything. An upgrade adds the library, the hadith search index and the science data on start without touching existing data |
| Tests | Unit tests and e2e (no key) | 677 unit tests and 193 e2e tests pass |

## Photos

| Photo | Subject named by vision | Tier | Verses | Hadith | Summary | Muslim science |
|---|---|---|---|---|---|---|
| tench | golden tench fish | sources | 5 | 4 | yes | — |
| brambling | small bird perched on a plant | sources | 5 | 4 | yes | — |
| tabby | cat | sources | 0 | 4 | yes | — |
| bee | honey bee on flowers | sources | 3 | 2 | yes | — |
| ant | leafcutter ant carrying a leaf | sources | 3 | 4 | yes | — |
| sorrel | horse | sources | 5 | 4 | yes | — |
| warthog | warthog | sources (sensitive) | 2 | 2 | — | — |
| ox | musk ox | sources | 2 | 0 | yes | — |
| ram | ram | sources | 2 | 4 | yes | — |
| Arabian_camel | camel caravan in a palm grove | sources | 5 | 4 | yes | kitab-al-nabat |
| candle | lit candle | sources | 2 | 2 | yes | kitab-al-manazir |
| cleaver | butcher's meat stall | sources (sensitive) | 2 | 4 | — | — |
| container_ship | container ship | sources | 5 | 2 | yes | kitab-al-fawaid, kamal |
| dome | copper dome with winged statue | sources | 2 | 0 | yes | — |
| honeycomb | honeycomb with bees | sources | 3 | 2 | yes | canon-of-medicine |
| lampshade | table lamp | sources | 4 | 4 | yes | kitab-al-manazir, book-of-ingenious-mechanical-devices |
| mosque | mosque with dome and two minarets | sources | 5 | 4 | yes | qibla-indicator, geometric-constructions-for-artisans |
| refrigerator | refrigerator | none | 0 | 0 | — | — |
| wing | clouds seen from an airplane | sources | 5 | 2 | yes | — |
| wreck | shipwreck on a beach | sources | 5 | 1 | yes | kitab-al-fawaid |
| strawberry | strawberry | sources | 2 | 0 | yes | kitab-al-filaha |
| fig | fig | sources | 1 | 3 | yes | kitab-al-nabat, kitab-al-filaha |
| banana | banana bunch | sources | 3 | 1 | yes | kitab-al-nabat, kitab-al-filaha |
| pomegranate | pomegranate | sources | 3 | 0 | yes | kitab-al-filaha, kitab-al-nabat |
| alp | mountain valley | sources | 5 | 3 | yes | tabula-rogeriana |
| cliff | rocky cliff | sources | 4 | 1 | yes | — |
| coral_reef | school of reef fish over coral | sources | 5 | 1 | yes | — |
| seashore | lake marina with boats | sources | 5 | 1 | yes | kitab-al-fawaid |
| volcano | lava flow on a volcano slope | none | 0 | 0 | — | — |
| groom | a person | person: not searched | 0 | 0 | — | — |
The **dome** row is from before the tighter rule. After it, the result is ⚪ "We won't guess".

## Known limits

- **First lookups take time.** A subject's first discovery takes 15–30 s; after that it is cached. Popular subjects could be warmed in advance.
- **Without an API key** discovery shows only the passages that contain the word itself. Homographs are filtered by requiring all the words of a multi-word subject; there is no summary.
- **Library and star sources need review before public launch.** The library texts are mirrors of public digital editions. The Arabic star-name meanings and the museum records need a specialist check (see `data/sky/README.md` and `data/science/README.md`).
