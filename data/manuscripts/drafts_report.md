# Claude vision drafts: how they were made and how good they are

**Files:** `<ms_id>/drafts/<page_id>.claude.json`, one per page, ten pages and 369 lines (main text and margins).
**Engine label:** `claude-vision (offline, Claude Code agent, 2026-10-02)`.
**Status:** unreviewed machine draft. It plays the part of the platform's "AI draft" for the demo.

## Headline

| | Claude draft | Tesseract draft (`stats.json`) |
|---|---|---|
| **CER, corpus standard** (diacritics and tatweel stripped, spaces count) | **0.105** | 0.702 |
| CER, folded (plus alef/hamza seats, ى/ي, ة/ه) | 0.055 | 0.686 |
| **CER, folded with spaces removed** (the normalisation this task asked for) | **0.057** | 0.706 |

All figures cover the same 314 lines that have ground truth (GT), 24,522 characters by the corpus standard. The Tesseract figures recomputed here match `stats.json` exactly, so both engines are scored by the same code: `norm_cer`, `fold` and `lev` copied from `scripts/merge_score.py`.

## Per page

CER is pooled per page as Σ edits / Σ GT characters, over lines that have GT.

| Page | GT lines | Claude CER (std) | Claude CER (folded) | **Claude CER (folded, no spaces)** | Tesseract CER (std, `stats.json`) | Tesseract CER (folded, no spaces) |
|---|---|---|---|---|---|---|
| umich-isl-22_01 | 35 | 0.109 | 0.055 | **0.059** | 0.739 | 0.751 |
| umich-isl-22_02 | 37 | 0.089 | 0.035 | **0.039** | 0.755 | 0.765 |
| umich-isl-22_03 | 37 | 0.123 | 0.058 | **0.064** | 0.765 | 0.781 |
| sbb-or-fol-215_01 ⚠ | 33 | 0.177 | 0.125 | **0.131** | 0.783 | 0.793 |
| sbb-or-fol-215_02 ⚠ | 32 | 0.111 | 0.054 | **0.057** | 0.820 | 0.830 |
| sbb-or-fol-215_03 ⚠ | 33 | 0.119 | 0.055 | **0.061** | 0.819 | 0.830 |
| bnf-arabe-5341_01 | 27 | 0.079 | 0.034 | **0.033** | 0.529 | 0.512 |
| bnf-arabe-5341_02 | 26 | 0.059 | 0.027 | **0.030** | 0.531 | 0.504 |
| bnf-arabe-5341_03 | 27 | 0.046 | 0.022 | **0.026** | 0.517 | 0.519 |
| bnf-arabe-5341_04 | 27 | 0.094 | 0.077 | **0.047** | 0.523 | 0.500 |
| **umich-isl-22** | 109 | 0.107 | 0.049 | **0.054** | 0.753 | 0.766 |
| **sbb-or-fol-215** ⚠ | 98 | 0.137 | 0.079 | **0.084** | 0.807 | 0.817 |
| **bnf-arabe-5341** | 107 | 0.070 | 0.041 | **0.034** | 0.525 | 0.509 |
| **All** | **314** | **0.105** | **0.055** | **0.057** | **0.702** | **0.706** |

Reading the numbers:

- **Std vs folded.** On the vocalised copies, most of the gap between the standard and folded CER comes from hamza seats and alef forms. The Claude draft writes them as the vocalised copy shows them (for example الأصل, بَدْأَة), while the GT often uses bare alef (الاصل). That gap is spelling convention, not misreading.
- **BnF is the "hard" copy for Tesseract but the easiest to score.** Its GT is unvocalised and follows the scribe closely. Most of the remaining Claude errors there are hamza conventions: the GT writes حدء, the draft writes حدا.
- **Margins.** 55 lines have `gt_text: null`: almost all SBB and BnF marginal glosses, plus 4 empty main-text slots. They are not scored, but every one is drafted, and they have the most `unclear` tokens. The scored margin lines are a handful of BnF glosses.

## ⚠ The Berlin (SBB) numbers are pessimistic, because its GT follows Michigan

The README notes that the SBB `gt_text` was pasted from the Michigan transcription and re-split into lines. The Claude draft was read from the Berlin image, so wherever the Berlin scribe differs from Michigan, a correct reading counts as an error.

After all drafts were saved, I checked several of the worst SBB lines against the image again. In each case the manuscript supports the draft, not the GT:

- **SBB 01 l16:** the image reads «بذأه كمنعه الرجل الفاحش وقد بذأ ويثلث …». This is the eye-skip the README describes. The draft follows the image, but the GT holds the Michigan wording, so this one line has CER 0.70.
  - The skipped words were not lost. The Berlin scribe wrote them in the margin with a صح mark: SBB 01 l48–l49, drafted as «رأى منه حالا كرهها واحتقره وذمه / والأرض ذم مرعاها وكبديع صح».
  - This adds to the README's account. The omission was corrected in the margin, which makes it an even better collation and verification example.
- **SBB 03 l19:** the image reads «والاسم كهمزة **وغراب وعمدة** واجتشأ». Michigan and the GT lack «وغراب وعمدة».
- **SBB 02 l15:** the image reads «ومحمد بن **عبدان وأحمد بن محمد** ومحمد بن عمر بن تانة». The GT has «ومحمد بن عبد الله».
- **SBB 01 l11 and l22:** the image has extra phrases such as «وفي عوده وبدئه» and «وابن قبيصة …» that are missing from the GT.

So the SBB CER (0.084 folded, no spaces) is an upper bound. With GT read from the Berlin images, the Berlin figure would probably fall to about the level of the Michigan pages (≈0.05). That is an estimate and was not measured. I did **not** edit any draft after seeing the GT.

## Method

1. **Blind extraction.** A script read each page JSON and kept only `page_id`, image path, size, region ids and types, and for each line `id`, `region_id`, `order`, `polygon` and `baseline`. It wrote these to a scratch `layout.json`. Nothing else from the page JSON was read or printed before the drafts were saved: no `gt_text`, no Tesseract `draft_text`, no `cer`.
2. **Crops** (Pillow, in `/home/user/scratch/drafts/<page>/`):
   - Each line was cropped from the web JPEG by its polygon bounding box with 8 px padding.
   - Lines whose baseline slopes more than 4° (the oblique margins) were rotated by the baseline angle first.
   - Small crops were upscaled ×2.
   - Each page also got "strips" of 3–4 consecutive lines, each labelled with its line id. Lines wider than about 700 px were split into an overlapping right half and left half, so the vision model sees each half at about 2× magnification.
   - For marginal blocks, the whole region was also rendered rotated, with each line's baseline drawn and labelled with its id. This maps the oblique glosses onto line ids.
   - Single difficult words were re-zoomed when needed.
3. **Transcription:**
   - Every line was read from these images, page by page and strip by strip, in reading order.
   - **Spelling:** the scribe's spelling is kept. The Michigan copy is given its full vocalisation, and Berlin is vocalised too. BnF is left unvocalised and without hamza wherever the scribe has none (حتا, بدا, شي).
   - **Rubrics:** red or gold headwords, ج, ع, د and ة, and section heads are `{"t":"hi","rend":"red"}` tokens. The Michigan headings «باب الهمزة / فصل …» are `rend:"gold"`. On the grayscale BnF scan, rubrics were recognised as the pale, heavy ink.
   - **Uncertain words** are `unclear` tokens with a best reading `v`, up to 2 `alts` and `conf` (0.15–0.6).
   - **Illegible stretches** are `gap` tokens with an approximate `extent`.
   - Totals: 156 `unclear` tokens and 3 `gap` tokens.
4. **Saving.** Per-line notes were kept in a compact markup (`<r:…>` for rubric, `{v|alt|conf}` for unclear, `[gap:reason:n]` for gaps). A converter turned them into the platform token format and checked that every line id in the page JSON appears exactly once. `plain_text` joins the token values, with `[…]` for gaps.
5. **Scoring.** Only after all ten draft files were written did I read `gt_text`, `stats.json` and the rest of the README, and compute the CER above.

**Blindness statement.** The drafts were produced from line and region images only. No `gt_text`, Tesseract draft text, `stats.json`, `collation.json` or README sample text was looked at before all ten draft files were saved. One kind of prior knowledge could not be switched off: the model knows the *Qāmūs* and Arabic lexicographic phrasing. That can help with worn words, and it can also hurt (see error type 4). After scoring, I re-checked a few SBB lines against the image to explain the SBB numbers. The drafts were **not** changed.

**How useful is the uncertainty marking?** On Michigan and BnF, a word in a plain `text` token matches a GT word (folded) 85 % of the time. A word in an `unclear` token matches only 42 % of the time: 30 % at conf < 0.4, 43 % at conf 0.4–0.5 and 63 % at conf ≥ 0.55. The flags point reviewers to the right places, and `conf` is roughly ordered, though slightly optimistic at the top. Exact word match is a strict test, since GT spelling conventions also count as misses.

## Five typical errors

All five examples are real diffs from the scoring, after normalisation.

1. **Hamza and alef spelling conventions.** These make up most of the residual "errors" on BnF and Michigan.
   - BnF 04 l7: GT «حدء حدء … ترخيم حدءه», draft «حدا حدا … ترخيم حداه».
   - Michigan 01 l35: GT «بكاءت … بكاء», draft «بكات … بكا».
   - The scribe wrote a seated or dropped hamza, and the GT transcriber spelled it out with ء (or the reverse). These would vanish under a hamza-insensitive fold. They are not reading errors.
2. **Misread words in dense or rubricated passages.** These are genuine errors and were all flagged `unclear` with low conf.
   - Michigan 03 l22: GT «وبندقة بن», draft «وبنو قيس» (flagged).
   - Michigan 03 l23: GT «واليه لجا», draft «والطير نجاه» (flagged, conf 0.2).
   - Michigan 03 l33: GT «الحبنطاء / كجرد حل», draft «الحنظأو كجردحل».
3. **Dotting and letter-shape confusions** in naskh with crowded vocalisation.
   - Michigan 01 l1: GT «يقايلون الحرز», draft «يتأملون الحر».
   - Michigan 03 l36: GT «تراده», draft «براده».
   - Michigan 01 l10: GT «ومرينه», draft «ومرتبة» (flagged).
4. **Lexicon prior and repetitive lists.** In the long بادي بدء… run of synonyms, the draft once inserted an extra pair.
   - BnF 01 l6: the draft adds «بدء وبادي» that is not on the line.
   - The model's familiarity with the *Qāmūs* can make it "complete" a formulaic list. Reviewers should check enumerations word by word.
5. **Marginal glosses and scribal deletions.**
   - BnF 03 l31, a 6-letter marginal gloss: GT «المرزح», draft «الخشن».
   - BnF 04 l23: the GT keeps a struck-through phrase (U+0336) «كالحنطاوة والقصير». The draft omits it as a scribal deletion, which costs 0.34 CER on that line. On BnF 04 l20 the draft transcribed the struck words as ordinary text.
   - The token model has no "deleted" type. A `del` token would let drafts and GT agree here.

## Issues and notes

- **No line was left empty.** Very faint SBB and BnF marginalia have low-confidence `unclear` readings. Three stretches are `gap` tokens: SBB 01 l35 ×2 and BnF 04 l13. The SBB gloss readings (Hagia Sophia note on 01 l34–l38, Persian bird and plant names on 02 l37) are weak and should be treated as suggestions.
- **Layout oddities:**
  - SBB 03 l7 is a tiny 7×23 px polygon; it got a conf-0.15 guess.
  - BnF 04 l13 runs vertically in the gutter.
  - Several BnF "margin" lines are short glosses that duplicate main-text words.
- **Rubric marking** on BnF is inferred from ink tone on a grayscale scan and may miss some heads.
- **Files touched.** Only the ten new `drafts/*.claude.json` files and this report were added. No existing corpus file was modified. Scratch crops, notes and the scoring script are in `/home/user/scratch/drafts/`.
