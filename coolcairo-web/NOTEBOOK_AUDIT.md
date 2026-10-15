# CoolCairo notebook audit

Audit of every notebook in [mohamedEsmat/CoolCairo](https://github.com/mohamedEsmat/CoolCairo) at commit `74f7168` (15 Oct 2026), cross-checked against the source modules, `README.md`, `results/`, the report source and the team's pre-pitch review (11 Oct). Fixes are in [`coolcairo-patches/`](coolcairo-patches) as three commits for the repository owner to apply.

## How it was checked

| Check | Result |
| --- | --- |
| Notebook 00 re-executed from a clean kernel (`nbconvert --execute`, locked environment) | Runs in 9 s, no errors; every printed number identical to the committed outputs |
| Notebooks 01–06 re-executed | **Not possible here**: they stream from Microsoft Planetary Computer, WorldPop, Google Open Buildings and DLR, which this environment's network policy blocks. Their saved outputs were audited instead |
| Every `coolcairo` function a notebook calls exists in the source | 49 of 49 found |
| Execution order of saved outputs | All seven notebooks executed top to bottom (counts 1…n), no error outputs |
| Saved numbers vs README, `results/`, `district.json` and report | All match (table below) |
| Unit tests | 24 / 24 pass before the patches, 27 / 27 after |
| Pinned versions: `requirements.txt`, `environment.yml`, `uv.lock` | All 167 pins agree |
| Re-running the example twice gives identical result files | **No** before the patches (floating-point noise rewrote `results/*.json` each run); **yes** after |

## Notebook by notebook

| Notebook | What it does | Numbers checked | Problems found | Status after patches |
| --- | --- | --- | --- | --- |
| **00 Quick example** | Offline: model, measures, heat risk, growth, writes `results/` | R² 0.25, ±1.2 °C, 2,538 blocks; 6,460 person·°C; −41/−24/−52/−60%; −74% (1,686, 22,588); +5.7%, 46.9 vs 46.0 °C | States shadow as the dark-roof cause; "targeting beats spreading" overclaims (the same −74% on every block); "residents cooled" counts treated blocks with no excess heat; +1 °C growth gap given without its cause | Wording aligned; new cells for the targeting comparison, reference sensitivity, per-resident ranking and the controlled growth gap; re-executed |
| **01 Data acquisition** | Landsat and Sentinel-2 composites on one grid; building heights | 65 Landsat scenes, 58 Sentinel-2 days, 15,129 buildings; grids snapped to block edges (30 m and 10 m pixel centres at 332115/3333405 and 332105/3333415); Open Buildings vs OSM bias −1.43 m, MAE 6.16 m, r 0.60 | Says EnMAP is "pending data access" (it was used in notebook 05) | Fixed |
| **02 Classification** | Four Sentinel-2 classes, BSI threshold, M2 spot check | BSI 0.137 at 75% balanced accuracy = config; 16 / 18 agree (89%); misses are dusty asphalt and a dusty roof read as sand | Calls the classes "interim", to be "replaced by the EnMAP classifier", which notebook 05 decided against; points to `CLAUDE.md`, no longer in the repo. The spot check was not blind | Wording fixed. **Still to do by the team:** redo the 20 points blind (about 30 min) |
| **03 Model** | Heat model, cool-roof deltas, heat exposure | Coefficients = `district.json`; −4.64 / −3.60 °C; exposure 6,459.75; −41.39/−23.71/−52.33/−60.23% | Blames shadow for the dark-roof sign; says only "trees" use the fit (parks do too; pavements use published values) | Fixed |
| **04 Export** | Runs the pipeline, writes `export/district.json` | Same model and exposure as 03; growth: 4 new, 45 denser blocks; EnMAP R² 0.58 vs 0.40 | None | Unchanged |
| **05 Hyperspectral value** | EnMAP vs Sentinel-2 for classes and for heat | BSI 0.760; S2 6-band 0.860; EnMAP-as-S2 0.797; EnMAP 0.816; fused 0.862. Heat R²: EnMAP 0.534 / 0.468 / 0.455 vs reduced 0.331 / 0.353 / 0.351 (1/2/3 km); ours + EnMAP 0.583 | Says shadow was "ruled out" as the dark-roof cause, contradicting README, notebooks 00/03 and the report. Its argument uses 30 m pixels; the classes are 10 m. "70-scene" composite (70 granules from 58 days) | Fixed: one explanation everywhere |
| **06 Urban growth** | Open Buildings 2016→2023 per block | 37.1 → 39.2 km² (+5.7%); 13,323 / 988 / 8,792 blocks; 46.0 / 46.9 / 48.6 °C; 61,145 residents in new blocks; stable across presence cut-offs (988–1,066 new blocks) | None in the notebook; the "+1 °C" message elsewhere omits that new blocks are sandier and less built up | Controlled gap (+0.22 °C) added to the pipeline, README and notebook 00 |

## The one real contradiction: why the dark-roof coefficient is negative

Five places said "building shadow" (README twice, notebooks 00 and 03, `aoi.yaml`, the report source); notebook 05 said shadow was "ruled out". New evidence from the sample data:

- Dark roofs cover on average **0.55% of an urban block**; only 22% of urban blocks have any. The −11 °C coefficient rests on very little variation.
- The sign survives adding neighbouring sand (−11.5), so it is not a desert-edge artefact.

Everything now says: *the cause is not yet confirmed (shadow, rooftop clutter or sparse trees in the 10 m "dark" class), and dark roofs cover only about 0.5% of an urban block, so cool roofs use published physics.*

## What the pre-pitch review asked for, and what is done

All of the review's analysis numbers were recomputed independently from `blocks_east_cairo.csv` with the team's own functions; they reproduce (the park effect with neighbouring sand: −3.3 °C here, −3.5 °C in the review, a slightly different window).

| Review item | Done in |
| --- | --- |
| "Knowing where pays": same −74% on every block / riskiest third / 106 hot blocks; −25% on a random third | `targeting_comparison` (patch 2), README, notebook 00, test; web planner "Does choosing the blocks matter?" |
| "Residents in treated blocks", 10,487 above typical | `targeted_plan`, README, notebook 00, Unity label (patch 1), web planner |
| Reference band 44.5–47.0 °C; plan −65% to −84%; single-measure ranking flips | `heat_line_sensitivity` (patch 2), README; web planner heat-line slider and chart |
| Threshold-free ranking: roofs −0.72, parks −0.55, pavements −0.37, trees −0.13 °C per resident | `resident_weighted_cooling` (patch 2), README; web planner "Felt by residents" |
| Pocket parks likely overstated about 2× | README limits (patch 2); web planner measure card and Method page |
| New blocks +1 °C is mostly sand (+0.2 °C controlled) | `controlled_new_build_gap` (patch 2), README, notebook 00; web planner growth caption |
| One dark-roof explanation | Patch 1 |
| `classify.py` "three classes", `enmap_scenes.txt` "inside the LST period", `CLAUDE.md` references | Patch 1 |
| Stretched analysis maps in the Unity pop-up | Patch 1 (`npotScale = None`); needs a Unity rebuild |
| "SAT LINK" implies live data | Patch 1 renames it ARCHIVE CHECK; needs a Unity rebuild |
| Water for parks and trees | README limits; web planner |
| Cost of the plan | Web planner shows ranges per plan and for the comparison rows |

**Not done here (needs the team or other access):** re-running notebooks 01–06 (network), rebuilding the report PDF (needs the EnMAP files) and the Unity app, slide and pitch-script edits, the blind spot check, the 6 s start-up cap in the Unity archive check, real survey responses, and a price on the business slide.

## Applying the patches

```bash
cd CoolCairo
git checkout -b notebook-audit
git am path/to/coolcairo-patches/*.patch
cd analysis && uv run pytest        # 27 passed
```

| Patch | Files | What |
| --- | --- | --- |
| `0001` | 17 | One dark-roof explanation; stale notes; `CLAUDE.md` references; Unity figure import and labels |
| `0002` | 6 code/docs + results | Targeting comparison, reference sensitivity, per-resident ranking, controlled growth gap, stable result files, README, notebook 00 re-executed, 3 new tests |
| `0003` | 1 | GitHub Actions: tests, notebook 00, reproducibility check of `results/` |

Verified: the three patches apply cleanly to `master` at `74f7168`.
