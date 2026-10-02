# Manuscript demo corpus: al-Qāmūs al-muḥīṭ (three copies, ten pages)

This folder is the real-manuscript corpus for the "Signs Around You" collaborative transcription demo. It holds page images, layout (regions and line polygons/baselines), human ground-truth text, an honest machine draft, a Quran-quotation scan and a collation of copies (مقابلة النسخ).

- **Work:** القاموس المحيط والقابوس الوسيط, the Arabic lexicon of Majd al-Dīn al-Fīrūzābādī (d. 817/1415). It is a content-neutral reference work.
- **Excerpt:** every page comes from *Bāb al-hamza* (entries آء … حلأ). The three copies contain the same entries, so the pages overlap and can be collated.
- **Not used:** Dalāʾil al-khayrāt, the Sufi manāqib, the Persian poetry, the Christianity risāle and Taftāzānī. No page with a Quranic passage needed Taftāzānī, because the lexicon itself quotes Q 43:15 (see the Quran section).

## Layout

```
index.json                      corpus + manuscripts (metadata, licence, credit) + page summaries
collation.json                  aligned overlapping passages between copies, with word variants
stats.json                      CER per page/copy/overall, chance baseline, Quran hits, collation summary
<ms_id>/manifest.json           one manuscript: metadata + pages
<ms_id>/pages/<page_id>.jpg     web image, long side 2000 px, JPEG q82
<ms_id>/thumbs/<page_id>.jpg    thumbnail, long side 400 px
<ms_id>/pages/<page_id>.json    layout + ground truth + draft (schema below)
scripts/                        re-runnable conversion pipeline
```

The folder is about 5.5 MB in total.

### Page JSON

```jsonc
{ "page_id": "umich-isl-22_02", "manuscript_id": "umich-isl-22", "folio": null, "label": "...",
  "image": "pages/umich-isl-22_02.jpg", "thumb": "thumbs/...", "width": 1332, "height": 2000,
  "source": { "repo", "commit", "alto", "image", "source_width", "source_height", "scale" },
  "gt_source": { "by", "reliability", "note" },
  "regions": [{ "id": "r1", "type": "main|margin|title|catchword|other", "polygon": [[x,y],...],
                "source_type": "Main", "source_id": "eSc_textblock_..." }],
  "lines": [{ "id": "l1", "region_id": "r1", "order": 1, "polygon": [[x,y],...], "baseline": [[x,y],...],
              "gt_text": "…" | null, "gt_status": "transcribed|reference_unverified|untranscribed",
              "source_id": "eSc_line_...",
              "draft_text": "…", "draft_conf": 32, "draft_words": [{ "t": "…", "conf": 44 }],
              "cer": 0.68, "cer_folded": 0.67 }],
  "draft": { "label": "Tesseract (open-source OCR) draft", "label_ar", "engine", "line_crop",
             "cer_page", "cer_folded_page", "gt_chars", "gt_words_found", "note" },
  "quran_hits": [{ "kind", "status", "line_ids", "text", "verses", "sura_ar", "canonical_uthmani", ... }] }
```

- **Coordinates** are integer pixels of the web JPEG. Multiply by `1/source.scale` to get the source image.
- **Reading order:** lines are numbered title, then main text, then catchword, then marginal material, then unassigned. Arabic baselines run left to right in pixel space; the text itself is right-to-left.
- **`folio` is null.** The source only gives scan or extract numbers, kept in `label` and `source.*`. No foliation was read from the images.

## The three copies

| ms_id | Library and shelfmark | Pages (source file) | What it shows | Licence (confidence) |
|---|---|---|---|---|
| `umich-isl-22` | University of Michigan Library, **Isl. Ms. 22** (HathiTrust `mdp.39015079126200`) | `university_of_michigan_isl_ms_221.pdf_page_1..3` | Clean, fully vocalised naskh with red rubrics and a gold-ruled frame. Page 01 has the **illuminated headpiece «باب الهمزة»**. This is the "easy" copy. | **Public domain**, HathiTrust rights `pd` (**high**). The stamp "Public Domain / hathitrust.org/access_use#pd" and the handle are printed in the margin of each scan. |
| `sbb-or-fol-215` | Staatsbibliothek zu Berlin – PK, **Ms. or. fol. 215** (Ahlwardt 6973) | `sbzb_ms_or_fol_215/00000016..18` | Vocalised naskh with red section heads, a double frame, pin-holes, and **oblique marginal glosses**. The glosses are segmented but untranscribed, which makes them good "help us read this" targets. | **Public Domain Mark 1.0** (**medium**). This is what SBB applies to its digitised oriental manuscripts. The item-level page could not be reached; older SBB scans were CC BY-NC-SA. |
| `bnf-arabe-5341` | Bibliothèque nationale de France, **Arabe 5341** | `…arabe_5341.pdf_page_3,4,5,7` | Unvocalised, crowded cursive hand on a grayscale (microfilm-type) scan, with big bold section heads and marginal notes. This is the "hard" copy. | **Gallica terms** (**high** for the general terms, item not opened): free **non-commercial** reuse with the credit «Source gallica.bnf.fr / BnF». **Commercial reuse needs a paid BnF licence.** |

**Credit lines.** Copy them from `index.json → credit_line`.

**Copy dates are `null`.** None of the catalogue sites (HathiTrust, Qalamos, Gallica) were reachable from the build sandbox. Fill them in from the catalogues before publication. Do not guess.

**Layout and ground-truth text.** These come from [OpenITI/arabic_ms_data](https://github.com/OpenITI/arabic_ms_data) at commit `c131f89`: eScriptorium ALTO-4 exports made for training Arabic-script HTR. The repo has a README but **no licence file**. Credit "OpenITI arabic_ms_data", and ask the maintainers (OpenITI / Jacob, last committer) before redistributing beyond the demo.

**If the product is or becomes commercial,** replace the BnF copy or license it. Public-domain alternatives already in the same repo with ALTO text are:
- U-M **Isl. Ms. 12**, which covers the same entries as SBB scans 17 and 18;
- SBB **Glaser 33**, which covers the same entries as SBB scan 17 and Isl. Ms. 22 page 02;
- Penn **LJS 387**, which has no overlap and only low-resolution web images.

## How the files were made

1. **`scripts/build_pages.py`** does the layout work:
   - It parses the ALTO: `OtherTag` labels (Main, Marginal Material, Title, Catchword, Interlinear) are referenced from `TextBlock/@TAGREFS`, along with `Shape/Polygon`, `TextLine/@BASELINE` and `String/@CONTENT`.
   - It maps the labels to our region types.
   - It gives lines that sit in eScriptorium's `eSc_dummyblock_` (no region) their own region. That region's type is inferred from position: `margin` if the line lies outside the main block, otherwise `other`. `source_type` says that the type was inferred.
   - It scales all coordinates to the web JPEG and writes the images and thumbnails.
   - It checks that the image size equals the ALTO `Page` WIDTH/HEIGHT; all ten pages match.
2. **`scripts/render_check.py`** draws the polygons and baselines on the web images. Four pages (umich 01 and 02, SBB 01, BnF 04) were inspected by eye. Lines, baselines and regions sit on the ink. A few source polygons have spikes, for example umich 01 l3, which juts into the right margin. These are kept as they are in the source.
3. **`scripts/ocr_lines.mjs`** produces the machine draft:
   - **Engine:** tesseract.js 7.0.0 with the Arabic LSTM model `ara.traineddata` loaded from a local file (`TESSDATA`, the directory holding `ara.traineddata` from tesseract-ocr/tessdata_best). The default CDN (jsdelivr) is blocked in the sandbox.
   - **Settings:** OEM LSTM_ONLY, PSM 7 (single line).
   - **Line crops:** taken at full source resolution from the line polygon. The polygon is dilated by 6 px, and everything outside it is painted with the local paper tone. The crop is rotated by the baseline angle, auto-contrasted and Otsu-binarised.
   - **Settings that were tried and dropped** (A/B test on 45 lines): height-normalising, PSM 13 (raw line) and the `tessdata` standard model. None did better. The `tessdata_best` float model does not run in tesseract.js's LSTM-only core.
4. **`scripts/merge_score.py`** does the rest:
   - merges the draft into the page JSONs and computes CER;
   - runs the Quran scan (it imports `match`, `exact_hits`, `norm` and `span` from `prep/scripts/match_inscription.py`, which uses KFGQPC Hafs v18);
   - aligns the overlapping copies and writes `index.json`, the manifests, `collation.json` and `stats.json`.

### Re-running

Total run time is about 4 minutes: build about 1 min, OCR about 20 s, scoring and Quran scan about 3 min.

```bash
cd data/manuscripts/scripts
python3 build_pages.py            # needs Pillow; MS_SOURCE=<arabic_ms_data checkout>, MS_WORK=<scratch>
npm install && node ocr_lines.mjs # TESSDATA=<dir with ara.traineddata>
python3 merge_score.py            # needs prep/data/raw (run prep/fetch_sources.sh once)
python3 render_check.py           # optional QA overlays -> $MS_WORK/check/
rm -rf node_modules               # keep the folder small (node_modules is git-ignored anyway)
```

Two runs gave identical CER for every page.

## Machine draft quality (honest numbers)

**How CER is computed:** Levenshtein distance over text with diacritics and tatweel stripped, punctuation and separators (• ⊙ ، digits) removed, and spaces collapsed. Spaces count. "Folded" additionally merges alef/hamza seats, ى/ي and ة/ه.

**Chance baseline:** each line is scored against the draft of a *different* line of the same copy. A draft only carries information where its CER is clearly below this baseline.

| Copy | CER | CER folded | Chance baseline | GT words found in draft |
|---|---|---|---|---|
| umich-isl-22 (pp. 01–03) | 0.739 / 0.755 / 0.765 → **0.753** | 0.738 | 0.808 | 1.5–2.8 % |
| sbb-or-fol-215 (pp. 01–03) | 0.783 / 0.820 / 0.819 → **0.807** | 0.794 | 0.847 | 0.9–2.2 % |
| bnf-arabe-5341 (pp. 01–04) | 0.529 / 0.531 / 0.517 / 0.523 → **0.525** | 0.508 | 0.785 | 2.5–5.7 % |
| **All (314 transcribed lines, 24,522 chars)** | **0.702** | 0.686 | – | – |

- **Summary.** About 30 % of characters are right, which is above the 5 % "unusable" threshold. But on the two vocalised naskh copies the draft is **barely better than chance**, and almost no whole word is right. On the unvocalised BnF hand the draft is clearly informative: CER 0.52 against a baseline of 0.79.
- **Why the vocalised copies do worse.** The dense vowel signs, red ink and frame rules break Tesseract's print-trained Arabic model. The draft often starts with `|` or `[`, which is the frame rule.
- **Labelling.** Ship the draft as «Tesseract (open-source OCR) draft» and present it as something to correct, not a reading. A manuscript-trained HTR model (for example a Kraken/eScriptorium model trained on this very OpenITI data) would be the honest upgrade.

## Quran quotations

**What was scanned:** every GT line, every two-line window within a region, and sub-line word windows of 5–12 words (exact matches only).

**Result:** three hits, all the same verse, one in each copy, inside the entry جزأ: «وجعلوا له من عباده جزءا» = **Q 43:15 (al-Zukhruf)**, a partial verse. The lexicon glosses it «أي إناثًا».

| Page | Lines | Text in copy |
|---|---|---|
| umich-isl-22_02 | l33 | وَجَعَلوُا له من عِبَادِهِ جُزءًا |
| sbb-or-fol-215_03 | l12–l13 | وَجَعَلوُا له من عِبَادِهِ جُزءًا (runs across the line break) |
| bnf-arabe-5341_03 | l26 | وجعلوا له من عباده جزءا |

- No whole line or two-line window matched exactly or nearly. There were no false positives.
- **For the jury:** this is a normal lexicographic citation, not devotional content. The UI should still render it with the KFGQPC text (`canonical_uthmani` is stored with each hit) and treat it under the platform's Quran-text rules.

## Collation of copies (مقابلة النسخ)

All ten pages overlap. `collation.json` aligns them word by word on normalised GT text, giving 15 page pairs with 29–407 shared words each, and lists each variant with line ids on both sides.

| Pair | Shared words | Word agreement | Variants |
|---|---|---|---|
| umich 01 l12–35 ↔ SBB 01 l1–30 | 407 | 0.975 | 4 |
| umich 02 l3–24 ↔ SBB 02 l1–32 | 357 | 0.992 | 2 |
| umich 03 l17–37 ↔ BnF 04 l1–28 | 271 | 0.81 | 43 |
| umich 01 l14–33 ↔ BnF 01 l1–27 | 270 | 0.78 | 57 |
| SBB 01 l4–27 ↔ BnF 01 l1–27 | 257 | 0.76 | 55 |
| umich 02 l16–34 ↔ BnF 03 l1–28 | 256 | 0.88 | 30 |
| umich 02 l1–16 ↔ BnF 02 l4–26 | 239 | 0.87 | 29 |
| umich 02 l24–37 ↔ SBB 03 l1–18 | 222 | 1.00 | 0 |
| umich 03 l1–13 ↔ SBB 03 l18–34 | 211 | 1.00 | 0 |
| (6 shorter pairs in `collation.json`) | | | |

**Best demo:** the entry جزأ with Q 43:15 is on all three copies (umich 02, SBB 03, BnF 03). So are the بدأ/بذأ/برأ run (umich 01, SBB 01, BnF 01) and بوأ (umich 02, SBB 01–02, BnF 02).

**The BnF variants are mostly real orthographic and copy variants:** hamza dropped (حتا / حَتَاءَ), ظ/ض, and words omitted or added. Some are transcription noise.

### Caveat: the SBB ground truth was copied from the Michigan copy

The SBB `gt_text` is **character-identical to the Michigan transcription**, including vowel signs and slips, over about 800 words. The same `similarity` 1.0 shows up in the table above. It was evidently produced by pasting the Isl. Ms. 22 text and re-splitting it into lines, and it does not always follow the Berlin manuscript.

**Checked against the image:** on SBB page 01 (scan 00000016), line l16, the manuscript reads «بذأه كمنعه الرجل الفاحش وقد بذأ ويثلث بذاء وبذاءة …». The scribe skipped «رأى منه حالا كرهها واحتقره وذمه والأرض ذم مرعاها وكبديع», a likely eye-skip from one «كمنعه/كبديع» to the next. But `gt_text` has the Michigan wording.

**How this is marked in the data:**
- `gt_source.reliability` is `"low"` for SBB;
- its lines carry `gt_status: "reference_unverified"`;
- `index.json` has the note;
- SBB CER figures are only approximate.

**For the demo this is a feature.** Collation against the image exposes a real scribal omission *and* an error in the "ground truth". That is exactly the case for human verification on the platform.

## Other caveats

- **Rubrics, catchwords and headings are not regions.** The source ALTO for these copies only uses `Main` and `Marginal Material` (plus unassigned lines). Red rubrics, the illuminated heading and the catchwords sit inside main-text lines or are unsegmented. No `title`, `rubric`, `catchword` or `seal` regions occur, although the schema allows them.
- **Untranscribed lines:** 55 lines have `gt_text: null`, mostly marginal glosses (SBB 16 + 7 + 11, BnF 3 + 6 + 4 + 8; 4 of them are empty main-text lines: BnF 03 ×2, BnF 04, SBB 03). They still have drafts.
- **The Michigan images include the HathiTrust stamp** (left margin) and the "Digitized by / Original from University of Michigan" footer.
- **Duplicate source folder:** `firuzabadi_al_qamus_al_muhit/…arabe_5267/` in the source repo actually holds Arabe 5341 pages 1–2. They were not used.
- **Licence confidence:** "high" means the statement was read from the image or from the library's published general terms. "medium" means it is based on the library's standard practice and was not checked on the item page. Verify each `source_url` / `catalogue_url` from a normal network before launch.
