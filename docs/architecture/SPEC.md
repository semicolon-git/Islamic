# Signs Around You · آيات حولك — Platform Spec (v1, 2026-10-02)

This is the single source of truth for every builder. If code and this file disagree, fix the code or update this file in the same change.

## 0. Product in one paragraph

A web + PWA platform with two faces:
- **Beneficiary app** (`/`, mobile-first, EN default with AR): a curious non-Muslim points the camera at the world (moon, palm, a mosque lamp, a manuscript in a museum). They get **only content an institution has approved**: Quran text inserted verbatim from the King Fahd Complex (KFGQPC) database, a labelled translation, sourced explanation. They can ask questions answered only from approved evidence, and they can talk to a person. No accounts, no belief tracking.
- **Institution portal** (`/portal`, desktop-first, AR default with EN): institutions, researchers and supervised students build that content together. The flagship is the **Manuscript Studio**: transcribing and understanding old Arabic manuscripts collaboratively (machine draft → students → researcher → institution approval → published to the public app).

## 1. Non-negotiable rules (from the challenge reference pack, R2–R8)

1. **Quran text is never typed by a model.** It is always inserted by reference (`Q:10:5`) from `quran_ayah` (KFGQPC Hafs v18), rendered in the KFGQPC font. Translation is always labelled with its edition.
2. **Hadith only by reference** (`H:bukhari:1042`) from the `hadith` table, always shown with collection, number, numbering scheme and grade. Never generate a hadith. If none is found, say "No authentic hadith in our approved sources states this."
3. **Counts come from code**, with the rule shown (e.g. "27 occurrences in 26 verses · Quranic Arabic Corpus lemma count").
4. **Levels A–D** (R2): A answer from source; B answer with references, no categorical claims on disputed points; C state that scholars differ, give at most 3 sourced views, no preference (no tarjih), offer referral; D never rule: give general info, state "not a ruling on your case", refer. X (out of scope: judging people or groups, private disputes) → polite decline.
5. **Abstain over guessing**: no evidence means "No verified reference yet" plus "Request this topic" and "Talk to a person".
6. **Transparency**: composed answers carry the label "AI-assisted answer · from approved sources · not a scholar". Approved cards carry "Approved card · {institution}". Handoff carries "You are now talking with a person".
7. **Privacy**: no accounts for visitors and no religion field. Photos are processed in memory and never stored; EXIF is stripped client-side. Visitor threads use a random device token. Training export is opt-in only.
8. **Manuscripts**: never silently "correct" a manuscript. Scribal variants of Quran quotes are annotated (manuscript reading vs standard text), never overwritten.
9. **No AI-generated calligraphy or fake manuscripts.** Generated imagery is decorative only and contains no letters.
10. **Demo honesty**: seeded personas, institutions and approvals are marked `(demo)` in the UI whenever `DEMO_MODE` is on (default on).

## 2. Stack

- **Framework:** Next.js 15 App Router, TypeScript strict, React 19, Tailwind v4 (CSS-first tokens in `src/app/globals.css`), lucide-react icons.
- **Database:** Postgres. Dev, test and single-node use embedded **PGlite** (`@electric-sql/pglite`, with pg_trgm) at `DATA_DIR` (default `.data/pglite`; `memory://` in tests). Production sets `DATABASE_URL` (Supabase or any Postgres) and uses `pg`. Access goes through a tiny query layer (`src/lib/db/index.ts`: `sql<T>(text, params)`, `tx(fn)`) over both drivers. Migrations are plain SQL files in `db/migrations/NNNN_name.sql`, applied in order and tracked in `_migrations`.
- **Realtime:** an `events` table plus `GET /api/events?scopes=a,b&after=id` (SSE). The server polls the table every 700 ms, so it works across instances. The client hook is `useEvents(scopes, onEvent)`, with auto-reconnect and a polling fallback.
- **Auth:**
  - Portal: demo personas, picked on `/portal/login` with a PIN (`DEMO_PIN`, default `1448`). The session is a JWT in an httpOnly cookie (`jose`, `SESSION_SECRET`).
  - Roles: `student`, `researcher`, `institution_admin`, `specialist`, `platform_admin`. The server checks the role on every mutation via `requireUser(roles?)`.
  - Visitors: none. A random `device_token` lives in localStorage, and only its sha256 is stored.
- **AI:** `@anthropic-ai/sdk` via `src/lib/ai/claude.ts`. It is enabled only if `ANTHROPIC_API_KEY` is set (`aiEnabled()`). It uses `client.messages.parse` with `output_config.format: zodOutputFormat(schema)`, base64 images, top-level `cache_control: {type:"ephemeral"}`, checks `stop_reason` (`refusal`/`max_tokens` → typed failure → fallback path), and is non-streaming with `max_tokens` sized per task.
  - **Model:** `claude-opus-5-5` for every agent, overridable per agent via env (`AI_MODEL_VISION`, `AI_MODEL_ROUTER`, `AI_MODEL_COMPOSER`, `AI_MODEL_VERIFIER`, `AI_MODEL_DRAFT`).
  - **Effort:** `output_config.effort` is `low` for router/vision, `medium` for composer/draft.
  - **No forced `tool_choice`** (it 400s on this model).
- **Every AI feature has a deterministic no-key path** (manual picker, rules router, approved-answer retrieval, Tesseract OCR draft, matcher). The app must be fully usable and testable without a key.
- **Images:** sharp (server) for thumbnails, crops and EXIF strip. Uploads go to `UPLOAD_DIR` (default `.data/uploads`). Seed images live in `public/`.
- **OCR without a key:** tesseract.js with `data/ocr/ara.traineddata` (local langPath), server-side.
- **Testing:** Vitest (`src/**/*.test.ts`) and Playwright (`e2e/**/*.spec.ts`). Chromium is at `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (the config reads that env var, and falls back to the default browser elsewhere). `npm run verify` = typecheck + lint + unit + build + e2e.

## 3. Directory ownership (builders only touch their own area plus their tests)

```
src/app/(public)/...        Beneficiary app pages             → B1 (beneficiary) / B5 (heritage pages) / B2 (ask pages)
src/app/portal/...          Portal pages                      → B3 (cards, inbox, demand, dashboard), B4 (manuscripts), B5 (items), B2 (eval)
src/app/api/<feature>/...   Route handlers per feature
src/features/<feature>/     Feature components, server logic, tests  (beneficiary, ask, cards, inbox, manuscripts, heritage, eval, pwa)
src/components/ui/          Shared primitives (scaffold-owned; additive changes only, never breaking)
src/lib/                    Scaffold-owned infra (db, auth, events, ai, i18n, quran, matcher, hadith)
db/migrations/              0001_core.sql (scaffold). Features may ADD files only in their range:
                             cards 0200–0299, ask 0300–0399, inbox 0400–0499, manuscripts 0500–0599, heritage 0600–0699
src/i18n/<feature>.ts       Per-feature message dictionaries {en:{}, ar:{}} (merge in src/i18n/index.ts is scaffold-owned)
data/                       Seed data (content/*, manuscripts/*, eval/*)
scripts/                    seed.ts, fetch-data.sh, eval runner
e2e/<feature>/*.spec.ts     Playwright specs per feature
```

## 4. Data model

See `db/migrations/0001_core.sql` for the authoritative DDL. All ids are `text` (nanoid or semantic, e.g. `card:moon`). Timestamps are `timestamptz default now()`.

**Content workflow states** (cards, manuscript pages, heritage items):
```
ai_draft → student_submitted → researcher_approved → published
          ↘ returned (with note) → student_submitted …          published → archived
```
- Transitions are enforced by `src/lib/workflow.ts` (`canTransition(role, from, to)`).
- The institution approval (→ published) must be done by a different user from the researcher who approved the same version.
- Every transition writes `reviews` + `audit_log` and emits an event.

**Manuscript line lifecycle:**
```
draft → transcribed → (consensus: agreed | disputed) → approved
```
- Saving is optimistic: a save sends `base_version`. A 409 conflict returns their version for merge.
- Soft lock: `locked_by`/`locked_until` (60 s, renewed every 20 s while editing).

**Transcription token model** (stored as `tokens jsonb` per line version):
```ts
type Tok =
 | { t: 'text', v: string }
 | { t: 'unclear', v: string, alts?: string[], conf?: number }            // TEI <unclear>
 | { t: 'gap', reason: 'illegible'|'damage'|'lacuna', extent?: number }   // TEI <gap>
 | { t: 'supplied', v: string }                                          // editor-supplied <supplied>
 | { t: 'del', v: string }                                               // scribe deleted <del>
 | { t: 'add', v: string, place: 'margin'|'above'|'below'|'inline' }      // scribe added <add>
 | { t: 'abbr', v: string, expan: string }                               // <choice><abbr><expan>
 | { t: 'mark', kind: 'sahh'|'nuskha'|'balagha'|'hashiya'|'intaha'|'other', v: string }  // صح، خ، بلغ، حـ، اهـ
 | { t: 'hi', rend: 'red'|'overline'|'large', v: string }                // rubrics
```
- `plain_text` is the diplomatic text: `v`s joined, gaps rendered as `[…]`. It is used for search and matching.
- `normalized_text` is an optional reading text.

## 5. Routes (user-facing)

**Beneficiary (`(public)` group, bottom tab bar on mobile: Discover · Snap · Ask · Heritage):**
- `/`: home with the hero, "Point your camera at something", explore tracks, and recent approved cards.
- `/welcome`: first-run onboarding in three short steps: language, what this is (AI disclosure + privacy promise), camera permission explained. Skippable.
- `/snap`: camera (getUserMedia live preview + capture, or file input `capture=environment`). Then recognition: AI → "Looks like: Moon ✓ · Change"; no AI → the picker. Sample photos are offered.
- `/c/[conceptId]`: the concept card, or the "No reviewed card yet — we won't guess" screen with "Notify me".
- `/card/[cardId]`: a card by id (answers, items).
- `/inscription`: snap or type Arabic text, then the matcher, then a verse card (exact / near / none).
- `/ask`: question, then answer with evidence chips and a "Why this answer?" drawer. Includes "Talk to a person".
- `/talk`: consent sheet, then a thread with realtime messages.
- `/heritage`: enter an item code or scan a QR code, browse items and published manuscripts.
- `/heritage/item/[code]`, `/heritage/manuscripts/[msId]` (read-only reader for published pages).
- `/about`: transparency, sources, privacy, contributors.
- Settings (language, text size, theme) live in a sheet.

**Portal (`/portal`, sidebar):**
- `/portal/login`: persona picker + PIN.
- `/portal`: role-aware dashboard ("Your next task").
- `/portal/cards`, `/portal/cards/[id]`: structured card editor + workflow + history.
- `/portal/demand`: card requests from visitors, live.
- `/portal/inbox`, `/portal/inbox/[threadId]`: specialist threads.
- `/portal/manuscripts`, `/portal/manuscripts/[msId]`, `/portal/manuscripts/[msId]/pages/[pageId]`: the Studio.
- `/portal/manuscripts/[msId]/compare`: collation of copies.
- `/portal/items`, `/portal/items/[id]`: heritage items, QR codes, inscriptions.
- `/portal/eval`: safety scoreboard.
- `/portal/people`: points and roles (light).

## 6. Shared API conventions

- Route handlers live in `src/app/api/<feature>/.../route.ts`. Validate input with zod. Return `{ ok: true, data }` or `{ ok: false, error: { code, message } }` with the proper HTTP status.
- Mutations call `requireUser([...roles])` and run in `tx()`, write audit, and `emit(scope, type, payload)`.
- Event scopes: `card:<id>`, `concept:<id>`, `cards`, `demand`, `thread:<id>`, `inbox`, `page:<pageId>`, `ms:<msId>`, `item:<code>`.

## 7. UX principles (apply everywhere)

1. **One primary action per screen**, visually obvious. Thumb-reachable on mobile (bottom area).
2. **Speak human.** "Point your camera at something you're curious about", not "Upload image for classification".
3. **Never a dead end.** Every empty or error state offers a next step: Try again, Choose instead, Ask a person.
4. **Honest confidence.** Show tiers ("Looks like"), never fake percentages. Uncertain OCR words show alternatives.
5. **Respect & calm.** Inviting, never preachy or "gotcha". No dark patterns, no counters of "converts".
6. **Bilingual by design.** Full RTL/LTR mirroring via logical CSS properties (`ms-`/`me-`/`ps-`/`pe-`, `start`/`end`). Arabic runs in LTR text use `<bdi>`. Use Western digits in EN and Arabic-Indic digits in AR UI, except verse keys, which stay `10:5`.
7. **Speed:** skeletons under 100 ms, optimistic UI for saves, no layout shift.
8. **Accessibility:** WCAG AA contrast in both themes, focus rings, 44 px touch targets, `aria-live` for async results, prefers-reduced-motion.
9. **Workspaces (portal):** keyboard-first (shortcuts listed in a `?` overlay), autosave with a visible "Saved" state, undo, nothing lost on reload.

## 8. Visual language

- **Theme:** night ink + paper. Brand navy `#10143A`, mint `#2FD3AE` (dark) / `#0A8C77` (light), violet `#6E5BFF`, sand `#F3EEE4` for manuscript surfaces, plus semantic ok/warn/bad.
- **Tokens:** defined as CSS variables in `globals.css`, light and dark. Components use tokens only.
- **Type:**
  - UI: Readex Pro (Latin + Arabic, variable).
  - Long Arabic: IBM Plex Sans Arabic.
  - Transcription editor: Amiri (naskh, good tashkil).
  - Quran: KFGQPC Hafs (`/fonts/hafs.18.woff2`), served unmodified.
  - Mono: IBM Plex Mono for keys and IDs.
- **Motif:** the 8-point khatam star and thin geometric lines, used sparingly. No purple-gradient heroes, no emoji icons.

## 9. Testing requirements per builder

- Unit tests for all pure logic (validators, routers, workflow, token model, TEI export, diff/consensus, matcher).
- Playwright specs for every primary journey of the feature, on mobile (Pixel 7) and desktop projects where relevant, plus an axe scan of each main page (no serious/critical violations).
- Tests must pass with **no API key** (AI paths are covered by unit tests with mocked clients).
