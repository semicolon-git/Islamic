# CoolCairo Planner (web)

The [CoolCairo](https://github.com/mohamedEsmat/CoolCairo) heat-planning app, rebuilt for the browser. Planners paint cool roofs, street trees, cool pavements and pocket parks onto 90 m blocks of Nasr City, Cairo, and see the predicted effect on surface temperature, heat exposure, residents and cost as they go.

- **No install.** `npm run build` produces one self-contained `dist/index.html` (about 1.3 MB: data, figures, three.js and styles inlined). Host it on any static server or open it from disk.
- **Same numbers as the analysis.** `src/model.ts` ports `analysis/src/coolcairo/interventions.py`; the tests check the published results (6,460 → 1,686 person·°C, −74%, 22,588 residents).
- **Works on phones.** Bottom-sheet panels, touch painting, two-finger pan and zoom.
- **Four districts.** Nasr City (the report's district) plus three more 24 × 24-block areas of east Cairo exported from CoolCairo's own sample data: Heliopolis edge, El Zeitoun area and the eastern growth edge.

Also in this folder:
- [`UX_REVIEW.md`](UX_REVIEW.md): the design rationale and a review of the Unity app's UX.
- [`NOTEBOOK_AUDIT.md`](NOTEBOOK_AUDIT.md): an audit of all seven CoolCairo notebooks against the code, README, results and the pre-pitch review.
- [`coolcairo-patches/`](coolcairo-patches): three commits for the CoolCairo repository that fix what the audit found.

## Run

Needs Node.js 20.19 or newer. Don't use `sudo`: if `npm install` says `EACCES`, the folder belongs to another user; fix it with `sudo chown -R "$(whoami)" .` and run `npm install` again.

```bash
cd coolcairo-web
npm install
npm run dev        # http://localhost:5173
npm test           # model parity tests (vitest)
npm run build      # typecheck + dist/index.html (with print and file downloads)
npm run build:artifact   # same, for the Claude artifact viewer (copy instead of print/download)
```

To refresh the extra districts and the Nasr City satellite basemap from a CoolCairo checkout (offline, uses its committed sample data):

```bash
uv run --project <CoolCairo>/analysis python scripts/export_districts.py <CoolCairo> src/assets
```

## What's inside

| Path | What |
| --- | --- |
| `src/assets/district.json` | Copy of CoolCairo `export/district.json` (schema 1): 576 blocks, 1,901 buildings, model coefficients |
| `src/model.ts` | Plan model: interventions, heat exposure, undo/redo, targeted plan, cost, plan codes, CSV |
| `src/colorizer.ts`, `src/colors.ts` | Colour scales per view (same palettes as the methodology report) |
| `src/scene.ts` | three.js district: ground texture with treatment rings, merged building mesh, camera, picking |
| `src/main.ts` | Interface wiring: districts, panels, legend, inspector, saved plans, dialogs, keyboard, onboarding |
| `src/report.ts` | Plan report (map, results, targeting comparison, measures, top blocks, caveats) |
| `src/assets/districts/*.json` | Extra districts (schema 1), written by `scripts/export_districts.py` |
| `src/assets/nasr_city_sentinel2.jpg` | Sentinel-2 summer composite of the Nasr City grid (satellite basemap) |
| `test/model.test.ts` | Parity with the Python results |

To show another district, replace `src/assets/district.json` with any file written by CoolCairo's `export.py` and rebuild.

## Using it

1. **Targeted plan** (left panel): pick the share of riskiest blocks and the measures, then **Apply targeted plan**.
2. **Paint by hand**: choose a measure (Q W E R), drag across blocks; Shift-drag or the Erase tool removes. Strength sets how much of each block's cap to apply.
3. **Results** (right panel): heat exposure, average temperature, change felt per resident, residents in treated blocks, indicative cost, cooling by measure.
4. **Does choosing the blocks matter?** Your plan against the same measures on only the blocks above the heat line, on every block and on random blocks, with the area each needs.
5. **How hot is too hot?** Move the heat line to see how much the percentage cut depends on where "too hot" starts.
6. **Inspect** a block for its surfaces and the effect of each measure there.
7. **Save** plans in the browser, copy a plan code to share, or copy the block table as CSV.
8. **Plan report**: a one-page summary to copy into an email, or print / save as PDF on a hosted copy.
9. **District** (under the name, top left) and **satellite photo** (map controls, Nasr City).

Keyboard: `1`–`5` views · `V` `B` `X` inspect / paint / erase · `[` `]` brush · `Ctrl+Z` / `Ctrl+Shift+Z` · `M` 2D/3D · `S` satellite · `?` all keys.

## Limits

Surface, not air, temperature. Heat model R² 0.25 (spatial CV): compare measures and places, don't predict single blocks. Costs are indicative ranges without Egyptian supplier quotes. See the in-app **Method** page.

Data credits: Landsat 8/9 (USGS) · Contains modified Copernicus Sentinel data [2023–2025] · Contains modified EnMAP data © DLR [2025] · WorldPop 2024 (CC BY 4.0) · © OpenStreetMap contributors (ODbL) · Google Open Buildings 2.5D Temporal (CC BY 4.0) · Microsoft Planetary Computer, DLR EOC Geoservice. Code: MIT, as CoolCairo.
