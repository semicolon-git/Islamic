# UX audit: Signs Around You · آيات حولك

UX1 · 2026-10-03 · branch `main` (all features merged)

## Method

- **Build under test.** A production build (`next build && next start`) on a freshly seeded database with no API key, so every screen ran its deterministic path.
- **Screenshots.** Playwright (Chromium) captured every in-scope screen:
  - visitor app at 390×844 on a touch device;
  - portal, and the visitor app as a spot check, at 1440×900;
  - light and dark themes, English and Arabic.
- **States covered.** Loading, empty, error and success states, and sheets or dialogs open: the picker, Why trust this?, the consent sheet, the QR scanner, the decision dialogs, the shortcuts overlay and the account menu.
- **Persona journeys.**
  - (a) Tourist: welcome → snap/choose → card → ask → talk.
  - (b) Arabic visitor: `/heritage` code entry and item page.
  - (c) Sara (student): returned card → submit.
  - (d) Huda (researcher): approve or return.
  - (e) Noura (institution admin): publish and demand.
  - (f) Yusuf (specialist): inbox.
- **Automated checks.** An axe sweep (WCAG 2 A/AA, colour contrast included) over 30 routes × {EN, AR} × {light, dark}. A scripted check for horizontal overflow and for touch targets under 44px.
- **Iterations.** Each fix was re-screenshotted and checked again (rounds r1 → r2 → final).

Severity:

- **blocker:** breaks a journey or a product rule.
- **major:** visibly wrong, or hurts trust or accessibility.
- **minor:** polish.

**Status:** ✅ fixed · 📝 noted, left open on purpose (reason given).

## Findings

| # | Screen | Persona | Issue | Severity | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | `/heritage/item/[code]` | b, a | **Ask about this object** and **Talk to a person** collapsed to 24px tall on phones: `flex-1` inside a column zeroes the flex-basis. These are the page's main actions. | major | `sm:flex-1`, so they are full-height buttons on phones and side by side from `sm`. | ✅ |
| 2 | `/c/[id]`, `/card/[id]` (image badge), `/` (Recently approved) | a | The approval line was truncated with an ellipsis ("College of Sharia — Demo U…"), cutting off the **(demo)** honesty label (SPEC §1.10). | major | Wraps to 2 lines (`line-clamp-2`) instead of truncating. An e2e check asserts the badge text is not clipped. | ✅ |
| 3 | `/portal/items` | e | Horizontal page scroll at 1440px (1584px wide): the table's grid column could not shrink below its content. | major | `minmax(0,1fr)` column. The venue-code aside moves under the table below 1536px, so every column stays visible. | ✅ |
| 4 | `/portal/cards/[id]` (AR) | c | An English reviewer note inside the Arabic "returned by …" sentence was bidi-scrambled: punctuation and quotes jumped to the wrong ends. | major | The note is bidi-isolated (FSI/PDI). The history timeline notes use `<bdi>`. | ✅ |
| 5 | `/heritage/item/[code]` (AR) | b | The generated-image credit and licence showed in English on the Arabic page. | major | A localised credit and licence are shown when the stored text has no Arabic (new key `heritage.item.generatedCredit`). | ✅ |
| 6 | `/c/<unknown>`, any unmatched URL | a | Bare 404: no title (axe `document-title`), no app shell, no tab bar, one 26px text link. A dead end. | major | New `(public)/not-found.tsx` that keeps the header and tab bar, and a branded root 404. Both have a page title and three next steps: Home, Choose what you see, Ask. | ✅ |
| 7 | All AR screens | b, c–f | Relative times ("قبل 20 ساعة"), waiting durations, workflow step numbers, tab counts and the "الإصدار 1" label used Western digits, while counts used Arabic-Indic digits (SPEC §7.6). | major | `fmtRelative` and `fmtDuration` use `ar-SA`. `Segmented` counts, workflow steps and the saved version go through `fmtNumber`. Verse keys stay `10:5`. | ✅ |
| 8 | `/portal/login` | c–f | Persona cards truncated the institution and showed no **(demo)** mark (SPEC §1.10). Platform Admin had a trailing "·". The radio cards had no visible keyboard focus. The wrong-PIN message was English-only and self-referential ("shown on the sign-in page"). The left panel repeated the subtitle and had no brand mark. The page title was English-only. | major | Each persona shows "(demo)" and a 2-line role · institution line. Keyboard focus ring via `has-[:focus-visible]`. Localised `login.badPin`. Brand mark added and the duplicate subtitle removed. Localised `<title>`. | ✅ |
| 9 | `/portal/eval` | e | Confusion-matrix diagonal cells failed AA contrast: white on a light accent mix (2.45:1) in light mode, dark on a dark mix (3.51:1) in dark mode. | major | Diagonal cells use `bg-accent-soft` + `text-ink` + an accent ring. Under-classified level-D cells stay red. | ✅ |
| 10 | `/portal/inbox` (dark) | f | Muted text on the selected thread row was 3.95:1. | minor | The selected row lifts muted text to `ink-2`. | ✅ |
| 11 | Visitor header, `/inscription` tabs, Talk **End conversation**, chips | a, b | Touch targets under 44px: the logo link was 34px, the language toggle 36px, segmented tabs 36px, `Button sm` 36px. | major | `pointer-coarse:` sizes on `Button sm`, `IconButton sm`, `Chip` and `Segmented`. Header controls are 44px. Mouse users keep the compact portal density. | ✅ |
| 12 | `/portal/demand` | e | Every tab used "No open requests" as its empty state, including Fulfilled and Dismissed. A one-request card read "1 · 1 request". | minor | Per-tab empty title and body. The unit word now follows the big number ("1 request"). | ✅ |
| 13 | `/portal/cards/[id]` (reviewing) | d, e | The read-only reviewer view still labelled its tab **Edit**. | minor | The tab reads **Content** when the editor is read-only. | ✅ |
| 14 | `/portal` (dark) | all | The "Your next task" hero (`bg-brand`) melted into the dark page background. | minor | The hero card gets a `line-strong` edge. | ✅ |
| 15 | `/portal` | c–e | "Learning points 615 · earned for accepted work" read as personal, but it is the institution total. In AR, "٠ صفحات للنسخ · ٠ …" looked like separators because the Arabic zero is a dot. | minor | "earned by your institution for accepted work". The Arabic Studio counts read "صفحات للنسخ: ٠، للمراجعة: ٠، …". | ✅ |
| 16 | Portal on phones | f | "Institution Portal" wrapped to 2 lines in the 56px header. The menu drawer was `aria-modal` but did not take focus and Escape did nothing (keyboard trap risk). | minor | Mark-only logo below `sm`. The drawer focuses its first link, has an accessible name and closes on Escape. | ✅ |
| 17 | `/heritage`, `/`, picker tiles | a | While images load, or when they are blocked, the tile showed light `surface-2` under white captions: unreadable. | minor | `ConceptImage` keeps the tinted khatam tile under the image, so captions always sit on a dark tile. | ✅ |
| 18 | `/heritage/item/LMP-3` | b | The 24:35 verse (11 lines) rendered twice: under the inscription and again in "From the approved card". | minor | The card summary skips a verse the page already shows in full. | ✅ |
| 19 | `/c/[id]` Still curious? | a | The decorative khatam was painted over the Ask and Talk buttons, because the buttons were not positioned. | minor | The decoration sits behind (`relative` content) and moves to the top corner. | ✅ |
| 20 | Ask, Talk, inscription | a | JS `scrollIntoView({behavior:"smooth"})` ignored *prefers-reduced-motion*; the global CSS rule does not cover explicit JS scrolling. | minor | `scrollBehavior()` helper (`src/components/ui/motion.ts`). | ✅ |
| 21 | `/portal/items` | e | The table header was uppercase and tracked, while the cards table uses sentence case: inconsistent between the two portal tables. | minor | Matched the cards table header style. | ✅ |
| 22 | Card editor and history | c | The workflow bar shows Draft "7 minutes ago" after Submitted "6 days ago", and v1 "14 minutes ago" against a review dated 27 Sept. The seed writes `created_at` = seed time but back-dates the reviews. | minor | Seed-data chronology only; the UI reads the stored times correctly. | 📝 Data, not UI. The seed is owned by the cards feature. |
| 23 | All concept and item images | a, b | The generated concept images are hot-linked from CloudFront. Where that host is blocked (as in this sandbox), every tile shows the fallback. | minor | The fallback is now readable (#17). | 📝 Hosting decision: vendor the images into `public/` before demo day so the app works offline and on locked-down venue Wi-Fi. |
| 24 | Picker sheet, shortcuts overlay | a, c | `showModal()` focuses the close button first, so a large focus ring appears on open. | minor | — | 📝 Correct dialog behaviour for keyboard users. Autofocusing the search field instead would pop the phone keyboard over the grid. |
| 25 | `/inscription` | a | A full-page screenshot shows a tiny resize grip at the textarea's start corner in RTL. | minor | — | 📝 Browser chrome, and it is functional. |
| 26 | `/offline.html` | a | The static offline page uses the system font rather than Readex Pro. | minor | — | 📝 It has to work with no network or cache. The layout and copy are fine. |
| 27 | Portal | c–f | Persona names in the portal (activity feed, queues) carry no "(demo)"; only the header pill, the dashboard subtitle, People and Login do. | minor | — | 📝 The portal header shows a persistent DEMO pill on every page. Repeating it on every name would add noise. |

### Content and sharia questions (not changed: content owners must decide)

| # | Screen | Observation |
|---|---|---|
| C1 | `/c/moon` hadith block | The source English reads "Narrated Ibn \`Umar:The Prophet (ﷺ) said": a missing space and a backtick. It comes verbatim from the hadith dataset, and SPEC §1.2 forbids editing hadith text, so it is noted for the data owner. |
| C2 | `/card/answer:jihad` | Saheeh International 2:190 shows "…but do not transgress. Indeed. Allah does not like…" (stray full stop). It is the mirrored translation as stored; pin it to the official edition (already listed as pending on /about). |
| C3 | Cards in AR | Arabic UI shows Quran text without a translation (by design). Confirm with reviewers that no Arabic tafsir summary is expected in its place for level-A cards. |
| C4 | `/c/moon` 41:37 | The sajdah overline in the KFGQPC glyph run extends slightly past the text box. That is the font's rendering of the verbatim text; do not alter it. |

### Quran rendering check

Quran text was checked on the card, the answer, the inscription result, the heritage item and the editor preview, in both locales:

- it renders in **KFGQPC Hafs**, from `quran_ayah`, inside `<blockquote lang="ar" dir="rtl">`, with the end-of-ayah glyph;
- the translation is always labelled "Translation of the meaning · Saheeh International", or "English translation of the meaning" for hadith;
- the explanation is labelled "Explanation (not Quran text)";
- inscriptions keep "As read on the object" (diplomatic, Amiri) separate from the KFGQPC verse.

No issues found.

## Accessibility summary

- **Before:** the axe sweep (120 page × locale × theme runs) flagged `document-title` on the in-app 404, `color-contrast` on the eval matrix (light and dark) and `color-contrast` on the selected inbox row (dark).
- **After:** no serious or critical violations, and no colour-contrast failures.
- **New e2e axe coverage:**
  - dark-mode scans of `/`, `/c/moon`, `/ask`, `/heritage`, `/heritage/item/LMP-3`, `/talk`, `/portal`, `/portal/eval`, `/portal/inbox/[id]`, `/portal/items` and the card editor;
  - light-mode scans of the 404s, `/portal/login` with the error state, `/portal/items` and the card History tab.

These are in `e2e/ux/visitor.mobile.spec.ts` and `e2e/ux/portal.desktop.spec.ts`.

## Screenshots

`docs/screenshots/ux/` holds before/after highlights (`*-before.png` / `*-after.png`) and the final state of the key screens.
