# CoolCairo: UX review of the Unity app and the web redesign

This review covers the Windows/Unity app in [mohamedEsmat/CoolCairo](https://github.com/mohamedEsmat/CoolCairo) (`unity/Assets/CoolCairo`), what each part does for a city planner, what gets in their way, and what the web version in this folder changes. Screens were judged from the code (`DistrictUI.cs`, `DistrictView.cs`, `InterventionBrush.cs`, `HudBuilder.cs`) and the report screenshots in `docs/report/screenshots`.

## 1. Who uses it and what they need to do

| | |
| --- | --- |
| **Primary user** | District or governorate planner, climate-programme officer, new-city developer |
| **Their question** | "Where do we cool first, with which measure, and what will it buy us?" |
| **Context of use** | A meeting room or a laptop, often showing the screen to others; increasingly a phone or tablet in the field |
| **Success** | A defensible plan: which blocks, which measures, the expected effect, the cost, and the caveats, in a form they can share |

The Unity app answers the first half of the question well (the map, the model, live results). It does little for the second half: there is no cost, no way to save or share a plan, and no way to see how firm the headline number is.

## 2. Review of the Unity app, element by element

### Entry and onboarding
- **Globe intro and archive check.** Impressive for a demo, but it stands between the planner and the map on every launch. The check of the satellite archives says nothing a planner acts on.
- **No onboarding.** The first view is a heat map with four tool buttons. Nothing says what to try first or what "good" looks like.
- **Distribution.** A Windows-only zip, unsigned (SmartScreen warning). This rules out most government laptops and every phone.

### Visual language
- **Sci-fi HUD styling** (corner brackets, "SAT LINK", "DOWNLINK" ticker, all-caps monospace). It reads as a game, not a planning tool, and uppercase monospace slows reading of anything longer than a label.
- **Panels cover much of the screen** at 1920 × 1080 (view panel, KPI cards, intervention bar, legend, ticker), and the district sits behind them.
- **Single dark theme.** Hard to read on a projector in a lit meeting room.
- **Scrolling ticker** carries the data credits. Moving text is hard to read and distracting next to live numbers.

### Map views
- Four views (Materials, Surface heat, Heat risk, Growth) with a 0.4 s cross-fade: good, keep.
- The **report palette** (blue / grey / orange around the typical block) is a strong choice; the Inferno and Warm alternatives are useful for colour-vision differences.
- **No view shows the effect of the plan itself.** Planners have to compare before/after in their head, or read the rings.
- Treated blocks get coloured **rings per measure**: good, keep.

### Painting
- **Dwell-based painting**: holding the mouse adds 200% per second, so the amount applied depends on how long you hover. Two people painting the same blocks get different plans, and there is no way to say "50% of roofs".
- **Left-drag paints, right-drag erases, Alt or middle-drag orbits.** Erasing by accident is easy and orbiting needs a modifier. None of it works on touch.
- **Brush size** is a slider labelled in blocks: clear, keep.
- **Undo** exists (Ctrl+Z, button) but **no redo**.
- No quick way to try the analysis's own recommendation (roofs and parks on the riskiest third). The −74% headline can only be reproduced by a scripted demo mode.

### Results
- Three KPI cards (average temperature before → after, heat exposure, residents in cooled blocks) with a glow when a number improves: clear, keep.
- **The exposure percentage is shown without context.** It depends heavily on the reference temperature (45.7 °C): the same plan gives −33% at a 43.7 °C line and −100% at 47.7 °C. The app gives no hint of this.
- **No cost**, though `docs/intervention_research.md` already has price ranges.
- **No breakdown** of which measure is doing the cooling.

### Block detail
- **Hover-only tooltip.** It vanishes when the mouse moves, so you cannot read it while doing anything else, and it does not exist on touch.
- You cannot act on a single block (add/remove a measure) from its details.

### Evidence and trust
- "Analysis maps for this view" popup with the report figures: good, keep.
- "Model notes" collapsed by default: the R² and the surface-vs-air caveat are hidden.
- **No method page** listing what is published vs estimated from the team's own data. Cool roofs and pavements come from literature; trees and parks from the regression. Planners should see which is which.

### Output
- **No save, no share, no export.** A plan disappears when the app closes.

### Accessibility
- No keyboard path to most controls, no focus states, no screen-reader labels, fixed 1920 × 1080 layout, colour-only encodings in places.

## 3. What the web version changes

| Area | Unity app | Web planner |
| --- | --- | --- |
| Access | Windows-only zip, unsigned | One 1.3 MB HTML file; any browser, phone or desktop, works offline |
| Time to first action | Globe intro and archive check | A 2 s fly-in, then the map |
| Onboarding | None | Three-step first-visit guide pointing at **Apply targeted plan** |
| Look | Sci-fi HUD, dark only | Calm planning tool; light and dark themes; map takes most of the screen |
| Layout | Panels over the map | Inputs left, map centre, results right; bottom sheets on phones |
| Quick start | Scripted demo only | **Targeted plan**: choose the share of riskiest blocks and the measures, apply in one click (reproduces the published −74%) |
| Painting | Dwell-based, left/right buttons | Inspect / Paint / Erase tools; fixed strength 25/50/100%; footprint preview; one stroke = one undo step; touch support |
| Undo | Undo | Undo and redo |
| Views | 4 | 5: adds **Plan effect** (cooling per block) |
| Block detail | Hover tooltip | Hover tooltip plus a pinned **inspector**: surface mix, growth, per-measure effect with Add/Remove, zoom to block |
| Results | 3 cards | Heat exposure, average temperature, **change felt per resident** (no threshold), residents in cooled blocks, **indicative cost** in EGP, cooling by measure |
| Firmness of the headline | Hidden | **Heat line** slider and a chart of the exposure cut across 43.5–47.5 °C |
| Evidence | Figures popup, collapsed notes | Figures per view, a **Method** page (published vs own-data effects, limits, scene list, credits), "published / our data" badge on each measure |
| Save and share | None | Named saved plans with key figures; plan code (copy/paste); block table as CSV for a spreadsheet or GIS |
| 2D | No | 2D/3D switch, buildings on/off |
| Accessibility | Minimal | Keyboard shortcuts for every tool, real buttons with ARIA state, visible focus, reduced-motion support, text keys alongside colour |

## 4. Model parity

`src/model.ts` is a line-by-line port of `interventions.py` / `InterventionModel.cs`. `test/model.test.ts` checks it against the published results on the real `district.json`:

- Baseline: 95,141 residents, 6,460 person·°C
- Targeted plan (roofs + parks, riskiest third, 192 blocks): 1,686 person·°C (−74%), 22,588 residents in cooled blocks, mean 44.7 → 44.3 °C
- One measure everywhere: cool roofs −41%, street trees −24%, cool pavements −52%, pocket parks −60%

All 14 tests pass. This closes the gap noted in the code review: the C# copy had no automated check against the Python reference, and now the browser copy does.

## 5. Added in the second round

- **Four districts.** A district picker with Nasr City plus three more 24 × 24-block areas exported from CoolCairo's committed sample data and OSM extract (`scripts/export_districts.py`, CoolCairo's own export helpers, schema 1).
- **Satellite basemap** for Nasr City from the Sentinel-2 summer composite in the sample data, under tinted block colours.
- **Plan report**: map snapshot, results, targeting comparison, heat-line sensitivity, measures with area and cost, the ten blocks where the plan removes most exposure, and caveats. Copy as text everywhere; print / PDF and CSV download on a hosted copy.
- **"Does choosing the blocks matter?"**: the pre-pitch review's main point, live for any plan. Exposure only counts heat above the line, so the gain from targeting is the area saved; the panel compares the plan with the same measures on only the hot blocks, on every block and on random blocks.
- **Honest labels**: "Residents in treated blocks" (with how many were above the line), "published / our data" badges, the pocket-park and pavement caveats, water, and one dark-roof explanation on the Method page.

## 6. Next steps (not built yet)

1. **Live archive data**: refresh districts from the satellite archives on a server (the planner reads any schema-1 `district.json`).
2. **Shared plans** via a small backend so a team can comment on the same plan.
3. **Vulnerability layer** (age, housing) once census data is joined in the analysis.
4. **Basemaps for the other districts** once Sentinel-2 composites are exported for them.
