# Content review: approved demo cards

*For the team's sharia lead. Generated from `data/content/cards/*.json` on 2026-10-02. The gate `npx tsx scripts/content-check.ts` passes on every card listed here.*

**43 cards** (39 published, 1 student_submitted, 1 returned, 1 researcher_approved, 1 ai_draft): 17 nature, 12 art and heritage, and 14 answers. All are attributed to the demo institution *College of Sharia — Demo University* and the demo personas (Sara or Omar submit, Dr. Huda approves, Dr. Noura publishes). None of them is a real approval: **every card needs your sign-off before any non-demo use.**

## What was verified by code, and what was not

| Item | How it was checked | What remains for a scholar |
|---|---|---|
| Quran text | Every verse key exists in KFGQPC Hafs v18 (`quran_ayah`). The text is inserted by key and never typed. The gate also fails if 4 or more consecutive words of a cited verse (or its neighbours) appear in Arabic prose (V3). | Whether each verse **suits** its use (relevance, context, tone). |
| Translation | Saheeh International, **mirror copy** (fawazahmed0 `eng-ummmuhammad`). It is labelled in the app. | Diff against Quranpedia edition 1947 before launch. Bracketed glosses such as "[reflected]" in 71:16 are why that verse is not used. |
| Hadith | Every id exists in the `hadith` table (al-Bukhari standard numbering; Muslim by Abd al-Baqi via `arabicnumber`). **Each text was read** to check that it says what the card claims. | Spot-check numbers and wording on dorar.net. Grades are shown from the table (both collections are *sahih*), never in prose. |
| Tafsir | Al-Tabari (d. 310 AH), *Jami' al-Bayan*, via the spa5k/tafsir_api mirror. Each excerpt is an **exact substring** of the cached source in `data/content/sources/tafsir/<sura>_<aya>.json` (URL recorded). Editorial footnotes `[[…]]` are never included. | Whether the **choice** of excerpt is fair; whether it matches the printed edition (Shakir). The English lines (`excerpt_en`) are **researcher paraphrases**, not translations, and need review. |
| Explanations | The gate checks that every cited ref is in the card's evidence, that EN and AR cite the same evidence, and that no banned framing appears (grade words, counts, rulings at the reader, tarjih, consensus words, "holy war" / "moon god" / bare "unity", miracle or "science proves" framing, an unattributed "the Prophet said"). | That each sentence is actually supported, and the tone. Arabic explanations are written in parallel, not translated word for word. |
| Civilisational notes | Only academic works the content builder is confident exist (King 1996; Blair 2006; Schimmel 1984; Blair & Bloom 1994; Ettinghausen, Grabar & Jenkins-Madina 2001; Bloom 1989; Necipoğlu 1995, 2005; Lu & Steinhardt 2007; Tabbaa 1985; Déroche 2006; Kunitzsch & Smart 2006; Bulliet 1979; Lapidus 2014). | **Page numbers were not checked.** Please confirm that each claim matches its source. They are marked historical (non-sharia). |

Deliberately avoided everywhere: i'jaz or "scientific miracle" verses (78:7, 21:30, 25:53, 55:19–20, 57:25, 36:38, 15:22, 96:2, embryology verses, 54:1), numerology, and the V10 sensitive verses. The gate fails if any of them is added.

## Cards

### Nature (concept cards)

| Card | Status | Level / certainty | Verses (KFGQPC keys) | Hadith | Tafsir excerpt (al-Tabari) | Other sources | Needs scholar check |
|---|---|---|---|---|---|---|---|
| `card:birds` | published | A / established | 67:19, 16:79, 24:41 | — | 67:19: «وإنما عُنِي بذلك أنها تصُفُّ أجنحتها أحيانا، وتقبض أحيانا.» | — | 24:41 «كلٌّ قد علم صلاته وتسبيحه»: commentators differ on who "knows" (the bird, or Allah). The card's "each knowing its own prayer" follows the translation, so please confirm. |
| `card:camel` | published | A / established | 88:17, 88:18 | — | 88:17: «أفلا ينظرون إلى الإبل فيعتبرون بها، ويعلمون أن القُدرة التي قدر بها عل…» | — | Kept to 88:17–18; the naqa (Thamud) verses are excluded. |
| `card:date_palm` | published | A / established | 19:25, 50:10, 6:99 | Bukhari 61 | 50:10: «وأنبتنا بالماء الذي أنزلنا من السماء النخل طوالا» | — | Respectful framing of the Maryam (Mary) story for Christian visitors. Al-Bukhari 61 says "like a Muslim", and the card keeps that wording. The 50:10 excerpt is from al-Tabari's combined comment on 50:9–11. |
| `card:grain` | **student_submitted** | A / established | 2:261, 6:95 | Bukhari 2320 | — | — | **Awaiting researcher approval** (student_submitted). There is no tafsir excerpt yet; 50:9 (al-Tabari: wheat and barley) could be added. |
| `card:honey_bee` | published | A / established | 16:68, 16:69 | — | 16:68: «وألهم ربك يا محمد النحل إيحاء إليها»<br>16:69: «يخرج من بطون النحل شراب، وهو العسل، مختلف ألوانه، لأن فيها أبيض وأحمر …» | — | "Healing" (16:69) is stated as the verse says it, with an explicit "not medical advice" line. Al-Tabari reports a disagreement over whether «فيه» refers to honey or to the Quran, and prefers honey; the card follows the plain reading. Al-Bukhari 5716 is deliberately not used. |
| `card:milk` | published | A / established | 16:66 | Bukhari 5576 | 16:66: «وإن لكم أيها الناس لعظة في الأنعام التي نُسقيكم مما في بطونه.» | — | Al-Bukhari 5576 mentions wine (the choice offered on the Night Journey). Is that acceptable on a general-audience card? 16:66 is given without physiology framing. |
| `card:moon` | published | A / established | 10:5, 36:39, 41:37 | Bukhari 1042, Bukhari 1909 | 10:5: «هو الذي أضاء الشمسَ وأنار القمر= ﴿وقدّره منازل﴾ ، يقول: قضاه فسوّاه من…» | King, D. A. (1996) | Fixture, lightly edited: tafsir URL now points at the cached source; 36:39 now cited; the 1909 sentence says the Prophet ﷺ *linked* the fast to sighting (avoids the sighting-vs-calculation question); Arabic reworded so no verse wording is typed into prose. Confirm that King (1996) covers crescent-visibility tables (the chapter is on qibla, gnomonics and timekeeping). |
| `card:mountain` | published | A / established | 88:19, 16:81, 59:21 | Bukhari 4083 | 88:19: «وإلى الجبال كيف أقيمت منتصبة لا تسقط،» | — | The text of al-Bukhari 4083 does not name Uhud; the card says "a mountain", although al-Bukhari's chapter heading names Uhud. 78:7 is excluded. |
| `card:night_day` | published | A / established | 3:190, 28:73, 25:62 | — | 3:190: «تدبروا أيها الناس واعتبروا، ففيما أنشأته فخلقته من السموات والأرض لمعا…» | — | Al-Tabari's comment on 3:190 continues his rebuttal of those who said "Allah is poor" (3:181). Is the excerpt acceptable out of that context? show_count is off (two lemmas combined). |
| `card:olive` | published | A / established | 95:1, 23:20, 16:11 | — | 95:1: «التين: هو التين الذي يُؤكل، والزيتون: هو الزيتون الذي يُعصر منه الزيت،…»<br>23:20: «ويعني بها: شجرة الزيتون.» | — | 95:1 has several early readings (the fruits; mosques of Damascus and Jerusalem; mountains). The card gives al-Tabari's view and says others exist. Confirm the Arabic paraphrase of 23:20 («يُستخرج منها الزيت ويُؤتدم به»). |
| `card:pen` | published | A / established | 96:1, 96:3, 96:4, 96:5, 68:1 | Bukhari 3 | 96:4: «يقول: اقرأ يا محمد وربك الأكرم ﴿الَّذِي عَلَّمَ بِالْقَلَمِ﴾ خَلْقَهُ …» | — | Al-Bukhari 3 «ما أنا بقارئ» is rendered "he was not one who could read"; scholars also read it as "what shall I read?", so please confirm. 96:2 is deliberately omitted, so the verse block shows 96:1, then 96:3–5. |
| `card:rain_water` | published | A / established | 50:9, 16:10, 30:50 | Bukhari 1032 | 50:9: «مطرا مباركا، فأنبتنا به بساتين أشجارا، وحبّ الزرع المحصود من البرّ وال…» | — | 30:50 also speaks of raising the dead; the explanation mentions only reviving the land. Al-Bukhari 1032: the card paraphrases «صيّبًا نافعًا» as "a beneficial rain". |
| `card:sea` | **returned** | A / established | 16:14, 45:12 | — | — | — | **Returned** by the researcher, who asked for an al-Tabari excerpt on «لحمًا طريًّا» (fish) and «حلية» (pearls and coral). Open for the demo. |
| `card:shadow` | published | A / established | 25:45, 25:46, 16:48 | — | 25:45: «ثم دللناكم أيها الناس بنسخ الشمس إياه عند طلوعها عليه، أنه خلْق من خلق…» | King, D. A. (1996) | The explanation's last sentence paraphrases the al-Tabari excerpt (not cited inline, since the tafsir block is shown). King (1996) covers gnomonics by title. |
| `card:stars` | published | A / established | 6:97, 16:16, 37:6 | — | 6:97: «والله الذي جعل لكم، أيها الناس، النجوم أدلةً في البر والبحر إذا ضللتم …» | Kunitzsch, P., & Smart, T. (2006) | Civilisational note: star-name etymologies (Aldebaran, Altair < al-nasr al-ta'ir, Vega < al-nasr al-waqi') from Kunitzsch & Smart (2006). 67:5 left out (mentions devils). |
| `card:sun` | published | A / established | 91:1, 25:61, 41:37 | Bukhari 1042 | 91:1: «قسم أقسم ربنا تعالى ذكره بالشمس وضحاها؛ ومعنى الكلام: أقسم بالشمس، وبض…»<br>25:61: «ووجهوا تأويل ذلك إلى أنه جعل فيها الشمس، وهي السراج» | — | 25:61: the verse says *a lamp*; that it is the sun rests on the Hafs reading «سراجًا» and Qatada's gloss, as reported by al-Tabari (second excerpt). Confirm this is acceptable on a card. 36:38 deliberately not used. |
| `card:tree_leaf` | published | A / established | 6:59, 14:24, 14:25 | Bukhari 2320 | 6:59: «ولا تسقط ورقةٌ في الصحاري والبراري، ولا في الأمصار والقرى، إلا الله يع…» | — | 14:24: some early commentators said the good tree is the date palm; the card does not name it. Al-Bukhari 2320 is phrased about a Muslim planter, as in the text. |

### Art and heritage

| Card | Status | Level / certainty | Verses (KFGQPC keys) | Hadith | Tafsir excerpt (al-Tabari) | Other sources | Needs scholar check |
|---|---|---|---|---|---|---|---|
| `card:arabesque` | published | A / established | — | — | — | Ettinghausen, R., Grabar, O., & Jenkins-Madina, M. (2001) | No verse. Confirm the origin claim (late-antique vine scrolls) from EGJ (2001), and the term islimi. |
| `card:astrolabe` | published | A / established | 6:97 | — | 6:97: «والله الذي جعل لكم، أيها الناس، النجوم أدلةً في البر والبحر إذا ضللتم …» | King, D. A. (1996) | Historical (non-sharia). 6:97 is labelled as a reflection. "Building on Greek models" and its use for prayer times and qibla follow King (1996). |
| `card:calligraphy_inscription` | published | A / established | — | — | — | Blair, S. S. (2006); Schimmel, A. (1984) | No verse by design (the inscription matcher supplies verses). Confirm the list of scripts and the claim that it was "the most highly regarded visual art" (Blair 2006; Schimmel 1984). |
| `card:geometric_pattern` | published | A / established | — | — | — | Necipoğlu, G. (1995); Lu, P. J., & Steinhardt, P. J. (2007) | No verse. "Infinity = tawhid" readings are deliberately omitted. Confirm the Darb-i Imam (1453) claim from Lu & Steinhardt (2007). |
| `card:illuminated_mushaf` | published | A / established | 96:4 | — | — | Déroche, F. (2006); Blair, S. S. (2006) | Only 96:4 is used; 85:22 and 80:13 are deliberately not applied to physical manuscripts. Déroche (2006) for codicology. |
| `card:kiswa_textile` | **researcher_approved** | A / established | 3:96, 2:144, 106:3 | — | — | — | **Researcher-approved, awaiting institution publication.** The description of the kiswa (black, embroidered with Quranic inscriptions) has no academic or official source attached yet. Add one (e.g. from the King Abdulaziz Complex for the Kiswa) or trim the sentence. |
| `card:mihrab` | published | A / established | 2:144, 106:3 | — | — | Ettinghausen, R., Grabar, O., & Jenkins-Madina, M. (2001) | The civilisational note dates the concave mihrab to al-Walid I's rebuilding of the Prophet's Mosque (EGJ 2001); confirm the source and page. The card does not use the Quranic «المحراب» (3:37, 19:11), which means a sanctuary, not the niche. |
| `card:minaret_call_to_prayer` | published | A / established | 62:9 | Bukhari 604 | 62:9: «وذلك هو النداء، ينادي بالدعاء إلى صلاة الجمعة عند قعود الإمام على المن…» | Bloom, J. M. (1989) | "The earliest mosques had no minarets" follows Bloom (1989); this is a scholarly position, so consider attributing it explicitly. 5:58 was left out for tone. Al-Bukhari 604 has been read in full. |
| `card:mosque_dome` | published | A / established | 72:18, 24:36 | — | 72:18: «ولا تشركوا به فيها شيئا، ولكن أفردوا له التوحيد، وأخلصوا له العبادة.»<br>24:36: «وعنى بالبيوت المساجد.» | Necipoğlu, G. (2005) | 24:36: al-Tabari takes «بيوت» as mosques; Ikrima said all houses (also in al-Tabari). 9:18 was left out because it reads as exclusionary next to the visiting question. Necipoğlu (2005) is cited for Sinan. |
| `card:mosque_lamp` | published | B / established | 24:35 | — | 24:35: «هادي من في السماوات والأرض، فهم بنوره إلى الحق يهتدون، وبهداه من حيرة …»<br>24:35: «ذلك مثل ضربه الله للقرآن في قلب أهل الإيمان به» | Blair, S. S., & Bloom, J. M. (1994) | Level B. The parable is explained only through al-Tabari's preferred reading, and the card says other readings exist. Blair & Bloom (1994) is cited for Mamluk enamelled lamps carrying the Light Verse; confirm the page. |
| `card:muqarnas` | **ai_draft** | A / established | — | — | — | Tabbaa, Y. (1985) | **ai_draft**: never submitted. Tabbaa (1985) is cited for "around the eleventh century". |
| `card:pen_and_ink` | published | A / established | 96:4, 68:1, 31:27, 18:109 | — | — | Blair, S. S. (2006) | 68:1: the card does not explain the letter ن. Al-Tabari's 68:1 entry opens with the Nun-fish narrations, so no excerpt was taken from it. |

### Answers (Ask)

| Card | Status | Level / certainty | Verses (KFGQPC keys) | Hadith | Tafsir excerpt (al-Tabari) | Other sources | Needs scholar check |
|---|---|---|---|---|---|---|---|
| `answer:fasting` | published | A / established | 2:183, 2:185 | Bukhari 1909 | — | — | Fixture. The 1909 sentence was reworded to "linked the start and end of the fast to sighting"; the Arabic was reworded to avoid typing 2:185. |
| `answer:five_pillars` | published | A / established | — | Bukhari 8 | — | — | Over-refusal guard. The order follows al-Bukhari 8 (Hajj before the fast). |
| `answer:jihad` | published | B / established | 29:69, 22:78, 2:190 | Bukhari 3004, Bukhari 1520 | — | — | Over-refusal guard, level B. **No glossary entry for jihad exists** (the Al-Jamhara site was unreachable from the build environment), so the term-lock relies on the banned-phrase list. 2:190: scholars discuss its scope, and the card says scholars set out the conditions and refers specific questions. Confirm whether the armed-jihad sentence should move to a level-C note. |
| `answer:kaaba` | published | A / established | 2:144, 106:3 | Bukhari 1597 | — | — | R6 Q1 fixture. The only change: "which unites them in one direction" became "wherever they are in the world", which stays closer to 2:144. |
| `answer:moon_god` | published | A / established | 41:37, 1:2, 29:46 | — | — | — | Gentle correction (41:37, 1:2, 29:46). Consider adding "Allah is the Arabic word for God, also used by Arab Christians" once a source is approved. |
| `answer:pork` | published | B / established | 2:173, 6:145 | — | — | — | R6 Q9 style (hostile to gentle), level B. 6:145 «فإنه رجس» is given as "describes pork as impure". Wisdoms appear only as "some scholars have mentioned", and no medical proof is claimed. |
| `answer:quran_authorship` | published | B / established | 29:48, 10:16, 2:23, 4:82 | Bukhari 3 | 29:48: «ولم تكن تكتب بيمينك، ولكنك كنت أمِّيًّا»<br>4:82: «لاتِّساق معانيه، وائتلاف أحكامه، وتأييد بعضه بعضًا بالتصديق، وشهادة بع…» | — | R6 Q2, level B. It shows the evidence the sources give (29:48, 10:16, 2:23, 4:82, al-Bukhari 3) with no i'jaz padding. Confirm that the 2:23 challenge is acceptable without further framing, and the rendering of «ما أنا بقارئ». |
| `answer:ramadan_start` | published | C / disputed | 2:189, 2:185 | Bukhari 1909, Muslim 1081 | 2:189: «ذكر أن رسول الله ﷺ سُئل عن زيادة الأهلة ونقصانها واختلاف أحوالها، فأنز…» | — | **Level C.** It gives three views (sighting; calculation; local vs global sighting) with no preference. The views are not yet attached to named fiqh sources (e.g. council resolutions), which a scholar should add. |
| `answer:spread_by_sword` | published | C / disputed | 2:256, 10:99, 60:8 | — | 2:256: «اختلف أهل التأويل في معنى ذلك.» | Bulliet, R. W. (1979); Lapidus, I. M. (2014) | R6 Q3, **level C**. Doctrine comes from 2:256 and 10:99 (plus 60:8). The disagreement note attributes three views to "historians" without preference, with Bulliet (1979) and Lapidus (2014) as reading. It notes that classical exegetes discussed the scope of 2:256; the al-Tabari excerpt is his "they differed" line only. Please check neutrality. |
| `answer:tawhid` | published | A / established | 112:1, 112:2, 112:3, 112:4, 2:163 | — | — | — | R6 Q7 newcomer template: plain sentence, then the R8 term, then 112:1–4. «الصمد» is rendered "the One on whom all depend"; confirm. |
| `answer:visit_mosque` | published | B / established | — | Bukhari 63 | — | — | Over-refusal guard, level B, general information. The common-practice statements (open days, etiquette) are deliberately unsourced and point the visitor to the mosque. Al-Bukhari 63 (Dimam): commentators discuss whether he was already Muslim, so the card does **not** claim he was a non-Muslim. The note mentions that the Sacred Mosque in Makkah has its own rules. Confirm the wording. |
| `answer:what_is_quran` | published | A / established | 2:185, 12:2, 2:2, 15:9 | Bukhari 3, Bukhari 5027 | — | — | "Beginning in the month of Ramadan" reads 2:185 as the start of revelation, so please confirm. The KFGQPC provenance sentence is factual app information. |
| `answer:who_is_muhammad` | published | A / established | 33:40, 21:107, 68:4 | Bukhari 3 | — | — | Includes a one-line explanation of ﷺ. 33:40 is rendered "the last of the prophets". |
| `answer:why_rulings_differ` | published | B / established | — | Bukhari 7352, Muslim 1716, Bukhari 946 | — | — | R6 Q4, level B (a question *about* disagreement). The "two rewards" hadith concerns a judge (حاكم); applying it to scholarly ijtihad is the usual reading, so please confirm. Muslim 1770 (the Zuhr wording) is not cited; al-Bukhari 946 (the 'Asr wording) is. |

## Demo workflow states (portal)

- `card:sea`: **returned** by Dr. Huda with a realistic note (add al-Tabari on «لحمًا طريًّا» and «حلية»).
- `card:grain`: **awaiting researcher approval** (student_submitted by Sara).
- `card:kiswa_textile`: **awaiting institution publication** (researcher_approved; the note asks for a source on the kiswa description).
- `card:muqarnas`: **ai_draft**, never submitted.

## Concepts disabled for the camera demo (`concept_labels.json`)

Reasons are weak camera recognition, or verses that need heavy tafsir or are tonally risky in a first encounter:

- `water_life`: overlaps with rain & water; its usual verse (21:30) is often framed as a scientific proof, which this app avoids.
- `lightning`: lightning is rarely photographed live. A printed photo would show bright jagged bolts in a dark, stormy sky.
- `wind`: wind is invisible to a camera; flags, bending trees or turbines are ambiguous. One commonly cited verse (15:22) is often framed as a scientific proof.
- `stone`: a pebble is hard to tell apart from many objects, and the best-known verse (2:74) is a rebuke that needs careful context for a first encounter.
- `soil`: soil photographs poorly, and related verses are often pulled into embryology claims that this app avoids.
- `iron`: metal objects are hard to identify as iron, and the usual verse (57:25) is widely framed as a scientific proof, which this app avoids.
- `salt_fresh`: salt and fresh water look identical to a camera, and the related verses (25:53) are commonly framed as an oceanography proof.
- `onion_garlic`: the only verse (2:61) needs heavy context about the story of the Children of Israel and reads poorly as a first encounter.
- `spider`: its verse (29:41) is a parable about false protectors, which needs context and reads as a rebuke in a first encounter.
- `manuscript_page`: specific manuscript pages are opened by item code or QR from the heritage section, never guessed from a photo.

Enabled concepts without a card (fig, pomegranate, grapes, clouds, river, ships, pearls & coral, livestock, horse, fish, ant, lamp, qibla, time) show the honest "No reviewed card yet — we won't guess" screen and feed the demand board.

## Open items for the sharia lead

1. Sign off each row above, or mark the changes needed. Nothing here is a real approval.
2. A glossary entry for **jihad** (and ideally *kafir*, *qibla*, *hilal*, *ijtihad*) from Al-Jamhara with URLs. The site was unreachable from the build environment, so `glossary.json` still holds only the 10 R8 terms, verbatim.
3. Sources for the three views on the start of Ramadan, and for the kiswa description.
4. Verify the translation against Quranpedia 1947 and the hadith against dorar.net.
