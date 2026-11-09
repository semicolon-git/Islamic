"""Is the refine gain real? Repeat flat vs refine over 10 different random tile-to-fold layouts.

Usage: python repeat_splits.py <data_dir> <results.json>   (adds "repeat_splits" to the results file)
"""
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import balanced_accuracy_score

sys.path.insert(0, str(Path(__file__).parent))
import layered as L  # noqa: E402

data, res_path = Path(sys.argv[1]), Path(sys.argv[2])
X, gt, wl, names, groups = L.load_pavia(data)
lab = gt > 0
y, Xl = gt[lab] - 1, X[lab]
S = {"Flat · all bands": lambda: L.Flat(L.lda),
     "Refine · all bands": lambda: L.Layered(L.lda, groups, soft=True, s1_flat=True, select2=False),
     "Refine · 20 bands per group": lambda: L.Layered(L.lda, groups, soft=True, s1_flat=True, k2=20),
     "Layered · soft (naive)": lambda: L.Layered(L.lda, groups, soft=True)}
out = {k: [] for k in S}
for seed in range(10):
    f = L.spatial_folds(gt.shape, 40, seed=seed)[lab]
    for name, mk in S.items():
        p = np.empty_like(y)
        for k in range(5):
            p[f == k] = mk().fit(Xl[f != k], y[f != k]).predict(Xl[f == k])
        out[name].append(float(balanced_accuracy_score(y, p)))
    print(seed, {k: round(v[-1], 3) for k, v in out.items()}, flush=True)
diff = np.array(out["Refine · all bands"]) - np.array(out["Flat · all bands"])
summary = {k: {"mean": float(np.mean(v)), "sd": float(np.std(v, ddof=1)), "runs": v} for k, v in out.items()}
summary["refine_minus_flat"] = {"mean": float(diff.mean()), "sd": float(diff.std(ddof=1)), "wins": int((diff > 0).sum()), "runs": 10}
print(json.dumps({k: (round(v["mean"], 4), round(v["sd"], 4)) for k, v in summary.items() if "mean" in v}, ensure_ascii=False), "wins", summary["refine_minus_flat"]["wins"])
r = json.loads(res_path.read_text()); r["pavia"]["repeat_splits"] = summary; res_path.write_text(json.dumps(r, indent=1))
