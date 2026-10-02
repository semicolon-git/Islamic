# Manuscript Workspace: Domain Research Memo
## «مساحة المخطوطات» in Signs Around You · آيات حولك

**Audience:** the engineering team building the collaborative manuscript workspace, and the sharia scholar and manuscript specialist who will review it.
**Scope:** how Arabic/Islamic manuscripts are written and why machines misread them; the tradition's own conventions; standards; lessons from collaborative transcription platforms; linking to Islamic sources; ethics; and a prioritized MVP spec with a data model and UI.
**Date:** 2026-10-02. **Status:** research input. It is not a policy decision.

### How to read the confidence marks

Every substantive claim carries one of these marks:

- **(H) High:** standard knowledge in the field, or verified against a source in this session.
- **(M) Medium:** I believe it is correct, but it varies by region or period, or I could not open the primary source.
- **(L) Low:** plausible. Verify it before the UI or the docs depend on it.

Bracketed codes such as [S4] or [K1] point to §9. **S** means a search in this session confirmed the item's existence or its key figure; most primary sites (arXiv, CEUR, Calfa, Shamela, unicode.org, archive.org) were blocked from the sandbox, so I read abstracts and snippets, not full papers. **K** means the claim comes from established literature I know but could not fetch. I have not invented any source. Where I could not verify something, I say so.

---

## 0. Executive summary: the decisions that matter

1. **Keep two layers and never merge them.** The **diplomatic layer** (النص كما في المخطوط) records what the scribe wrote, including errors, missing dots and abbreviations. The **reading layer** (القراءة/النص المقروء) holds expansions, regularizations and editorial suggestions. Machines and students propose changes to the reading layer. Nobody "corrects" the diplomatic layer except to fix a *misreading of the image*. This one rule prevents the worst embarrassment, an AI that "fixes" a Quranic quotation or the scribe's spelling.
2. **Store semantics, not brackets.** Arabic critical editions use `[ ]` for editorial additions and `﴿ ﴾` for Quran. Leiden convention uses `[ ]` for restored lost text and `( )` for expanded abbreviations. The two systems collide, so store typed spans (`supplied`, `gap`, `unclear`, `abbr`, `quran_quote`…) and render brackets through a selectable **style profile** (Arabic-tahqiq style or Leiden/EpiDoc style) [K5][K10].
3. **Use the line as the unit of work.** The page is the unit of approval, and the token is the unit of uncertainty. Students edit line by line with the page image always visible. Only *flagged hard tokens* go to double-keying. Full-page multi-keying (the Zooniverse model) costs too much for a scarce, expert-level script.
4. **Model the scribal marks** («صح»، «خ»، «بلغ»، «ظ»، الضبة، التخريج/اللحق، الدارة…) **as first-class annotations with a palette, not as typed text.** This is where generic tools such as Transkribus, FromThePage and Zooniverse fail Arabic manuscripts.
5. **Expand abbreviations by genre, with a human confirming.** «خ» means *nuskha* (another copy) in a margin and *al-Bukhārī* in a rijāl or takhrīj context. «م» can mean *Muslim*, *maʿrūf* (in al-Qāmūs) or *maʿan* («معاً»). There is no global find-and-replace.
6. **Quran linking runs beside the manuscript, never over it.** Detect the quote, show the canonical KFGQPC text in a side panel, and mark the differences neutrally ("differs from the Ḥafṣ text"). A manuscript differs for one of three reasons: a scribal slip, another *qirāʾa* (for example Warsh in Maghribi manuscripts), or an older orthography. Only a researcher decides which, and the manuscript text is never changed.
7. **Set realistic OCR/HTR expectations.** Fine-tuned models reach about 5% CER on a single consistent hand. Generic models across varied historical hands land at about 9–17% CER. Margins, rotated glosses and damaged pages are much worse, and **layout fails before recognition**. Vision LLMs are useful as a *drafting* aid but produce fluent text the page does not support. The draft is a starting point, and the UI must make that obvious [S1–S10].

---

## 1. Why Arabic manuscripts are hard for machines (HTR/OCR)

### 1.1 Script-level problems

| Phenomenon | What happens on the page | Why it breaks HTR | Implication for UI and data |
|---|---|---|---|
| Connected cursive and contextual forms | Most letters take 4 forms (isolated/initial/medial/final). Six letters (ا د ذ ر ز و) do not join leftward, so words break into "parts of words" (PAWs). (H) | Word and character segmentation is ill-defined. Spaces between PAWs look like spaces between words. Line-level, segmentation-free models (CTC/attention) are the norm for this reason. (H) | Tokenize by *words in the reading*, not by visual gaps. Store a token's `bbox` as optional and approximate. |
| Ligatures and stacking | لا is obligatory. Scribes stack letters vertically (ligatures such as لمحـ, يحـ, the ascending مـ). In Nastaʿlīq and some Naskh hands, word-final strokes climb toward the next word. (H) | Glyph order on the baseline does not follow logical order. Vertical stacks get skipped or reordered. | Show the line image *large*, with zoom, next to the edit field. Never show only a word crop. |
| Missing or variant dots (iʿjām) | Many scribes leave letters undotted, especially final ي/ى, ة written as ه, and teeth (ٮ) in a cluster. Some hands use *ihmāl* marks (a small letter below, e.g. ح under ح, or a ٮ-shaped or v mark above ر/س/ص/ط/ع) to say "this letter is deliberately undotted." (M; Gacek [K3][S24]) | HTR guesses dots from a language model, so it "fixes" the text silently. Ihmāl marks look like dots or tashkīl and get misread as letters. | The diplomatic layer must allow dotless letters: U+066E ٮ, U+06A1 ڡ, U+066F ٯ, U+06BA ں, U+0649 ى. Add a token flag `dots: "absent" \| "partial" \| "as_written"`. |
| Diacritics (tashkīl) | Usually sparse: vowels appear only where ambiguity matters, and in Quran, ḥadīth and poetry. Shapes vary: sukūn as a circle, as a *jīm/khāʾ* head or as a short stroke; shadda as a small س-like shape; vowel signs sometimes in red. (M) | Models trained on undiacritized text drop the vowels. Models trained on fully diacritized print hallucinate them. | **Never let the machine add tashkīl.** Record tashkīl only where it is written. Report CER with and without tashkīl (§4.7). |
| Early dot vocalization | Early Qurʾāns (Ḥijāzī/Kufic) mark vowels with **red dots** (the Abū al-Aswad system) and hamza with other coloured dots (yellow or green). (H) | Unicode tashkīl cannot represent this faithfully. Converting red dots to fatḥa or kasra is interpretation. | Keep it out of the MVP. If needed, represent it as an annotation layer (`vocalization_system: "dots"`), not as tashkīl codepoints. |
| Hamza and orthography | Hamza is often omitted or "eased": مسايل for مسائل, جا for جاء, ساير for سائر. Alif maqṣūra and yāʾ are interchangeable, and so are ة and ه. The long *a* may be unwritten (older/Uthmānī-like spellings: ثلثة، الرحمن). (H) | A language model normalizes these toward modern spelling. | These are **not errors** in the diplomatic layer. The reading layer can regularize (`reg`), and that is optional and visible. |

### 1.2 Regional and stylistic scripts

| Script | Where and what | Specific hazards |
|---|---|---|
| **Naskh** (نسخ) | The book hand for most scholarly copying in the Mashriq from about the 4th/10th century. (H) | The best-supported script. Even so, HTR fails on careless *riqʿa*-like book hands (late Ottoman scholars' copies). |
| **Thuluth** (ثلث) | Titles, headings, *ʿunwān*, inscriptions. (H) | Heavily stacked and decorative. Usually rubricated headings, where reading order is unclear. |
| **Muḥaqqaq / Rayḥānī** | Large Qurʾāns (Mamluk, Ilkhanid). (H) | Wide spacing, elongated horizontals and ornament mixed in. |
| **Maghribī** (مغربي) | North Africa and al-Andalus. **fāʾ has one dot below (ڢ) and qāf has one dot above (ڧ).** Wide final curves, and final ف/ق/ن/ي are often undotted. (H) [S22] | A Mashriqī-trained model reads Maghribī ف as ق or ب. Prefer Maghribi-specific models [S1][S2][S3]. Unicode note: U+06A2 ڢ and U+06A7 ڧ exist to keep the graphic distinction when the source requires it. For ordinary reading text, use ف/ق and let a Maghribī font render them (M) [S22]. **Decision:** store ف/ق, set `hand.script = "maghribi"`, and offer ڢ/ڧ only as a diplomatic option. |
| **Sūdānī / West African** (سوداني) | Sahel and West Africa. Maghribī-derived dotting with heavy, thick strokes. (H) | Little or no training data. Expect very high CER. |
| **Nastaʿlīq / Taʿlīq / Shikasta** | The Persianate world. Arabic texts in Iran and India, and very often the **marginal notes and ownership statements** in them. (H) | The baseline descends steeply right to left, words stack, and dots drift. Training data is mostly Persian. |
| **Ruqʿa** (رقعة) | Ottoman, from the 19th century, for documents and quick notes. Late *ḥawāshī*, ownership and reading notes are often in Ruqʿa even when the main text is Naskh. (M) | A **different hand from the main text on the same page**, so a page needs per-zone models. |
| **Kufic** (كوفي) | Early Qurʾāns and headings. Dots are sparse or absent. (H) | Out of scope for HTR in the MVP. Offer "manual transcription only". |
| Dīwānī, Siyāqat | Chancery documents and accounting. Siyāqat numerals are a separate system. (H) | Out of scope. Detect and flag. |

### 1.3 Page-level problems

- **Layout: matn and ḥawāshī (متن/حواشٍ).** The page has a ruled text block (often made with a *misṭara*) plus marginalia on all sides, in several hands and centuries (H). Marginal glosses are often written **obliquely (about 45°), rotated 90° or 180°, or spiralling** around the text block, to fit (H). Commentaries (*sharḥ*) carry the base text (*matn*) inside them, marked by **red ink or overlining (khaṭṭ fawqa)** of the lemma (H).
  → *Implication:* a line needs `orientation_deg`, `zone` (main/margin/interlinear/…), `hand_id` and `reading_order`. A gloss needs an **anchor** to a word or line in the main text. Transcribe the main text first, then the margins.
- **Rubrics (red ink).** These include headings, the words قال/أقول/قوله/المتن/الشرح, section dividers, and overlines that mark the lemma (H). → Use `rend: ["red"]`, `rend: ["overline"]`. The editor must be able to *show* them.
- **Catchwords (taʿqība, تعقيبة).** The first word of the next page is written at the lower left of the *b*-side (verso) to keep the folios in order (H) [K3][K4]. → Use zone type `catchword` (TEI `<fw type="catch">`). **Exclude it from the running text**, otherwise the word appears twice in reading view. Use it to check folio order.
- **Interlinear glosses and vowelling** are written above words: synonyms, short explanations, grammatical parses (H). → Use `place: "above"` and anchor the gloss to a token.
- **Physical damage:** ink corrosion and bleed-through, water stains, wormholes (the classic *arḍa* damage), trimmed margins that cut off glosses, repairs and patches, faded red ink (H). → Use the `gap` reason codes `damage | trimmed | faded | illegible | blank_by_scribe | lost`. Never guess silently.
- **Text the scribe left out:** the scribe may leave a blank (بياض) where the exemplar was illegible (M). → `gap reason="blank_by_scribe"` is different from damage.
- **Numerals and dating:**
  - Arabic-Indic digits (٠–٩, U+0660–0669) and Eastern/Persian digits (۰–۹, U+06F0–06F9) look different for 4, 5 and 6 (H).
  - **Abjad numerals and chronograms** (ḥisāb al-jummal) encode dates in letters (H).
  - The Maghrib also used *Rūmī/Fāsī* (zimām) numerals (M).
  - Foliation in Arabic catalogues uses **و (wajh, recto) and ظ (ẓahr, verso)**, or أ/ب (H) [K4].
  - Many manuscripts have **no original foliation**. Catalogue foliation was added later in pencil, often in Western digits.
  → Store `folio: 12, side: "a"|"b"` and display it as «١٢و / ١٢ظ». Never derive folio numbers from the image sequence.
- **Images:** photographs show gutter curvature, spreads (two pages per image), colour casts and microfilm-derived greyscale. → Use IIIF canvases at folio-side level and support spread splitting.

### 1.4 What current tools achieve (realistic numbers)

CER means character error rate: (substitutions + deletions + insertions) ÷ reference characters. Numbers are **not comparable across papers**. They depend on line or page level, whether layout came from ground truth, and whether tashkīl and dots are counted.

| System or study | Material | Reported result | Conf. |
|---|---|---|---|
| Kraken / OpenITI AOCP (Romanov, Miller, Savant, Kiessling 2017) [S6] | Arabic and Persian **print** | >97%, sometimes >98% character accuracy with about 800–1,000 training lines | H |
| Calfa Vision on **RASAM 1** (BULAC Maghribi mss.) [S1] | Maghribī manuscripts, 300 images | about 4.8% average CER (word-based approach) | H |
| Lucas, Salah, Vidal-Gorène 2022 [S2] | Maghribī manuscripts | <5% CER after fine-tuning on **about 10 manually transcribed pages** | H |
| **RASAM 2** (CHR 2024) [S3] | 3,750 lines, 15 BULAC manuscripts | about a 40% CER reduction across new in- and out-of-domain manuscripts versus earlier models; absolute values not checked here | M |
| Transkribus public model "Arabic Khat 17–20th c. handwritten" [S7] | Mixed (RASAM, Svoboda Diaries, QDL biographies) | **15.4% CER** on validation | H |
| Transkribus "Agapet 13th c." [S7] | Christian Arabic manuscripts | 7.48% CER on validation | H |
| **Muharaf** (NeurIPS 2024 D&B) [S4] | 1,644 pages (1,216 public under CC), 19th–20th c. Lebanese archival material: letters, church records, legal papers. **Not Islamic scholarly codices.** | Baseline page-level CER about 13–16% depending on split. HATFormer cites the baseline as 17.6%. | M |
| **HATFormer** (2024) [S5] | Muharaf, **line-level** (lines given) | **8.6% CER** | H |
| **KITAB-Bench** (ACL Findings 2025) [S8] | Multi-domain Arabic OCR, mostly modern | VLMs (GPT-4o, Gemini, Qwen) beat classical OCR by about 60% CER on average. Best PDF→Markdown (Gemini-2.0-Flash) only about 65% accurate. Failures: numerals, elongation (kashīda), tables | H |
| "When do VLMs help Arabic manuscript OCR?" (preprint, 2026) [S9] | 8 datasets, >7,700 samples | No single system is uniformly best. VLM correction of an OCR draft helps when the draft is readable, and **hurts on Maghribī** and other script-mismatched input | M |
| VLM failure study (Greek and Arabic editions, preprint 2026) [S10] | Printed editions | **Fluent text not supported by the page**, repetition collapse, markup emission, off-script output | M |

**What to expect in our pilot (my estimate, M/L):**

- Clean Naskh book hand with good images and a model fine-tuned on 10–30 pages of the same manuscript or scribe: **about 4–8% CER**.
- The same hand with a generic model or a zero-shot VLM: **about 10–20% CER**.
- Marginalia, Nastaʿlīq/Ruqʿa notes, damaged leaves and Maghribī read with a Mashriqī model: **25–50%+**, or unusable.
- Line detection on oblique margins often fails entirely, so a human draws the line.

**Where all of them fail:**

1. Layout: rotated margins, reading order, glosses anchored to the text.
2. Dots and ihmāl marks.
3. Abbreviations, which get expanded or dropped silently.
4. Quranic quotations, which get normalized to the canonical text.
5. Numerals and dates.
6. Rubrics and overlines, because colour is lost.
7. Hallucinated tashkīl.
8. Model self-reported "confidence", which is not calibrated. **Never show an LLM's self-reported number as a probability**; the review doc §6 already flags "Moon · 94%".

**Engineering implications:**

- The draft pipeline is: layout (Surya, Kraken or manual) → line images → HTR or VLM → tokens with `machine.conf` and `alts`.
- If a VLM is used, prompt it for **transcription only, line by line, with the line image**. It may output `[?]` for an uncertain token. It must not expand, correct, add vowels, or normalize to the Quran text.
- Measure CER on 3–5 pages of gold standard before any public claim.
- Use the student-corrected lines as **ground truth for fine-tuning** a per-collection Kraken or Transkribus model. This is the measurable "data flywheel" that RASAM shows works with very few pages [S2].

---

## 2. The manuscript tradition's own conventions

Generic tools fail here. The sources are:

- the classical *adab al-kitāba* and ḥadīth-transmission manuals: Ibn al-Ṣalāḥ's *Muqaddima*, section 25 «في كتابة الحديث وكيفية ضبط الكتاب وتقييده» [K1], and al-Qāḍī ʿIyāḍ's *al-Ilmāʿ* [K2];
- Gacek's glossary and *Vademecum* [K3][S24];
- Déroche et al., *Islamic Codicology* [K4];
- the Arab editorial tradition (al-Munajjid; ʿAbd al-Salām Hārūn) [K5].

### 2.1 Marks the scribe or reader put on the text

| Mark | Arabic term | Meaning | Data model | Conf. |
|---|---|---|---|---|
| «صح» over a word | تصحيح | "Correct as written." The word looks odd or doubtful, but the copyist confirms it matches the exemplar. | `metamark{function:"sahh", target: token}`. Do not treat it as text. | H [K1] |
| «صح» at the end of a marginal insertion | — | Confirms the marginal addition belongs in the text (it is not a gloss). | `add{place:"margin", confirmed_by_sahh:true}` | H [K1] |
| Truncated ص (a "ضبّة") over a word or passage | تضبيب / ضبّة | Transmitted this way but faulty or doubtful in wording or meaning. A warning, not a correction. | `metamark{function:"dabba"}` + `unclear`-like rendering in the reading layer | H/M [K1] |
| A line from the text toward the margin (sometimes curved), with the missing words in the margin | التخريج / اللَّحَق / علامة الإلحاق | Insertion of words the copyist omitted. The marginal text often runs upward and ends with «صح» (sometimes «رجع»). | `add{place:"margin_left/right", anchor: between tokens}` + `metamark{function:"takhrij"}` | H/M [K1] |
| «خ» / «نـ» / «نسخة» / «في نسخة» beside a marginal word | نسخة | **A variant reading from another copy**. It does *not* correct the text. | `variant{witness:"nuskha_unspecified", lem: tokens, rdg: text}` | H [K3] |
| «ظ» beside a marginal word | الظاهر | "The apparent (correct) reading is probably…" A reader's conjecture. | `variant{type:"conjecture", marker:"ظ"}` | M [K3] |
| «م» / «معاً» over a vowel | معاً | Both vowellings are valid. | `metamark{function:"maan"}` on the token | M |
| «م» … «مؤ» (or «مقدم» / «مؤخر») over two words | تقديم وتأخير | Transposition: read them in the other order. | `metamark{function:"transposition", order:[…]}` | M |
| Strike-through; or «لا» at the start and «إلى» at the end; or «من…إلى»; or enclosing semicircles; or the word «زائد» | الضرب / الشقّ / التحويق | Deletion. The scribe cancels text and prefers striking to erasing (ḥakk), so the text stays legible. | `del{rend:"strike"\|"la_ila"\|"bracket"\|"zaid"}` | H/M [K1] |
| «كذا» above a word | — | "Thus (in the exemplar)": *sic*. | `metamark{function:"sic"}` | H |
| «بلغ» / «بلغ مقابلة» / «بلغ قراءةً» / «بلغ سماعاً» + name/date (margin) | البلاغات | **Collation or reading progress.** Marks how far a reading or collation session reached. | `note{type:"balagh", subtype:"collation"\|"reading"\|"audition", persons, date}` | H |
| ○ circle between ḥadīths; ⊙ circle with a dot or line inside | الدارة | A separator. The dot inside is added once the passage is **collated** (al-Khaṭīb's practice). | `metamark{function:"dara", collated:true\|false}` | M/H [K1] |
| Small letter below or above a letter (e.g. ح under ح) | علامات الإهمال | "This letter is undotted" (it disambiguates it from its dotted twin). | Token `ihmal:true`. Not a character. | M [K3] |
| Numbers over words, or ascending dot-numbers | — | Word order or count marks in some copies | `metamark{function:"other", note}` | L |

**UI implication:** build a **Marks palette** (§7.3) whose buttons create these typed annotations *on a selection*. Their rendering in the image overlay and the text is distinct (an icon plus a coloured underline). **They must never be typed as letters into the text.** A student who types «صح» inline has corrupted the text with a word that is not in the manuscript.

### 2.2 Paratexts: the notes that make a manuscript a historical document

| Paratext | Arabic | What it is | Structured fields |
|---|---|---|---|
| Colophon | قيد الفراغ / خاتمة النسخ | Typically: completion formula (تمّ… بحمد الله وعونه…), scribe's name, date (often with weekday), place, sometimes the patron and the exemplar. Often set in a triangular (inverted-pyramid) block. (H) | `scribe`, `date_text`, `date_hijri{y,m,d,weekday}`, `place`, `patron`, `exemplar_note`, `is_copied_colophon?` |
| Copied colophon | — | **Scribes sometimes copied the exemplar's colophon**, so the stated date is not the date of this copy. (H) [K4] | `colophon_kind: "original"\|"copied"\|"unknown"`, set only by a researcher |
| Ownership statement | تملّك | «دخل في ملك…»، «من كتب…»، «في نوبة…», often with a purchase price and date, in many hands and over centuries. (H) | `owner`, `date`, `price?`, `hand`, `seal_ref?` |
| Seal | ختم | Owner's or waqf seal, often with the owner's name and a date or motto. (H) | Zone type `seal` + transcription of the legend (often reversed or illegible) |
| Waqf statement | وقفية / قيد وقف | «وقف لله تعالى…», with the endowment conditions and the library. Sometimes a seal. (H) | `waqf_by`, `beneficiary_institution`, `conditions`, `date` |
| Audition certificate | سماع / طبقة السماع | Records a reading session: reader (القارئ), authority (المُسمِع/الشيخ), listeners (السامعون), the portion read, date, place, the certificate's scribe (كاتب الطبقة), and whether a listener was absent for part (فوت). (H) | `event{type:"samaa", reader, shaykh, listeners[], portion, date, place, writer}` |
| Licence | إجازة | Licence to transmit, with the chain of transmission. (H) | `event{type:"ijaza", grantor, grantee, scope, date, chain[]}` |
| Reading or perusal note | قيد قراءة / مطالعة / نظر | «طالعه…»، «نظر فيه…» (H) | `note{type:"mutalaa"}` |
| Title page | الظهرية / صفحة العنوان | Title and author, often added **later**. Sometimes wrong (misattribution). (H) | `title_as_written` ≠ `title_attested` |
| Glosses | حواشٍ / تعليقات / تقريرات | Marginal commentary, sometimes signed with the glossator's sigil, e.g. «منه» = the author's own note, «اهـ» at the end. (M/H) | `note{type:"gloss", hand, anchor, signed_as?}` |

**Implication:** a researcher-level form for "paratext events" is a **SHOULD** for the MVP. A paratext is a *person-and-date graph*, which is the most scholarly-valuable output and the most attractive to institutions. "Copied colophon" and "title attestation" must be explicit fields so the app never asserts a date or author from a single note.

### 2.3 Abbreviations: a vetted table

**Rules:**

- **(a)** The diplomatic layer keeps the abbreviation exactly as written.
- **(b)** The reading layer may show the expansion. A human confirms it, or it carries `cert` from a genre-aware suggestion.
- **(c)** The suggester must know the **genre** (ḥadīth / rijāl / fiqh-sharḥ / lexicon / general) and the **zone** (main text vs margin), because the same sign means different things.

Sources: Ibn al-Ṣalāḥ [K1], Gacek [K3][S24], the introductions of the works named [K14–K16]. I could not open Gacek's appendix in this session, so items not from the classical manuals are marked M.

| As written | Expansion | Context or genre | Notes | Conf. |
|---|---|---|---|---|
| ثنا، نا، دثنا | حدّثنا | Ḥadīth isnād | The classic shortenings | H |
| ثني | حدّثني | Isnād | | M |
| أنا، أرنا، أبنا | أخبرنا | Isnād | Ibn al-Ṣalāḥ notes أرنا and أبنا (al-Bayhaqī) as less common | H/M |
| أنبا | **أنبأنا** (not أخبرنا) | Isnād | ⚠ Distinct term. In later usage أنبأنا often signals transmission by ijāza. **Do not auto-map it to أخبرنا.** | M |
| قثنا | قال حدّثنا | Isnād | قال is often omitted in writing between narrators but read aloud | M/H |
| ح (between two isnāds) | تحويل (switch to another isnād) | Isnād | Other readings reported: حائل, or «الحديث» (some Maghāriba) | H (meaning) / M (variants) |
| اهـ، اه، ا.هـ | انتهى | Any: end of a quotation or gloss | Very common in ḥawāshī | H |
| إلخ، الخ | إلى آخره | Any | | H |
| المص، المصـ | المصنِّف | Sharḥ / ḥāshiya | | H |
| الش، الشـ | الشارح (sometimes الشيخ) | Sharḥ / ḥāshiya | Context decides | M |
| ص / ش (as paragraph labels) | المتن / الشرح | Sharḥ layouts (also common in printed editions) | | M |
| حـ، ح (inside prose) | حينئذٍ | Sharḥ, kalām, fiqh | ⚠ Collides with ح = taḥwīl in isnāds | M |
| ظ (margin) | الظاهر | Margin | ⚠ In catalogues ظ = ẓahr (verso) | M (margin) / H (catalogue) |
| خ، نـ، نخ (margin) | نسخة (another copy) | Margin | ⚠ Collides with خ = al-Bukhārī | H |
| م (over a vowel) | معاً | Vocalization | | M |
| مم / لانم | ممنوع / لا نسلّم | Ādāb al-baḥth, kalām, uṣūl disputation | | M |
| صلعم، صلم، صلع، ص، صم | صلى الله عليه وسلم | Any | Classical scholars **disapproved** of abbreviating the taṣliya (Ibn al-Ṣalāḥ; al-Nawawī). Record it as written; the reading layer shows the full formula. Do not inject ﷺ (U+FDFA) where the scribe wrote the full words or nothing. | H |
| ع، عم، عـ | عليه السلام / عليهم السلام | Any (ع is more frequent in Shīʿī texts) | ⚠ In al-Qāmūs ع = موضع | M |
| رضه، رض | رضي الله عنه | Any | | M/H |
| رح، رحه، ره | رحمه الله | Any (ره is common in Persianate and Shīʿī texts) | | M |
| تع، تعـ | تعالى | Any | | M |
| قده | قدّس سرّه | Ṣūfī and Persianate | | M/H |
| Honorific signs U+0610–U+0614 (e.g. U+0612 = رحمة الله عليه); ﷺ U+FDFA | — | Unicode | Use only if the manuscript shows a *ligature-like sign*. Otherwise transcribe the letters. | H (codepoints) |
| خ، م، د، ت، س (or ن)، ق (or هـ)، ع، ٤، خت | al-Bukhārī; Muslim; Abū Dāwūd; al-Tirmidhī; al-Nasāʾī; Ibn Mājah; all six (al-jamāʿa); the four Sunan; al-Bukhārī taʿlīqan | Rijāl (al-Mizzī's *Tahdhīb al-Kamāl*, Ibn Ḥajar's *Taqrīb*) | Genre-specific. Never apply outside rijāl or takhrīj works. | H [K14] |
| ق، حم، ك، حب، طب، طس، طص، هق | agreed upon by both (Bukhārī & Muslim); Aḥmad; al-Ḥākim; Ibn Ḥibbān; al-Ṭabarānī (*al-Kabīr / al-Awsaṭ / al-Ṣaghīr*); al-Bayhaqī (*al-Sunan*) | al-Suyūṭī, *al-Jāmiʿ al-Ṣaghīr* and works that follow it | ⚠ Here ق = *muttafaq ʿalayh*, not Ibn Mājah | M [K16] |
| م، ع، د، ة، ج، جج | معروف؛ موضع؛ بلد؛ قرية؛ جمع؛ جمع الجمع | al-Fīrūzābādī, *al-Qāmūs al-Muḥīṭ* (and lexica that follow it) | A clear example of genre dependence | H [K15] |
| م ر، حج، ع ش، سم، ق ل، ز ي | al-Ramlī; Ibn Ḥajar al-Haytamī; ʿAlī al-Shabrāmallisī; Ibn Qāsim al-ʿAbbādī; al-Qalyūbī; al-Ziyādī | Late Shāfiʿī ḥawāshī | Do not reuse these mappings in Ḥanafī or Mālikī texts | M |
| عج | عجّل الله فرجه (Shīʿī) / al-Ujhūrī (late Mālikī) | Context | ⚠ A collision of meanings | M/L |
| هـ after a year | هجرية | Mostly modern cataloguing and print. Pre-modern colophons usually write «من الهجرة النبوية» in words. | | M |
| الآية / الآيةَ / إلى آخر الآية | "…(the rest of) the verse" | After the first words of a Quranic verse | The scribe quotes the opening and expects the reader to continue. Link to the **whole** verse, but show only the written words as quoted. | H |
| الحديثَ | "…(the rest of) the ḥadīth" | Same convention for ḥadīth | | M/H |

**Implementation:**

- Use a per-project **abbreviation lexicon** with fields `{form, expansion, genres[], zones[], collisions[], source, conf}`.
- The suggester proposes an expansion only when the genre matches. Otherwise it shows *all* candidates.
- The student confirms with one key (`Ctrl+Shift+E`, then 1–9). The researcher can lock a mapping for the whole manuscript.

### 2.4 Critical editing (تحقيق المخطوطات) and what it means for us

- **Choosing the base copy (الأصل / النسخة الأم).** The usual order of preference is:
  1. the author's autograph (بخط المؤلف);
  2. a copy read to or checked by the author;
  3. a copy collated with the autograph;
  4. older and well-collated copies (ones with «بلغ», sama'at and corrections).

  Late or uncollated copies come last (H) [K5]. A copy is not better just because it is older (H).
- **Sigla for witnesses (رموز النسخ).** Often (أ)، (ب)، (ج), or letters derived from the library (e.g. ظ for al-Ẓāhiriyya) (M). They are declared in the edition's introduction. → The data model needs a `witnesses[]` list with `siglum`, library, shelfmark, date and role (`base` / `collated`).
- **The apparatus (الحواشي/الهوامش)** is in footnotes: «في (ب): …», «سقط من (ب)», «زيادة من (ج)», «ما بين المعقوفين من (ب)» (H). → TEI `<app><lem wit><rdg wit>` [K6].
- **Brackets in Arabic editions.** Each editor declares them in the «منهج التحقيق» section. There is **no single universal standard** (H). Common practice (M):

  | Bracket | Usual use |
  |---|---|
  | `[ ]` | Additions from another copy or source, or from the editor |
  | `﴿ ﴾` | Quranic text, with sūra:āya in a footnote. Saudi university guidelines require ornate brackets plus sūra and āya numbers [S23]. |
  | `« »` | Ḥadīth or quotations |
  | `( )` | Varies: sometimes book titles, sometimes Quran in older editions, sometimes the matn in a sharḥ |
  | `< >` | Sometimes the editor's conjectural additions |

  **Decision:** store semantics and render by profile.
- **Scribal errors versus the edited text.** Many Arab editions (including Saudi thesis guidelines) put the corrected reading in the text and the manuscript reading in a footnote ("التصويب في المتن والإشارة في الحاشية") [S23]. Others keep the base text and correct in the note.
  → Our **diplomatic layer is not an edition**. An edition is a *view* generated from: base witness + accepted `corr` + `supplied` + apparatus. Both are recoverable only if the raw reading is never overwritten.
- **Quranic quotations in manuscripts.**
  - Scribes quote from memory, in their region's *qirāʾa* (Warsh/Qālūn in the Maghrib, al-Dūrī in parts of Africa), in common (imlāʾī) spelling rather than the Uthmānī *rasm*, and sometimes with slips (H).
  - Modern editors usually typeset the quotation from a printed muṣḥaf and footnote the sūra and āya (M) [S23].
  - **Rule for us:** the diplomatic layer keeps the scribe's text. The Quran panel shows the canonical text (KFGQPC Ḥafṣ v18, already pinned in `prep/`) and a neutral diff. A researcher classifies the difference as `scribal_slip | qiraa_variant | orthographic | paraphrase/iqtibas | unknown`. **The word "error" never appears in the UI for a Quranic difference before a researcher classifies it.**
- **"Middle Arabic" and non-standard grammar** (for example, feminine agreement or dropped final hamza) are features of the text, not transcription mistakes (H). → A `reg` (regularize) suggestion is allowed only in the reading layer, and it is off by default.
- **Naming:** a transcription made in our tool is «نسخ/تفريغ نصّي مُراجَع» (a reviewed transcription), **not «تحقيق»**. Calling it taḥqīq in front of a specialist would be a credibility error (§7.6).

---

## 3. Standards and interoperability

### 3.1 Layers

| Layer | Content | Who edits | Export |
|---|---|---|---|
| **Image** | IIIF canvas per folio side | Institution | IIIF Image and Presentation 3.0 [K8] |
| **Layout** | Zones (regions) and lines: polygon, baseline, orientation, reading order | Machine, then student | PAGE-XML (primary), ALTO 4 |
| **Diplomatic** | Tokens as written, plus states (unclear/gap/…) | Machine draft, then student. A researcher can "lock" lines. | TEI `<lb/>`-based transcription; PAGE `TextEquiv` |
| **Reading / normalized** | `expan`, `reg`, `corr`, `supplied` | Student proposes, researcher accepts | TEI `<choice>`; plain normalized text for search |
| **Annotations** | Marks, variants, Quran/ḥadīth links, entities, comments | All roles (by type) | TEI + W3C Web Annotation (JSON-LD) [K9] |
| **Workflow** | Proposals, reviews, versions, approvals | — | Internal. Audit as JSON Lines. |

### 3.2 Leiden ↔ TEI ↔ our model

Leiden conventions per EpiDoc [K10] and TEI P5, chapter 11 ("Representation of Primary Sources") and chapter 12 ("Critical Apparatus") [K6] (H).

| Phenomenon | Leiden display | TEI P5 | Our span/token `type` | Arabic-tahqiq display (default profile) |
|---|---|---|---|---|
| Unclear letters | dots under letters (ạḅ) | `<unclear reason="faded" cert="low">` | token `state:"unclear"`, `cert` | dashed underline plus a tooltip with alternatives; optionally (؟) |
| Lost or illegible, extent known | `[...]` or `[- - -]` with count | `<gap reason="illegible\|damage" extent="3" unit="word"/>` | `gap{reason, extent, unit}` | […] with a tooltip: «بياض/طمس بقدر ٣ كلمات» |
| Lost but restored by editor | `[abc]` | `<supplied reason="damage" source="#B">` | `supplied{reason, source_witness?}` | `[ ]`. ⚠ In Leiden `[ ]` means *restored lost text*; in Arabic editions it means *addition*. Same glyph, different meaning. |
| Omitted by scribe, added by editor | `⟨abc⟩` | `<supplied reason="omitted">` | `supplied{reason:"omitted"}` | `[ ]` (or `< >` in some profiles) |
| Deleted by scribe | `⟦abc⟧` | `<del rend="strikethrough">` | `del{rend}` | strikethrough |
| Added by scribe (interlinear/margin) | `\abc/` or `` `abc´ `` | `<add place="above\|margin">` | `add{place}` | superscript or margin icon plus «[في الحاشية: …]» in plain text |
| Substitution | — | `<subst><del/><add/></subst>` | `subst{del, add}` | |
| Abbreviation | `a(bc)` | `<choice><abbr>ثنا</abbr><expan>حدثنا</expan></choice>` (`<am>`/`<ex>` for the parts) | token `abbr{expan, cert, lexicon_ref}` | shown as written, with expansion on hover; reading view: حدّثنا |
| Scribal error and correction | `abc (!)` / `{abc}` superfluous | `<choice><sic/><corr/></choice>`, `<surplus>` | `corr{sic, corr, by}` | text as written plus a footnote suggestion |
| Regularization | — | `<choice><orig/><reg/></choice>` | token `reg` | off by default |
| Line, page, column break | `/`, `‖` | `<lb/>`, `<pb n="12a" facs=""/>`, `<cb/>` | line and surface ids | — |
| Catchword | — | `<fw type="catch" place="bottom-left">` | zone `catchword` | separate, never in the running text |
| Scribal sign («صح»، ضبة، دارة) | — | `<metamark function="sahh" target="#t5">` | `metamark{function}` | icon |
| Gloss | — | `<note type="gloss" place="margin" hand="#h2" target="#t5">` | `note{type:"gloss"}` | side panel and overlay |
| Change of hand | — | `<handShift new="#h2"/>`, `<handNote>` | line or token `hand` | colour badge per hand |
| Variant from another copy | — | `<app><lem/><rdg wit="#nuskha"/></app>` | `variant{witness, rdg}` | apparatus footnote «في نسخة: …» |
| Quran quote | — | `<quote type="quran" source="quran:2:255">` inside `<cit>` with `<bibl>`, or `<seg type="quran" ana="…">` | `quran_quote{verse_keys, match, qiraa?}` | side panel with ﴿canonical﴾ and the diff |
| Person, place, book | — | `<persName ref>`, `<placeName ref>`, `<title ref>` / `<rs>` | `entity{kind, ref}` | linked chip |

**Manuscript description:** use TEI `<msDesc>` (`msIdentifier`, `msContents/msItem`, `physDesc/handDesc`, `history/provenance`, `additional/adminInfo`) as the target for the codex-level record. The Fihrist union catalogue of Islamicate manuscripts in UK libraries uses TEI msDesc, a good model to copy (M) [K6].

### 3.3 Layout formats

- **PAGE-XML (PRImA)** (H) [K7]:
  - Hierarchy: `PcGts › Page › TextRegion › TextLine (Coords polygon, Baseline points) › Word › Glyph`, with `TextEquiv/Unicode` and `@conf` at every level.
  - Region `@type` includes `paragraph`, `heading`, `marginalia`, `catch-word`, `page-number`, `signature-mark`, `drop-capital`, `footnote`.
  - `@readingDirection="right-to-left"`, `@orientation` (degrees), and a `ReadingOrder` element.
  - **This is the best round-trip format with Transkribus and eScriptorium.**
- **ALTO v4** (H/M) [K7]: `Layout › Page › PrintSpace › TextBlock › TextLine (@BASELINE) › String (@CONTENT, @WC word confidence) / SP`. It has polygon `Shape` support and is common in library systems. Export it, but PAGE is primary.
- **SegmOnto** is a shared vocabulary of zone and line types used with eScriptorium and Kraken (M, existence verified) [S-segmonto]. It includes types such as MainZone, MarginTextZone, NumberingZone, QuireMarksZone, StampZone and SealZone, and lines such as DefaultLine, InterlinearLine and HeadingLine. Map our `zone.type` to SegmOnto for portability.

### 3.4 IIIF

- **Image API 3.0** (H) [K8]: `{base}/{id}/{region}/{size}/{rotation}/{quality}.{format}`, e.g. `…/ms12_f003b/1200,800,600,90/max/0/default.jpg` to crop a line. Use this for line thumbnails instead of storing crops.
- **Presentation API 3.0** (H) [K8]:
  - Manifest › `items` (Canvases, one per folio side) › AnnotationPage › Annotation with `motivation: "painting"` for the image.
  - Transcriptions, glosses and comments are Web Annotations with motivations `supplementing` (transcription) or `commenting`, targeting `canvas#xywh=…`, or an SVG selector for polygons.
  - **Set `"viewingDirection": "right-to-left"`** for Arabic codices so viewers (Mirador, Universal Viewer) show spreads correctly.
  - Put rights in `rights` (a CC or rightsstatements.org URI) and the credit line in `requiredStatement` [K18].
- **Viewer and annotation libraries:** OpenSeadragon (deep zoom) + **Annotorious** (polygon annotation on OSD) (H) [K20]. Mirador 3 if a full IIIF viewer is wanted. For the MVP, OSD + Annotorious + our own line list is enough.

### 3.5 Internal JSON token model: principles for lossless export

1. **Stable IDs** for every manuscript, witness, surface, zone, line and token. Annotations are **stand-off** spans `{from_token, to_token}` or an insertion point `{after_token}`. This makes TEI, PAGE and Web Annotation exports straightforward.
2. **The diplomatic token text is the single source of truth.** `expan`, `reg` and `corr` are attributes and never replace it.
3. **Unicode:** store NFC (UAX #15). Keep tatweel (U+0640) only if the student marks it as meaningful, which is rare. Ban presentation forms (U+FB50–FDFF, FE70–FEFF) except ﷺ and similar signs that are deliberately chosen. Ban Persian ی (U+06CC) and ک (U+06A9) in Arabic text unless the hand is Persian. **VLMs and Persian keyboards emit these and they silently break search and diffs** (H) [K12].
4. **Search form, separate from display:** strip tashkīl, unify أإآٱ→ا, ى→ي, ة→ه, and remove tatweel. Add an optional **rasm (skeleton) form** for matching undotted text (§5.1).
5. **Every edit is a proposal against a base version** (`base_rev`). Accepting it creates a new line revision. Nothing is deleted.

---

## 4. Collaborative transcription platforms: what works and what fails

### 4.1 The platforms in brief

| Platform | Model | Lessons for us |
|---|---|---|
| **Transkribus** (READ-COOP) | Page or document editing on PAGE-XML. Roles (owner/editor/transcriber). Page versions with status (New / In progress / Done / Final / Ground truth). Model training. Public Arabic models [S7]. (M) | ✔ Per-page **status** plus version history. ✔ Corrected pages become training data. ✘ No Arabic scribal-mark vocabulary. Tagging is generic (abbrev/unclear/sic/person). Commercial credit model. |
| **eScriptorium + Kraken** (EPHE-PSL) | Open source. Several **named transcription layers per document** ("manual", one per model, imported) [S17]. Ontology for region and line types. IIIF import. ALTO and PAGE export. Built with RTL scripts in mind. (H/M) | ✔ **Multiple transcription layers side by side** (a machine draft that stays visible as a reference). ✔ The best open path to train a per-collection Arabic model. ✘ Weak review workflow. Not built for volunteers or students. |
| **FromThePage** | Page-level wiki editing. **"Needs review" flag**, which can be required on every page. Wiki-style `[[subject]]` links that build an index. IIIF import. **TEI export with full revision history** [S16]. (H) | ✔ Subject linking as a by-product of transcription. ✔ Review flag. ✔ Attribution in export. ✘ Free-text markup is error-prone for Arabic RTL. |
| **Zooniverse** (Shakespeare's World, AnnoTate, Anti-Slavery Manuscripts, **Scribes of the Cairo Geniza**) | Line-level micro-tasks. **Independent multi-keying** with retirement after N classifications, then algorithmic aggregation. **ALICE** (Aggregate Line Inspector and Collaborative Editor) for reviewing the aggregated output [S15]. The Geniza project sorted fragments into Hebrew or Arabic script and formal or informal (**5 classifications per subject before retirement**) and then ran transcription with **custom keyboards and markup for Hebrew and Arabic scripts** designed for non-experts [S14]. (H) | ✔ Line-sized tasks lower the barrier. ✔ Sorting/triage as a beginner task. ✔ On-screen script keyboard. ✘ Independent N-keying is costly. Shakespeare's World's original aggregation **produced fewer successfully transcribed lines than expected** [S15]. Zooniverse research found "collaborative" (see-others'-work) transcription a viable, often more efficient alternative (M) [S15]. |
| **Recogito** (Pelagios) | Semantic annotation of text and images: places, people, events. Gazetteer linking. Underlying JS: Annotorious and RecogitoJS (H) | ✔ Entity tagging UX: select, type, link to an authority. ✔ Reuse **Annotorious** for image polygons. |
| **Scripto** (RRCHNM) | Omeka (Classic/S) + MediaWiki transcription. Wiki history and talk pages (H) | ✔ Wiki-grade history and discussion. ✘ Wiki markup for RTL Arabic is a usability trap. |
| **Wikisource ProofreadPage** | Page status: **Without text → Not proofread → Problematic → Proofread → Validated.** "Validated" requires a **different user** from the proofreader. IP users cannot change status [S13]. (H) | ✔ The simplest proven two-person validation rule. ✔ A "Problematic" state for pages that need discussion. **Copy both.** |
| **Smithsonian Transcription Center** | Anyone transcribes; **a different registered volunteer reviews** (sends back or completes); **staff approve**, and may reopen [S11]. (H) | ✔ Almost exactly our 4-stage chain. It has run for over a decade, which validates the design. |
| **Library of Congress "By the People"** (Concordia, open source) | Transcribe → submit → **another volunteer reviews; you cannot review your own work** (unless someone else edits and resubmits) [S12]. (H) I could not verify a Benjamin Franklin–specific crowd campaign. LoC put the Franklin papers online in 2018. The transferable model is Concordia. | ✔ A "no self-review" rule enforced in code. ✔ Campaign-based organization. |

### 4.2 Task granularity: decision

- **Page:** the unit of *assignment and approval*. Scholars think in folios, and paratexts span lines.
- **Line:** the unit of *editing, locking, review comments and diffs*. The student sees the whole page image, with the current line highlighted and zoomed.
- **Token:** the unit of *uncertainty and adjudication*. Only tokens flagged `unclear` (by the machine with low confidence, or by a person) enter a **"hard words" queue**, where two students read the token independently with the line image and without seeing the other's reading.
  - Agreement → `cert=high`, auto-accepted for researcher spot-check.
  - Disagreement → the researcher adjudicates.

This spends double-keying only where it buys accuracy.

### 4.3 Consensus and adjudication: the 4 stages mapped

| Stage | Role | Action | Gate |
|---|---|---|---|
| 0 `machine_draft` | System | Layout + HTR/VLM draft. `machine.conf` and `alts` per token. | Read-only for students as "machine layer". Their working copy starts from it. |
| 1 `student` | Student (طالب) | Corrects lines, flags uncertainty, applies marks and abbreviations, proposes Quran links | Submit requires: every line touched or marked "checked", and no unresolved `[?]` without a flag |
| 2 `researcher` | Researcher (باحث) | Reviews diffs against the machine draft and the previous revision. Accepts or rejects per line or token. Adjudicates the hard-word queue. Classifies Quran differences. Fills paratexts. | **Must not be the same user** as any stage-1 contributor on that page (the Wikisource/LoC rule). Can return the page with comments. |
| 3 `institution` | Institution (مؤسسة) | Final approval, rights check, publish scope | **Must not be the same user as the researcher** (already in the review doc). Publishes a **frozen, hashed version**. |
| Published | — | Visible in the app with credit line, contributors and version | Corrections after publication create a new version and an erratum note. The old version stays citable. |

Add a **"Problematic / يحتاج نقاش"** state (Wikisource) usable at any stage. It blocks progress until a researcher resolves it.

### 4.4 Suggestion versus direct edit

- **Students** edit their *working revision* directly, which is fast. Everything they submit is, as a whole, a *suggestion* to the researcher, shown as a diff.
- **Researchers** edit directly, or "accept with modification".
- **Institution** users do not edit text. They return the page or publish it. This keeps the accountability chain clean.
- **Comments** attach to a token, line or zone, and threads can be resolved. A comment never changes the text.

### 4.5 Version history and attribution

- Every line revision stores `{rev, base_rev, author, role, timestamp, diff, comment, client}`.
- Every page approval stores `{stage, user, decision, page_content_sha256}`.
- The published record lists **contributors by role** («نسخ: …، مراجعة: …، اعتماد: …»), plus "machine draft by model X, version Y, date". FromThePage-style TEI export carries the revision history [S16].

### 4.6 Onboarding and training of students

The proven pattern (Zooniverse, Geniza, Smithsonian) is a **short tutorial, a field guide and progressive task difficulty** (H/M). Concretely:

1. A 10-minute in-app tutorial on one sample page: line navigation, flagging, the marks palette, and *"never correct the scribe"*.
2. A **qualification page** with a known gold transcription. The student's CER against gold and their correct use of 5 marks unlocks "real" pages.
3. A **field guide** panel: letterforms by script (Naskh vs Maghribī ف/ق), common abbreviations with images, and the marks. Link to HMML's free Arabic paleography materials (vHMML School) as further study (M).
4. Task ladder: triage (classify zones, mark blank pages) → main text lines → margins and paratexts.

### 4.7 Quality metrics

| Metric | Definition | Use |
|---|---|---|
| CER / WER | Against researcher-approved text. Report **4 variants**: (a) full, (b) without tashkīl, (c) without tashkīl and with hamza/yāʾ/tāʾ-marbūṭa unified, (d) **rasm-only** (dots removed). | (b) is the headline. (d) isolates dot errors from shape errors. |
| Machine draft CER | Machine draft vs final | Model selection, and evidence for judges |
| Student acceptance rate | Share of the student's line edits the researcher accepted unchanged | Feedback to the student, not a public ranking |
| Reviewer edit distance | CER between the student submission and the researcher's accepted version | Calibrates training needs |
| Inter-annotator agreement | On the hard-words queue: % exact agreement. For categorical labels (mark type, Quran-difference class): Cohen's κ (2 raters) or Krippendorff's α | Guideline clarity. A low κ means the guidelines are ambiguous, not that the students are bad. |
| Coverage | % of lines checked, % of tokens flagged, open comments | Page readiness |

### 4.8 Gamification pitfalls

Points for volume reward speed over care. Public leaderboards discourage careful newcomers, and badges for "edits" invite trivial edits (M, widely reported in crowdsourcing literature).

**Decision:**

- Points accrue **only when work is accepted at the next stage**, weighted by difficulty (margins and paratexts count more than main text).
- No public leaderboard. Each student sees only their own progress.
- "Service-learning hours" certificates (review doc §20) are derived from *accepted* work.

### 4.9 Concurrent edits

- For the MVP, use a **soft line lock**: a presence indicator ("Fatimah is editing line 7") plus optimistic concurrency. A save carries `base_rev`. If the head moved, show a 3-way diff (base / theirs / mine) for that line only.
- CRDTs (Yjs) are not needed at line granularity with one student per page.
- Assign each page to one student at a time. The hard-words queue gives parallelism.

### 4.10 Accessibility and RTL editor pitfalls

- **Bidi (UAX #9):**
  - Use `dir="rtl"` on the editor, and `dir="auto"` / `unicode-bidi: plaintext` per line for lines that may contain Latin sigla or digits.
  - Mixed runs like «في (ب) ص 12a» reorder unexpectedly. Wrap Latin and digit runs in isolates (FSI…PDI, U+2068/U+2069) in *generated display strings* only. **Never store bidi controls in token text.**
- **Brackets:** `( ) [ ] { } < >` are Bidi_Mirrored and render correctly in RTL. The ornate parentheses **﴾ ﴿ (U+FD3E/U+FD3F) are not mirrored**, an explicit UTC exemption to protect existing Arabic and Persian data [S22]. In Arabic text the opening bracket on the right is conventionally U+FD3F «﴿», and the closing one is U+FD3E «﴾». Test this in our fonts. Generate these brackets in the renderer, never by typing.
- **Caret movement** in `contenteditable` across bidi boundaries and combining marks is buggy in every browser (H). Use **one plain `<textarea>`/`<input>` per line** (simplest and most robust), or CodeMirror 6, which handles per-line direction (M). Avoid rich-text contenteditable for the diplomatic text. Render marks as overlays and side chips, not as inline rich text.
- **Combining marks and normalization:** shadda + fatḥa typed in either order normalizes under NFC to fatḥa-first order (canonical combining classes: fatḥa 30 < shadda 33) (H) [K12]. **Normalize before diffing**, or diffs show phantom changes.
- **Digits:** keep them as written (٠–٩ vs ۰–۹ vs 0–9). The search form maps all three to ASCII.
- **Keyboard:**
  - Windows "Arabic (101)" gives tashkīl on Shift+Q/W/E/R/A/S/X/~ and similar keys. macOS Arabic layouts differ (M).
  - Provide an **on-screen palette**: tashkīl, dotless letters ٮ ڡ ٯ ں ى, Maghribī ڢ ڧ, hamza forms, ﷺ-type signs, and ZWNJ.
  - **Shortcuts must use `KeyboardEvent.code` (the physical key), not `.key`**. With an Arabic layout active, `.key` returns Arabic letters (H).
  - Avoid Alt/Option+letter: on macOS it types characters, and on Windows AltGr = Ctrl+Alt on some layouts. Use **Ctrl+Shift+letter** on all platforms.
- **Fonts:**
  - Scheherazade New (SIL, OFL) has broad extended-Arabic coverage, including Maghribī letters and honorific signs (M).
  - Amiri (OFL) is good for classical Naskh.
  - Use KFGQPC Hafs (already in `prep/data/raw/fonts`) **only** for the canonical Quran panel.
  - Set `line-height` ≥ 2 for tashkīl.
- **Accessibility:** keyboard-only workflow, visible focus, and contrast (WCAG 2.2 AA). Don't use colour alone for hand or certainty; add patterns or icons. Image alt text: "Folio 12b, line 7 of 19".

---

## 5. Linking to Islamic sources inside manuscripts

### 5.1 Quranic quotations

- **Reuse what exists:** `prep/scripts/match_inscription.py` already matches text to KFGQPC Ḥafṣ v18 with exact / near / none / too_short outcomes, letters-only matching across word breaks, and a minimum length.
- **Extend it for manuscripts:**
  1. **Run it on the *diplomatic* text joined across line breaks** (and across page breaks via the catchword). Quotes often span lines.
  2. **Add a rasm (skeleton) normalization** that maps letters to dotless classes, so undotted or misdotted text still matches:
     - ب ت ث and medial ن ي → ٮ
     - ج ح خ → ح
     - د ذ → د
     - ر ز → ر
     - س ش → س
     - ص ض → ص
     - ط ظ → ط
     - ع غ → ع
     - ف ق → ڡ (Maghribī dotting is then irrelevant)

     Treat final ن, final ي and ى by position. Use it as a *candidate generator*, then score on the dotted text (M, my design).
  3. **Cue phrases** raise the prior: قال تعالى، قوله تعالى، لقوله عز وجل، كما قال الله. «الآية» or «إلى آخر الآية» after a partial quote → link the full verse and mark `truncated_by_scribe:true`.
  4. **Thresholds:** keep MIN_CHARS ≥ 8 letters and add **≥ 3 words**. Phrases like بسم الله، الحمد لله، إن شاء الله، لا حول ولا قوة إلا بالله are formulae, not quotations (H).
  5. **Allusion and embedded quotation** (*iqtibās/taḍmīn*): short Quranic phrases woven into prose, especially in introductions and poetry. Label them `match:"allusion"`, which is weaker than a quotation. A researcher must confirm.
  6. **Qirāʾāt:** if a near-match differs in ways typical of another reading (Warsh vs Ḥafṣ: e.g. ملك/مالك in al-Fātiḥa 1:4, or يعملون/تعملون-type person changes), label it *"differs from Ḥafṣ; possibly another reading"* (M). KFGQPC publishes Warsh and other riwāyāt texts and fonts (M). Load Warsh as a second reference if Maghribī manuscripts are in scope. **Do not use Tanzil to alter text.** Tanzil's licence allows verbatim redistribution only and forbids changes [S18].
- **Display:** the canonical text in a side panel inside ﴿…﴾ with the sūra:āya key. Below it, a word-level neutral diff:
  - "The manuscript has: …"
  - "Ḥafṣ (KFGQPC): …"
  - Researcher class: slip / qirāʾa / orthography / paraphrase.

  The manuscript text in the main editor **never changes**.

### 5.2 Ḥadīth

- **Detection:** attribution formulas (قال رسول الله ﷺ، عن النبي ﷺ، أن النبي ﷺ قال، يرفعه) and isnād chains (sequences of حدثنا/أخبرنا/عن + names). The abbreviations from §2.3 must be expanded *in the search form* before matching. Example: ثنا → حدثنا.
- **Matching:**
  - Fuzzy matn matching against Bukhārī and Muslim (already in `prep/data/raw/hadith`). Later add the LK Hadith Corpus (six books, Arabic–English, isnād/matn segmented; Leeds and King Saud University, LREC 2020) [S20] and Sunnah.com.
  - Ḥadīth is often transmitted **by meaning (riwāya bi-l-maʿnā)**, so lower thresholds apply and the output is **"possible parallel", never "this is ḥadīth #N"**.
- **Grading is never inferred.** That a ḥadīth appears in a manuscript says nothing about its authenticity. Link out to dorar.net for grading, as the prep README already requires, and show grades only after a researcher records them with grader and URL.
- **Benchmarks for this exact failure:** the IslamicEval 2025 shared task (ArabicNLP 2025) targets identification and verification of Quran and ḥadīth citations in LLM outputs [S19]. Its systems (rule-based and retrieval-augmented) are a useful reference for our matcher's design.

### 5.3 Named entities and works

- **Persons:** Arabic names are chains (ism, kunya, nasab, nisba, laqab). The same short form ("أبو بكر", "ابن حجر", "الشيخ") is highly ambiguous (H).
  - Link to **OpenITI/KITAB author URIs** (death year AH, zero-padded to four digits, plus a name, e.g. `0256Bukhari`; book URI `0256Bukhari.Sahih`) (M/H) [K13].
  - Add Wikidata QIDs where they exist.
  - Mark the link `cert`. The researcher confirms.
- **Places:** **al-Thurayyā** gazetteer (Seydi & Romanov; more than 2,000 toponyms from Cornu's atlas, designed for linked data) [S21], plus Wikidata/GeoNames for later periods.
- **Books cited in the text** («قال في المغني»، «وفي الصحيح»): link to OpenITI book URIs. Text reuse between our transcription and the OpenITI corpus (KITAB's passim approach [K19]) can later suggest *which work is being quoted*. That is a SHOULD after the hackathon.
- **Dates:** store `date_text` as written plus a parsed Hijri date. A computed Gregorian equivalent is labelled "≈" (±1–2 days, because tabular and observed calendars differ) (H). If a weekday is stated, check it against the conversion. A mismatch is a *finding*, not an error to fix.
- **Glossary:** link technical terms (مصطلح الحديث، أصول، فقه، كلام) to the project glossary (the review doc's `glossary` table) with bilingual definitions approved by the researcher.

---

## 6. Ethics, rights and trust

### 6.1 Images and licensing

- Rights in the *images* belong to the holding institution, under its terms. Rights in the *text* of a pre-modern work are public domain, but a library's photographs often are not freely reusable (H). Policies vary: some libraries publish under CC0/public-domain mark or CC BY, while many Arab and Gulf collections restrict reuse.
- **Rules:**
  - (a) Every image record carries `rights` (a CC or rightsstatements.org URI), `credit_line`, `source_url`, `permission_doc` and `ai_training_allowed: true|false`.
  - (b) **No model training on images without explicit permission.**
  - (c) The credit line is shown wherever the image is shown (IIIF `requiredStatement`).
  - (d) Demo pages: only CC0, public domain or CC BY with a stored credit line, matching review doc §14 and `data/licenses.csv`.
- **Transcriptions:** recommend publishing approved transcriptions under **CC BY 4.0**, with the institution as publisher and contributors credited. Contributors accept a short contributor agreement at signup. The institution can choose CC0. M (a policy choice).

### 6.2 Attribution, provenance and audit

- Credit every published page by role, with names (or a chosen display name; see §6.4).
- Record the machine draft's model, version, prompt hash and date. This **AI disclosure** must be visible: "Initial draft by machine; verified by…".
- The audit log is append-only: who changed what, from which base, when and why. The institution's publish action records the content hash. This lets the app show «اعتمدته [المؤسسة] بتاريخ … (النسخة ٣)».

### 6.3 Sensitivity: transcription is not endorsement

Manuscripts contain contested material: kalām positions, Ṣūfī practices, sectarian polemic, talismans and *ʿilm al-ḥurūf*, astrology, outdated medicine, and statements about other religions (H).

- **Label** on every published manuscript text:
  > «نصٌّ تاريخيّ نُقل كما ورد في المخطوط لأغراض التوثيق والبحث، ونشرُه لا يعني تبنّي ما فيه.»
  > *"A historical text transcribed as it appears in the manuscript for documentation and research; publication does not imply endorsement of its content."*
- **Publish scope:** `archive_only` (the manuscript reader/search) vs `eligible_for_cards` (may feed the beneficiary app's content). The default is `archive_only`. Feeding the public "Signs" app requires the same scholarly sign-off as any card. This keeps the da'wah-facing app from presenting a disputed historical opinion as "the Islamic view".
- **Content flags** (researcher-set): `theology_disputed`, `sectarian_polemic`, `magic_talismanic`, `medical_historical`, `explicit_content` (rare but real in adab/medicine). They affect visibility in the beneficiary app, never the scholarly archive.
- **Respect:** no ads or decorative overlays on Quranic manuscript images. Quranic folios appear only in respectful contexts.

### 6.4 Student privacy

- Saudi **Personal Data Protection Law (PDPL)**, in force since September 2023 with enforcement from September 2024, supervised by SDAIA (M/H) [K17]. Collect the minimum: name, institution, role and email.
- Students choose a **public display name** (full name, initials or anonymous) for published credits. The default is initials.
- Per-student metrics (acceptance rate, CER) are visible only to the student, their researcher and the institution admin. They are never public.
- Export contributors' data only with consent. Retention: delete inactive student accounts after a stated period. Published credits remain as the chosen display name.

---

## 7. Concrete product requirements

### 7.1 Prioritized list: MUST / SHOULD / COULD

The 3-day hackathon build is Oct 4–6, followed by the pilot. **[H]** means "in the hackathon build". Items without it go to the pilot.

**MUST (core credibility; 18 items)**

| # | Requirement | Rationale |
|---|---|---|
| M1 [H] | **Separate diplomatic and reading layers.** Machine or AI output never auto-corrects. | Prevents silent "fixing" of Quran and scribal text (the #1 expert objection) |
| M2 [H] | LLM/VLM draft prompt is **transcription only**: no expansion, vowelling or normalization; per-token `[?]` uncertainty; line-image input | Vision models hallucinate fluent text [S10]. A prompt that asks the model to "correct diacritics" would silently alter the text. |
| M3 [H] | **Line-synced image ↔ text:** clicking a line highlights its polygon and zooms; moving the caret scrolls the image | The basic transcription ergonomics every platform has |
| M4 [H] | Token uncertainty: `unclear` with `cert` (low/med/high) and **alternatives** (machine and human) shown as chips; never show a model's self-reported % as a probability | Honest uncertainty. Fixes the deck's "94%" issue. |
| M5 [H] | **Gap** insertion with a reason (damage / illegible / blank-by-scribe / trimmed) and extent | Never guess lost text |
| M6 [H] | 4-stage workflow with **role separation enforced in code**: reviewer ≠ transcriber, publisher ≠ researcher; return-with-comment | Proven by Wikisource, LoC and Smithsonian. It is the product's core claim. |
| M7 [H] | Immutable versions: line revisions with `base_rev`, a page approval log, and a **hash-frozen published version** | Trust and citability |
| M8 [H] | **Marks palette** with at least: «صح», «خ/نسخة», «بلغ», حاشية (gloss), لحق/تخريج (insertion), deletion, «كذا». These are typed annotations, never inline text. | The tradition's core vocabulary. Generic tools lack it. |
| M9 [H] | Zones: main text / margin / interlinear / heading (rubric) / catchword / seal-stamp; line `orientation`; catchword excluded from reading text | Margins and catchwords are where naive tools embarrass themselves |
| M10 [H] | **Quran-quote panel:** detection on the diplomatic text across line breaks, canonical KFGQPC text beside it, neutral diff, researcher classification | Never overwrite. Shows the platform's Islamic-content competence. |
| M11 [H] | Abbreviation handling: kept as written, expansion as `<choice>`, confirmed by a human; a genre-aware suggestion list with collisions shown | خ ≠ خ. Avoids misexpansion. |
| M12 [H] | Folio and side identity (`12a/12b`, displayed «١٢و/١٢ظ»), not image index | Basic codicological literacy |
| M13 [H] | Image rights fields plus a visible credit line; demo uses only openly licensed pages | Legal and ethical baseline (review doc §14) |
| M14 [H] | "Transcription is not endorsement" label, and `publish_scope` defaulting to `archive_only` | Protects the da'wah app and the institution |
| M15 [H] | Unicode hygiene: NFC on save, ban presentation forms and Persian ی/ک, normalize before diff, a `search_form` field | Prevents phantom diffs and broken search |
| M16 [H] | RTL-safe editor: one plain input per line, `dir="rtl"`, shortcuts via `KeyboardEvent.code` with Ctrl+Shift, an on-screen Arabic palette (tashkīl and dotless letters) | Avoids the bidi caret and shortcut bugs that break demos |
| M17 [H] | Comments on token, line or zone, with resolve; required comment on "return" | Review conversation without polluting the text |
| M18 [H] | Contributor credits by role, plus AI-draft disclosure, on the published view | Attribution and transparency |

**SHOULD (pilot-grade quality; 14 items)**

| # | Requirement | Rationale |
|---|---|---|
| S1 | PAGE-XML import and export (from and to Transkribus and eScriptorium) | Institutions already use these tools |
| S2 | TEI P5 export (msDesc header + diplomatic and reading via `<choice>`, `<metamark>`, `<add>`, `<del>`, `<gap>`, `<note>`, `<fw>`) | Scholarly interoperability and long-term preservation |
| S3 | IIIF Presentation 3.0 manifests with `viewingDirection: right-to-left`; Web Annotation export | Library standard. Viewers render spreads correctly. |
| S4 | **Hard-words queue** with blind double-keying by two students and researcher adjudication | Spends redundancy only where it matters |
| S5 | Qualification page with a gold standard plus a tutorial and field guide (script letterforms, marks, abbreviations) | Onboarding quality. Geniza and Zooniverse practice. |
| S6 | CER dashboard (4 variants incl. rasm-only), student acceptance rate, κ on labels | Measurable quality for judges and institutions |
| S7 | Paratext forms: colophon (with `copied?`), ownership, waqf, samāʿ, ijāza, as person/date/place events | The most scholarly-valuable output |
| S8 | Hands registry (`h1` main scribe, `h2` glossator…) with a colour badge and `handShift` | Margins are in other hands and other centuries |
| S9 | Variant readings (`app/lem/rdg`) for «خ» marks and multiple witnesses with sigla | Groundwork for taḥqīq |
| S10 | Rasm (skeleton) matching for Quran detection; a Warsh reference text for Maghribī material | Undotted and Maghribī quotations otherwise go undetected or get mislabelled |
| S11 | Ḥadīth "possible parallel" detection (Bukhārī and Muslim first), grading only by a researcher with source URL | Useful and safe |
| S12 | Entity linking (person/place/book) to OpenITI, al-Thurayyā and Wikidata with `cert` | Searchability and scholarly linking |
| S13 | Export corrected lines as HTR ground truth; fine-tune a per-collection Kraken model | The data flywheel: under 5% CER is achievable with about 10 pages [S2] |
| S14 | Points only for *accepted* work, private progress, service-learning certificate | Avoids gamification pitfalls |

**COULD (later; 9 items)**

| # | Requirement | Rationale |
|---|---|---|
| C1 | Style profiles for rendering (Arabic-taḥqīq brackets vs Leiden) | Serves both Arab editors and international users |
| C2 | Critical-edition view generated from base witness + accepted corrections + apparatus | Moves toward taḥqīq support without corrupting data |
| C3 | Text-reuse detection against OpenITI to identify quoted works | Powerful attribution aid |
| C4 | Chronogram / abjad calculator; Hijri ↔ Gregorian with weekday check | Colophon dating |
| C5 | Spread splitting and deskew tools; per-zone model choice (Ruqʿa notes vs Naskh text) | Real-world image variety |
| C6 | Mirador viewer integration and IIIF Content Search API | Library-grade viewing |
| C7 | Real-time co-presence with a CRDT editor | Only if pages get multiple simultaneous editors |
| C8 | Early-Qurʾān dot-vocalization layer | Specialist need |
| C9 | Public read-only API and OAI-PMH for library catalogues | Institutional integration |

### 7.2 Recommended data model (JSON)

This is compatible with, and a superset of, the review doc's `tokens{t, uncertain, alts}`: `t` → `dip`, `uncertain` → `state:"unclear"`, and `alts` keeps its name.

```json
{
  "manuscript": {
    "id": "ms_kfcris_1234",
    "institution_id": "inst_demo",
    "shelfmark": "MS 1234",
    "title_as_written": "كتاب …",
    "title_attested": {"value": "…", "openiti_uri": "0676Nawawi.Adhkar", "cert": "medium", "by": "u_res_1"},
    "author_attested": {"openiti_author": "0676Nawawi", "cert": "medium"},
    "genre": "hadith",
    "language": "ara",
    "witness_siglum": "أ",
    "rights": {"uri": "https://creativecommons.org/publicdomain/mark/1.0/", "credit_line": "…", "ai_training_allowed": false, "permission_doc": null},
    "iiif_manifest": "https://…/manifest.json",
    "viewing_direction": "right-to-left",
    "hands": [
      {"id": "h1", "role": "main_scribe", "script": "naskh", "ink": ["black", "red"]},
      {"id": "h2", "role": "glossator", "script": "ruqa", "date_text": "ق ١٣هـ؟", "cert": "low"}
    ],
    "publish_scope": "archive_only",
    "content_flags": []
  },

  "surface": {
    "id": "sf_012b",
    "manuscript_id": "ms_kfcris_1234",
    "folio": 12, "side": "b", "label_ar": "١٢ظ",
    "iiif_canvas": "https://…/canvas/f012b",
    "status": "student",
    "assigned_to": "u_stu_7",
    "zones": [
      {"id": "z1", "type": "main", "segmonto": "MainZone", "polygon": [[110,90],[980,90],[980,1400],[110,1400]], "reading_order": 1},
      {"id": "z2", "type": "margin", "segmonto": "MarginTextZone", "polygon": [[990,300],[1180,260],[1200,700],[1010,740]], "orientation_deg": 45, "hand": "h2", "anchor": {"after_token": "t_0007_04"}, "reading_order": 2},
      {"id": "z3", "type": "catchword", "segmonto": "QuireMarksZone", "polygon": [[120,1420],[260,1420],[260,1480],[120,1480]]}
    ]
  },

  "line": {
    "id": "l_0007",
    "surface_id": "sf_012b", "zone_id": "z1", "n": 7,
    "baseline": [[960,612],[140,598]],
    "polygon": [[965,560],[135,548],[135,640],[965,652]],
    "orientation_deg": 0,
    "hand": "h1",
    "head_rev": 3,
    "checked_by_student": true,
    "tokens": [
      {
        "id": "t_0007_01",
        "dip": "ثنا",
        "state": "clear",
        "abbr": {"expan": "حدثنا", "lexicon_ref": "isnad.thana", "cert": "high", "confirmed_by": "u_stu_7"},
        "search": "حدثنا"
      },
      {
        "id": "t_0007_02",
        "dip": "ٮسر",
        "dots": "absent",
        "state": "unclear", "cert": "low",
        "alts": [
          {"t": "بشر", "src": "htr", "model": "kraken:openiti-ms-v2", "score": 0.41},
          {"t": "بسر", "src": "human", "by": "u_stu_7"},
          {"t": "يسر", "src": "human", "by": "u_stu_9"}
        ],
        "reading": null,
        "search": "ٮسر",
        "rasm": "ٮسر"
      },
      {
        "id": "t_0007_03",
        "dip": "صلعم",
        "abbr": {"expan": "صلى الله عليه وسلم", "lexicon_ref": "tasliya", "cert": "high"},
        "rend": ["red"]
      },
      {
        "id": "t_0007_04",
        "dip": "الخطا",
        "reg": {"value": "الخطأ", "by": "u_stu_7", "status": "proposed"}
      }
    ],
    "machine": {"text": "حدثنا بشر صلعم الخطا", "model": "kraken:openiti-ms-v2", "prompt_sha": null, "date": "2026-10-03"}
  },

  "annotations": [
    {"id": "a1", "type": "metamark", "function": "sahh", "target": {"token": "t_0007_02"}, "hand": "h1", "by": "u_stu_7"},
    {"id": "a2", "type": "add", "place": "margin_left", "insert_after": "t_0007_04", "text_zone": "z2", "confirmed_by_sahh": true, "hand": "h2"},
    {"id": "a3", "type": "variant", "marker": "خ", "witness": "nuskha_unspecified", "lem": {"from": "t_0009_02", "to": "t_0009_02"}, "rdg": "قال", "hand": "h1"},
    {"id": "a4", "type": "gap", "reason": "damage", "extent": 2, "unit": "word", "insert_after": "t_0011_05"},
    {"id": "a5", "type": "del", "rend": "la_ila", "span": {"from": "t_0012_01", "to": "t_0012_03"}},
    {"id": "a6", "type": "note", "subtype": "balagh", "text_zone": "z4", "persons": [{"name_as_written": "…", "role": "collator"}], "date_text": "…"},
    {
      "id": "a7", "type": "quran_quote",
      "span": {"from": "t_0014_03", "to": "t_0015_06"},
      "match": "near", "verse_keys": ["2:255"], "words": [1, 9],
      "canonical_source": "KFGQPC Hafs v18",
      "diff": [{"op": "replace", "ms": "السموات", "canonical": "ٱلسَّمَٰوَٰتِ", "class": null}],
      "truncated_by_scribe": false,
      "classification": {"value": "orthographic", "by": "u_res_1"},
      "status": "researcher_confirmed"
    },
    {"id": "a8", "type": "entity", "kind": "person", "span": {"from": "t_0016_01", "to": "t_0016_03"}, "ref": {"openiti": "0256Bukhari", "wikidata": null}, "cert": "medium"},
    {"id": "a9", "type": "comment", "target": {"token": "t_0007_02"}, "thread": [{"by": "u_res_1", "text": "قارن بالسطر ١٢ نفس الرسم", "ts": "…"}], "resolved": false}
  ],

  "line_revision": {
    "line_id": "l_0007", "rev": 3, "base_rev": 2,
    "author": "u_stu_7", "role": "student",
    "ops": [{"op": "set_dip", "token": "t_0007_02", "from": "بسر", "to": "ٮسر"}],
    "comment": "النقط غير ظاهرة في الصورة", "ts": "…"
  },

  "page_review": {
    "surface_id": "sf_012b", "stage": "researcher", "decision": "return",
    "by": "u_res_1", "comment": "راجع الحاشية اليسرى", "content_sha256": "…", "ts": "…"
  },

  "published_version": {
    "surface_id": "sf_012b", "version": 1, "content_sha256": "…",
    "approved": [{"stage": "student", "by": "u_stu_7"}, {"stage": "researcher", "by": "u_res_1"}, {"stage": "institution", "by": "u_inst_2"}],
    "machine_draft": {"model": "kraken:openiti-ms-v2", "date": "2026-10-03"},
    "credits_display": "نسخ: ف. ع. · مراجعة: د. … · اعتماد: [المؤسسة] (تجريبي)",
    "label": "نصٌّ تاريخيّ نُقل كما ورد في المخطوط… ونشره لا يعني تبنّي ما فيه"
  }
}
```

**Model invariants** (enforce them in code and tests):

1. `dip` changes only through `line_revision` ops by a human. Machine output lives in `line.machine` and `alts`.
2. `abbr.expan`, `reg` and `corr` never alter `dip`.
3. Every `quran_quote` has `canonical_source`. Its `diff.class` is null until a researcher sets it, and the UI says "differs from" until then.
4. A publish requires `institution.by ≠ researcher.by` and `researcher.by ∉ students on the page`.
5. Before every store, text is NFC with no presentation forms, no U+06CC/U+06A9 unless the hand is Persian, and no bidi controls.
6. Zone `catchword` tokens are excluded from `reading_text()`.

**Export mapping:** `dip` → TEI text nodes and PAGE `TextEquiv`. `abbr` → `<choice><abbr/><expan/></choice>`. `state:"unclear"` → `<unclear cert>`. `gap` → `<gap>`. `add` → `<add place>`. `del` → `<del rend>`. `metamark` → `<metamark function>`. `variant` → `<app><lem/><rdg wit/></app>`. `quran_quote` → `<quote type="quran" source="quran:2:255">` plus Web Annotation `linking`. Zone types → PAGE region types and SegmOnto.

### 7.3 UI affordances

**Layout:** three panes in RTL order. The image is on the right on desktop, the text editor in the middle, and tabbed tools on the left. On narrow screens, the image stacks above the text with a sticky line strip.

**A. Image pane (OpenSeadragon + Annotorious)**
- Polygons for zones (colour by type) and lines (thin outline). Hovering a line highlights its text row, and clicking it focuses the row.
- Buttons:
  - zoom to line (`Ctrl+Shift+L`)
  - rotate the view for oblique margins (`Ctrl+Shift+R`, 15° steps)
  - contrast/invert toggle (`Ctrl+Shift+I`)
  - draw/edit line polygon (researcher, or a student on a margin)
- Folio label «١٢ظ», a recto/verso spread toggle and the credit line.

**B. Text pane (one row per line)**
- Each row has the line number, a cropped line image strip *directly above* the input (IIIF region URL), and a single-line RTL input with the diplomatic text.
- Below each row are chips for tokens with flags: uncertain (dashed amber), abbreviation (dotted blue), Quran (green), mark (purple icon).
- The caret position maps to a token and highlights its approximate box on the image.

**Navigation:**

| Keys | Action |
|---|---|
| `Ctrl+↓` / `Ctrl+↑` | Next / previous line |
| `Ctrl+Enter` | Mark the line checked and go to the next one |
| `Ctrl+Shift+Z` / `Ctrl+Shift+Y` | Undo / redo |

**C. Uncertainty**
- `Ctrl+Shift+U` on the selected word cycles: clear → unclear (med) → unclear (low).
- `Ctrl+Shift+1…9` picks an alternative from the chip list.
- `Ctrl+Shift+N` adds my alternative without replacing the current reading.
- `Ctrl+Shift+G` inserts a gap, with a dialog for reason and extent.
- The chip tooltip shows the machine score as a *bar labelled "model score (not a probability)"*, the human alternatives with who proposed them, and the number of keyers who agreed.

**D. Manuscript-marks palette** (left tab «علامات المخطوط»)
- Buttons with the glyph as written, an Arabic name and an English tooltip:
  - «صح» تصحيح
  - «ضبّة» تضبيب
  - «خ/نسخة» فرق نسخة (opens a variant form)
  - «ظ» الظاهر
  - «بلغ» بلاغ (opens a form: collation/reading/audition, names, date)
  - حاشية (gloss: draw or select the margin zone, then anchor it)
  - لحق/تخريج (insertion: pick the insertion point, then the margin zone)
  - حذف (deletion: strike / لا…إلى / bracket)
  - تقديم وتأخير
  - كذا
  - دارة
  - تعقيبة
  - ختم/وقف
  - قيد فراغ (colophon form)
- **Shortcut:** `Ctrl+Shift+M`, then the first letter (صح→S, خ→K, بلغ→B, حاشية→H, لحق→L, حذف→D, كذا→Y).
- Applying a mark shows an icon over the token in the text and a pin on the image. **Typing these words into the text triggers a gentle prompt:** "Did you mean the mark «صح»? Marks are not text."

**E. Abbreviations**
- `Ctrl+Shift+E` on a token opens the expansion list, filtered by the manuscript's genre, with collisions shown («خ: نسخة / البخاري»).
- Pick with 1–9. "Apply to all identical forms on this manuscript" (researcher only).
- Toggle the reading view (`Ctrl+Shift+V`): as written ↔ expanded.

**F. Quran and ḥadīth linking** (left tab «القرآن والحديث»)
- An auto-detected list per page, plus a manual "link selection" button (`Ctrl+Shift+Q`).
- Each item shows the verse key, the canonical text in ﴿…﴾ (KFGQPC font) and a word-level diff.
- Classification buttons (researcher): خطأ نسخ / قراءة أخرى / رسم إملائي / اقتباس بالمعنى / غير محدد.
- Ḥadīth items say «موضع مشابه محتمل» with collection and number (Abd al-Bāqī numbering for Muslim, as in the prep README). Grading is empty until a researcher fills it with the source URL.

**G. Comments and review** (left tab «التعليقات والمراجعة»)
- `Ctrl+Shift+C` comments on the selection.
- Threads per token, line or zone, with resolve.
- **Researcher review mode:**
  - Per-line diff of the student's version against the previous approved version (default) or the machine draft (toggle).
  - Accept / modify / reject per line (`A` / `E` / `R` in review mode).
  - "Accept all unchanged lines".
  - The page-level decision: approve or return (a comment is required).
- **Institution mode:** a read-only reading view, a rights checklist, publish scope and **Publish**. The button is disabled if the role-separation checks fail, with the reason shown.

**H. Consensus** (the hard-words queue, its own screen)
- One token at a time: the line image with the token box highlighted and an input field. The other student's reading is hidden.
- After two readings: auto-accept if they agree; send to the researcher if they disagree.
- The researcher sees both readings, the machine alternatives and the image, and decides.

**I. Status bar**
- Page stage («مسودة آلية ← طالب ← باحث ← مؤسسة»), % of lines checked, open flags, open comments, Quran links needing classification, and the current user role.

### 7.4 Six-to-eight pitfalls that would embarrass us before a manuscript expert

1. **The AI "corrects" the manuscript.** It fixes a Quranic quotation to the muṣḥaf, adds hamzas, vowels the text, or modernizes spelling.
   *Avoid:*
   - Transcription-only prompts.
   - The diplomatic layer is human-edited only.
   - A test asserts that machine output never contains tashkīl absent from the image layer's draft. Spot-check 20 lines.
   - The Quran panel shows the canonical text *beside* the manuscript, never in place of it.
2. **Calling a Warsh reading or old orthography an "error".**
   *Avoid:* neutral "differs from Ḥafṣ" wording, researcher-only classification, and a Warsh reference text for Maghribī material.
3. **Misreading sigla and abbreviations.** Examples: reading «خ» in a margin as al-Bukhārī; mapping أنبا to أخبرنا; expanding ح as حينئذ inside an isnād; injecting ﷺ where the scribe wrote صلعم or nothing.
   *Avoid:* a genre- and zone-aware lexicon with collisions shown, human confirmation, and the diplomatic text kept as written.
4. **Treating marks and paratexts as text.** Examples: «صح» typed into the sentence; the catchword duplicated into the running text; a marginal gloss merged into the main text; a «بلغ» note read as part of the book.
   *Avoid:* the marks palette, zone types, catchword exclusion, anchored glosses, and the typed-«صح» prompt.
5. **Dating and attribution from a single note.** Examples: dating the copy from a *copied colophon*, or trusting a later title page for the author's name.
   *Avoid:* `colophon_kind`, `title_as_written` vs `title_attested`, and `cert` on every attribution, all set by a researcher.
6. **Codicological illiteracy in the UI.** Examples: "page 23" instead of «١٢ظ»; spreads shown left to right; foliation taken from the image order; calling the output «تحقيق».
   *Avoid:* the folio/side model, IIIF `viewingDirection`, and the terminology «نسخ مُراجَع» / "reviewed transcription".
7. **Unicode and RTL breakage on stage.** Examples: reversed or wrong ornate brackets, Persian ی in Arabic text, phantom diffs from shadda order, broken caret movement, shortcuts that type Arabic letters.
   *Avoid:* M15/M16, a 10-item Unicode test file (shadda+vowel, dotless letters, ﴿﴾, mixed digits, ZWNJ, presentation forms), and a rehearsal on Windows Arabic and macOS Arabic layouts.
8. **Presenting the machine's confidence or the ḥadīth's presence as authority.** Examples: "94% confident"; "this ḥadīth is in Bukhārī" on a fuzzy match; a grade shown without grader and source.
   *Avoid:* "model score (not a probability)", "possible parallel", and grades only from a researcher with a URL.

### 7.5 Demo-specific recommendations (hackathon)

- Use one real, openly licensed Naskh folio with **at least one marginal correction marked «صح», one «خ» variant, one catchword and one short Quranic quotation**. That set demonstrates M8–M11 in under a minute.
- The "student fix" should be a genuine misreading of dots (review doc: «القب»→«الثقب») and must stay inside the diplomatic layer. Show that a researcher *rejected* an attempted "modernization" and explain why. That one moment convinces a manuscript expert.
- Show the rasm-only CER next to the full CER for the demo page, measured, not estimated.

---

## 8. Open questions for the scholar and the manuscript specialist

1. **Pilot scope:** which genres and regions? If Maghribī is in scope, we need Warsh text and Maghribī models from day one.
2. **Reading-layer display:** should the expanded honorific be shown by default in the public reading view, or only on hover?
3. **Default bracket profile:** which style should the public view use? I recommend that of the partner institution's own edition guidelines.
4. **Audition certificates:** should samāʿāt be in the pilot? They are highly valuable but researcher-heavy.
5. **Publication licence:** CC BY 4.0 or CC0 for the transcription text, and whether to grant model-training rights on the images.

---

## 9. Sources

**S: confirmed by search in this session.** Full texts were mostly blocked from the sandbox, so figures come from abstracts and snippets as noted.

- [S1] Vidal-Gorène, C., Lucas, N., Salah, C., Decours-Perez, A., Dupin, B. "RASAM – A Dataset for the Recognition and Analysis of Scripts in Arabic Maghrebi." ICDAR 2021 Workshops. HAL halshs-03430697. (300 images; about 4.8% CER.)
- [S2] Lucas, N., Salah, C., Vidal-Gorène, C. "New Results for the Text Recognition of Arabic Maghribī Manuscripts — Managing an Under-resourced Script." arXiv:2211.16147 (2022); HAL hal-03874725. (<5% CER with about 10 pages.)
- [S3] "Enhancing Arabic Maghribi Handwritten Text Recognition: RASAM 2…" Computational Humanities Research 2024, CEUR-WS Vol-3834, paper 35. (3,750 lines, 15 mss; about a 40% CER reduction.)
- [S4] Saeed, M., Chan, A., Mijar, A., Moukarzel, J., Habchi, G., Younes, C., Elias, A., Wong, C.-W., Khater, A. "Muharaf: Manuscripts of Handwritten Arabic Dataset for Cursive Text Recognition." NeurIPS 2024 Datasets & Benchmarks; arXiv:2406.09630; Zenodo 11492215.
- [S5] "HATFormer: Historic Handwritten Arabic Text Line Recognition with Transformers." arXiv:2410.02179 (2024). (8.6% CER on Muharaf, line-level.)
- [S6] Romanov, M., Miller, M. T., Savant, S. B., Kiessling, B. "Important New Developments in Arabographic Optical Character Recognition (OCR)." arXiv:1703.09550 (2017).
- [S7] Transkribus model pages: "Arabic Khat 17–20 century handwritten" (transkribus.org/model/arabic-khat-17-20-century-handwritten; 15.4% CER) and "Agapet 13th century" (7.48% CER).
- [S8] Heakl, A. et al. "KITAB-Bench: A Comprehensive Multi-Domain Benchmark for Arabic OCR and Document Understanding." Findings of ACL 2025; arXiv:2502.14949.
- [S9] "When Do VLMs Help Arabic Manuscript OCR? A Cross-Dataset Study." arXiv:2608.22366 (2026 preprint; authors not verified).
- [S10] "Reading or Guessing? Visual Grounding Failures of Vision-Language Models for OCR in Ancient Greek Editions." arXiv:2605.27750 (2026 preprint).
- [S11] Smithsonian Transcription Center, instructions and FAQs (transcription.si.edu/instructions/begin; /faqs).
- [S12] Library of Congress, By the People, "How to Review" (crowd.loc.gov/get-started/how-to-review/).
- [S13] Wikisource, Help:Page status (wikisource.org/wiki/Help:Page_status).
- [S14] Penn Libraries, "Scribes of the Cairo Geniza" news releases; dataset "Scribes of the Cairo Geniza, Sorting Phase, August 2017 – February 2019" (repository.upenn.edu/cairogeniza/1).
- [S15] Zooniverse ALICE; "Revisiting Shakespeare's World" (UMD DRUM); Blickhan, S. et al., "Individual vs. Collaborative Methods of Crowdsourced Transcription," *Journal of Data Mining & Digital Humanities* (2019) (jdmdh.episciences.org/5759). The finding on the collaborative method is M.
- [S16] FromThePage project-owner documentation (content.fromthepage.com/project-owner-documentation); TEI wiki "FromThePage".
- [S17] eScriptorium documentation (escriptorium.readthedocs.io), "Manual transcription" (multiple transcription layers).
- [S18] Tanzil.net credits and licence (CC BY 3.0, verbatim copies only, "changing it is not allowed").
- [S19] IslamicEval 2025 Shared Task (ArabicNLP 2025): papers such as "TCE at IslamicEval 2025…" and "Isnad AI at IslamicEval 2025…" (ACL Anthology, 2025.arabicnlp-sharedtasks).
- [S20] Altammami, S., Atwell, E., Alsalka, A. "The Arabic–English Parallel Corpus of Authentic Hadith" (LK Hadith Corpus), LREC 2020.
- [S21] Seydi, M., Romanov, M. al-Thurayyā Gazetteer and Geospatial Model of the Early Islamic World (DH abstracts; islamiclaw.blog spotlight, 2020).
- [S22] Unicode: code charts and notes for U+06A2 / U+06A7 (Maghribī feh and qaf); L2/21-051 "feh-qaf comments"; Unicode mailing list 2007 and PRI #80 on the Bidi_Mirrored exemption for U+FD3E/U+FD3F.
- [S23] Imam Muhammad ibn Saud Islamic University, College of Sharia, Fiqh Dept.: «المنهج الأخير للقسم في التحقيق» (units.imamu.edu.sa). Confirms Quran in ornate brackets with sūra and āya, collation differences in footnotes, and correction of the base text noted in footnotes.
- [S24] Gacek, A. *Arabic Manuscripts: A Vademecum for Readers.* Leiden: Brill, 2009 (Handbook of Oriental Studies). Includes Appendix I, "Non-specific (General) Abbreviations". Existence and contents list verified; entries were not read in this session.
- [S-segmonto] Gabay, S., Camps, J.-B., Pinche, A., Carboni, N. "SegmOnto: common vocabulary and practices for analysing the layout of manuscripts (and more)." IWCP 2021. Existence verified; the zone names are from memory (M).

**K: established literature, not fetched in this session. Claims drawn from these carry their own confidence mark.**

- [K1] Ibn al-Ṣalāḥ, *Maʿrifat anwāʿ ʿilm al-ḥadīth* (al-Muqaddima), section 25: «في كتابة الحديث وكيفية ضبط الكتاب وتقييده» (التصحيح، التضبيب، اللحق، الضرب، الرموز، الدارة).
- [K2] al-Qāḍī ʿIyāḍ, *al-Ilmāʿ ilā maʿrifat uṣūl al-riwāya wa-taqyīd al-samāʿ*.
- [K3] Gacek, A. *The Arabic Manuscript Tradition: A Glossary of Technical Terms and Bibliography* (Brill, 2001) and *Supplement* (2008).
- [K4] Déroche, F. et al. *Islamic Codicology: An Introduction to the Study of Manuscripts in Arabic Script* (Al-Furqān, 2006); Arabic ed. «المدخل إلى علم الكتاب المخطوط بالحرف العربي» (2005).
- [K5] al-Munajjid, Ṣalāḥ al-Dīn. «قواعد تحقيق المخطوطات» (1955); Hārūn, ʿAbd al-Salām. «تحقيق النصوص ونشرها» (1954).
- [K6] TEI Consortium, *TEI P5 Guidelines*: ch. 10 (Manuscript Description), ch. 11 (Representation of Primary Sources), ch. 12 (Critical Apparatus).
- [K7] PRImA PAGE-XML schema (2019 version); Library of Congress ALTO v4.
- [K8] IIIF Image API 3.0; IIIF Presentation API 3.0.
- [K9] W3C Web Annotation Data Model (2017).
- [K10] EpiDoc Guidelines (Leiden-convention encoding in TEI).
- [K12] The Unicode Standard, ch. 9 (Arabic); UAX #9 (Bidirectional Algorithm); UAX #15 (Normalization).
- [K13] OpenITI corpus documentation (URI scheme: `0256Bukhari`, `0256Bukhari.Sahih`, version IDs).
- [K14] al-Mizzī, *Tahdhīb al-Kamāl*, and Ibn Ḥajar, *Taqrīb al-Tahdhīb*: introductions (rumūz).
- [K15] al-Fīrūzābādī, *al-Qāmūs al-Muḥīṭ*: introduction (rumūz).
- [K16] al-Suyūṭī, *al-Jāmiʿ al-Ṣaghīr*: introduction (rumūz).
- [K17] Saudi Personal Data Protection Law (Royal Decree M/19, 1443H; amended 1444H), SDAIA.
- [K18] RightsStatements.org vocabulary; Creative Commons licences.
- [K19] Smith, D. A. et al., *passim* text-reuse detection, as used by the KITAB project.
- [K20] OpenSeadragon; Annotorious (Recogito/Pelagios); Mirador 3.

**In-repo references:** `docs/review/signs-around-you-review.md` (§6, §7.2, risk 15, §14, §17); `prep/scripts/match_inscription.py`; `prep/README.md` (KFGQPC Hafs v18, Muslim numbering trap, licences).
