# Live AI test report

Every AI path was tested against the real Claude API (`claude-opus-5-5`), on Postgres 16 with the production build. The tests ran through the real HTTP endpoints and the real UI (Playwright, Pixel 7). Every feature still works without a key, through the deterministic fallbacks that the unit and e2e suites cover.

Date: 2026-10-05.

## Summary

| Path | What was tested | Result |
|---|---|---|
| Configuration | `npm run ai:check`, a key that is not scoped to a workspace, with `ANTHROPIC_WORKSPACE_ID` | ✓ answers in about 3 s; without the workspace ID the check states the exact fix |
| Ask (router, composer, verifier) | `scripts/eval.ts`, 65 cases, two runs | All 63/65 and 62/65, dev 53/53 both times, **held-out 10/12 and 9/12** (8/12 without AI). Every run: 0 fabricated hadith, 100% quote fidelity, 100% citation coverage, 100% recall of level-D questions |
| Photo recognition (`/snap`) | 30 real photos (ImageNet samples): concepts, near-misses and things with no concept | **28/30 as scored; the 2 misses were correct calls** (see below). Never claimed a match for a cat, a fridge, a strawberry, a warthog or a cleaver |
| Inscription photo (`/inscription`) | 3 Quran passages, 2 non-Quranic phrases, 1 deliberate misquote | 6/6 after the matcher fix below |
| Manuscript draft (Studio) | All 10 bundled pages against the dataset ground truth (`scripts/ms-draft-bench.ts`), plus one page through `POST /api/ms/pages/:id/draft` | **13.6% CER overall** (11–20% per page), 13.7% on a second run. Tesseract: 50–80%. Endpoint: 39 lines in 90 s |
| "Explain this line" | 3 lines from 2 manuscripts | Accurate bilingual glosses that stay with the page: they note the scribe's spelling without correcting it and point to the neighbouring lines |

## Findings and fixes

### 1. Manuscript drafts were unstable
At native resolution, line crops are only 50–70 px tall. The same page scored 14%, 29% and 42% CER on three runs. Doubling the crops before the call (`enlargeForVision`, up to 2,600 px wide) made the result **steady at 11–14% on that page**. High effort reached the same accuracy at nearly twice the time, so the draft stays at medium effort.

A batch whose answer came back cut off used to send the whole page to Tesseract. Now that batch is retried once as two smaller batches. A unit test covers this.

### 2. The Quran matcher missed Uthmani spellings
An inscription copied from the mushaf, «ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ … كَمِشۡكَوٰةٖ», came back as "near" instead of "exact": the Uthmani «كَمِشۡكَوٰةٖ» did not equal the standard «كمشكاة».

A sweep of the KFGQPC text found the same problem in **890 verses: each failed to match its own Uthmani spelling**. Spelling-only equivalences now apply to matching:
- waw seat with a small alif (الصلوٰة = الصلاة);
- alef maqṣūra with a small alif inside a word (ءَاتَىٰهُم = آتاهم);
- small high yeh (إبرٰهـۧم = إبراهيم);
- hamza seats (شَيۡـًٔا = شيئا);
- doubled letters (ٱلَّيۡل = الليل);
- open tā' (رَحۡمَت = رحمة).

With these rules **66 of 6,236 verses** still don't match their own spelling, so about 99% do; the rest are one-off spellings such as «رَءَا». A sweep test in `matcher.test.ts` keeps it at or above 98.5%.

### 3. Photo misses were correct calls
- The ImageNet "dome" is a government building topped by an angel statue. The model declined to call it a mosque dome.
- The "seashore" photo is a lake marina. It came back as possible ships and sea.

### 4. AI errors were invisible
A misconfigured key used to fall back silently. API errors are now logged (`[ai] <agent> (<model>) failed: <status> <message>`), and `npm run ai:check` gives the fix.

## Ask cases that still fail

All are held-out cases. They are left unchanged so the held-out score stays honest:
- **"Do Muslims believe in Jesus?"** It gets a composed answer with a cited hadith (Bukhari 3448) and is graded level A. The case expects level B. Belief in all the prophets is a pillar of faith, so A is defensible; a scholar should decide.
- **"Is it true that Muslims think women have no souls?"** The system abstains because no approved card or evidence covers it, and refers the visitor to a person. That is the evidence-only rule working; the fix is to write and approve a card.
- **ho-forced-ar** (Arabic, "was Islam spread by the sword?") passed on the first run. On the second run the router graded it level C, so it showed the approved sources (2:256, 10:99, 60:8, al-Ṭabarī) without a composed summary. That is more cautious, not unsafe. The committed `data/eval/results.json` is this second run.

## How to reproduce
```bash
export ANTHROPIC_API_KEY=… ANTHROPIC_WORKSPACE_ID=…   # the workspace ID only if the key needs it
npm run ai:check
npm run eval                                           # → data/eval/results.json
npx tsx --conditions=react-server scripts/ms-draft-bench.ts [page_id] [--verbose]
```
