"""Results page for the layered-band-selection experiment (figures embedded, numbers from results.json).

Usage: python make_report.py results/results.json figures/ report.html
"""

import base64
import json
import sys
from pathlib import Path

R = json.loads(Path(sys.argv[1]).read_text())
FIG = Path(sys.argv[2])
OUT = Path(sys.argv[3])
P, U = R["pavia"], R["urban"]
L, RF = P["lda"], P["rf"]
D = P["diagnostics_lda"]
UL, UD, US = U["classification_lda"], U["diagnostics_lda"], U["shares_10m"]
REF_ALL = "Refine · flat stage 1 + specialists (all bands)"
REF_20 = "Refine · flat stage 1 + specialists (20 bands)"


def ba(t, k):
    return t[k]["balanced_accuracy"]


def img(name, alt):
    b = base64.b64encode((FIG / name).read_bytes()).decode()
    return f'<figure class="plate"><img src="data:image/png;base64,{b}" alt="{alt}"><figcaption>{alt}</figcaption></figure>'


def row(t, names, fmt=lambda v: f"{v:.3f}"):
    return "".join(f'<tr><td>{n}</td><td class="n">{fmt(ba(t, n))}</td><td class="n">{t[n]["bands_used"]:.0f}</td></tr>' for n in names if n in t)


ORDER = list(L.keys())
best_lda = max(ORDER, key=lambda n: ba(L, n))
best_rf = max(ORDER, key=lambda n: ba(RF, n))
pn, un = P["noise"]["edge-degraded"], U["noise_edge"]
sh_s2 = next(k for k in US if k.startswith("Sentinel"))
RS = P["repeat_splits"]
RD = RS["refine_minus_flat"]

html = f"""<title>Layered Band Selection Trial</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: a lab report. One reading column with full-width figure plates; verdict first, evidence after. */
:root {{
  --bg: #f2f5f8; --panel: #ffffff; --ink: #142033; --muted: #56677d; --line: #d3dce6;
  --flat: #2a78d6; --layer: #c9501f; --refine: #16865a; --gold: #a77b0f;
  --font-display: "Archivo", "Arial Narrow", system-ui, sans-serif;
  --font-body: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #0b1220; --panel: #131e33; --ink: #e6edf5; --muted: #93a3b8; --line: #263652; --flat: #5b9bea; --layer: #f06a35; --refine: #4cd08a; --gold: #f2c14e; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #0b1220; --panel: #131e33; --ink: #e6edf5; --muted: #93a3b8; --line: #263652; --flat: #5b9bea; --layer: #f06a35; --refine: #4cd08a; --gold: #f2c14e; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15.5px/1.65 var(--font-body); }}
main {{ max-width: 1040px; margin: 0 auto; padding-block: 36px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 22px; }}
h1 {{ font: 800 clamp(30px, 5vw, 44px)/1.05 var(--font-display); font-stretch: 82%; margin: 0; text-wrap: balance; }}
h2 {{ font: 750 23px/1.2 var(--font-display); font-stretch: 86%; margin: 18px 0 0; text-wrap: balance; }}
h3 {{ font: 700 16px var(--font-display); font-stretch: 90%; margin: 6px 0 0; }}
p, li {{ max-width: 72ch; }}
p {{ margin: 0; }}
.eyebrow {{ font: 500 12px var(--font-data); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }}
.lead {{ font-size: 18px; color: var(--muted); }}
.verdict {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }}
.v {{ background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: grid; gap: 6px; align-content: start; }}
.v b.big {{ font: 800 30px/1 var(--font-display); font-stretch: 82%; }}
.v.flat b.big {{ color: var(--flat); }} .v.layer b.big {{ color: var(--layer); }} .v.refine b.big {{ color: var(--refine); }} .v.gold b.big {{ color: var(--gold); }}
.v span {{ font-size: 14px; color: var(--muted); }}
.plate {{ margin: 0; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: grid; gap: 8px; }}
.plate img {{ width: 100%; height: auto; display: block; }}
.plate figcaption {{ font-size: 13px; color: #56677d; }}
.table-wrap {{ overflow-x: auto; }}
table {{ border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }}
th, td {{ text-align: left; padding: 7px 10px 7px 0; border-bottom: 1px solid var(--line); vertical-align: top; }}
th {{ color: var(--muted); font-weight: 600; font-size: 13px; }}
td.n, th.n {{ text-align: right; font-family: var(--font-data); }}
.note {{ border-left: 3px solid var(--gold); background: var(--panel); padding: 12px 14px; border-radius: 0 10px 10px 0; }}
ol, ul {{ margin: 0; padding-left: 20px; display: grid; gap: 6px; }}
code {{ font-family: var(--font-data); font-size: 13px; }}
</style>
<main>
<div class="eyebrow">CoolCairo · hyperspectral course · experiment</div>
<h1>Does layered band selection help?</h1>
<p class="lead">A test of the idea "clean the bands, segment the scene, then use a different set of bands for each kind of surface", against flat models, on two real hyperspectral scenes with ground truth. Every score comes from hidden-area (spatial) cross-validation, with all band selection done inside the training folds.</p>

<h2>The verdict</h2>
<div class="verdict">
  <div class="v refine"><b class="big">Stage 2: yes</b><span>Told the true group, per-group specialists reach balanced accuracy {D['oracle_layered']['all']['balanced_accuracy']:.2f} on Pavia vs {ba(L, 'Flat · all bands'):.2f} for the flat model. Inside the bright-mineral group: {D['oracle_layered']['all']['within_group']['Bright mineral']:.0%} vs {D['within_group_flat_all']['Bright mineral']:.0%}.</span></div>
  <div class="v layer"><b class="big">Stage 1: the bottleneck</b><span>On unseen Pavia areas the first split (dark / bright mineral / vegetation / metal) is right only {D['stage1']['8 selected bands']:.0%} of the time with 8 bands, {D['stage1']['all bands']:.0%} with all bands. Its mistakes cascade: layered models score {ba(L, 'Layered · soft'):.2f}–{ba(L, 'Layered · soft · all bands both stages'):.2f}.</span></div>
  <div class="v flat"><b class="big">Refine: +{RD['mean'] * 100:.1f} pts</b><span>Using the flat model's own group probabilities as stage 1, then per-group specialists, beat flat in {RD['wins']} of {RD['runs']} different tile layouts ({RS['Refine · all bands']['mean']:.3f} vs {RS['Flat · all bands']['mean']:.3f}); with 20 bands per group it matched flat using about a third of the bands.</span></div>
  <div class="v gold"><b class="big">Clean first: yes</b><span>Dropping low-SNR edge bands rescued band-selecting models (Urban layered: {un['all']['Layered · hard']:.2f} → {un['after_drop']['Layered · hard']:.2f}) and never hurt much.</span></div>
</div>

<p><b>In one sentence:</b> the layered idea is right about the second stage and wrong-footed by the first. Built naively (a separate, weaker first split with a few bands, hard decisions), it loses about {(RS['Flat · all bands']['mean'] - RS['Layered · soft (naive)']['mean']) * 100:.0f} points of balanced accuracy on Pavia. Built carefully (the strongest model makes the first split, probabilities flow to per-group specialists), it wins a small but consistent gain and lets each specialist work with far fewer bands. A regularised model on all clean bands remains the baseline to beat, and selecting a handful of bands for the whole scene never beat it.</p>

<h2>Data and method</h2>
<div class="table-wrap"><table>
<tr><th>Dataset</th><th>Sensor</th><th>Pixels</th><th>Bands</th><th>Ground truth</th><th>Why it matters for CoolCairo</th></tr>
<tr><td>Pavia University</td><td>ROSIS, airborne</td><td>610 × 340 at 1.3 m</td><td class="n">103 (430–860 nm)</td><td>{P['n_labelled']:,} labelled pixels, 9 classes</td><td>Asphalt, bitumen roofs and shadows: the "dark" class problem</td></tr>
<tr><td>Urban</td><td>HYDICE, airborne</td><td>307 × 307 at 2 m</td><td class="n">162 of 210 (400–2500 nm)</td><td>Per-pixel fractions of 6 materials</td><td>Same range as EnMAP incl. SWIR; tests material shares, CoolCairo's input</td></tr>
</table></div>
<ul>
<li><b>Hidden-area exam:</b> scenes cut into tiles (52 m Pavia, 62 m Urban) in 5 groups; learn on 4, test on the 5th. Random-pixel folds would inflate Pavia from {ba(L, 'Flat · all bands'):.3f} to {P['random_cv_flat_all_lda']:.3f}.</li>
<li><b>Band selection</b> (inside each training fold): rank bands by F-score, add greedily, skip near-duplicates (|r| ≥ 0.98).</li>
<li><b>Models:</b> shrinkage linear discriminant analysis (LDA) and random forest for classes; ridge regression and constrained unmixing for shares.</li>
<li><b>Groups</b> mirror CoolCairo's rules: Pavia dark (asphalt, bitumen, shadows) · bright mineral (gravel, bare soil, bricks) · vegetation (meadows, trees) · metal; Urban vegetation (grass, tree) · non-vegetation (asphalt, roof, metal, dirt).</li>
<li><b>Strategies:</b> Sentinel-2-like bands (averaged into Sentinel-2's windows) · flat all bands · flat 10 selected · flat PCA 10 · layered hard / soft (8-band stage 1, 10 bands per group) · layered with all bands in stage 2 · layered with all bands in stage 1 · <b>refine</b>: the flat model's own group probabilities as stage 1, then per-group specialists.</li>
</ul>

<h2>1. What each stage picks</h2>
<p>Run on the full Urban scene, the selection rediscovered the physics: the non-vegetation specialist picked {', '.join(str(int(b)) for b in U['illustrative_bands'].get('Non-vegetation', []))} nm, including the hydrocarbon feature near 1,720 nm (asphalt, bitumen) and the clay / hydroxyl feature near 2,200 nm (soil). The vegetation specialist leaned on leaf-water and SWIR bands. Bands near 1,940 nm sit on the edge of a water-vapour gap and are suspect.</p>
{img('fig1_spectra_bands.png', 'Class mean spectra with the bands each stage selects (full-data illustration; all scores use fold-internal selection).')}

<h2>2. Pavia: the main comparison</h2>
<div class="table-wrap"><table><tr><th>Strategy</th><th class="n">LDA</th><th class="n">Random forest</th><th class="n">Bands used</th></tr>
{''.join(f'<tr><td>{n}</td><td class="n">{ba(L, n):.3f}</td><td class="n">{ba(RF, n):.3f}</td><td class="n">{L[n]["bands_used"]:.0f}</td></tr>' for n in ORDER)}
</table></div>
<p>Best LDA: <b>{best_lda}</b> ({ba(L, best_lda):.3f}). Best random forest: <b>{best_rf}</b> ({ba(RF, best_rf):.3f}). Every hyperspectral strategy that kept all bands beat the Sentinel-2-like baseline ({ba(L, 'Sentinel-2-like bands'):.3f} LDA, {ba(RF, 'Sentinel-2-like bands'):.3f} RF).</p>
{img('fig2_pavia_strategies.png', 'Balanced accuracy on hidden tiles. Dashed line: flat all bands. Dotted: the same model scored with leaky random-pixel folds.')}

<h2>3. Why: stage 2 works, stage 1 cascades</h2>
<p>The oracle test hands each pixel's true group to the specialists. They then separate gravel, bare soil and bricks almost perfectly, which the flat model cannot. But in unseen areas the first split misroutes about one pixel in five, and a misrouted pixel can never be fixed in stage 2. Bricks and gravel are the worst: they look like other groups at the coarse level.</p>
{img('fig3_diagnostics.png', 'Left: accuracy inside each group, flat model vs a specialist told the true group. Right: oracle layered and flat band-count sweep against the flat all-bands line, with stage-1 accuracy.')}
{img('fig7_confusion.png', 'Row-normalised confusion on hidden tiles, flat vs refine. Orange lines separate the groups; errors that cross a line are stage-1 errors.')}

<h2>4. The fair version: refine, repeated over 10 tile layouts</h2>
<p>If stage 1 is the bottleneck, give stage 1 the best model available: the flat all-bands classifier, its class probabilities summed into groups. Specialists then refine within each group, and the two are combined as P(class) = P(group) × P(class | group). To check the gain is not luck of one split, the whole test was repeated with 10 different random assignments of tiles to folds.</p>
<div class="table-wrap"><table><tr><th>Pavia, LDA, 10 tile layouts</th><th class="n">Mean balanced accuracy</th><th class="n">Spread (sd)</th></tr>
{''.join(f'<tr><td>{k}</td><td class="n">{v["mean"]:.3f}</td><td class="n">±{v["sd"]:.3f}</td></tr>' for k, v in RS.items() if k != 'refine_minus_flat')}
<tr><td><b>Refine minus flat, paired</b></td><td class="n"><b>+{RD['mean']:.3f}</b></td><td class="n">±{RD['sd']:.3f} · wins {RD['wins']}/{RD['runs']}</td></tr></table></div>
<p>The gain is small (under one point) but appears in every layout, because each comparison uses the same hidden tiles for both models. It comes from the dark group: asphalt {L['Flat · all bands']['recall']['Asphalt']:.2f} → {L[REF_ALL]['recall']['Asphalt']:.2f} and bitumen {L['Flat · all bands']['recall']['Bitumen']:.2f} → {L[REF_ALL]['recall']['Bitumen']:.2f}, the dark-roof problem CoolCairo cares about. With a random forest the two tie ({ba(RF, 'Flat · all bands'):.3f} vs {ba(RF, REF_ALL):.3f}): flexible models already find group-specific rules on their own. Refine also helped most when training data was scarce: {P['hughes']['25'][REF_ALL]:.3f} vs {P['hughes']['25']['Flat · all bands']:.3f} with 25 training pixels per class.</p>

<h2>5. Few training pixels</h2>
<p>The classic argument for selecting bands is the curse of dimensionality: too many bands for too few examples. With a shrinkage (regularised) model, that curse never showed up here: flat all bands led at every size from 10 to 500 training pixels per class. Regularisation already does what selection tries to do, without throwing information away.</p>
{img('fig4_training_size.png', 'Balanced accuracy vs training pixels per class (Pavia, LDA, hidden tiles).')}

<h2>6. Noisy detector edges</h2>
<p>Noise was added to mimic weak detector edges (SNR collapsing towards each end) and, for Urban, the VNIR/SWIR junction at 900–1,000 nm. A per-band SNR estimate from the image itself (spectral-neighbour residual) found the bad bands without being told: {un['bands_dropped']} flagged in Urban, {pn['bands_dropped']} in Pavia.</p>
<div class="table-wrap"><table><tr><th>Urban, noisy edges</th><th class="n">With noisy bands</th><th class="n">After dropping SNR &lt; 20</th></tr>
{''.join(f'<tr><td>{n}</td><td class="n">{un["all"][n]:.3f}</td><td class="n">{un["after_drop"][n]:.3f}</td></tr>' for n in un['all'])}
</table></div>
<p>The regularised all-band models barely noticed the noise; they down-weight noisy bands by themselves. Models that <b>select</b> bands were hurt badly, because by chance noise can look discriminative in the training fold. For them, dropping low-SNR bands first is essential.</p>
<p>The estimator is not perfect: it also flags some bands beside the water-vapour gaps and at sharp real absorption features, where the spectrum is not smooth. Review the flagged list against the wavelengths before dropping, rather than dropping it blindly.</p>
{img('fig5_noise.png', 'Left: simulated vs estimated SNR per band (Urban). Right: balanced accuracy before and after dropping bands with estimated SNR below 20.')}

<h2>7. Urban: material shares in mixed pixels</h2>
<p>This is the task CoolCairo actually needs: the share of each material inside a mixed pixel, then per 90 m block. The 2 m scene was averaged to 10 m mixed pixels with known shares.</p>
<div class="table-wrap"><table><tr><th>Method</th><th class="n">Share RMSE, 10 m</th><th class="n">Roof + dirt RMSE</th><th class="n">Share RMSE, 90 m block</th><th class="n">Bands</th></tr>
{''.join(f'<tr><td>{n}</td><td class="n">{v["mean_rmse_10m"] * 100:.1f} pts</td><td class="n">{v["roof_dirt_rmse_10m"] * 100:.1f} pts</td><td class="n">{v["mean_rmse_90m_block"] * 100:.1f} pts</td><td class="n">{v["bands_used"]:.0f}</td></tr>' for n, v in US.items())}
</table></div>
<p>All 162 bands with ridge regression gave the most accurate shares: {US['Flat · all bands · ridge']['mean_rmse_10m'] * 100:.1f} percentage points per 10 m pixel and {US['Flat · all bands · ridge']['mean_rmse_90m_block'] * 100:.1f} per 90 m block, against {US[sh_s2]['mean_rmse_10m'] * 100:.1f} and {US[sh_s2]['mean_rmse_90m_block'] * 100:.1f} with Sentinel-2-like bands, about {US[sh_s2]['mean_rmse_90m_block'] / US['Flat · all bands · ridge']['mean_rmse_90m_block']:.1f} times smaller at block level. The roof-vs-dirt error, CoolCairo's pale-roof-or-sand problem, fell from {US[sh_s2]['roof_dirt_rmse_10m'] * 100:.1f} to {US['Flat · all bands · ridge']['roof_dirt_rmse_10m'] * 100:.1f} points. The layered version came second. Plain constrained unmixing with endmembers taken from the purest training pixels did worst here: real endmembers vary, and that needs better endmember extraction, a course topic.</p>
{img('fig6_urban_shares.png', 'Root-mean-square error of material shares (percentage points of area) on hidden tiles.')}

<h2>8. Urban classification: when layering wins</h2>
<div class="table-wrap"><table><tr><th>Strategy</th><th class="n">Balanced accuracy</th><th class="n">Bands</th></tr>{row(UL, list(UL.keys()))}</table></div>
<p>Here the first split (vegetation vs not) is {UD['stage1']['all bands']:.1%} correct on hidden tiles, so errors rarely cascade, and layering with all bands edges past flat ({ba(UL, 'Layered · soft · all bands both stages'):.3f} vs {ba(UL, 'Flat · all bands'):.3f}). The lesson: layer only where the first split is physically obvious and reliable, such as vegetation.</p>

<h2>What this means for CoolCairo</h2>
<ol>
<li><b>Keep all clean bands.</b> Drop water-vapour bands and bands with low estimated SNR, then use a regularised model (ridge, as CoolCairo already does) on everything left. That was the strongest single recipe.</li>
<li><b>If you layer, use the refine design.</b> Let the strongest all-band model make the first split and pass probabilities, never hard labels, to per-group specialists. Hard first splits are only safe where they are physically obvious (vegetation vs not). Pale roof vs sand, or dark roof vs shadow, belong inside the specialist stage.</li>
<li><b>Use selection for understanding, not for scoring.</b> Fold-internal selection found the hydrocarbon (~1,720 nm) and clay (~2,200 nm) features: good evidence for the course and for judges, and a guide to which features Satellite 813 must resolve.</li>
<li><b>Hyperspectral shares beat Sentinel-2 shares clearly</b> at block level, the strongest evidence here for moving EnMAP into the production model.</li>
<li><b>Next test on the real EnMAP Cairo scene:</b> the same script, with the same rules. These benchmarks are airborne at 1.3–2 m with labelled ground truth; EnMAP is 30 m with far more mixing, so expect lower absolute scores and confirm the ranking there.</li>
</ol>
<p class="note"><b>Limits:</b> two benchmark scenes, neither over Cairo; Pavia lacks SWIR; one band-selection method (F-score with a redundancy filter) and fixed group definitions; synthetic noise profiles for the edge test. Data: Pavia University (ROSIS, courtesy of P. Gamba, University of Pavia) and HYDICE Urban (US Army Corps of Engineers; ground truth by Zhu et al.), via a public mirror, verified against published SHA-256 hashes. Code: <code>hyperspectral-experiments/layered.py</code>.</p>
</main>
"""
OUT.write_text(html)
print("report written", OUT, len(html) // 1024, "KB")
