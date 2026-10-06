# Open-world Snap and the Muslim-science layer

**Ask:**
1. **Any photo gets an answer.** Snap and Explore should work for any photo, not only the 43 curated concepts. The answer must rest on verified sources: the Quran by reference, Bukhari and Muslim by number, and other known books.
2. **Muslim scientific contributions.** Add a layer on Muslim science, for example: star, then its Arabic name, then the astrolabe, then the scholars who perfected it, then where to see one in a museum.

Status: **built** (2026-10-06): phases 1–4 below, including tier-2 books and PDF upload. Test results: `docs/review/open-world-test.md`.

---

## 1. Where the platform stands today

| Piece | Today | Reuse |
|---|---|---|
| Photo recognition | Claude vision picks from a **closed list of 43 concepts**. Anything else gets "We couldn't match this" plus a picker. Live test: 28/30 on real photos, and the misses were correct refusals. | Keep the vision call and make it open-vocabulary. |
| Cards | 48 cards, 40 published, reviewed by student → researcher → institution (four eyes). Cards already have a `civilizational_note` field, for example the stars card names Aldebaran, Altair and Vega and cites Kunitzsch. | Cards remain the gold standard. |
| Quran | All 6,236 verses (KFGQPC Hafs v18), the Saheeh translation and Quranic Arabic Corpus lemmas. Text is only ever inserted by reference. | Lemma search gives exact Arabic word matches. |
| Hadith | **Bukhari 7,554 and Muslim 2,962**, Arabic and English, with grade and source URL. | Full-text search plus fetch by number. |
| Ask pipeline | Router → retrieval → composer → verifier, with 13 validators: quote fidelity, hadith checks, miracle-framing lint, level-D referral. | This *is* the safety core. Open Snap should reuse it, not bypass it. |
| Demand board | Visitors' "Notify me" requests appear live in the portal and turn into draft cards in one click. | Becomes the review flywheel. |

**The core tension.** The platform's promise, and its strongest point with the judges, is that visitors only see content an institution reviewed. "Any photo gets an answer" breaks that unless an answer can be **sourced but not yet reviewed**, and that difference is made obvious. Section 2 is how to do this without losing the promise.

---

## 2. Open-world Snap: evidence first, never AI-written scripture

### 2.1 Three trust levels, always visible

| Badge | When | What the visitor sees |
|---|---|---|
| 🟢 **Approved by [institution]** | An approved card exists. | The card, as today. |
| 🟡 **Sources found, not yet reviewed** (مصادر موثقة، لم تُراجع بعد) | No card, but verified passages are relevant. | Quran text from KFGQPC, hadith from the database (collection, number, grade), and a short labelled *AI summary*. No rulings and no tafsir from the AI. |
| ⚪ **We won't guess** | Nothing directly relevant, or the subject is sensitive. | An honest "no direct mention", with "Notify me" and "Talk to a person". |

### 2.2 Pipeline: pick, fetch, check, then compose

```
photo ──► 1. IDENTIFY (vision, open vocabulary)
            label_en / label_ar, category, specificity,
            flags: person · text · other faith's symbol · sensitive item
        ──► 2. ROUTE
            has an approved card     → card (🟢)
            Arabic writing           → inscription reader
            person                   → describe the scene only, never identify anyone
            night sky                → Sky mode (§4)
            otherwise                → 3
        ──► 3. CANDIDATES (references only, never text)
            a) Quran: Arabic lemma search via QAC + full-text search of the translation
            b) Hadith: full-text search over Bukhari / Muslim (Arabic and English)
            c) the model proposes extra references (verse keys, hadith numbers): it may misremember, so…
        ──► 4. FETCH verbatim text by reference from the database (anything unknown is dropped)
        ──► 5. CHECK: a second call reads the *fetched* text and grades each item
            direct (names the thing) · thematic (clearly about its class) · unrelated → dropped
            each kept item carries a one-line reason shown to the visitor
        ──► 6. COMPOSE through the existing Ask validators
            no miracle framing, no rulings (level D → person), quote fidelity, citation coverage
        ──► 7. STORE and CACHE by normalised label
            the next photo of the same thing is instant and consistent
            the entry appears on the portal demand board as a pre-filled draft card
```

**Why this is safe by construction.**
- The model never writes a verse or a hadith. It can only point to references, and code fetches the text.
- A misremembered hadith number comes back with the wrong text, so the check step drops it. The worst failure is "less content", never fabricated content. The fabricated-hadith rate stays at 0 for the same reason it does in Ask today.

### 2.3 The review flywheel (the selling point)

Every 🟡 discovery becomes a pre-filled draft card on the demand board, sorted by how often visitors photograph it. Students check it, researchers approve it, and the next visitor gets 🟢.

So coverage grows from what visitors actually point their phones at, and human review stays the gate. For the judges: AI widens coverage; scholars keep authority.

### 2.4 Honesty rules for connections

The biggest quality risk is **forced connections**: linking every object to a verse. Rules:
1. **Direct beats thematic, and thematic must be obvious.**
   - A date palm and «وَٱلنَّخۡلَ بَاسِقَٰتٖ» (50:10) is direct.
   - A camel and 88:17 is direct.
   - A coffee cup and a verse about drinks in Paradise is forced: reject it.
2. **"No direct mention" is a valid answer.** For example: "The Quran doesn't mention coffee. Coffee spread in the Muslim world from Yemen in the 15th century; see the Muslim-science section." That is honest and still interesting.
3. **No miracle framing.** The existing lint ("science proves", «إعجاز علمي» claims) applies to every composed text.
4. **Sensitive items** (alcohol, pork, other faiths' symbols, graves) get a respectful, neutral description with no ruling. "Is it halal?" goes to level D, a person.

### 2.5 "Any known book": scope it in tiers

| Tier | Sources | How they may be used |
|---|---|---|
| **1. Verbatim, by reference (have now)** | Quran (KFGQPC), Sahih al-Bukhari, Sahih Muslim | Quoted and cited automatically. |
| **2. Verbatim, add next (licensing needed)** | **Tafsir al-Muyassar** (King Fahd Complex, the same publisher as our Quran text), Ibn Kathir, al-Saʿdi. Other hadith collections (Abu Dawud, al-Tirmidhi, al-Nasaʾi, Ibn Majah, Muwattaʾ), **always with grade and grader shown**. | Quoted only from text we hold. |
| **3. Bibliographic pointers only** | Classical science works such as al-Sufi's *Book of Fixed Stars*, al-Biruni's *al-Qanun al-Masʿudi* and Ibn al-Haytham's *Optics*, plus modern scholarship (King, Kunitzsch, Saliba) | Cited by author, title and date. **The AI may never "quote" a book we don't hold.** It may summarise only from a curated excerpt in our library. |

---

## 3. Muslim-science layer: «من إسهامات علماء المسلمين»

### 3.1 Get the history right first

**Muslims did not invent the astrolabe.** It is Hellenistic (Greek) in origin. What Muslim scholars did is better, and true:
- **al-Fazari** (8th c., Baghdad) is credited with building the first astrolabe in the Islamic world.
- **al-ʿIjliyya** of Aleppo, a woman instrument maker in the 10th c., worked for Sayf al-Dawla. Asteroid 7060 is named after her. Note: her popular name "Mariam" is not in the only source about her.
- **al-Zarqali** (Toledo, 11th c.) built the **universal astrolabe (*saphaea*)**, which works at any latitude and was used by navigators until the 16th century.
- Spherical and geared astrolabes, and above all Islamic uses: **prayer times and the qibla**.

The app must say "perfected, refined and made Islamic", never "invented". Scholars and judges will check this, and getting it right is a credibility win. Add it to the content lint.

### 3.2 Example journey: a photo of a star

1. **Sky mode (§4)** recognises the star as **Vega**.
2. **Modern facts:** brightness, distance and constellation, from the public-domain Yale Bright Star Catalogue.
3. **Arabic name:** «النسر الواقع», "the swooping eagle". Most star names in use today (Aldebaran, Algol, Betelgeuse, Rigel, Vega) come through **al-Sufi's *Book of Fixed Stars* (c. 964)**, which listed 1,017 stars in 48 constellations.
4. **Quran (direct, honest link):** «وَهُوَ ٱلَّذِي جَعَلَ لَكُمُ ٱلنُّجُومَ لِتَهۡتَدُواْ بِهَا فِي ظُلُمَٰتِ ٱلۡبَرِّ وَٱلۡبَحۡرِ» (6:97), and 16:16. Stars as guidance for travellers: no miracle claim needed.
5. **Instrument:** the **astrolabe**. The pointers on its rete are named stars, so Vega is literally marked on many astrolabes. Then the history in §3.1.
6. **Where to see one:**
   - **History of Science Museum, Oxford:** the world's largest collection of astrolabes from the Islamic world.
   - **Museum of Islamic Art, Doha:** e.g. a planispheric astrolabe by Muhammad Mahdi al-Yazdi, Iran, 1654–55.
   - **The Metropolitan Museum of Art, New York:** an astrolabe by Muhammad Zaman, Mashhad, 1654–55, and the Yemeni astrolabe of al-Ashraf ʿUmar ibn Yusuf, 1291.
7. **Next:** "Talk to a person", or related cards (Moon, Qibla, Time of ʿAsr).

### 3.3 Data model: a small curated knowledge graph

```
Scientist ─wrote─► Work ─describes─► Instrument ─held_by─► MuseumHolding
    │                                     │                    (museum, city, object, accession no., URL,
    └──────── linked_to ────────► Concept (moon, stars, qibla, …)      on display?, last verified date)
StarName (IAU name, Arabic, meaning, source: Kunitzsch & Smart) ─on─► Instrument (rete pointers)
```

- **Workflow:** each entry goes through the same review workflow as cards, with every claim sourced. Museum holdings carry a **last-verified date**, because exhibitions change.
- **Seed scope** (about 3 days of curation and drafting, then review):
  - 25 scientists;
  - 12 instruments (astrolabe, quadrant, celestial globe, armillary sphere, sundial, water clock, …);
  - about 60 Arabic star names;
  - about 30 museum holdings with URLs.
- **Saudi museums:** I found no verified astrolabe holding at Ithra or the National Museum in Riyadh. Ask them directly before listing either. Showing a local holding would be a strong point for Saudi judges.

---

## 4. Sky mode: stars should not be identified from photos

Phone photos of the night sky rarely capture stars well enough to identify them. The reliable method uses the phone's **location, time and compass**. **astronomy-engine** (an MIT-licensed JavaScript library) plus the bright-star catalogue computes exactly what the phone points at:

- **Point at a star:** "That's **Vega** — النسر الواقع".
- **Point at the Moon:** phase and **Hijri date** (`Intl` supports `islamic-umalqura`).
- **Planets:** "Jupiter is the bright one in the south-east."

It works offline and costs nothing per use. Vision is used only to confirm "this is a night-sky photo". iOS needs a tap to allow compass access.

---

## 5. Risks and guardrails

| Risk | Guardrail |
|---|---|
| Fabricated verse or hadith | Structurally impossible: references only, text fetched, unknown references dropped. Measured: fabricated rate = 0. |
| Forced or out-of-context verses | The check step grades direct, thematic or unrelated; each kept item shows a visible reason; "no direct mention" is allowed; sample audit by a scholar. |
| Weak hadith | Tier 1 is Bukhari and Muslim only. Other collections only with grade and grader. |
| AI tafsir or rulings | Banned. Level D goes to a person; explanations are labelled "AI summary, not reviewed". |
| Miracle framing | The existing lint applies to all composed text. |
| Wrong history (e.g. "Muslims invented the astrolabe") | A curated graph with sources; the AI summarises only graph entries; new lint rule. |
| Museum facts going stale | Last-verified date on each holding, and a quarterly re-check task in the portal. |
| People in photos | Never identify anyone; describe the scene only (the `person` flag already exists). |
| Other faiths' symbols | Respectful and neutral; no comparative claims. |
| Cost or abuse | Per-IP limits (exist), label cache, one vision call per photo. |
| Latency (first discovery 10–15 s) | Stream it: identification at ~3 s, then sources appear as they pass the check. Cached repeats are under 200 ms. |

## 6. How to measure it before release

- **Open-world image set:** 1,000 ImageNet sample photos (already reachable in our sandbox) plus 100 photos of local objects.
- **Metrics:**
  - fabricated references: **must be 0**;
  - relevance precision of kept items: LLM judge **plus a 50-item scholar audit**, target ≥ 90%;
  - forced-link rate;
  - share of 🟡 versus ⚪;
  - p50 and p95 latency;
  - cost per new label.
- **Sky mode:** compare against a planetarium app at 5 times and places.
- **Dashboard:** show it next to the Ask safety scoreboard in `/portal/eval`.

## 7. Plan (MVP-fast)

| Phase | Scope | Estimate |
|---|---|---|
| **1. Open Snap** | Open-vocabulary identification; candidate search over Quran, Bukhari and Muslim; fetch and check; compose through the Ask validators; three trust badges; label cache; flywheel to the demand board; open-world eval on 200 images | 3–4 days |
| **2. Muslim-science layer** | Graph tables and portal editor (reusing the card workflow); seed data from §3.3; "From Muslim science" section on cards and discoveries; the star → astrolabe → museum journey | 3–4 days, plus scholar review |
| **3. Sky mode** | astronomy-engine and the bright-star catalogue; compass UI; Moon phase and Hijri date; links into star names and the astrolabe | 2–3 days |
| **4. Tier-2 books** | Licence and import Tafsir al-Muyassar, then Ibn Kathir; other hadith collections with grades | depends on licensing |

**Demo for the judges:**
1. Photograph an olive branch: 🟢 approved card.
2. Photograph a pomegranate or another uncovered fruit: 🟡 verified verses, labelled; then in the portal it already sits on the demand board as a draft card.
3. Photograph a coffee cup: ⚪ "no direct mention", plus the Muslim-science note.
4. Sky mode on a star: Vega → النسر الواقع → al-Sufi → astrolabe → Oxford and Doha.

## Decisions needed

1. **Show 🟡 "sources found, not yet reviewed" answers to the public,** or only in demo mode until an institution signs off? Recommended: public, clearly labelled, because it is the feature.
2. **Which tier-2 books to license first?** Recommended: Tafsir al-Muyassar, from the same publisher as the Quran text.
3. **Order:** Phase 1 and 3 first for the demo (the most visible), or Phase 2 first (the most content)?

## Sources

- [History of Science Museum, Oxford: astrolabes and quadrants](https://www.hsm.ox.ac.uk/files/astrolabesquadrants-0)
- [al-ʿIjliyya (Wikipedia)](https://en.wikipedia.org/wiki/Al-%CA%BBIjliyyah)
- [al-Fazari (Wikipedia)](https://en.wikipedia.org/wiki/Mu%E1%B8%A5ammad_ibn_Ibr%C4%81h%C4%ABm_al-Faz%C4%81r%C4%AB)
- [al-Zarqali (Wikipedia)](https://en.wikipedia.org/wiki/Al-Zarqali)
- [Science Museum blog: al-Sufi and star names](https://blog.sciencemuseum.org.uk/updating-stars-and-observing-the-andromeda-galaxy)
- [List of Arabic star names (Wikipedia)](https://en.wikipedia.org/wiki/List_of_Arabic_star_names)
- [Qatar Museums: planispheric astrolabe](https://collections.qm.org.qa/en/objects/planispheric-astrolabe-mw3362007)
- [The Met: planispheric astrolabe](https://www.metmuseum.org/art/collection/search/451699)
- [The Met: Heilbrunn Timeline, astrolabe](https://www.metmuseum.org/toah/works-of-art/63.166a-j)
