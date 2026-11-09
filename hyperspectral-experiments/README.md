# Layered band selection: experiment

Tests the idea "remove noisy bands, segment the scene, then use a different set of bands for each kind of surface" against flat approaches, on two public hyperspectral benchmarks with ground truth. Read the results in `report.html` (open in a browser).

| File | What |
| --- | --- |
| `layered.py` | The experiment: data loading, spatial folds, fold-internal band selection, flat / layered / refine strategies, training-size, noise and shares tests |
| `repeat_splits.py` | Flat vs refine over 10 different tile-to-fold layouts |
| `make_figures.py`, `make_report.py` | Figures and the results page from `results/results.json` |
| `results/results.json` | Every number in the report |
| `figures/` | The seven figures |

## Data (not committed)

Pavia University (ROSIS; `PaviaU.mat`, `PaviaU_gt.mat`) and HYDICE Urban (`Urban_R162.mat`, `end6_groundTruth.mat`), from the public mirror `github.com/cu4oral6/hsi_datasets_unmixing` (Git LFS; fetch via `https://media.githubusercontent.com/media/cu4oral6/hsi_datasets_unmixing/HEAD/<path>`). SHA-256: PaviaU.mat `28447fa8…34d2fb`, Urban_R162.mat `aa8fb6d4…cda9862`.

## Run

With the CoolCairo analysis environment (numpy, scipy, scikit-learn, matplotlib):

```bash
python layered.py <data_dir> results          # ~8 minutes
python repeat_splits.py <data_dir> results/results.json
python make_figures.py results/results.json figures
python make_report.py results/results.json figures report.html
```

To run on the real EnMAP Cairo scene, add a loader returning `(cube, labels, wavelengths, names, groups)` like `load_pavia`; everything else is unchanged.
