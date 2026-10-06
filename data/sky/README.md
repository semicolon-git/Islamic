# Sky mode data

`stars.json` is the bright-star catalogue behind Sky mode (`/sky`, `/sky/star/[id]`). It is generated, then committed, so the
app never needs the network.

```bash
node scripts/sky/build-stars.mjs            # downloads the pinned HYG file (sha256-checked) into prep/data/raw/ and rebuilds
node scripts/sky/build-stars.mjs --csv FILE # same, from a copy you already have
```

## What is in it

- **Selection:** every star of V magnitude ≤ 3.0 (177 stars, primary components only, so α Cen B "Toliman" and the
  companions of Capella and Castor, which the eye sees as one point, are left out) plus Thuban (3.65), kept for its history.
- **Fields:** `id` (slug of the IAU name, or of the Bayer designation when the star has no IAU name), `iau`, `name_ar`
  (the original Arabic for Arabic-origin names, otherwise an Arabic-script transliteration of the IAU name, never a
  translation), `bayer`, `hip`, `constellation` / `constellation_en` / `constellation_ar`, `ra_hours`, `dec_deg` (J2000),
  `mag`, `distance_ly` (from the Hipparcos parallax; `null` when unknown), `spectral`.
- **Arabic-origin names** (91 stars) add `arabic_name`, `arabic_translit`, `arabic_part` (`full`, or `hybrid` for names
  such as *Kaus Australis* = Arabic *qaws* + Latin), `meaning_en`, `meaning_ar` and `name_source {citation, url}`.

## Sources and licences

| What | Source | Licence |
|---|---|---|
| Positions (J2000), magnitudes, distances, spectral types, Bayer letters, IAU names | [HYG database v4.1](https://github.com/astronexus/HYG-Database) by David Nash (astronexus), file `hyg/CURRENT/hygdata_v41.csv` at commit `c7f7f883fe678cc7680169a50ccd7dcc49b060ce`, sha256 `d9f69fd8…4ebd` (see the script). HYG compiles the Hipparcos, Yale Bright Star and Gliese catalogues. | **CC BY-SA 4.0.** `stars.json` is a derivative, so it is shared under CC BY-SA 4.0 too, with this attribution. |
| Star names | IAU Working Group on Star Names (WGSN), as carried in HYG v4.1 | Facts (names) |
| Arabic origin, Arabic form, transliteration, meaning | P. Kunitzsch & T. Smart, *A Dictionary of Modern Star Names*, 2nd ed. (Sky Publishing, 2006), cited per star "s.v. *name*"; background: P. Kunitzsch, *The Arabs and the Stars* (Variorum, 1989). Online secondary summary that cites Kunitzsch: Wikipedia, "List of Arabic star names". | Short factual citations |
| Constellation names (Arabic) | Standard Arabic astronomical usage (e.g. القيثارة، الجبار، ذات الكرسي) | — |
| Astronomy | [astronomy-engine](https://github.com/cosinekitty/astronomy) 2.1.19 (npm) | MIT |

## Rules we followed for the Arabic names (please keep them)

1. **Never invent an etymology.** A star gets Arabic fields only when its name's Arabic origin and meaning are well
   established in Kunitzsch & Smart. Names whose derivation is disputed or uncertain are deliberately left without them:
   Alioth, Mirach, Mirzam, Scheat, Algenib, Hassaleh, Athebyne, Lesath, Kraz, Tejat and Matar, among others.
2. Names that are Greek or Latin (Sirius, Canopus, Arcturus, Capella, Procyon, Spica, Antares, Regulus, …) have no Arabic
   fields even where Arabic has its own traditional name for the star (e.g. الشعرى for Sirius): the field means "the
   modern name comes from Arabic", not "the Arabs had a name for it".
3. Hybrid names carry `arabic_part: "hybrid"` and the page says "Part of this name comes from Arabic".

## Review status

The curated table in `scripts/sky/star-names.mjs` was compiled from the references above while the build machine could
not reach Wikipedia or the IAU site, so it has **not yet been checked line by line against a copy of Kunitzsch & Smart**.
Like the rest of the demo content (see `docs/content/CONTENT_REVIEW.md`), it needs that check by a specialist before public
launch; the star pages say so ("awaiting review by a specialist"). When an entry is confirmed or corrected, edit
`star-names.mjs` and re-run the script; the build fails if a curated name no longer matches a star.
