"""Figures for the layered-band-selection report, from results/results.json.

Usage: python make_figures.py results/results.json figures/
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

R = json.loads(Path(sys.argv[1]).read_text())
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

INK, MUTED, GRID = "#142033", "#56677d", "#d3dce6"
FLAT, LAY, REF, S2C, OTHER = "#2a78d6", "#c9501f", "#16865a", "#8aa0b8", "#a77b0f"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK,
                     "xtick.color": MUTED, "ytick.color": MUTED, "axes.titleweight": "bold", "axes.titlesize": 11,
                     "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 150})


def colour(name):
    if name.startswith("Sentinel"):
        return S2C
    if name.startswith("Refine"):
        return REF
    if name.startswith("Layered"):
        return LAY
    if "PCA" in name or "selected" in name:
        return OTHER
    return FLAT


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# 1. Spectra with the bands each stage selects (illustration on full data)
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8))
for ax, key, title in ((axes[0], "pavia", "Pavia University (ROSIS, 430–860 nm)"), (axes[1], "urban", "Urban (HYDICE, 400–2500 nm)")):
    d = R[key]
    wl = np.array(d["wavelengths"])
    cmap = plt.get_cmap("tab10")
    for i, (n, s) in enumerate(zip(d["names"], d["mean_spectra"])):
        if key == "urban":  # gaps where water-vapour bands were removed
            s = np.array(s, float); gaps = np.where(np.diff(wl) > 15)[0]
            s[gaps] = np.nan
        ax.plot(wl, s, lw=1.6, color=cmap(i), label=n)
    ymax = ax.get_ylim()[1]
    for j, (stage, bands) in enumerate(d["illustrative_bands"].items()):
        y = ymax * (1.02 + 0.06 * j)
        ax.scatter(bands, [y] * len(bands), marker="|", s=90, color=[INK, LAY, REF, OTHER][j % 4], clip_on=False)
        ax.text(wl.max() + (wl.max() - wl.min()) * 0.01, y, stage, va="center", fontsize=8, color=MUTED)
    ax.set_title(title, loc="left"); ax.set_xlabel("wavelength (nm)"); ax.set_ylabel("reflectance (scaled)")
    ax.legend(fontsize=8, ncol=5 if key == "pavia" else 6, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.16))
    ax.grid(color=GRID, lw=0.6)
save(fig, "fig1_spectra_bands.png")

# 2. Pavia: balanced accuracy by strategy, LDA and Random Forest
names = list(R["pavia"]["lda"].keys())
fig, axes = plt.subplots(1, 2, figsize=(12, 4.6), sharey=True)
for ax, model in zip(axes, ("lda", "rf")):
    vals = [R["pavia"][model][n]["balanced_accuracy"] for n in names]
    y = np.arange(len(names))[::-1]
    ax.barh(y, vals, color=[colour(n) for n in names], height=0.7)
    for yy, v in zip(y, vals):
        ax.text(v + 0.005, yy, f"{v:.3f}", va="center", fontsize=8.5, color=INK)
    best_flat = R["pavia"][model]["Flat · all bands"]["balanced_accuracy"]
    ax.axvline(best_flat, color=FLAT, ls="--", lw=1)
    ax.set_yticks(y); ax.set_yticklabels(names, fontsize=8.5)
    ax.set_xlim(0.4, 1.0); ax.set_xlabel("balanced accuracy, hidden 52 m tiles")
    ax.set_title("Linear discriminant (LDA)" if model == "lda" else "Random forest", loc="left")
    ax.grid(axis="x", color=GRID, lw=0.6)
if "random_cv_flat_all_lda" in R["pavia"]:
    axes[0].axvline(R["pavia"]["random_cv_flat_all_lda"], color=MUTED, ls=":", lw=1.2)
    axes[0].text(R["pavia"]["random_cv_flat_all_lda"] + 0.004, len(names) - 0.4, "random-pixel CV\n(leaky)", fontsize=7.5, color=MUTED)
save(fig, "fig2_pavia_strategies.png")

# 3. Diagnostics: stage-1 bottleneck and oracle specialists
d = R["pavia"]["diagnostics_lda"]
groups = list(d["within_group_flat_all"].keys())
fig, axes = plt.subplots(1, 2, figsize=(12, 4))
x = np.arange(len(groups))
w = 0.38
axes[0].bar(x - w / 2, [d["within_group_flat_all"][g] for g in groups], w, color=FLAT, label="Flat · all bands")
axes[0].bar(x + w / 2, [d["oracle_layered"]["all"]["within_group"][g] for g in groups], w, color=REF, label="Specialist, told the true group")
for xi, g in enumerate(groups):
    axes[0].text(xi - w / 2, d["within_group_flat_all"][g] + 0.02, f"{d['within_group_flat_all'][g]:.2f}", ha="center", fontsize=8)
    axes[0].text(xi + w / 2, d["oracle_layered"]["all"]["within_group"][g] + 0.02, f"{d['oracle_layered']['all']['within_group'][g]:.2f}", ha="center", fontsize=8)
axes[0].set_xticks(x); axes[0].set_xticklabels(groups); axes[0].set_ylim(0, 1.1); axes[0].set_ylabel("accuracy within the group")
axes[0].set_title("Stage 2 works: specialists separate classes inside a group", loc="left"); axes[0].legend(frameon=False, fontsize=8.5, loc="lower left")
ks = list(d["oracle_layered"].keys())
axes[1].plot(range(len(ks)), [d["oracle_layered"][k]["balanced_accuracy"] for k in ks], "o-", color=REF, label="Oracle layered (true group)")
sweep = d["flat_select_sweep"]
axes[1].plot([ks.index(k) for k in sweep], [sweep[k] for k in sweep], "o-", color=OTHER, label="Flat · k selected bands")
axes[1].axhline(R["pavia"]["lda"]["Flat · all bands"]["balanced_accuracy"], color=FLAT, ls="--", lw=1, label="Flat · all bands")
for lbl, v in d["stage1"].items():
    axes[1].axhline(v, color=LAY, ls=":", lw=1)
    axes[1].text(len(ks) - 1, v + 0.008, f"stage-1 group accuracy, {lbl}: {v:.2f}", ha="right", fontsize=7.5, color=LAY)
axes[1].set_xticks(range(len(ks))); axes[1].set_xticklabels([f"{k} bands" if k != "all" else "all" for k in ks])
axes[1].set_ylim(0.4, 1.02); axes[1].set_ylabel("balanced accuracy")
axes[1].set_title("…but stage 1 is the bottleneck in unseen areas", loc="left"); axes[1].legend(frameon=False, fontsize=8, loc="lower right")
for ax in axes:
    ax.grid(axis="y", color=GRID, lw=0.6)
save(fig, "fig3_diagnostics.png")

# 4. Hughes: training pixels per class
h = R["pavia"]["hughes"]
caps = [int(c) for c in h]
fig, ax = plt.subplots(figsize=(7.5, 4))
for n in h[str(caps[0])]:
    ax.plot(caps, [h[str(c)][n] for c in caps], "o-", color=colour(n), label=n, lw=2 if n == "Flat · all bands" else 1.4,
            ls="-" if "stage 1 all" not in n else "--")
ax.set_xscale("log"); ax.set_xticks(caps); ax.set_xticklabels(caps)
ax.set_xlabel("training pixels per class"); ax.set_ylabel("balanced accuracy (hidden tiles)")
ax.set_title("Few training pixels: does band selection beat the curse of dimensionality?", loc="left")
ax.legend(frameon=False, fontsize=8); ax.grid(color=GRID, lw=0.6)
save(fig, "fig4_training_size.png")

# 5. Noise: SNR profile (true vs estimated) and effect of dropping low-SNR bands
nu = R["urban"]["noise_edge"]
wl = np.array(R["urban"]["wavelengths"])
fig, axes = plt.subplots(1, 2, figsize=(12, 4.2))
axes[0].plot(wl, nu["snr_true"], color=INK, lw=1.6, label="simulated SNR")
axes[0].plot(wl, nu["snr_estimated"], ".", color=LAY, ms=4, label="estimated from the image")
axes[0].axhline(20, color=MUTED, ls="--", lw=1); axes[0].text(wl.min(), 23, "drop threshold 20", fontsize=8, color=MUTED)
axes[0].axvspan(900, 1000, color=OTHER, alpha=0.15); axes[0].text(905, max(nu["snr_true"]) * 0.92, "VNIR/SWIR\njunction", fontsize=7.5, color=OTHER)
axes[0].set_yscale("log"); axes[0].set_xlabel("wavelength (nm)"); axes[0].set_ylabel("signal-to-noise ratio")
axes[0].set_title(f"Urban: noisy detector edges · {nu['bands_dropped']} bands flagged", loc="left"); axes[0].legend(frameon=False, fontsize=8)
strats = [n for n in nu["all"] if not n.startswith("Sentinel")]
y = np.arange(len(strats))[::-1]
for yy, n in zip(y, strats):
    a, b = nu["all"][n], nu["after_drop"][n]
    axes[1].plot([a, b], [yy, yy], color=GRID, lw=3, zorder=1)
    axes[1].scatter([a], [yy], color=MUTED, zorder=2, s=30, label="with noisy bands" if yy == y[0] else None)
    axes[1].scatter([b], [yy], color=colour(n), zorder=3, s=40, label="after dropping SNR < 20" if yy == y[0] else None)
    axes[1].text(max(a, b) + 0.006, yy, f"{b - a:+.3f}", va="center", fontsize=8, color=INK)
axes[1].set_yticks(y); axes[1].set_yticklabels(strats, fontsize=8); axes[1].set_xlabel("balanced accuracy")
axes[1].set_title("Dropping noisy bands matters most when you select bands", loc="left"); axes[1].legend(frameon=False, fontsize=8, loc="lower left")
axes[1].grid(axis="x", color=GRID, lw=0.6)
save(fig, "fig5_noise.png")

# 6. Urban shares
s = R["urban"]["shares_10m"]
meths = list(s.keys())
fig, axes = plt.subplots(1, 2, figsize=(12, 4))
y = np.arange(len(meths))[::-1]
for ax, key, title in ((axes[0], "mean_rmse_10m", "Share error per 10 m mixed pixel"), (axes[1], "mean_rmse_90m_block", "Share error per 90 m block (CoolCairo's unit)")):
    vals = [s[m][key] for m in meths]
    ax.barh(y, vals, color=[colour(m) if not m.startswith("Physics") else MUTED for m in meths], height=0.65)
    for yy, v in zip(y, vals):
        ax.text(v + 0.002, yy, f"{v * 100:.1f} pts", va="center", fontsize=8.5)
    ax.set_yticks(y); ax.set_yticklabels(meths if ax is axes[0] else [""] * len(meths), fontsize=8.5)
    ax.set_xlabel("RMSE of material shares (fraction of area)"); ax.set_title(title, loc="left"); ax.grid(axis="x", color=GRID, lw=0.6)
save(fig, "fig6_urban_shares.png")

# 7. Confusion matrices, flat vs refine (row-normalised)
nm = R["pavia"]["names"]
order = [0, 7, 8, 2, 5, 6, 1, 3, 4]
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
for ax, strat in zip(axes, ("Flat · all bands", "Refine · flat stage 1 + specialists (all bands)")):
    if strat not in R["pavia"]["lda"]:
        continue
    cm = np.array(R["pavia"]["lda"][strat]["confusion"], float)
    cm = cm[np.ix_(order, order)]
    cm = cm / cm.sum(1, keepdims=True)
    ax.imshow(cm, cmap="Blues", vmin=0, vmax=1)
    for i in range(len(order)):
        for j in range(len(order)):
            if cm[i, j] >= 0.05:
                ax.text(j, i, f"{cm[i, j]:.2f}", ha="center", va="center", fontsize=7.5, color="white" if cm[i, j] > 0.6 else INK)
    ax.set_xticks(range(len(order))); ax.set_xticklabels([nm[o] for o in order], rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(order))); ax.set_yticklabels([nm[o] for o in order], fontsize=8)
    ax.set_xlabel("predicted"); ax.set_ylabel("true")
    ax.set_title(f"{strat} · BA {R['pavia']['lda'][strat]['balanced_accuracy']:.3f}", loc="left", fontsize=10)
    for b in (2.5, 5.5, 7.5):
        ax.axhline(b, color=LAY, lw=1); ax.axvline(b, color=LAY, lw=1)
save(fig, "fig7_confusion.png")
print("figures written to", OUT)
