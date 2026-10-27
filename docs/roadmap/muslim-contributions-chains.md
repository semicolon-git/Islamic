# From what you photograph to what Muslim scholars contributed: contribution chains

**Ask:** «not only linking the thing the user scanned to Quran or hadith — also add the Muslims' contributions in it. Example: if someone scans a TV, link that Muslims' contributions in light led to this … with verified answers. Please do deep analysis.»

**Status:** built, 2026-10-27. Chain data, matching, visitor UI, chain pages and the portal review flow are all live in the code. The measured results are in §7.

---

## 1. Today's starting point, and why it wasn't enough

| | Before this change | Problem |
|---|---|---|
| Knowledge base | 25 scholars, 19 works, 11 instruments, 28 museum objects, 37 topics. All sourced (`data/science`). | Almost all astronomy, and linked only to **nature concepts** (moon, stars, date palm …). A TV, a phone, glasses or a clock had nothing to link to. |
| Open-world photos | The judge AI could attach up to 2 scholars to a discovery, **with a one-line reason the AI wrote itself**. | That reason was unverified history, written by a model and shown as fact. This breaks the platform's core rule: AI may pick, but never author, what visitors read as true. |
| Results with no Quran/hadith | A TV gets no verse, so the visitor saw «لن نخمّن» (we won't guess) and nothing else. | An honest dead end. It was also a missed chance: the strongest bridge for many non-Muslim visitors is *your phone's camera exists partly because of a Muslim scholar's optics*. |
| Review | Science entries had no review workflow in the portal. | "Verified" could only mean "has a source". No scholar had signed anything off. |

## 2. The idea: a *contribution chain* (سلسلة الإسهام)

A chain is a short, sourced history of **one science**, told as steps. It goes from the people before, through the documented work of scholars in Muslim civilisation, through how that knowledge travelled, to the people after, and ends with today's object.

```
 TV / camera / phone screen   ← what the visitor photographed
        │  science: light and image (optics)
 before ── Euclid, Ptolemy: ray geometry of sight
 muslim ── al-Kindi … Ibn Sahl (refraction, 984) … Ibn al-Haytham (Book of Optics, c.1011–21: light enters the eye; dark-room image; experiment)
 muslim ── Kamal al-Din al-Farisi (camera obscura experiments, rainbow)
 travel ── Latin "De aspectibus" (c.1200) → Bacon, Witelo, Kepler
 after  ── photography (Niépce, Daguerre) → electronic TV (Farnsworth, Zworykin, Baird)
 today  ── every camera and screen still forms images by the rules of rays and lenses
```

Why a chain, and not «Ibn al-Haytham invented the camera»?
- **Honesty is the product.** Our visitors are sceptical, and one exaggeration ("Muslims invented X") costs the whole platform its credibility. A chain *shows* the Muslim contribution as an essential, documented link in a longer human story. That is both true and more persuasive.
- **It credits others by design.** Every chain must name who came before and after. Every chain carries an explicit **«ما لا ندّعيه»** (what we don't claim) line, for example: "Muslims did not invent the television".
- **It debunks.** Popular overclaims (al-Jazari "invented the robot", Abbas ibn Firnas' flight, the Kaldi coffee legend) sit in a **«ادعاءات شائعة راجعناها»** (popular claims we checked) list, each with a correction and a source. Visitors learn to trust us *because* we correct our own side.
- **Claim strength is labelled:** «خطوة تأسيسية» (a foundational step), «إسهام بين إسهامات عدة» (one contribution among several) or «سلف مباشر» (a direct ancestor).

## 3. How it works (verified by construction)

```
photo ─► vision label ("flat screen TV" / «تلفاز»)
          │
          ├─► Quran & hadith pipeline (unchanged): fetched by reference, judged, verified
          │
          └─► contribution chains
                ├─ word matcher: the label's head noun against each chain's object list
                │    ("flat screen tv" → tv ✓;  "television tower" → tower ✗;  «ساعة حائط» → ساعة ✓)
                ├─ AI picker (parallel, ids only, closed list, max 2, unknown ids dropped)
                └─ code fetches the curated chain text → visitor sees it with its review badge
```

1. **The AI never writes history.** It returns chain ids, or scholar ids for the existing science chips, from a closed list. The text shown is the curated, sourced entry. The old AI-written reason under scholar chips is gone: the chip now shows the scholar's own first curated contribution.
2. **It works without AI.** The word matcher is deterministic, and on a fixed set of everyday labels it is measured (§7). Head-noun matching (the last word in English, the first in Arabic) is what stops "television tower" or «برج الساعة» (clock tower) from matching.
3. **Scripture and history stay separate.** The Quran/hadith tier badge speaks only for scripture. When the scriptures don't mention the object, the visitor reads: «لا يذكر القرآن والسنة «التلفاز»، ولن نتكلّف رابطًا. وهذا ما يسجّله التاريخ عن العلم الذي يقوم عليه.» (The Quran and Sunnah don't mention «the TV», and we won't force a link. Here is what history records about the science behind it.) We never say the Quran predicted the science. Tests reject "scientific miracle" and "Quran predicted" anywhere in chain data.
4. **Sensitive subjects get sources only**, and people are never searched.

## 4. What "verified" means here: two levels, both visible

| Badge on the chain | Meaning | Who |
|---|---|---|
| «كل خطوة موثّقة بمصدر · لم يراجعها مختص بعد» | Every step by a Muslim scholar, and every transmission step, cites a source (Britannica, SEP, MacTutor, Iranica, museum and library pages). Automated tests enforce this. | Data team. The data has to pass the tests before it can merge. |
| «راجعها ‹اسم المؤسسة›» | A researcher checked each step against its sources and approved. Then a **different** institution admin signed it off (four eyes). | Portal → «سلاسل الإسهام» (`/portal/science`) |

The portal review uses the same rules as cards. A researcher can approve, or return the chain with a required note. Only an admin who is not that researcher can sign it off, and the server enforces this. The reviewer's checklist is printed on the page: each step matches its source; nothing says Muslims invented the object; who came before and after is credited; dates and names are right. Every decision lands in `reviews` and `audit_log`. Once a chain is signed off, a re-seed won't overwrite it (`updated_by`).

## 5. Coverage: which objects, which chains

CHAIN_TABLE

**Next chains, ranked by how often visitors photograph the object** (from the demand board):
- architecture (domes, arches, muqarnas → geometry, al-Kashi);
- the hospital pharmacy and drug standards (al-Kindi, Ibn al-Baytar);
- glass and lamps (lustreware, mosque lamps);
- textiles and carpets (cotton and muslin trade words);
- agriculture and irrigation (qanats, noria, Ibn al-'Awwam);
- universities and libraries (al-Qarawiyyin, House of Wisdom; framing needs care);
- algebra in school textbooks (already partly covered by computing and numbers).

Each new chain goes through the same tests and the portal review.

## 6. Risks and how they're handled

| Risk | Guardrail |
|---|---|
| Overclaiming ("invented", "first", "father of") | Writing rules in the brief. A test fails if "invented" or «اخترع» appears in the answer or in any Muslim-scholar step, unless it is negated. Superlatives must be attributed to a named source. |
| Erasing other civilisations | A test requires a *before* or *after* step in every chain. Every chain must end with *today*. Every chain has a «ما لا ندّعيه» line. |
| Legends repeated as fact | Contested claims are moved to "myths", each with its correction and a source. |
| Wrong chain on a photo | Head-noun word matching. AI picks from a closed list only, at most 2. Negatives such as tower, clock tower and red car are measured (§7). When unsure, show nothing. |
| A link to an object family that is too loose (a car → al-Jazari) | Left out on purpose. A car is not linked. The machines chain says exactly what al-Jazari described (crank-slider, camshaft, segmental gears) and what is debated. |
| Link rot or a wrong citation | A source is required on every Muslim and transmission step, and URLs are checked for format by tests. Before launch, a person opens every source URL once, the same pass already planned for museum holdings. Researchers re-check sources in the portal review. |
| Nationalistic tone | We report as historians: described / developed / transmitted. No ranking of civilisations, no "golden age vs dark ages" framing. |

## 7. Measured

MEASURED

## 8. What's in this change (files)

- Data: `data/science/chains.json` (chains and myths) and new scholars in `data/science/scientists.json`. Seeded by `scripts/seed/science.ts`. Migration `db/migrations/0900_science_chains.sql` adds kind `chain` and the `chain` reviews.
- Matching: `src/features/science/chains.ts` (types, head-noun matcher, the list shown to the AI), and the pipeline steps `src/features/discover/{ai,pipeline,server}.ts`. The prompt version is now `discover-v3`, so cached results refresh.
- Visitor UI: `src/features/science/ui/chain-view.tsx`, shown in the discovery result, on `/science/chain/[id]`, on the science index, and on scholar pages ("From their work to today").
- Portal: `/portal/science` and `/portal/science/[id]`, `src/features/science/review.ts`, `POST /api/science/chains/[id]/review`.
- Tests: `src/features/science/data.test.ts` (schemas and history guardrails), `src/features/science/chains.eval.test.ts` (measured matching), and `src/features/discover/pipeline.test.ts` (no AI-written history; head-noun; sensitive; unknown ids dropped).

## 9. Next steps

1. A researcher at a partner institution reviews the chains in the portal, starting with light-and-image, algorithms-and-computing and hospitals-and-medicine.
2. Add a "draft a chain" button on the demand board. It would take objects that visitors photograph and that have no chain, and produce a draft from a researcher-supplied source list only. Drafts go through the same review.
3. Run a live-AI evaluation on 60 real photos to measure the AI picker. The target: no wrong chain, and a chain for at least 80% of objects that have one.
