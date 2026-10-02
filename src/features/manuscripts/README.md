# Manuscript Studio (core) — `src/features/manuscripts`

Collaborative transcription of Arabic manuscripts: machine draft → students → researcher → institution.
Built to the research memo (`docs/research/manuscripts.md`) and SPEC §4. This file is for the next builder
(collaboration layer: suggestions, double-keying, comments, review UI, tasks, presence, Quran-quote annotations,
collation, public reader).

## Map

| Path | What |
|---|---|
| `tokens.ts` | **Token model** (`Tok`) and pure utilities: `plainText` (diplomatic), `readingText`, `editorString`, `applyTextEdit` (typing), `applyMarkup` (selection → unclear/supplied/del/add/abbr/hi/clear), `insertAt` (marks, gaps), `replaceWithGap`, `acceptAlternative`, `normalizeTokens`, `sameTokens`, `toRenderSpans` (render plan), `tokensToTei` / `teiToTokens` (lossless), `tokensCer`. |
| `text.ts` | Unicode hygiene (`normalizeStoreText`: NFC, no presentation forms / Persian ی ک / bidi controls), `searchForm`, `cerForm`/`cer`/`cerParts` (dataset rule), `diffChars`, `detectTypedMarks`. |
| `marks.ts` | Manuscript marks palette (صح، خ، بلغ، حاشية، اهـ، كذا، ضبة، ظ) and the special-characters palette. |
| `abbreviations.ts` | Genre/zone-aware lexicon (`suggestExpansions`), collisions always shown, أنبا = أنبأنا. Never applied automatically. |
| `segment.ts` | Auto line segmentation (Otsu, text block, projection profile + autocorrelation pitch). Recall 0.905 on all 10 dataset pages (`segment.test.ts`). |
| `geometry.ts` | Polygons, boxes, reading order (`orderLines`: region seq, then line seq). |
| `rules.ts` | Permissions and the four-eyes page gate (`checkPageDecision`), canonical JSON for content hashes. |
| `tei.ts` | TEI P5 document, TXT (diplomatic/reading), JSON, JSONL training set. `xml.ts` = well-formedness checker. |
| `schema.ts` | zod schemas for tokens and every API body. |
| `types.ts` | DTOs (`PageDetail`, `LineDTO`, `LineVersionDTO`, …). |
| `server/*` | `repo` (loaders), `lines` (save/lock/approve), `workflow` (page decisions, flag, frozen snapshots), `layout` (regions/lines/auto-segment), `draft` + `engines` (Claude vision / Tesseract), `images` (sharp, safe file paths), `manuscripts` (create, upload, evaluation), `export`. |
| `components/*` | Library, manuscript page, workspace (image pane, text pane, `LineEditor`, `LineSession`, merge dialog, workflow bar, sheets). |
| `extensions.ts`, `studio-extensions.tsx` | **Extension contract and registry** (see below). |

Tokens (SPEC §4, superset): `unclear` may also carry `cert` and `rend`; `gap` may carry `unit`; `supplied.reason`;
`del.rend`; `abbr.confirmed` (false = suggestion not yet confirmed, not applied in the reading); `mark.note`
(variant reading, gloss text, collation note); mark kinds add `sic`, `dabba`, `zahir`; `hi.rend` adds `gold`.
Marks are zero-width in the editable string and never part of `plain_text`/`reading_text`.

## APIs (`src/app/api/ms`)

| Method & path | Who | Notes |
|---|---|---|
| `GET/POST /manuscripts` | any / researcher, institution_admin | create requires licence + credit line |
| `GET /manuscripts/:id` · `POST /manuscripts/:id/pages` | any / not specialist | multipart `files[]`, `segment=1` |
| `GET /manuscripts/:id/export?format=tei\|txt\|json\|jsonl&layer=` | any | |
| `GET /pages/:id` | any | `PageDetail` (never contains ground truth) |
| `POST /pages/:id/workflow` `{decision, note}` | by role | submit → approve → publish (four eyes; snapshot + sha256 in `ms_page_publications`) |
| `POST /pages/:id/flag` `{flagged, reason}` | anyone raises; researcher/admin resolves | pauses the workflow |
| `POST /pages/:id/draft` `{line_ids?}` | editors | Claude vision with a key, Tesseract without; only lines with no human version |
| `POST /pages/:id/segment` `{replace?}` · `/regions` · `/lines` · `/reorder` | layout editors | |
| `GET /pages/:id/eval` | researcher, institution_admin | dataset GT, evaluation only |
| `GET /pages/:id/export` | any | |
| `GET/PUT/PATCH/DELETE /lines/:id` | | `PUT {base_version, tokens, normalized_text?}` → new version or **409** `{theirs}` / **423** locked |
| `POST /lines/:id/lock` `{action: acquire\|renew\|release}` | student, researcher | 60 s soft lock; 423 with `holder` |
| `GET /lines/:id/versions` · `POST /lines/:id/approve` | any / researcher | |
| `PATCH/DELETE /regions/:id` · `GET /files/<dataset\|uploads>/…` | | safe path resolution |

Realtime scope `page:<pageId>` events: `line.saved`, `line.locked`, `line.unlocked`, `line.status`, `layout.changed`,
`draft.done`, `page.status`, `page.flag`. Scope `ms:<msId>`: `page.status`, `page.added`.

## Extension points (for the collaboration layer)

Add an object to `studioExtensions` in `studio-extensions.tsx` (one import, one array entry). Contract in `extensions.ts`:

- `lineRowExtras(line, ctx)` — inline content at the end of each line row (comment count, consensus badge, Quran chip).
- `lineEditorExtras({ line, tokens, setTokens, canEdit, ...ctx })` — content under the line editor; can read the
  unsaved tokens and replace them (e.g. "apply suggestion"), which still goes through the normal save/409 path.
- `toolbarExtras(ctx)` and `panels[]` — buttons in the page tools bar and side panels (`render({...ctx, close})`).
- `imageOverlay(ctx)` — SVG in image pixel coordinates drawn over the page (presence avatars, annotation pins).
- `onEvent(ev, ctx)` — every `page:<id>` event; call `ctx.reload()` after you change data.

`ctx` (`WorkspaceContext`) gives `detail`, `selected`, `selectLine`, `reload`, `zoomToLine`.

Reusable pieces: `LineEditor` (controlled `tokens`/`onChange`; no saving/locking inside — use it for blind
double-keying or suggestions), `TokenText` (render tokens, diplomatic/reading), `LineCrop` (line image from the page
image), `api()` client, `diffChars`, `tokensCer`. Tables already in 0001 for you: `ms_suggestions`, `ms_keyings`,
`ms_comments`, `ms_annotations`, `ms_tasks`. Version kinds `suggestion`/`consensus` exist in `ms_line_versions`.
The frozen publication (`ms_page_publications.content`) is what the public reader should show.

## Data and honesty

- Seed (`scripts/seed/manuscripts.ts`): 3 copies (sigla أ/ب/ج, `work:qamus-muhit`) held by the demo institution
  `inst_lib`, with the real holding library, shelfmark, licence, credit line and source URL. Lines carry `gt_text`
  for evaluation only. v1 per line = `data/manuscripts/<ms>/drafts/<page>.claude.json` when present, else the
  Tesseract draft (conf < 60 → `unclear` with the model score).
- Machine scores are labelled "model score (not a probability)". The editor never corrects; expansions live only in
  the reading layer after a person confirms them.
- Images are served from `data/manuscripts` (no copies in `public/`) and uploads from `UPLOAD_DIR/ms`.
