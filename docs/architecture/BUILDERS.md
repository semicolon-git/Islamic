# Builder brief (read fully before writing code)

You are one of several parallel builder agents creating the **Signs Around You · آيات حولك** platform for a Saudi hackathon (AI Challenge — Serving Islamic Content). Judges include sharia scholars and AI experts. The team lead asked for a complete, working, beautiful platform: deeply tested, intuitive and easy to use. Treat quality as the job.

## 0. Setup (in your git worktree)

```bash
npm ci || npm install --no-audit --no-fund
mkdir -p prep/data && cp -r /home/user/Islamic/prep/data/raw prep/data/     # pinned Quran/hadith/translation sources (gitignored)
npx tsx scripts/seed.ts --reset                                           # seeds .data/pglite in your worktree
PORT=<your dev port> npm run dev                                          # dev server
```

Read, in this order:
1. `docs/architecture/SPEC.md` (single source of truth)
2. `db/migrations/0001_core.sql`
3. `src/lib/*` (db, auth, events, use-events, workflow, quran, hadith, glossary, cards, ai/claude, http)
4. `src/components/ui/*`, `src/components/shell/*`, `src/i18n/*`
5. `scripts/seed.ts`, `scripts/seed/core.ts`, `scripts/seed/content.ts`, `data/content/*`
6. `e2e/helpers.ts`, `e2e/smoke.spec.ts`, `playwright.config.ts`
7. `docs/research/manuscripts.md` (domain research) and `docs/review/signs-around-you-review.md` (strategy, safety rules §5, §9, §17)

## 1. Ownership: you only create or modify files in your own area

- Your feature directories are listed in your task.
- Scaffold-owned files (`src/lib/**`, `src/components/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/i18n/index.ts`, `src/i18n/core.ts`, `db/migrations/0001_core.sql`, `scripts/seed.ts`, `playwright.config.ts`, `package.json`) must **not** be edited.
  - Exceptions: you may **add new files** under `src/components/ui/` if they are generic.
  - If a scaffold file has a real bug, make the smallest fix and list it in your final report.
- **No new npm dependencies.** Available: next 15, react 19, zod 4, drizzle not used (use `sql`/`one`/`tx` from `@/lib/db`), sharp, qrcode, jsqr, react-zoom-pan-pinch, tesseract.js 7, nanoid, lucide-react, clsx, @anthropic-ai/sdk.
- **i18n:** add every user-facing string to your own `src/i18n/messages/<feature>.ts` in **both English and natural, high-quality Arabic** (not word-for-word translation). Key prefix = your feature.
- **DB changes:** add SQL files only in your migration number range (see your task). Prefer the existing schema.
- **Seed:** your optional `scripts/seed/<feature>.ts` exports `async function seed(q: Queryable)`. It runs after core and content, must be idempotent, and must work with an empty or a full content set.

## 2. Non-negotiable product rules (SPEC §1)

- **Quran text** only by reference, from `quran_ayah`, rendered with `VerseBlock`/KFGQPC font. Never generated, never typed.
- **Hadith** only by id from the `hadith` table, always shown with collection, number and grade.
- **Counts** come from code, with the counting rule shown.
- **Levels A–D, abstention and transparency labels** exactly as in SPEC. No visitor accounts and no religion fields. Photos are never stored.
- **Manuscripts:** never "correct" the manuscript. Diplomatic layer ≠ reading layer.
- **Demo honesty:** seeded personas, institutions and approvals show `(demo)` when `env.demoMode`.
- **Every AI feature has a deterministic no-key path.** Tests run with **no API key**. Test AI code with mocked clients (`__setClientForTests` in `src/lib/ai/claude.ts`).

## 3. UX & visual bar

These are the most important criteria.

- Follow SPEC §7 (UX principles) and §8 (visual language).
- Use the design tokens (`bg-surface`, `text-ink-2`, `border-line`, `bg-accent`, …) and UI kit components. Use logical properties (`ms-/me-/ps-/pe-/start/end`) so RTL works automatically.
- **Mobile first** for the visitor app (390×844), **desktop first** for the portal (1440×900), and **responsive both ways**.
- Every async view has **loading (skeleton), empty, and error states**, each with a next action.
- Arabic must look excellent:
  - correct `dir`;
  - no clipped diacritics (generous line-height);
  - Arabic-Indic numerals only where natural;
  - `<bdi>` for mixed runs.
- Accessibility:
  - semantic landmarks, labelled controls and visible focus;
  - 44px touch targets;
  - `aria-live` for async results;
  - **zero serious/critical axe violations** (use `expectAccessible` in e2e).
- Motion: subtle (`animate-rise`/`animate-pop`), respect reduced motion.
- **Self-review visually:**
  1. Use Playwright (chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) to screenshot every main screen at mobile and desktop, light and dark, EN and AR.
  2. **Look at the PNGs** (Read tool) and fix what looks off: spacing, hierarchy, alignment, truncation, contrast, empty areas.
  3. Iterate at least twice.
  4. Save final screenshots to `docs/screenshots/<feature>/` (PNG, ≤ 30 files, keep sizes reasonable).

## 4. Testing (required)

- Unit tests (`src/**/*.test.ts`, Vitest) for all pure logic.
- Playwright specs in `e2e/<feature>/` for every primary journey plus an axe scan of each main page.
  - Run with your own port: `npx next build && E2E_PORT=<your e2e port> npx playwright test e2e/<feature>`.
  - Use `*.mobile.spec.ts` / `*.desktop.spec.ts` suffixes to limit to one project.
- Before finishing, all of these must pass in your worktree:
  - `npx tsc --noEmit`
  - `npx eslint src` (no errors)
  - `npx vitest run`
  - `npx next build`
  - your e2e specs **and** `e2e/smoke.spec.ts`
- Fix flakiness; never skip tests.

## 5. Commit & report

- Commit to your worktree's branch in logical commits:
  `git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "<message>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  Do **not** push.
- **Final report** (your last message):
  - branch name (`git rev-parse --abbrev-ref HEAD`) and HEAD SHA;
  - what you built, with routes and APIs;
  - test results (counts);
  - files touched outside your area, and why;
  - known gaps;
  - the screenshots folder.
