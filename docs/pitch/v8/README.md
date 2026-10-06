# Pitch deck v8 (Arabic, 17 slides)

`Signs-Around-You-Pitch-v8.pdf` is rendered from `deck.html`. Every screen in it is the real app (`shots/`, taken by `scripts/pitch-deck/shots.mjs`).

```bash
APP_URL=http://localhost:3400 OUT_DIR=docs/pitch/v8/shots node scripts/pitch-deck/shots.mjs   # screenshots (read-only)
node scripts/pitch-deck/render.mjs docs/pitch/v8/deck.html docs/pitch/v8/Signs-Around-You-Pitch-v8.pdf
```

## Review comments on v7, and what changed

| Comment | Change |
|---|---|
| Slide 7: numbers must be measured | The numbers slide (now 13) only shows figures from committed runs; see the table below. Two v7 figures changed: 63/65 → **62/65** (the committed run), and 13.6% CER (a report figure with no saved output) → **10.5% vs 70.2%** for Tesseract on the same 314 lines. "28/30 photos" (also report only) was replaced by "10/10 fatwa questions referred". The eval dashboard screenshot sits beside the numbers. |
| Shorten Mohamed Esmat's title | Now reads «مطوّر الذكاء الاصطناعي وتطبيق المستفيد». |
| Slide 10 last, with "thank you" | «ما بعد التحدي» is now the final slide, together with «شكرًا لكم», the live link and a QR code. |
| Verses to the beginning | Fussilat 41:53 opens the deck as slide 2, right after the cover. |
| Slide 5: remove the cost | The business model has no cost or service-fee line. The separate funding slide was folded into one «الاستدامة» card, with no amounts. |
| Focus on the institutions portal | Four portal slides: overview (6), visitor request → approved card workflow with four-eyes (7), Manuscript Studio (8), blind double-keying and collation (9). |
| Sky mode technical detail | Slide 11 covers inputs → astronomy-engine + HYG v4.1 (177 stars) → pointing (12° field). It also covers Umm al-Qura Hijri, privacy, Arabic star names and the links to verses and the astrolabe. |
| Explain the flow | Slide 5 shows the discovery pipeline and the three trust badges. Slide 7 shows the portal workflow. Slide 12 shows the architecture across four lanes. |
| Recursive improvement | Slide 10 shows the loop and what each human action becomes as training data. It marks what works today (versions and decisions stored; JSONL/TEI export of approved lines) and what comes next (first fine-tuning run). |

## Where each number comes from

| Number | Source |
|---|---|
| 0/65 fabricated hadith · 80/80 verses byte-equal · 10/10 level-D referred · 62/65 all checks · 1/30 false refusal | `data/eval/results.json` (2026-10-05, AI on); also shown live at `/portal/eval` |
| 10.5% vs 70.2% CER (314 lines, 24,522 chars) | `data/manuscripts/drafts_report.md`, `data/manuscripts/stats.json` |
| 99.1% (6,181 / 6,236) verses word-synced with Al-Husary | `data/content/recitation/husary-segments.json`; method in `scripts/recitation-segments.mts` |
| 0 fabricated references, 27/30 photos with sources | `docs/review/open-world-test.md` |
| 685/685 unit tests | `npx vitest run`, re-run 2026-10-06 (47 files) |
| 177 stars, HYG v4.1, 91 Arabic-origin names | `data/sky/stars.json`, `data/sky/README.md` |
| 6,236 verses · 10,516 Bukhari + Muslim · 21,124 other hadith · 584 sha256 files | `scripts/seed/core.ts`, `data/library/manifest.json` |
