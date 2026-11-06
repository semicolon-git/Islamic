# CoolCairo Academy

A browser game that teaches the domain behind CoolCairo and every part of its method, from first principles to the judges' questions. Built from *CoolCairo: the methodology report in simple words* (v1.2) plus the notebook audit's corrections.

**Play:** open `index.html` in any browser (no install, works offline except the web fonts). Progress, XP and badges are saved in your browser.

## Structure

16 missions in four acts. Each mission has a **briefing** (key ideas and the numbers to remember), a **lab** (an interactive visual), **In the field** (real-world uses, each linked back to CoolCairo) and a **checkpoint** (4 questions; 3 of 4 earns the badge).

| Act | Missions |
| --- | --- |
| 1 · Foundations | Urban heat islands · Light and the spectrum (Planck, Wien) · Pixels and resolution · Thermal infrared and LST (emissivity, atmosphere, USGS Level-2) |
| 2 · From pixels to facts | Clouds and the median · Spectral fingerprints (NDVI, brightness, BSI, the four rules) · Thresholds and balanced accuracy · Blocks, buildings, people (fusion, heat exposure, unmixing) |
| 3 · The model | The heat model (linear regression, least squares, sign check) · Scoring (R², MAE) · The hidden-areas exam (spatial cross-validation) |
| 4 · Decisions and the frontier | Cooling measures and targeting (albedo, "knowing where pays") · Hyperspectral data (EnMAP, the control, ridge, PCA) · Growth and other cities · Honest limits and verification · The judges' drill (flashcards) |

Then a **final exam** (20 random questions from all missions); 16/20 with all 16 badges makes you a *Super Expert*. Press **G** for the glossary of 40 terms.

## Building

The page is assembled from `src/` (styles, shell, engine, content, labs):

```bash
python3 build.py   # writes index.html (normal page) and academy.html (Claude artifact version)
```

Lab values marked "illustrative" are teaching models (diurnal curves, toy districts, distributions tuned to the real results); every number presented as CoolCairo's comes from the methodology report.
