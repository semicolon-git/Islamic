# Phase 2: manuscript geometry and area notes

This phase makes the manuscript image a first-class place to work, not just a backdrop for line text.

## What phase 1 does today (verified in code)

| Capability | Status |
|---|---|
| Regions (main text, margin, title, rubric, catchword, colophon, seal, illustration) | Drawn as **upright rectangles**. They can be moved and resized; a resize scales the shape inside its bounding box. |
| Lines | Each has a polygon and a baseline. Lines are synced with the text both ways. Polygons imported from datasets can be any shape, but **people can only draw upright rectangles**. |
| Automatic line detection | Horizontal lines in the main block only (projection profile; 90.5% line recall on the 10 sample pages). Vertical and oblique lines must be drawn by hand. |
| Vertical text | Works when drawn by hand. A tall line crop is turned 90° automatically, and a button flips the direction (clockwise or anticlockwise). |
| Diagonal or oblique text | **Partial.** The line can be transcribed, but its box must be an upright rectangle that also covers its neighbours, and the crop is not straightened. |
| Reading order | Lines are ordered by region, then by line. The order can be changed by hand. |
| Word position | **Estimated only**, from the word's place in the line text. It is used to show the hard-word crop. No word boxes are stored. |
| Comments, annotations and observations | Attached to a **line**, or to words in the text. **They can't be attached to an area of the image.** |

## Phase 2 scope

### 1. Free shapes and real orientation
- **Drawing tools:**
  - a *rotated rectangle* tool: drag along the writing direction, then set the height;
  - a *polygon* tool: click points, then double-click to close.
- Each line stores its **angle** (from its baseline). Any angle is allowed: horizontal, vertical, diagonal, upside-down.
- Line crops are **straightened at the exact angle** so they always read horizontally.
- Region types gain `interlinear` and `marginal-oblique`.
- **Reading order:** drag lines in a sidebar, plus a "follows" link for notes that wrap around the text block.
- **Auto-detect for marginal and oblique text:** estimate each margin cluster's dominant angle (Hough transform or minimum-area rectangle), rotate the cluster, then run the existing line detector. Every result is offered as a *suggestion* that a person accepts.

### 2. Word boxes
- Each word gets an optional `box` (a polygon in page pixels, plus `src: auto|person` and `conf`). The text model doesn't change.
- **Automatic first pass:** the vertical ink profile along the straightened line finds the gaps, which are then aligned to the transcribed words. Arabic letters that don't join forward (ا د ذ ر ز و) create gaps inside a word. So each candidate gap is scored, and a word whose box disagrees with its text length is flagged for review.
- **Correction:** select a word in the editor and its box appears on the image, ready to drag its corners or redraw it. Box edits are versioned like text edits, including the conflict and merge rules.
- **Public reader:** tapping a word highlights its exact area on the image.

### 3. Area notes (observations on any part of the page)
- Any user with access to the page can select an **area**: a rectangle, rotated rectangle or polygon. It can be text or something that isn't text, such as a seal, an ownership note, a drawing, a repair or damage.
- They then add a typed note: `observation`, `question`, `reading suggestion`, `damage`, `ownership / reader's note`, `collation`, or `decoration`.
- Notes are discussed in threads, with @mentions and resolve, just like line comments. A note never changes the text.
- **Pins on the image.** A side list can be filtered by type, author, status and region.
- **Review:** a researcher can *confirm* a note, which marks it reviewed; only confirmed notes can be published. Students are shown by initials.
- **Optional public visibility:** confirmed notes marked *public* appear in the public reader as numbered markers with a plain-language explanation.
- **Points:** awarded only for notes a researcher confirms. Weight depends on the type: paratext and seals count more.

### 4. Exports
- TEI: `<facsimile>`/`<zone>` with `points`, including rotated zones; words link to zones by `facs`; area notes become `<note target>`.
- **PAGE-XML** export: `TextRegion`, `TextLine` (with baseline and orientation), `Word`, and `Coords`. This is the format used to train handwriting-recognition models (Kraken, eScriptorium, Transkribus).

## Data model sketch
- `ms_lines.angle real`, and `ms_lines.polygon` free-form (already a polygon).
- Token field `box?: {points: [x,y][], src: 'auto'|'person', conf?: number}`.
- New table `ms_area_notes`: `id, page_id, shape jsonb, kind, body, author_id, status(suggested|confirmed|rejected), visibility(internal|public), created_at`. Replies reuse `ms_comments` through `area_note_id`.
- Realtime events: `area.created`, `area.updated` and `area.resolved` on `page:<id>`.

## Acceptance tests
1. A page with horizontal main text, a vertical margin note and a 45° oblique gloss: each can be outlined, its crop reads horizontally, and its transcription saves.
2. On the bundled pages, automatic word boxes cover ≥ 85% of main-text words within the IoU threshold. Every flagged box can be corrected in two actions or fewer.
3. A student selects a seal and adds an *ownership* observation. A second user sees the pin appear live. A researcher confirms it and marks it public. It appears in the public reader. Points are awarded once.
4. The TEI and PAGE-XML exports validate, and they round-trip angles, word boxes and notes.
5. Axe passes and keyboard-only use works. Every shape can also be created and edited with keyboard nudges.
