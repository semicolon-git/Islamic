# Signs Around You · آيات حولك

A web app and PWA that lets a curious visitor point a phone at the world (the moon, a date palm, a mosque lamp, a page of an old manuscript) and get **only content that an Islamic institution has reviewed and approved**:

- the Quran text, inserted verbatim from the King Fahd Complex database;
- a labelled translation;
- authenticated hadith, cited by collection and number;
- a sourced explanation.

Behind it, a portal lets **institutions, researchers and supervised students** build that content together. Its flagship is the **Manuscript Studio**, where a team transcribes, reviews and *understands* old Arabic manuscripts and then publishes them for the public.

Entry for the **AI Challenge: Serving Islamic Content** (تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي).

> **Content status.** The cards, glossary meanings and demo answers were written for the demo and still need sign-off by a qualified scholar before any public launch. See [`docs/content/CONTENT_REVIEW.md`](docs/content/CONTENT_REVIEW.md). The seeded people, institutions and approvals are personas, shown as **(demo)**.

**Demo video:** [`docs/demo/signs-around-you-demo.mp4`](docs/demo/signs-around-you-demo.mp4) (3 minutes, real platform footage). To re-record it, see [`scripts/demo-video`](scripts/demo-video/README.md).

## Quick start

Requirements: Node 20+ and about 1 GB of disk. No external database is needed.

```bash
npm ci
npm run setup          # downloads the pinned Quran / hadith / translation sources (sha256-checked) and seeds the database
npm run assets:fetch   # optional: copies the generated concept images into public/ (otherwise they load from the CDN)
npm run dev            # http://localhost:3000
```

- **Visitor app:** <http://localhost:3000>
- **Portal:** <http://localhost:3000/portal>. Pick a persona and enter the demo PIN **1448**.

| Persona | Role | What to try |
|---|---|---|
| Sara Al-Harbi | student | Fix the card that came back with a reviewer note, continue a draft, transcribe manuscript lines, key hard words |
| Omar Haddad | student | The second reader for blind double-keying |
| Dr. Huda Al-Qahtani | researcher | Review and approve or return cards, adjudicate hard words, review manuscript pages, confirm Quran quotations |
| Dr. Noura Al-Saleh | institution admin (university) | Publish approved cards, read visitor demand |
| Khalid Al-Otaibi | institution admin (library) | Publish manuscript pages; manage heritage items and QR labels |
| Yusuf Rahman | specialist | Answer visitors in "Talk to a person" |

All AI features work without an API key through deterministic fallbacks. Set `ANTHROPIC_API_KEY` to switch on the AI paths (see [AI](#ai) below).

## What's inside

### Visitor app (mobile first, English/Arabic, installable PWA)
| Route | What it does |
|---|---|
| `/welcome` | First run: language, what this is (AI disclosure, privacy promise), camera explained. |
| `/` | Explore three tracks (nature, art and architecture, heritage) and recently approved cards. |
| `/snap` | Camera or photo. With a key, the AI suggests a concept; without one, a searchable picker opens. Photos are never stored. |
| `/c/[concept]` | The approved card, or "No reviewed card yet — we won't guess" with "Notify me", which goes live to the portal's demand board. |
| `/ask` | Questions answered **only from approved evidence**: levels A–D, abstention, a "Why this answer?" drawer, misquote detection, term corrections. |
| `/talk` | Talk to a person: consent, then a realtime thread with a specialist. |
| `/inscription` | Type or photograph Arabic calligraphy. The matcher finds the exact verse (or the nearest one, with the differences shown) or says it is not a Quranic verse. |
| `/heritage`, `/heritage/item/[code]` | Museum items by label code or QR code, with confirmed inscriptions. |
| `/heritage/manuscripts/…` | The public reader for published manuscript pages: diplomatic and reading layers, marks explained, contributors credited. |
| `/about` | Sources, privacy, how approval works. |

### Portal (desktop first, Arabic/English)
| Route | What it does |
|---|---|
| `/portal` | A role-aware dashboard that always shows your one next task. |
| `/portal/cards` | A structured card editor with a validation checklist and lint (for example, no "scientific miracle" framing), the workflow (student → researcher → institution, four-eyes rule) and version diffs. |
| `/portal/demand` | Live visitor requests grouped by concept or topic, with one-click "Create card". |
| `/portal/inbox` | Specialist conversations, live. |
| `/portal/manuscripts` | **Manuscript Studio:** library, page workspace, `…/queue` (My work, review queue, assignments), `…/queue/hard-words` (blind double-keying and adjudication), `…/[msId]/compare` (copies side by side). See below. |
| `/portal/items` | Heritage items, printable QR labels, inscription confirmation. |
| `/portal/eval` | The Ask safety scoreboard: fabricated hadith, quote fidelity, citation coverage, false refusals, levels. Can be run from the UI. |
| `/portal/people` | Learning points from accepted work. Students are shown by initials. |

### Manuscript Studio, the novel part
A manuscript is never "corrected". The **diplomatic layer** records exactly what the scribe wrote, marks and all. The **reading layer** adds confirmed abbreviation expansions and normalisation. The two are never merged. The domain research behind every decision is in [`docs/research/manuscripts.md`](docs/research/manuscripts.md).

- **Machine first draft:**
  - Claude vision (transcription only, line by line) with a key, Tesseract without one.
  - Uncertain words are marked `unclear` with a model score; the score is not a probability.
  - Measured character error rate on the 10 bundled pages: live Claude drafts 11–20% per page (13.6% overall, stable across runs; `npx tsx --conditions=react-server scripts/ms-draft-bench.ts`), Tesseract 50–80%. The seeded demo drafts measure 5–18%.
- **Workspace:**
  - The page image with zoomable regions and line sync.
  - An RTL line editor whose markup covers unclear words, gaps (with a reason), supplied text, deletions, additions, abbreviations, red and gold ink, and scribal marks (sic / ضبة / ظ / collation).
  - Soft locks, conflict merge and history.
- **Collaboration:**
  - Students get assignments and a "My work" queue.
  - **Blind double-keying of hard words:** two students read the same uncertain word independently. If they agree, that becomes the consensus; if not, a researcher adjudicates.
  - Suggestions with accept, edit or reject.
  - Threaded comments.
  - Presence.
  - Page review as diffs.
  - Points only for accepted work.
- **Understanding:**
  - Quran quotations inside the manuscript are detected by the same matcher as `/inscription`. They are shown next to the standard text, and the variants are annotated, never overwritten.
  - Panels list abbreviations, glossary terms and notes on the page.
- **Compare copies:** copies of one work, with sigla أ/ب/ج, are aligned word by word with an apparatus («في (ب): …», «سقط من (ب)»).
- **Publish:** four-eyes approval freezes a page as a sha256-hashed publication, which the public reader shows as a «تفريغ نصي مُراجَع» (reviewed transcription), never as «تحقيق».
- **Exports:** TEI, TXT, JSON and JSONL.

## Rules the code enforces
- **Quran text** comes only by reference from the KFGQPC Hafs v18 table and is rendered in the KFGQPC font. It is never generated or typed.
- **Quran recitation** is a human recording looked up by verse key (Al-Husary, murattal, Hafs), never synthesised speech. Every verse shows a "Listen" button; an invalid key gets no audio. `npm run recitation:check` verifies the recordings' numbering against KFGQPC in all 114 suras, that first verses are recorded without the bismillah (matching the text), and the pinned sha256 of every verse the cards cite.
- **Hadith** come only by id (Bukhari, standard numbering; Muslim, Abd al-Baqi numbering) and always show the collection, number and grade.
- **Counts** are computed by code from the Quranic Arabic Corpus, and the counting rule is shown.
- **Ask** answers only from approved cards. It abstains when the evidence is empty, refers fatwa-type questions (level D) to a person, and never confirms "scientific miracle" framing.
- **Workflow:** student → researcher → institution, and no one approves their own work.
- **Privacy:** no visitor accounts, no belief tracking, photos are never stored, "Notify me" is keyed to a hashed device token.

## Development

```bash
npm run dev            # dev server (PORT=3000)
npm run typecheck      # tsc
npm run lint           # eslint
npm test               # vitest (unit)
npm run test:e2e       # playwright (builds nothing: run `npm run build` first; it seeds its own database)
npm run eval           # Ask evaluation on data/eval/cases.json → data/eval/results.json (committed run: AI on; results.nokey.json: deterministic path)
npm run verify         # all of the above
npx tsx scripts/sql.mts "select count(*) from cards"   # quick SQL against the local DB
```

- **Stack:**
  - Next.js 15 (App Router), React 19, TypeScript and Tailwind v4.
  - Postgres: PGlite embedded for local use, or any Postgres through `DATABASE_URL`. SQL migrations in `db/migrations` are applied automatically.
  - Realtime over Server-Sent Events, using the `events` table.
- **Docs:**
  - [`docs/architecture/SPEC.md`](docs/architecture/SPEC.md) is the source of truth.
  - Each feature lives in `src/features/<feature>` with its own README where it has one.

### AI
`ANTHROPIC_API_KEY` switches on:
- photo recognition (`/snap`);
- composed answers with a verifier (`/ask`);
- inscription reading from a photo;
- manuscript line drafts;
- "explain this line" glosses.

Every AI output is labelled as an AI draft, and every AI path has a tested no-key fallback. Keys that are not scoped to a workspace also need `ANTHROPIC_WORKSPACE_ID`. Models default to `claude-opus-5-5` and can be overridden per agent (`AI_MODEL_*`, see [`.env.example`](.env.example)). `npm run ai:check` makes one tiny call per configured model and says what is wrong if the key or workspace is misconfigured.

## Deploy

**Your own server (recommended):** one command on a clean Ubuntu/Debian server installs Docker, Postgres and automatic HTTPS (Caddy), seeds the data and starts the app:

```bash
curl -fsSL https://raw.githubusercontent.com/semicolon-git/Islamic/main/deploy/install.sh | sudo bash -s -- your.domain.com
```

Full guide, everyday commands, backups and troubleshooting: [`deploy/README.md`](deploy/README.md).

**Any other Node host:** set `DATABASE_URL` (Postgres 15+ with `pg_trgm`), `SESSION_SECRET` and `PUBLIC_BASE_URL`, then run `npm run build && npx tsx scripts/seed.ts --if-empty && npm start`.

## Data and licences
- **Quran:**
  - Text: KFGQPC Hafs v18 (King Fahd Glorious Quran Printing Complex).
  - Translation: Saheeh International.
  - Morphology: Quranic Arabic Corpus 0.4 (GPL, used verbatim for counts).
  - Recitation: Sheikh Mahmoud Khalil Al-Husary (murattal), verse-by-verse files streamed from EveryAyah.com; checksums of the cited verses are pinned in [`data/content/recitation/husary.json`](data/content/recitation/husary.json). EveryAyah publishes no licence terms, so **confirm permission before commercial use**.
- **Hadith:** Sahih al-Bukhari and Sahih Muslim, from the fawazahmed0 hadith-api mirror. Re-verify each one on dorar.net before launch.
- **Manuscript images:** the bundled pages come from public collections. The holding library, shelfmark, licence and credit line are stored for every copy and shown wherever an image appears. **Check each licence before commercial use** (some are non-commercial).
- **Decorative images:** generated, and they contain no letters. No AI-generated calligraphy or fake manuscripts are used anywhere.

## Background
- [`docs/review/signs-around-you-review.md`](docs/review/signs-around-you-review.md) is the strategic review of pitch deck v4. It covers compliance with the challenge's reference pack (levels A–D, the 8 standards, the 12 test questions), the architecture and the demo script.
- [`prep/`](prep/README.md) is the prep-day data kit: pinned sources, the verified concept list and the inscription matcher prototype.
- [`docs/review/ux-audit.md`](docs/review/ux-audit.md) records the UX audit and its fixes. [`docs/screenshots/`](docs/screenshots) holds the screens, by feature.
