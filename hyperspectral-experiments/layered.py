"""Layered (hierarchical) band selection vs flat approaches on real hyperspectral data.

Datasets (public benchmarks, verified against their published SHA-256):
  Pavia University (ROSIS): 610 x 340 px, 1.3 m, 103 bands 430-860 nm, 9 labelled classes.
  Urban (HYDICE): 307 x 307 px, 2 m, 162 of 210 bands 400-2500 nm, per-pixel fractions of
  6 materials (asphalt, grass, tree, roof, metal, dirt).

Every score uses spatial cross-validation (whole tiles held out, 5 folds) and every band
selection happens inside the training fold only, the same rules as CoolCairo's hidden-areas exam.

Usage: python layered.py <data_dir> <out_dir>
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.io as sio
from scipy.optimize import nnls
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import f_classif, f_regression
from sklearn.linear_model import RidgeCV
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

RNG = 0
K_STAGE1, K_STAGE2, K_FLAT = 8, 10, 10

# ------------------------------------------------------------------ data


def load_pavia(d: Path):
    X = sio.loadmat(d / "PaviaU.mat")["paviaU"].astype("float32") / 10000.0
    gt = sio.loadmat(d / "PaviaU_gt.mat")["paviaU_gt"]
    wl = np.linspace(430, 860, X.shape[2])
    names = ["Asphalt", "Meadows", "Gravel", "Trees", "Painted metal", "Bare soil", "Bricks", "Bitumen", "Shadows"]
    # Stage-1 groups mirror CoolCairo's four rules: dark, bright mineral, vegetation, metal.
    groups = {"Dark": [0, 7, 8], "Bright mineral": [2, 5, 6], "Vegetation": [1, 3], "Metal": [4]}
    return X, gt, wl, names, groups


def load_urban(d: Path):
    u = sio.loadmat(d / "Urban_R162.mat")
    g = sio.loadmat(d / "end6_groundTruth.mat")
    n = int(u["nRow"][0, 0])
    Y = u["Y"].astype("float32") / float(u["maxValue"][0, 0])  # bands x pixels
    X = Y.T.reshape(n, n, -1, order="F")  # HYDICE Urban is stored column-major
    A = g["A"].T.reshape(n, n, -1, order="F")
    sb = u["SlectBands"].ravel().astype(int)
    wl = 400 + (sb - 1) * (2100 / 209)  # 210 bands spaced evenly over 400-2500 nm
    names = ["Asphalt", "Grass", "Tree", "Roof", "Metal", "Dirt"]
    return X, A, wl, names


# Sentinel-2 bands that fall inside each sensor's range (nm).
S2 = {"B2": (458, 523), "B3": (543, 578), "B4": (650, 680), "B5": (698, 713), "B6": (733, 748),
      "B7": (773, 793), "B8": (785, 899), "B11": (1565, 1655), "B12": (2100, 2280)}


def s2_like(X, wl):
    cols, used = [], []
    for name, (a, b) in S2.items():
        m = (wl >= a) & (wl <= b)
        if m.sum():
            cols.append(X[..., m].mean(-1)); used.append(name)
    return np.stack(cols, -1), used


def spatial_folds(shape, tile, k=5, seed=RNG):
    ny, nx = int(np.ceil(shape[0] / tile)), int(np.ceil(shape[1] / tile))
    ids = np.random.default_rng(seed).permutation(ny * nx) % k
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return ids[(yy // tile) * nx + (xx // tile)]


# ------------------------------------------------------------------ band selection (fold-internal)


def select_bands(X, y, k, regression=False, max_corr=0.98):
    """Rank bands by F-score, then add greedily while skipping near-duplicates of chosen bands."""
    if regression:
        Y = np.atleast_2d(y.T).T
        score = np.nansum([np.nan_to_num(f_regression(X, Y[:, j])[0]) for j in range(Y.shape[1])], axis=0)
    else:
        score = np.nan_to_num(f_classif(X, y)[0])
    order = np.argsort(score)[::-1]
    C = np.corrcoef(X[: min(len(X), 4000)].T)
    chosen = []
    for b in order:
        if all(abs(C[b, c]) < max_corr for c in chosen):
            chosen.append(int(b))
        if len(chosen) == k:
            break
    return np.array(sorted(chosen))


def lda():
    return LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto")


def rf():
    return RandomForestClassifier(n_estimators=150, max_features="sqrt", n_jobs=-1, random_state=RNG)


# ------------------------------------------------------------------ strategies (classification)


class Flat:
    def __init__(self, make, bands="all", k=K_FLAT, pca=False):
        self.make, self.bands, self.k, self.pca = make, bands, k, pca

    def fit(self, X, y):
        self.sel = select_bands(X, y, self.k) if self.bands == "select" else np.arange(X.shape[1])
        Z = X[:, self.sel]
        self.sc = StandardScaler().fit(Z); Z = self.sc.transform(Z)
        if self.pca:
            self.p = PCA(self.k, random_state=RNG).fit(Z); Z = self.p.transform(Z)
        self.m = self.make().fit(Z, y)
        return self

    def _z(self, X):
        Z = self.sc.transform(X[:, self.sel])
        return self.p.transform(Z) if self.pca else Z

    def predict(self, X):
        return self.m.predict(self._z(X))

    @property
    def n_bands(self):
        return len(self.sel)


class Layered:
    """Stage 1: coarse group from a few selected bands. Stage 2: one model per group, each on its
    own selected bands (or all bands when select2 is False). soft=True combines probabilities,
    P(class) = P(group) x P(class | group), so a stage-1 mistake does not lock in the answer."""

    def __init__(self, make, groups, soft=False, select2=True, k1=K_STAGE1, k2=K_STAGE2, s1_all=False, s1_flat=False):
        self.make, self.groups, self.soft, self.select2 = make, groups, soft, select2
        self.k1, self.k2, self.s1_all, self.s1_flat = k1, k2, s1_all, s1_flat

    def fit(self, X, y):
        self.g_of = np.empty(y.max() + 1, int)
        for gi, cls in enumerate(self.groups.values()):
            self.g_of[cls] = gi
        g = self.g_of[y]
        self.s1 = Flat(self.make, "all" if self.s1_all else "select", self.k1).fit(X, g)
        if self.s1_flat:  # stage 1 = the flat all-bands class model, its probabilities summed per group
            self.flat = Flat(self.make).fit(X, y)
        self.s2 = {}
        for gi, cls in enumerate(self.groups.values()):
            if len(cls) == 1:
                continue
            m = g == gi
            sel = select_bands(X[m], y[m], self.k2) if self.select2 else np.arange(X.shape[1])
            sc = StandardScaler().fit(X[m][:, sel])
            self.s2[gi] = (sel, sc, self.make().fit(sc.transform(X[m][:, sel]), y[m]))
        return self

    def group_proba(self, X):
        """(classes, P(group)) from the stage-1 model."""
        if self.s1_flat:
            pc = self.flat.m.predict_proba(self.flat._z(X))
            cls = self.flat.m.classes_
            G = np.zeros((len(X), len(self.groups)))
            for j, c in enumerate(cls):
                G[:, self.g_of[c]] += pc[:, j]
            return np.arange(len(self.groups)), G
        return self.s1.m.classes_, self.s1.m.predict_proba(self.s1._z(X))

    def predict(self, X):
        n_cls = len(self.g_of)
        if not self.soft:
            gc, gp = self.group_proba(X)
            g = gc[gp.argmax(1)]
            out = np.empty(len(X), int)
            for gi, cls in enumerate(self.groups.values()):
                m = g == gi
                if not m.any():
                    continue
                if len(cls) == 1:
                    out[m] = cls[0]
                else:
                    sel, sc, mdl = self.s2[gi]
                    out[m] = mdl.predict(sc.transform(X[m][:, sel]))
            return out
        gcls, pg = self.group_proba(X)
        P = np.zeros((len(X), n_cls))
        for col, gi in enumerate(gcls):
            cls = list(self.groups.values())[gi]
            if len(cls) == 1:
                P[:, cls[0]] += pg[:, col]
            else:
                sel, sc, mdl = self.s2[gi]
                pc = mdl.predict_proba(sc.transform(X[:, sel]))
                for j, c in enumerate(mdl.classes_):
                    P[:, c] += pg[:, col] * pc[:, j]
        return P.argmax(1)

    def stage1(self, X):
        gc, gp = self.group_proba(X)
        return gc[gp.argmax(1)]

    @property
    def n_bands(self):
        used = set(self.s1.sel.tolist())
        for sel, _, _ in self.s2.values():
            used |= set(sel.tolist())
        return len(used)


def classification_strategies(make, groups):
    return {
        "Sentinel-2-like bands": ("s2", lambda: Flat(make)),
        "Flat · all bands": ("all", lambda: Flat(make)),
        f"Flat · {K_FLAT} selected bands": ("all", lambda: Flat(make, "select")),
        f"Flat · PCA {K_FLAT}": ("all", lambda: Flat(make, pca=True)),
        "Layered · all bands in stage 2": ("all", lambda: Layered(make, groups, soft=True, select2=False)),
        "Layered · hard": ("all", lambda: Layered(make, groups)),
        "Layered · soft": ("all", lambda: Layered(make, groups, soft=True)),
        "Layered · soft · stage 1 all bands · 20 per group": ("all", lambda: Layered(make, groups, soft=True, s1_all=True, k2=20)),
        "Layered · soft · all bands both stages": ("all", lambda: Layered(make, groups, soft=True, s1_all=True, select2=False)),
        "Refine · flat stage 1 + specialists (20 bands)": ("all", lambda: Layered(make, groups, soft=True, s1_flat=True, k2=20)),
        "Refine · flat stage 1 + specialists (all bands)": ("all", lambda: Layered(make, groups, soft=True, s1_flat=True, select2=False)),
    }


def run_classification(X, gt, wl, names, groups, make, folds, label, train_cap=None):
    Xs2, _ = s2_like(X, wl)
    lab = gt > 0
    y_all, f_all = gt[lab] - 1, folds[lab]
    feats = {"all": X[lab], "s2": Xs2[lab]}
    rng = np.random.default_rng(RNG)
    res = {}
    for name, (feat, factory) in classification_strategies(make, groups).items():
        Xf = feats[feat]
        pred, s1_ok, s1_n, bands, t0 = np.empty_like(y_all), 0, 0, [], time.time()
        for k in range(5):
            tr, te = f_all != k, f_all == k
            tri = np.where(tr)[0]
            if train_cap:  # per-class cap on training pixels (Hughes experiment)
                tri = np.concatenate([rng.choice(tri[y_all[tri] == c], min(train_cap, (y_all[tri] == c).sum()), replace=False)
                                      for c in np.unique(y_all[tri])])
            mdl = factory().fit(Xf[tri], y_all[tri])
            pred[te] = mdl.predict(Xf[te])
            bands.append(mdl.n_bands)
            if isinstance(mdl, Layered):
                gtrue = mdl.g_of[y_all[te]]
                s1_ok += (mdl.stage1(Xf[te]) == gtrue).sum(); s1_n += te.sum()
        cm = confusion_matrix(y_all, pred, labels=range(len(names)))
        recall = cm.diagonal() / cm.sum(1)
        res[name] = {
            "balanced_accuracy": float(balanced_accuracy_score(y_all, pred)),
            "overall_accuracy": float((pred == y_all).mean()),
            "recall": {n: float(r) for n, r in zip(names, recall)},
            "confusion": cm.tolist(),
            "bands_used": float(np.mean(bands)),
            "stage1_accuracy": float(s1_ok / s1_n) if s1_n else None,
            "seconds": round(time.time() - t0, 1),
        }
        print(f"  [{label}] {name:34s} BA {res[name]['balanced_accuracy']:.3f}  OA {res[name]['overall_accuracy']:.3f}  bands {res[name]['bands_used']:.0f}", flush=True)
    return res


def diagnostics(X, gt, groups, names, make, folds, ks=(5, 10, 20, 40)):
    """Where does layering win or lose? Stage-1 accuracy with few vs all bands, and an oracle
    layered model that is told the true group (isolates the per-group band subsets)."""
    lab = gt > 0
    y, Xl, f = gt[lab] - 1, X[lab], folds[lab]
    g_of = np.empty(len(names), int)
    for gi, cls in enumerate(groups.values()):
        g_of[cls] = gi
    g = g_of[y]
    out = {"stage1": {}, "oracle_layered": {}, "flat_select_sweep": {}, "within_group_flat_all": None}
    for label, mk in (("8 selected bands", lambda: Flat(make, "select", 8)), ("all bands", lambda: Flat(make))):
        p = np.empty_like(g)
        for k in range(5):
            p[f == k] = mk().fit(Xl[f != k], g[f != k]).predict(Xl[f == k])
        out["stage1"][label] = float((p == g).mean())
    # flat all-bands predictions (to score within-group accuracy the same way)
    pf = np.empty_like(y)
    for k in range(5):
        pf[f == k] = Flat(make).fit(Xl[f != k], y[f != k]).predict(Xl[f == k])
    out["within_group_flat_all"] = {gn: float((pf[g == gi] == y[g == gi]).mean()) for gi, gn in enumerate(groups)}
    for kk in list(ks) + ["all"]:
        p = np.empty_like(y)
        for k in range(5):
            tr, te = f != k, f == k
            for gi, cls in enumerate(groups.values()):
                mt, me = tr & (g == gi), te & (g == gi)
                if len(cls) == 1:
                    p[me] = cls[0]; continue
                sel = np.arange(X.shape[-1]) if kk == "all" else select_bands(Xl[mt], y[mt], kk)
                sc = StandardScaler().fit(Xl[mt][:, sel])
                p[me] = make().fit(sc.transform(Xl[mt][:, sel]), y[mt]).predict(sc.transform(Xl[me][:, sel]))
        out["oracle_layered"][str(kk)] = {"balanced_accuracy": float(balanced_accuracy_score(y, p)),
                                          "within_group": {gn: float((p[g == gi] == y[g == gi]).mean()) for gi, gn in enumerate(groups)}}
    for kk in ks:
        p = np.empty_like(y)
        for k in range(5):
            p[f == k] = Flat(make, "select", kk).fit(Xl[f != k], y[f != k]).predict(Xl[f == k])
        out["flat_select_sweep"][str(kk)] = float(balanced_accuracy_score(y, p))
    print("  diagnostics:", json.dumps({k: v for k, v in out.items() if k != "oracle_layered"}), flush=True)
    print("  oracle layered:", {k: round(v["balanced_accuracy"], 3) for k, v in out["oracle_layered"].items()}, flush=True)
    return out


def random_cv_inflation(X, gt, make):
    """Same flat model, random-pixel folds instead of spatial tiles: how much the score inflates."""
    lab = gt > 0
    y, Xl = gt[lab] - 1, X[lab]
    f = np.random.default_rng(RNG).permutation(len(y)) % 5
    pred = np.empty_like(y)
    for k in range(5):
        pred[f == k] = Flat(make).fit(Xl[f != k], y[f != k]).predict(Xl[f == k])
    return float(balanced_accuracy_score(y, pred))


# ------------------------------------------------------------------ noise: degraded detector edges


def snr_profile(wl, kind):
    if kind == "uniform-40":
        return np.full(len(wl), 40.0)
    # Good mid-range, collapsing towards each detector's ends; for 400-2500 nm sensors also at the
    # VNIR/SWIR junction (~900-1000 nm), the weak-edge region discussed in the course.
    s = np.full(len(wl), 150.0)
    lo, hi = wl.min(), wl.max()
    edge = 0.12 * (hi - lo)
    s = np.where(wl < lo + edge, 6 + 144 * (wl - lo) / edge, s)
    s = np.where(wl > hi - edge, 6 + 144 * (hi - wl) / edge, s)
    if hi > 1500:
        s = np.where((wl > 900) & (wl < 1000), 10.0, s)
    return s


def add_noise(X, snr, seed=RNG):
    mean = X.reshape(-1, X.shape[-1]).mean(0)
    return X + np.random.default_rng(seed).normal(0, 1, X.shape).astype("float32") * (mean / snr)


def estimate_snr(X):
    """Per-band SNR from the spectral-neighbour residual: real spectra are smooth across adjacent
    bands, noise is independent, so r = x_b - (x_{b-1} + x_{b+1}) / 2 is mostly noise with
    variance 1.5 sigma^2. Robust (MAD) spread; end bands use their single inner neighbour."""
    P = X.reshape(-1, X.shape[-1])
    r = np.empty_like(P)
    r[:, 1:-1] = (P[:, 1:-1] - 0.5 * (P[:, :-2] + P[:, 2:])) / np.sqrt(1.5)
    r[:, 0] = (P[:, 0] - P[:, 1]) / np.sqrt(2); r[:, -1] = (P[:, -1] - P[:, -2]) / np.sqrt(2)
    noise = np.median(np.abs(r - np.median(r, 0)), 0) * 1.4826
    return P.mean(0) / np.maximum(noise, 1e-9)


# ------------------------------------------------------------------ Urban: material shares


def aggregate(arr, f):
    n = (arr.shape[0] // f) * f
    a = arr[:n, :n].reshape(n // f, f, n // f, f, -1).mean((1, 3))
    return a


def fcls(Xp, M, delta=10.0):
    """Fully constrained least squares unmixing: fractions >= 0 that sum to one."""
    A = np.vstack([M, delta * np.ones((1, M.shape[1]))])
    return np.array([nnls(A, np.append(x, delta))[0] for x in Xp])


def norm_fracs(F):
    F = np.clip(F, 0, None)
    s = F.sum(1, keepdims=True)
    return np.where(s > 0, F / np.maximum(s, 1e-9), 1 / F.shape[1])


def run_shares(X, A, wl, names, factor=5, tile=6):
    """Mixed pixels at factor x 2 m (10 m for factor 5); predict each material's share."""
    Xa, Fa = aggregate(X, factor), aggregate(A, factor)
    n = Xa.shape[0]
    folds = spatial_folds((n, n), tile)
    Xp, Fp, fo = Xa.reshape(-1, Xa.shape[-1]), Fa.reshape(-1, Fa.shape[-1]), folds.ravel()
    Xs2, s2_used = s2_like(Xa, wl)
    Xs2 = Xs2.reshape(-1, Xs2.shape[-1])
    veg = [1, 2]
    alphas = np.logspace(-4, 3, 15)
    methods = {}

    def ridge_on(Xf, sel=None):
        def fit_pred(tr, te):
            cols = sel(Xf[tr], Fp[tr]) if sel else np.arange(Xf.shape[1])
            sc = StandardScaler().fit(Xf[tr][:, cols])
            m = RidgeCV(alphas=alphas).fit(sc.transform(Xf[tr][:, cols]), Fp[tr])
            return norm_fracs(m.predict(sc.transform(Xf[te][:, cols]))), len(cols)
        return fit_pred

    def fcls_train_endmembers(tr, te):
        # Endmembers = mean spectrum of the purest training pixels of each material (no ground-truth spectra).
        M = np.stack([Xp[tr][np.argsort(Fp[tr][:, j])[-30:]].mean(0) for j in range(Fp.shape[1])], 1)
        return fcls(Xp[te], M), Xp.shape[1]

    def layered(tr, te):
        """Stage 1: vegetation-dominated vs not (soft). Stage 2: one ridge per group on that group's
        selected bands, trained on the group's pixels; shares blended by stage-1 probability."""
        gtr = np.isin(Fp[tr].argmax(1), veg).astype(int)
        s1 = Flat(lda, "select", K_STAGE1).fit(Xp[tr], gtr)
        pv = s1.m.predict_proba(s1._z(Xp[te]))[:, list(s1.m.classes_).index(1)]
        out, used = np.zeros((te.sum(), Fp.shape[1])), set(s1.sel.tolist())
        for gval, w in ((1, pv), (0, 1 - pv)):
            m = gtr == gval
            cols = select_bands(Xp[tr][m], Fp[tr][m], 20, regression=True)
            used |= set(cols.tolist())
            sc = StandardScaler().fit(Xp[tr][m][:, cols])
            r = RidgeCV(alphas=alphas).fit(sc.transform(Xp[tr][m][:, cols]), Fp[tr][m])
            out += w[:, None] * norm_fracs(r.predict(sc.transform(Xp[te][:, cols])))
        return norm_fracs(out), len(used)

    methods = {
        f"Sentinel-2-like ({len(s2_used)} bands) · ridge": ridge_on(Xs2),
        "Flat · all bands · ridge": ridge_on(Xp),
        "Flat · 20 selected bands · ridge": ridge_on(Xp, lambda a, b: select_bands(a, b, 20, regression=True)),
        "Physics unmixing (FCLS, all bands)": fcls_train_endmembers,
        "Layered · soft · ridge": layered,
    }
    res = {}
    for name, fp in methods.items():
        pred, bands = np.zeros_like(Fp), []
        for k in range(5):
            tr, te = fo != k, fo == k
            p, nb = fp(tr, te)
            pred[te] = p; bands.append(nb)
        rmse = np.sqrt(((pred - Fp) ** 2).mean(0))
        # Block level: 90 m blocks = 9 x 9 of the 10 m mixed pixels (CoolCairo's unit).
        b = 9
        nb_ = n // b
        P9 = pred.reshape(n, n, -1)[: nb_ * b, : nb_ * b].reshape(nb_, b, nb_, b, -1).mean((1, 3)).reshape(-1, Fp.shape[1])
        T9 = Fp.reshape(n, n, -1)[: nb_ * b, : nb_ * b].reshape(nb_, b, nb_, b, -1).mean((1, 3)).reshape(-1, Fp.shape[1])
        res[name] = {
            "rmse_10m": {nm: float(v) for nm, v in zip(names, rmse)},
            "mean_rmse_10m": float(rmse.mean()),
            "mean_rmse_90m_block": float(np.sqrt(((P9 - T9) ** 2).mean())),
            "roof_dirt_rmse_10m": float(np.sqrt(((pred[:, [3, 5]] - Fp[:, [3, 5]]) ** 2).mean())),
            "bands_used": float(np.mean(bands)),
        }
        print(f"  [Urban shares] {name:38s} RMSE10 {res[name]['mean_rmse_10m']:.4f}  roof/dirt {res[name]['roof_dirt_rmse_10m']:.4f}  block {res[name]['mean_rmse_90m_block']:.4f}", flush=True)
    return res


# ------------------------------------------------------------------ main


def main(data: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    results = {}

    print("Pavia University: classification", flush=True)
    X, gt, wl, names, groups = load_pavia(data)
    folds = spatial_folds(gt.shape, 40)
    results["pavia"] = {"names": names, "groups": groups, "wavelengths": wl.tolist(), "n_labelled": int((gt > 0).sum())}
    results["pavia"]["lda"] = run_classification(X, gt, wl, names, groups, lda, folds, "Pavia LDA")
    results["pavia"]["rf"] = {k: v for k, v in run_classification(X, gt, wl, names, groups, rf, folds, "Pavia RF").items()}
    results["pavia"]["random_cv_flat_all_lda"] = random_cv_inflation(X, gt, lda)
    results["pavia"]["diagnostics_lda"] = diagnostics(X, gt, groups, names, lda, folds)
    print(f"  random-pixel CV, flat all bands: BA {results['pavia']['random_cv_flat_all_lda']:.3f}", flush=True)

    print("Pavia: training-set size (Hughes effect)", flush=True)
    hughes = {}
    keep = ["Flat · all bands", f"Flat · {K_FLAT} selected bands", "Layered · soft", "Layered · soft · stage 1 all bands · 20 per group", "Refine · flat stage 1 + specialists (all bands)"]
    for cap in (10, 25, 50, 150, 500):
        r = run_classification(X, gt, wl, names, groups, lda, folds, f"cap {cap}", train_cap=cap)
        hughes[cap] = {k: r[k]["balanced_accuracy"] for k in keep}
    results["pavia"]["hughes"] = hughes

    print("Pavia: noisy detector edges", flush=True)
    noise = {}
    for kind in ("edge-degraded", "uniform-40"):
        Xn = add_noise(X, snr_profile(wl, kind))
        est = estimate_snr(Xn)
        keep_b = est >= 20
        r = run_classification(Xn, gt, wl, names, groups, lda, folds, f"noise {kind}")
        r_drop = run_classification(Xn[..., keep_b], gt, wl[keep_b], names, groups, lda, folds, f"noise {kind} + drop SNR<20")
        noise[kind] = {"snr_true": snr_profile(wl, kind).tolist(), "snr_estimated": est.tolist(), "bands_dropped": int((~keep_b).sum()),
                       "all": {k: r[k]["balanced_accuracy"] for k in r}, "after_drop": {k: r_drop[k]["balanced_accuracy"] for k in r_drop}}
    results["pavia"]["noise"] = noise

    print("Urban: material shares in mixed pixels", flush=True)
    Xu, Au, wlu, names_u = load_urban(data)
    results["urban"] = {"names": names_u, "wavelengths": wlu.tolist()}
    results["urban"]["shares_10m"] = run_shares(Xu, Au, wlu, names_u)
    # Urban dominant-material classification (pixels at least 60% one material), 2 m.
    lab = (Au.max(-1) > 0.6) * (Au.argmax(-1) + 1)
    groups_u = {"Vegetation": [1, 2], "Non-vegetation": [0, 3, 4, 5]}
    results["urban"]["groups"] = groups_u
    results["urban"]["classification_lda"] = run_classification(Xu, lab, wlu, names_u, groups_u, lda, spatial_folds(lab.shape, 31), "Urban LDA")
    results["urban"]["diagnostics_lda"] = diagnostics(Xu, lab, groups_u, names_u, lda, spatial_folds(lab.shape, 31))
    print("Urban: noisy detector edges (incl. VNIR/SWIR junction)", flush=True)
    Xn = add_noise(Xu, snr_profile(wlu, "edge-degraded"))
    est = estimate_snr(Xn)
    keep_b = est >= 20
    results["urban"]["noise_edge"] = {
        "snr_true": snr_profile(wlu, "edge-degraded").tolist(), "snr_estimated": est.tolist(), "bands_dropped": int((~keep_b).sum()),
        "all": {k: v["balanced_accuracy"] for k, v in run_classification(Xn, lab, wlu, names_u, groups_u, lda, spatial_folds(lab.shape, 31), "Urban noise").items()},
        "after_drop": {k: v["balanced_accuracy"] for k, v in run_classification(Xn[..., keep_b], lab, wlu[keep_b], names_u, groups_u, lda, spatial_folds(lab.shape, 31), "Urban noise + drop").items()},
    }

    # Class mean spectra for the report figures.
    lab_p = gt > 0
    results["pavia"]["mean_spectra"] = [X[lab_p][(gt[lab_p] - 1) == c].mean(0).tolist() for c in range(len(names))]
    pure = Au.reshape(-1, Au.shape[-1]).max(1) > 0.8
    Xr, Ar = Xu.reshape(-1, Xu.shape[-1]), Au.reshape(-1, Au.shape[-1]).argmax(1)
    results["urban"]["mean_spectra"] = [Xr[pure & (Ar == c)].mean(0).tolist() for c in range(len(names_u))]
    # Bands each layered stage picks on the full data (illustration only; scores above are fold-internal).
    lay = Layered(lda, groups).fit(X[lab_p], gt[lab_p] - 1)
    results["pavia"]["illustrative_bands"] = {"Stage 1": wl[lay.s1.sel].round(0).tolist(),
                                              **{list(groups)[gi]: wl[s[0]].round(0).tolist() for gi, s in lay.s2.items()}}
    lab_u = lab > 0
    lay_u = Layered(lda, groups_u).fit(Xu[lab_u], lab[lab_u] - 1)
    results["urban"]["illustrative_bands"] = {"Stage 1": wlu[lay_u.s1.sel].round(0).tolist(),
                                              **{list(groups_u)[gi]: wlu[s[0]].round(0).tolist() for gi, s in lay_u.s2.items()}}
    (out / "results.json").write_text(json.dumps(results, indent=1))
    print("written", out / "results.json")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
