import "./styles.css";
import nasrRaw from "./assets/district.json";
import heliopolisRaw from "./assets/districts/heliopolis-edge.json";
import nozhaRaw from "./assets/districts/nozha-growth.json";
import zeitounRaw from "./assets/districts/zeitoun.json";
import nasrPhoto from "./assets/nasr_city_sentinel2.jpg";
import fig2 from "./assets/fig2_district.webp";
import fig3 from "./assets/fig3_model_fit.webp";
import fig4 from "./assets/fig4_hyperspectral.webp";
import fig5 from "./assets/fig5_interventions.webp";
import fig6 from "./assets/fig6_growth.webp";
import {
  EFFECT_RAMP, GROWTH, MATERIAL, MEASURE_COLOR, NO_EXCESS_HEAT, NO_RESIDENTS, RISK_RAMP,
  css, gradientCss, type HeatPalette, type View,
} from "./colors";
import { Colorizer } from "./colorizer";
import { hasGrowth, parseDistrict } from "./data";
import { COST_EGP_PER_M2, MEASURES, PlanModel, type Measure } from "./model";
import { buildReport } from "./report";
import { DistrictScene, type Interaction } from "./scene";

// ---------- formatting ----------

const MINUS = "−";
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const signed = (v: number, digits = 1) => (v < -1e-9 ? MINUS : v > 1e-9 ? "+" : "") + Math.abs(v).toFixed(digits);
const pct = (v: number) => `${v < -0.5 ? MINUS : v > 0.5 ? "+" : ""}${Math.abs(Math.round(v))}%`;
const share = (v: number) => `${Math.round(v * 100)}%`;
function egp(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)} bn`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return int(v);
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- browser storage (optional: the page works without it) ----------

const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const STORE = "coolcairo.plans.v1";
/** Print and file downloads work on a normal web host, not inside the Claude artifact viewer. */
const HOSTED = import.meta.env.VITE_TARGET !== "artifact";

// ---------- districts ----------

interface DistrictEntry { raw: unknown; label: string; note: string; photo?: string; }
const DISTRICTS: Record<string, DistrictEntry> = {
  "nasr-city": { raw: nasrRaw, label: "Nasr City", note: "The district of the CoolCairo report and app.", photo: nasrPhoto },
  "heliopolis-edge": { raw: heliopolisRaw, label: "Heliopolis edge", note: (heliopolisRaw as { about: string }).about },
  "zeitoun": { raw: zeitounRaw, label: "El Zeitoun area", note: (zeitounRaw as { about: string }).about },
  "nozha-growth": { raw: nozhaRaw, label: "Eastern growth edge", note: (nozhaRaw as { about: string }).about },
};
const requested = location.hash.slice(1);
const districtKey = requested in DISTRICTS ? requested : (() => {
  const k = store.get<string>("coolcairo.district", "nasr-city");
  return k in DISTRICTS ? k : "nasr-city";
})();
const district = DISTRICTS[districtKey];

// ---------- data and model ----------

const d = parseDistrict(district.raw);
const model = new PlanModel(d, districtKey);
const colors = new Colorizer(model);
const m = d.model;

interface MeasureInfo { name: string; key: string; effect: string; note: string; source: "lit" | "own"; }
const INFO: Record<Measure, MeasureInfo> = {
  roof: {
    name: "Cool roofs", key: "Q", source: "lit",
    effect: `${signed(m.coolRoofDarkDeltaC)} °C dark · ${signed(m.coolRoofPaleDeltaC)} °C pale`,
    note: "Coat every roof in the block with reflective white. Per unit of block area coated.",
  },
  trees: {
    name: "Street trees", key: "W", source: "own",
    effect: `${signed(m.vegFrac - m.darkGroundFrac)} °C per unit area`,
    note: `Plant up to ${share(model.treeMax)} of the block's dark ground (asphalt, dark paving). Needs irrigation, not modelled.`,
  },
  pavement: {
    name: "Cool pavements", key: "E", source: "lit",
    effect: `${signed(m.coolPavementDeltaC)} °C per unit area`,
    note: "Reflective coating on the dark ground that trees have not taken. Rests on published values only.",
  },
  park: {
    name: "Pocket parks", key: "R", source: "own",
    effect: `${signed(m.pocketParkDeltaC)} °C per unit area`,
    note: `Green up to ${share(model.parkMax)} of the block's bare sand with drought-tolerant planting. Likely overstated: allowing for sand in neighbouring blocks roughly halves it.`,
  },
};

const VIEW_HINT: Record<View, string> = {
  heat: "Land surface temperature per 90 m block: the median of summer 2023–25 Landsat 8/9 scenes. Surface, not air, temperature.",
  risk: "Heat exposure: residents × degrees above the heat line. Residents from WorldPop 2024.",
  materials: "What the ground and roofs are made of (Sentinel-2, summer 2023–25), mixed per block.",
  effect: "How much your plan cools each block's surface.",
  growth: "Building cover change per block, from Google Open Buildings Temporal.",
};

// ---------- state ----------

const state = {
  view: "heat" as View,
  mode: "inspect" as Interaction,
  measure: "roof" as Measure,
  strength: 1,
  radius: 1,
  selected: -1,
};

// ---------- scene ----------

let strokeVersion = 0;
let strokeErase = false;
let lastPointer = { x: 0, y: 0, block: -1 };

const scene = new DistrictScene($("map"), d, model, colors, {
  hover(block, x, y) {
    lastPointer = { x, y, block };
    scene.footprint = block >= 0 ? footprint(block) : [];
    showTooltip(block, x, y);
  },
  strokeStart(block, erase) {
    strokeErase = erase;
    model.checkpoint();
    strokeVersion = model.version;
    paintAt(block);
  },
  strokeMove(block) { paintAt(block); },
  strokeEnd() {
    model.dropCheckpointIfUnchanged(strokeVersion);
    renderButtons();
  },
  select(block) { select(block >= 0 && model.isValid(block) ? block : -1); },
});

function footprint(centre: number): number[] {
  const r = state.radius, cr = Math.floor(centre / d.cols), cc = centre % d.cols;
  const out: number[] = [];
  for (let row = cr - r; row <= cr + r; row++)
    for (let col = cc - r; col <= cc + r; col++) {
      if (row < 0 || row >= d.rows || col < 0 || col >= d.cols) continue;
      if ((row - cr) ** 2 + (col - cc) ** 2 > r * r) continue;
      out.push(row * d.cols + col);
    }
  return out;
}

function paintAt(block: number) {
  const blocks = footprint(block);
  if (strokeErase) model.eraseMany(blocks);
  else model.setMany(state.measure, blocks.filter((i) => model.applicable(state.measure, i)), state.strength);
}

// ---------- views and legend ----------

function setView(v: View) {
  if (v === "growth" && !hasGrowth(d)) return;
  state.view = v;
  colors.view = v;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#viewSeg button")) b.setAttribute("aria-checked", String(b.dataset.view === v));
  scene.refresh(true);
  renderLegend();
}

function renderLegend() {
  const el = $("legend");
  const v = state.view;
  const keys = (rows: [string, string][]) =>
    `<div class="legend-keys">${rows.map(([c, l]) => `<div><i style="background:${c}"></i>${esc(l)}</div>`).join("")}</div>`;
  let html = "";
  if (v === "heat") {
    const ref = model.heatLine;
    html = `<div class="legend-title">Surface temperature${colors.palette === "report" ? `, grey = heat line ${ref.toFixed(1)} °C` : ""}</div>
      <div class="legend-ramp" style="background:${gradientCss((t) => colors.heat(colors.heatMin + t * (colors.heatMax - colors.heatMin)))}"></div>
      <div class="legend-scale"><span>${colors.heatMin.toFixed(1)} °C</span><span>${((colors.heatMin + colors.heatMax) / 2).toFixed(1)}</span><span>${colors.heatMax.toFixed(1)} °C</span></div>
      <div class="legend-pal" role="group" aria-label="Colour scheme"><span>Colours</span>${(["report", "inferno", "warm"] as HeatPalette[])
        .map((p) => `<button data-pal="${p}" aria-pressed="${colors.palette === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</div>`;
  } else if (v === "risk") {
    html = `<div class="legend-title">Heat exposure, person·°C per block</div>
      <div class="legend-ramp" style="background:${gradientCss(RISK_RAMP)}"></div>
      <div class="legend-scale"><span>&gt; 0</span><span>${int(colors.riskMax / 2)}</span><span>${int(colors.riskMax)}+</span></div>
      ${keys([[css(NO_EXCESS_HEAT), `At or below the heat line (${model.heatLine.toFixed(1)} °C)`], [css(NO_RESIDENTS), "No residents"]])}`;
  } else if (v === "materials") {
    html = `<div class="legend-title">Surfaces, mixed by share of each block</div>
      ${keys([[css(MATERIAL.veg), "Vegetation"], [css(MATERIAL.dark), "Dark: asphalt, dark roofs"], [css(MATERIAL.pale), "Pale: concrete, pale roofs"],
        [css(MATERIAL.sand), "Bare sand / soil"], [css(MATERIAL.coolRoof), "Cool roof (your plan)"], [css(MATERIAL.coolPavement), "Cool pavement (your plan)"]])}`;
  } else if (v === "effect") {
    html = `<div class="legend-title">Surface cooling from your plan</div>
      <div class="legend-ramp" style="background:${gradientCss(EFFECT_RAMP)}"></div>
      <div class="legend-scale"><span>none</span><span>${MINUS}1.5 °C</span><span>${MINUS}${colors.effectMax} °C</span></div>
      ${model.hasPlan ? "" : `<div class="legend-note">No plan yet. Apply the targeted plan or paint blocks to see the effect.</div>`}`;
  } else {
    const g = d.growth!;
    html = `<div class="legend-title">Urban growth ${g.firstYear}–${g.lastYear}</div>
      ${keys([[css(GROWTH[3]), `New built-up since ${g.firstYear}`], [css(GROWTH[2]), `Denser (+${Math.round(g.denserMin * 100)} pts cover)`],
        [css(GROWTH[1]), "Built before, little change"], [css(GROWTH[0]), `Still open land in ${g.lastYear}`]])}
      <div class="legend-note">${g.builtFirstKm2.toFixed(2)} → ${g.builtLastKm2.toFixed(2)} km² of buildings; ${g.newBlocks} new and ${g.denserBlocks} denser blocks.</div>`;
  }
  if (model.hasPlan && v !== "effect") {
    html += `<div class="legend-keys rings">${MEASURES.filter((k) => anyShare(k)).map((k) => `<div><i style="background:transparent;border:2.5px solid ${MEASURE_COLOR[k]}"></i>Ring: ${INFO[k].name.toLowerCase()}</div>`).join("")}</div>`;
  }
  html += `<div class="legend-note">${esc(VIEW_HINT[v])}</div>`;
  el.innerHTML = html;
}

const anyShare = (k: Measure) => { for (let i = 0; i < model.n; i++) if (model.getShare(k, i) >= 0.01) return true; return false; };

$("legend").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-pal]");
  if (!b) return;
  colors.palette = b.dataset.pal as HeatPalette;
  scene.refresh(true);
  renderLegend();
});

// ---------- plan panel ----------

function renderMeasures() {
  $("measureList").innerHTML = MEASURES.map((k) => `
    <button class="measure" role="radio" data-measure="${k}" aria-checked="${state.measure === k}">
      <span class="sw ${k}"></span>
      <span class="m-name">${INFO[k].name}<span class="m-source ${INFO[k].source}" title="${INFO[k].source === "lit" ? "Effect from published studies" : "Effect estimated from our own satellite data"}">${INFO[k].source === "lit" ? "published" : "our data"}</span></span>
      <kbd class="m-key">${INFO[k].key}</kbd>
      <span class="m-effect">${INFO[k].effect}</span>
      <span class="m-note">${INFO[k].note}</span>
    </button>`).join("");
}

function setMeasure(k: Measure) {
  state.measure = k;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#measureList .measure")) b.setAttribute("aria-checked", String(b.dataset.measure === k));
  if (state.mode === "inspect") setMode("paint");
}

function setMode(mode: Interaction) {
  state.mode = mode;
  scene.setInteraction(mode);
  for (const b of document.querySelectorAll<HTMLButtonElement>("#modeSeg button")) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  $("paintHint").textContent = mode === "inspect"
    ? "Drag to turn the map, right-drag to move it, click a block to inspect it. Choose a measure to start painting."
    : mode === "paint"
      ? `Drag across blocks to add ${INFO[state.measure].name.toLowerCase()} at ${share(state.strength)}. Right-drag turns the map; Shift-drag erases.`
      : "Drag across blocks to remove every measure from them. Right-drag turns the map.";
  scene.markDirty();
}

function setRadius(r: number) {
  state.radius = Math.max(0, Math.min(4, r));
  ($("brushSize") as HTMLInputElement).value = String(state.radius);
  const n = footprint(Math.floor(d.rows / 2) * d.cols + Math.floor(d.cols / 2)).length;
  $("brushOut").textContent = n === 1 ? "1 block" : `${n} blocks`;
  if (lastPointer.block >= 0) scene.footprint = footprint(lastPointer.block);
  scene.markDirty();
}

function autoMeasures(): Measure[] {
  return [["autoRoof", "roof"], ["autoTrees", "trees"], ["autoPavement", "pavement"], ["autoPark", "park"]]
    .filter(([id]) => ($(id) as HTMLInputElement).checked).map(([, k]) => k as Measure);
}

/** Slider value as a fraction; 33 and 67 mean exactly a third and two thirds (the analysis plan). */
function autoFraction(): number {
  const v = Number(($("autoShare") as HTMLInputElement).value);
  return v === 33 ? 1 / 3 : v === 67 ? 2 / 3 : v / 100;
}

function renderAutoCount() {
  const f = autoFraction();
  const valid = model.rankedByRisk().length;
  $("autoShareOut").textContent = f === 1 / 3 ? "a third" : f === 2 / 3 ? "two thirds" : `${Math.round(f * 100)}%`;
  $("autoShareCount").textContent = `${int(Math.floor(valid * f))} of ${int(valid)} blocks, ranked by heat exposure`;
  ($("autoApply") as HTMLButtonElement).disabled = autoMeasures().length === 0;
}

// ---------- results ----------

let lastExposure = -1;

function renderKpis() {
  const s = model.summary();
  const plan = model.hasPlan;
  $("expNow").textContent = int(s.exposureAfter);
  $("expNow").parentElement!.classList.toggle("good", s.exposureAfter < s.exposureBefore - 0.5);
  $("expDelta").innerHTML = plan
    ? `<b>${pct(s.exposureChangePct)}</b> vs today's ${int(s.exposureBefore)} · ${int(s.blocksTreated)} blocks treated`
    : `Today, before any plan. Counts heat above the ${model.heatLine.toFixed(1)} °C line.`;
  ($("expMeter") as HTMLElement).style.width = `${s.exposureBefore > 0 ? (100 * s.exposureAfter) / s.exposureBefore : 0}%`;
  if (lastExposure >= 0 && s.exposureAfter < lastExposure - 0.5) {
    const k = $("kpiExposure");
    k.classList.remove("flash"); void k.offsetWidth; k.classList.add("flash");
  }
  lastExposure = s.exposureAfter;

  const cooler = s.meanAfter < s.meanBefore - 0.005;
  $("tempNow").innerHTML = cooler ? `${s.meanBefore.toFixed(1)} → <span style="color:var(--good)">${s.meanAfter.toFixed(1)}</span> °C` : `${s.meanBefore.toFixed(1)} °C`;
  $("tempSub").textContent = cooler ? `${signed(s.meanAfter - s.meanBefore, 2)} °C · mean of ${int(model.rankedByRisk().length)} blocks` : `mean of ${int(model.rankedByRisk().length)} blocks`;
  $("wDelta").textContent = `${signed(s.residentWeightedDelta, 2)} °C`;
  $("wDelta").classList.toggle("good", s.residentWeightedDelta < -0.005);
  $("resCooled").textContent = int(s.residentsCooled);
  $("resCooled").classList.toggle("good", s.residentsCooled > 0);
  $("resSub").textContent = plan ? `${int(s.residentsCooledAbove)} above the heat line · of ${int(s.residents)}` : `of ${int(s.residents)} residents`;
  $("costNow").textContent = plan ? `${egp(s.cost.low)}–${egp(s.cost.high)}` : "—";
  $("costSub").textContent = plan ? `EGP installed · ${int(Object.values(s.areaM2).reduce((a, b) => a + b, 0))} m² treated` : "EGP, installed";

  // Where the cooling comes from: resident-weighted °C per measure.
  const contrib: Record<Measure, number> = { roof: 0, trees: 0, pavement: 0, park: 0 };
  for (let i = 0; i < model.n; i++) {
    const r = model.residents(i);
    if (!r) continue;
    const c = model.contributions(i);
    for (const k of MEASURES) contrib[k] += r * c[k];
  }
  const max = Math.max(1e-9, ...MEASURES.map((k) => -contrib[k]));
  $("mixBars").innerHTML = plan
    ? MEASURES.map((k) => {
      const v = contrib[k] / Math.max(1, s.residents);
      return `<div class="mix-row"><span>${INFO[k].name}</span><span class="bar"><span style="width:${(100 * -contrib[k]) / max}%;background:${MEASURE_COLOR[k]}"></span></span><span class="v">${signed(v, 2)} °C</span></div>`;
    }).join("") + `<p class="mix-empty">Average surface change per resident, by measure. Cost: ${int(s.areaM2.roof)} m² roofs, ${int(s.areaM2.trees)} m² trees, ${int(s.areaM2.pavement)} m² pavement, ${int(s.areaM2.park)} m² parks.</p>`
    : `<p class="mix-empty">Apply the targeted plan or paint blocks to see which measures do the cooling.</p>`;

  renderSensitivity();
  scheduleWhere();
}

// The targeting comparison runs a few hundred scenarios, so it waits until painting pauses.
let whereTimer = 0;
function scheduleWhere() {
  clearTimeout(whereTimer);
  whereTimer = window.setTimeout(renderWhere, 250);
}

function renderWhere() {
  const rows = model.targetingComparison(200);
  if (!rows) {
    $("whereBody").innerHTML = `<p class="mix-empty">With a plan on the map, this compares it with the same measures on every block and on random blocks.</p>`;
    return;
  }
  const area = (r: (typeof rows)[number]) => Object.values(r.summary.areaM2).reduce((a, b) => a + b, 0) / 1e4;
  const [mine, above, every, random] = rows;
  $("whereBody").innerHTML = `<table class="where">
    <tr><th>Same measures on…</th><th>Exposure</th><th>Area</th></tr>
    ${rows.map((r, k) => `<tr class="${k === 0 ? "mine" : ""}"><td>${esc(r.label)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ""}</td><td>${pct(r.summary.exposureChangePct)}</td><td>${area(r).toFixed(0)} ha</td></tr>`).join("")}
  </table>
  <p class="where-take muted">${every.summary.exposureChangePct < -0.5
    ? `Treating every block cuts ${pct(every.summary.exposureChangePct)} with ${area(every).toFixed(0)} ha. ${Math.abs(above.summary.exposureChangePct - every.summary.exposureChangePct) < 1 ? `The ${above.label.split(" ")[2]} hot blocks alone give the same cut with ${Math.round(100 * (1 - area(above) / Math.max(area(every), 1e-9)))}% less area; random blocks give ${pct(random.summary.exposureChangePct)}.` : `Random blocks of the same number give ${pct(random.summary.exposureChangePct)}.`}`
    : "These measures barely change exposure at this heat line."}${area(mine) > area(above) * 1.15 && Math.abs(mine.summary.exposureChangePct - above.summary.exposureChangePct) < 1 ? " Your plan treats blocks that are already below the line; dropping them would save area without losing exposure cuts." : ""}</p>`;
}

function renderSensitivity() {
  const el = $("sensChart");
  if (!model.hasPlan) {
    el.innerHTML = `<p class="mix-empty">With a plan on the map, this chart shows its exposure cut at every heat line from 43.5 to 47.5 °C.</p>`;
    return;
  }
  const lines: number[] = [];
  for (let t = 43.5; t <= 47.501; t += 0.25) lines.push(+t.toFixed(2));
  const rows = model.sensitivity(lines);
  const W = 300, H = 130, L = 34, R = 16, T = 10, B = 22;
  const x = (t: number) => L + ((t - 43.5) / 4) * (W - L - R);
  const y = (p: number) => T + (-Math.max(-100, Math.min(0, p)) / 100) * (H - T - B);
  const pts = rows.map((r) => `${x(r.line).toFixed(1)},${y(r.pct).toFixed(1)}`);
  const cur = model.summary();
  const grid = [0, -50, -100].map((p) => `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 4}" y="${y(p) + 3.5}" text-anchor="end">${p === 0 ? "0" : MINUS + Math.abs(p)}%</text>`).join("");
  const ticks = [43.5, 44.5, 45.5, 46.5, 47.5].map((t) => `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`).join("");
  const cx = x(model.heatLine), cy = y(cur.exposureChangePct);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${grid}${ticks}
    <path class="area" d="M${x(43.5)},${y(0)} L${pts.join(" L")} L${x(47.5)},${y(0)} Z"/>
    <polyline class="line" points="${pts.join(" ")}"/>
    <line class="now" x1="${cx}" x2="${cx}" y1="${T}" y2="${H - B}"/>
    <circle class="dot" cx="${cx}" cy="${cy}" r="4.5"/>
    <text class="val" x="${Math.min(cx + 7, W - 60)}" y="${Math.max(cy - 7, T + 9)}">${pct(cur.exposureChangePct)}</text>
  </svg>`;
  el.setAttribute("aria-label", `Exposure change ranges from ${pct(rows[0].pct)} at 43.5 °C to ${pct(rows[rows.length - 1].pct)} at 47.5 °C`);
}

// ---------- inspector and tooltip ----------

function select(block: number) {
  state.selected = block;
  scene.selected = block;
  scene.markDirty();
  renderInspector();
  if (block >= 0 && matchMedia("(max-width: 900px)").matches) openSheet("results");
}

function renderInspector() {
  const i = state.selected;
  $("inspClose").hidden = i < 0;
  if (i < 0) {
    $("inspTitle").textContent = "Block";
    $("inspBody").innerHTML = `<p class="muted small">Select a block on the map with the Inspect tool to see what it is made of and what each measure would do there.</p>`;
    return;
  }
  const b = d.blocks, row = Math.floor(i / d.cols), col = i % d.cols;
  const t0 = model.baseline(i), t1 = model.lst(i);
  const e0 = model.exposure(i, false), e1 = model.exposure(i);
  const ground = Math.max(0, 1 - b.roofFrac[i]);
  const parts: [string, number, string][] = [
    ["Dark roof", b.darkRoofFrac[i], css(MATERIAL.dark)], ["Pale roof", b.paleRoofFrac[i], "#B9B2A2"],
    ["Dark ground", b.darkGroundFrac[i], "#55555C"], ["Sand", b.soilFrac[i], css(MATERIAL.sand)], ["Green", b.vegFrac[i], css(MATERIAL.veg)],
  ];
  const paleGround = Math.max(0, ground - b.darkGroundFrac[i] - b.soilFrac[i] - b.vegFrac[i]);
  parts.push(["Pale ground", paleGround, css(MATERIAL.pale)]);
  const growthLine = hasGrowth(d) && (b.builtFirst?.[i] ?? -1) >= 0
    ? `<dt>Building cover ${d.growth!.firstYear} → ${d.growth!.lastYear}</dt><dd>${share(b.builtFirst![i])} → ${share(b.builtLast![i])}</dd>` : "";
  const contrib = model.contributions(i);
  $("inspTitle").textContent = `Block R${String(row).padStart(2, "0")} · C${String(col).padStart(2, "0")}`;
  $("inspBody").innerHTML = `
    <div class="insp-temps">${t1 < t0 - 0.01 ? `${t0.toFixed(1)} <span class="arrow">→</span> <span class="after">${t1.toFixed(1)} °C</span>` : `${t0.toFixed(1)} °C`}</div>
    <div class="muted small">${t0 > model.heatLine ? `${(t0 - model.heatLine).toFixed(1)} °C above` : `${(model.heatLine - t0).toFixed(1)} °C below`} the heat line · surface temperature</div>
    <dl class="dl">
      <dt>Residents</dt><dd>${int(model.residents(i))}</dd>
      <dt>Heat exposure</dt><dd>${e1 < e0 - 0.5 ? `${int(e0)} → ${int(e1)}` : int(e0)} person·°C</dd>
      <dt>Mean building height</dt><dd>${b.meanHeightM[i] > 0 ? `${b.meanHeightM[i].toFixed(0)} m` : "no buildings"}</dd>
      ${growthLine}
    </dl>
    <div class="stack" aria-label="Surface shares">${parts.filter((p) => p[1] > 0.005).map(([l, v, c]) => `<span title="${l} ${share(v)}" style="width:${v * 100}%;background:${c}"></span>`).join("")}</div>
    <div class="stack-key">${parts.filter((p) => p[1] > 0.005).map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} ${share(v)}</span>`).join("")}</div>
    <div class="insp-measures">
      ${MEASURES.map((k) => {
        const ok = model.applicable(k, i);
        const on = model.getShare(k, i);
        const full = previewDelta(k, i);
        return `<div class="im-row ${ok ? "" : "na"}">
          <span class="sw ${k}"></span>
          <span>${INFO[k].name}${on > 0 ? ` · ${share(on)}` : ""}</span>
          <span class="im-eff">${ok ? `${signed(on > 0 ? contrib[k] : full, 2)} °C` : "n/a"}</span>
          ${ok ? `<button class="btn small" data-im="${k}" data-on="${on > 0}">${on > 0 ? "Remove" : "Add"}</button>` : `<span></span>`}
        </div>`;
      }).join("")}
    </div>
    <div class="btn-row"><button class="btn small" id="inspFocus">Zoom to block</button></div>`;
}

/** Effect of one measure at full adoption in a block, given its other current measures. */
function previewDelta(k: Measure, i: number): number {
  const before = model.getShare(k, i);
  model.set(k, i, 1, true);
  const v = model.contributions(i)[k];
  model.set(k, i, before, true);
  return v;
}

$("inspBody").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const b = t.closest<HTMLButtonElement>("button[data-im]");
  if (b) {
    model.checkpoint();
    model.set(b.dataset.im as Measure, state.selected, b.dataset.on === "true" ? 0 : 1);
    return;
  }
  if (t.closest("#inspFocus")) scene.focusBlock(state.selected);
});
$("inspClose").addEventListener("click", () => select(-1));

function showTooltip(block: number, x: number, y: number) {
  const tip = $("tooltip");
  if (block < 0 || !model.isValid(block) || matchMedia("(hover: none)").matches) { tip.hidden = true; return; }
  const t0 = model.baseline(block), t1 = model.lst(block);
  const e0 = model.exposure(block, false), e1 = model.exposure(block);
  const row = Math.floor(block / d.cols), col = block % d.cols;
  tip.innerHTML = `<div class="t-title"><span>R${String(row).padStart(2, "0")} · C${String(col).padStart(2, "0")}</span><span class="muted">${state.mode === "inspect" ? "click for details" : ""}</span></div>
    <div class="t-big">${t1 < t0 - 0.01 ? `${t0.toFixed(1)} → <span class="after">${t1.toFixed(1)} °C</span>` : `${t0.toFixed(1)} °C`}</div>
    <div class="t-row"><span>Residents</span><b>${int(model.residents(block))}</b></div>
    <div class="t-row"><span>Heat exposure</span><b>${e1 < e0 - 0.5 ? `${int(e0)} → ${int(e1)}` : int(e0)}</b></div>
    <div class="t-row"><span>Roofs dark / pale</span><b>${share(d.blocks.darkRoofFrac[block])} / ${share(d.blocks.paleRoofFrac[block])}</b></div>
    <div class="t-row"><span>Ground dark / sand / green</span><b>${share(d.blocks.darkGroundFrac[block])} / ${share(d.blocks.soilFrac[block])} / ${share(d.blocks.vegFrac[block])}</b></div>`;
  tip.hidden = false;
  const wrap = $("mapWrap").getBoundingClientRect();
  let left = x - wrap.left + 16, top = y - wrap.top + 16;
  if (left + 250 > wrap.width) left -= 270;
  if (top + tip.offsetHeight + 8 > wrap.height) top -= tip.offsetHeight + 28;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

// ---------- buttons, save and share ----------

function renderButtons() {
  ($("undoBtn") as HTMLButtonElement).disabled = !model.canUndo;
  ($("redoBtn") as HTMLButtonElement).disabled = !model.canRedo;
  const plan = model.hasPlan;
  ($("clearBtn") as HTMLButtonElement).disabled = !plan;
  ($("copyCodeBtn") as HTMLButtonElement).disabled = !plan;
  ($("copyCsvBtn") as HTMLButtonElement).disabled = !plan;
  ($("saveBtn") as HTMLButtonElement).disabled = !plan;
  ($("reportBtn") as HTMLButtonElement).disabled = !plan;
}

interface SavedPlan { name: string; code: string; pct: number; cost: [number, number]; blocks: number; line: number; district?: string; }
let saved: SavedPlan[] = store.get<SavedPlan[]>(STORE, []);
const savedHere = (p: SavedPlan) => (p.district ?? "nasr-city") === districtKey;

function renderSaved() {
  $("savedList").innerHTML = saved.map((p, k) => savedHere(p) ? `<li>
    <span class="s-name">${esc(p.name)}</span>
    <span class="s-meta">${pct(p.pct)} exposure · ${p.blocks} blocks · EGP ${egp(p.cost[0])}–${egp(p.cost[1])}</span>
    <span class="s-actions"><button class="btn small" data-load="${k}">Open</button><button class="btn small" data-del="${k}" aria-label="Delete ${esc(p.name)}">✕</button></span>
  </li>` : "").join("");
}

$("saveBtn").addEventListener("click", () => {
  const input = $("planName") as HTMLInputElement;
  const s = model.summary(m.heatReferenceC);
  const name = input.value.trim() || `Plan ${saved.length + 1}`;
  const entry: SavedPlan = { name, code: model.encode(), pct: s.exposureChangePct, cost: [s.cost.low, s.cost.high], blocks: s.blocksTreated, line: m.heatReferenceC, district: districtKey };
  saved = [entry, ...saved].slice(0, 12);
  store.set(STORE, saved);
  input.value = "";
  renderSaved();
  toast(`Saved “${name}”`);
});
$("planName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("saveBtn").click(); });
$("savedList").addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!t) return;
  if (t.dataset.load) { const p = saved[+t.dataset.load]; model.decode(p.code); toast(`Opened “${p.name}”`); }
  if (t.dataset.del) { const [p] = saved.splice(+t.dataset.del, 1); store.set(STORE, saved); renderSaved(); toast(`Deleted “${p.name}”`); }
});

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`);
  } catch {
    const ta = $("codeInput") as HTMLTextAreaElement;
    $("codeLoad").hidden = false;
    ta.value = text;
    ta.select();
    toast(`Select and copy the ${what} from the box`);
  }
}
$("copyCodeBtn").addEventListener("click", () => copy(model.encode(), "plan code"));
$("copyCsvBtn").addEventListener("click", () => copy(model.toCsv(), "block table (CSV)"));
$("loadCodeBtn").addEventListener("click", () => { $("codeLoad").hidden = false; ($("codeInput") as HTMLTextAreaElement).value = ""; $("codeInput").focus(); });
$("codeCancel").addEventListener("click", () => { $("codeLoad").hidden = true; $("codeError").hidden = true; });
$("codeApply").addEventListener("click", () => {
  const ok = model.decode(($("codeInput") as HTMLTextAreaElement).value);
  $("codeError").hidden = ok;
  $("codeError").textContent = model.decodeError;
  if (ok) { $("codeLoad").hidden = true; toast("Plan loaded"); }
});

// ---------- plan report ----------

let reportText = "";
$("reportBtn").addEventListener("click", () => {
  const { html, text } = buildReport(model, d, district.label, scene.snapshot(), CREDITS, model.targetingComparison(200));
  reportText = text;
  $("reportBody").innerHTML = html;
  ($("reportDlg") as HTMLDialogElement).showModal();
});
$("repCopy").addEventListener("click", () => copy(reportText, "report"));
$("repPrint").addEventListener("click", () => window.print());
$("repCsv").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([model.toCsv()], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `coolcairo-${districtKey}-plan.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("undoBtn").addEventListener("click", () => model.undo());
$("redoBtn").addEventListener("click", () => model.redo());
$("clearBtn").addEventListener("click", () => { $("clearConfirm").hidden = false; });
$("clearNo").addEventListener("click", () => { $("clearConfirm").hidden = true; });
$("clearYes").addEventListener("click", () => { model.reset(); $("clearConfirm").hidden = true; toast("Plan cleared. Undo brings it back."); });

$("autoShare").addEventListener("input", renderAutoCount);
for (const id of ["autoRoof", "autoTrees", "autoPavement", "autoPark"]) $(id).addEventListener("change", renderAutoCount);
$("autoApply").addEventListener("click", () => {
  const f = autoFraction();
  const ms = autoMeasures();
  const n = model.autoPlan(ms, f);
  const s = model.summary();
  if (state.view === "heat" || state.view === "materials") setView("risk");
  toast(`${ms.map((k) => INFO[k].name.toLowerCase()).join(" + ")} on ${n} blocks: ${pct(s.exposureChangePct)} heat exposure`);
  coachAdvance("plan");
});

$("heatLine").addEventListener("input", (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  model.setHeatLine(v);
});
$("heatLineReset").addEventListener("click", () => {
  ($("heatLine") as HTMLInputElement).value = m.heatReferenceC.toFixed(1);
  model.setHeatLine(m.heatReferenceC);
});

// Inline explanations for the "?" buttons.
const TIPS: Record<string, string> = {
  exposure: `Residents × degrees of surface temperature above the heat line (${m.heatReferenceC.toFixed(1)} °C, the typical east-Cairo urban block), summed over blocks. A screening indicator: it does not include age, housing or access to cooling.`,
  cost: `Indicative installed cost from published price ranges (51.5 EGP per USD): ${MEASURES.map((k) => `${INFO[k].name}: EGP ${COST_EGP_PER_M2[k].low}–${int(COST_EGP_PER_M2[k].high)}/m² (${COST_EGP_PER_M2[k].basis})`).join("; ")}. No Egyptian supplier quotes yet.`,
};
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.info");
  if (!b) return;
  const kpi = b.closest(".kpi")!;
  const open = kpi.querySelector(".tipbox");
  if (open) { open.remove(); return; }
  const p = document.createElement("p");
  p.className = "tipbox";
  p.textContent = TIPS[b.dataset.tip!];
  kpi.appendChild(p);
});

// ---------- dialogs ----------

const FIGURES: Record<View, { src: string; title: string; caption: string }[]> = (() => {
  const district = { src: fig2, title: "Nasr City from four angles", caption: "a: Sentinel-2 true colour. b: surface materials at 10 m. c: summer surface temperature per 90 m block (centre of the scale = typical block). d: heat exposure per block." };
  const fit = { src: fig3, title: "How well the heat model fits", caption: `Surface temperature predicted by the linear heat model against Landsat, on ${int(m.nBlocks)} urban blocks with 1 km tiles held out: R² ${m.r2SpatialCv.toFixed(2)}, ±${m.maeSpatialCv.toFixed(1)} °C. Good for comparing measures, not for predicting a single block.` };
  const hyper = { src: fig4, title: "What hyperspectral data adds", caption: `EnMAP block spectra explain surface heat at R² ${d.hyperspectral?.r2Hyperspectral.toFixed(2) ?? "0.58"} against ${d.hyperspectral?.r2Multispectral.toFixed(2) ?? "0.40"} for Sentinel-2. ${d.hyperspectral?.attribution ?? ""}.` };
  const meas = { src: fig5, title: "One measure everywhere vs a targeted plan", caption: "Cut in Nasr City heat exposure at full adoption of each measure, against cool roofs and pocket parks on the riskiest third of blocks, at the 45.7 °C heat line. The same two measures on every block also give −74%: the gain from targeting is the area saved, not a bigger cut (see “Does choosing the blocks matter?”)." };
  const growth = { src: fig6, title: "Urban growth 2016–2023", caption: "a: building growth per 90 m block across east Cairo (box: Nasr City). b: building footprint area. c: newly built blocks run about 1 °C hotter than established ones, mostly because they are sandier and less built up: allowing for cover, sand and vegetation the gap is about 0.2 °C. Open desert is hotter still." };
  return { heat: [district, fit, hyper], risk: [district, meas], materials: [district, hyper], effect: [meas, fit], growth: [growth] };
})();

let evIndex = 0;
function showFigure(k: number) {
  const list = FIGURES[state.view];
  evIndex = Math.max(0, Math.min(list.length - 1, k));
  const f = list[evIndex];
  ($("evImg") as HTMLImageElement).src = f.src;
  ($("evImg") as HTMLImageElement).alt = f.title;
  $("evTitle").textContent = f.title;
  $("evCap").textContent = f.caption + (districtKey === "nasr-city" ? "" : " These figures come from the CoolCairo report and show Nasr City and the whole east-Cairo model area.");
  $("evCount").textContent = list.length > 1 ? `${evIndex + 1} of ${list.length}` : "";
  ($("evPrev") as HTMLButtonElement).disabled = evIndex === 0;
  ($("evNext") as HTMLButtonElement).disabled = evIndex === list.length - 1;
  $("evPrev").parentElement!.hidden = list.length < 2;
}
$("evidenceBtn").addEventListener("click", () => { showFigure(0); ($("evidenceDlg") as HTMLDialogElement).showModal(); });
$("evPrev").addEventListener("click", () => showFigure(evIndex - 1));
$("evNext").addEventListener("click", () => showFigure(evIndex + 1));
$("aboutBtn").addEventListener("click", () => ($("aboutDlg") as HTMLDialogElement).showModal());
$("helpBtn").addEventListener("click", () => ($("helpDlg") as HTMLDialogElement).showModal());
for (const dlg of document.querySelectorAll<HTMLDialogElement>("dialog")) {
  dlg.addEventListener("click", (e) => { if (e.target === dlg || (e.target as HTMLElement).closest("[data-close]")) dlg.close(); });
}

function renderAbout() {
  const src = (d.sources ?? []).map((s) => `<tr><td>${esc(s.satellite)}</td><td>${esc(s.use)}</td><td class="num">${s.sceneIds.length}</td><td class="num">${s.firstDate} → ${s.lastDate}</td></tr>`).join("");
  $("aboutBody").innerHTML = `
    <h3>This district</h3>
    <p>${esc(district.note)} ${int(model.rankedByRisk().length)} blocks of ${d.blockSize} m, ${int(model.summary().residents)} residents, ${int(d.buildings.count)} mapped buildings.</p>
    <h3>What the planner computes</h3>
    <p>Every number is per 90 m block (3 × 3 Landsat pixels). Surface temperature is the median of summer 2023–25 Landsat 8/9 scenes. A measure changes a block's surface shares, and the change in temperature is a weighted sum of those shares, the same arithmetic as the CoolCairo Python analysis and the desktop app.</p>
    <ul>
      <li><b>Cool roofs and cool pavements</b> use published values (Wang, Huang &amp; Li 2020, GRL 47): ${MINUS}8 °C per unit of albedo, roofs 0.12/0.25 → 0.70, asphalt 0.12 → 0.40.</li>
      <li><b>Street trees and pocket parks</b> use the team's own regression: vegetation against dark ground (${signed(m.vegFrac - m.darkGroundFrac, 2)} °C) and against sand (${signed(m.pocketParkDeltaC, 2)} °C).</li>
      <li><b>Heat exposure</b> = residents × degrees above the heat line. The default line is ${m.heatReferenceC.toFixed(1)} °C, the median east-Cairo urban block.</li>
    </ul>
    <h3>Read the results with care</h3>
    <ul>
      <li><b>Surface, not air, temperature.</b> City-wide cool roofs lower air temperature by roughly 0.1–0.33 °C per +0.1 roof albedo; the effect on air is smaller and spreads beyond the district.</li>
      <li><b>The heat model fits modestly</b>: spatial cross-validated R² ${m.r2SpatialCv.toFixed(2)}, ±${m.maeSpatialCv.toFixed(1)} °C on ${int(m.nBlocks)} blocks. Use it to compare measures and places, not to predict one block.</li>
      <li><b>Percent cuts depend on the heat line.</b> Only ${int(model.rankedByRisk().filter((i) => model.baseline(i) > m.heatReferenceC).length)} of ${int(model.rankedByRisk().length)} blocks sit above the default line, so a cooling of about 1 °C can remove most of a block's exposure. "Felt by residents" (average °C change per resident) has no threshold and is the steadier figure to quote.</li>
      <li><b>Choosing blocks saves area, not extra cuts.</b> Exposure only counts heat above the line, so measures on blocks below it cannot change it. Cool roofs and pocket parks on the riskiest third and on every block both cut Nasr City's exposure 74%; on a random third they cut about 25%. "Does choosing the blocks matter?" shows this for any plan.</li>
      <li><b>No single ranking of measures.</b> At the default line pocket parks remove the most excess heat; per resident, with no threshold, cool roofs cool the most people. The order changes with the heat line.</li>
      <li><b>Pocket parks are probably overstated.</b> Landsat's thermal pixel is about 100 m, so a block beside open sand reads hotter than its own surfaces explain. Adding the sand share of neighbouring blocks lifts the model's R² from 0.25 to 0.37 and roughly halves the park effect (to about ${MINUS}3.3 °C per unit area). The targeted plan still cuts exposure by about two thirds.</li>
      <li><b>Cool pavements rest on published values only.</b> The model sees dark ground as no hotter than pale ground (${signed(m.darkGroundFrac, 2)} °C), so our own data neither supports nor contradicts the pavement effect.</li>
      <li><b>Dark-roof coefficient.</b> The model says dark roofs are cooler (${signed(m.darkRoofFrac, 1)} °C), which is not physical. The cause is not yet confirmed (shadow, rooftop clutter or sparse trees in the 10 m "dark" class), and dark roofs cover only about 0.5% of an urban block, so the coefficient rests on little data. Cool roofs therefore use published physics.</li>
      <li><b>Water.</b> Trees and pocket parks need irrigation, which is not modelled; drought-tolerant planting on treated wastewater uses far less.</li>
      <li><b>Costs are indicative</b>, from international and Egyptian price ranges; there are no supplier quotes yet.</li>
      <li><b>Residents are modelled</b> (WorldPop 2024, not a census), and vulnerability (age, housing, access to cooling) is not included.</li>
      <li><b>Buildings come from OpenStreetMap</b>, which maps only part of Cairo's roofs. ${districtKey === "nasr-city" ? "Heights are per footprint (Google Open Buildings 2.5D, OSM tags)." : "In this district, heights are OSM tags where present, otherwise the block's mean height from Google Open Buildings; blocks with few mapped buildings still have full heat and resident data."}</li>
    </ul>
    <h3>Satellite scenes behind this district</h3>
    <div class="table-wrap"><table><thead><tr><th>Sensor</th><th>Used for</th><th>Scenes</th><th>Dates</th></tr></thead><tbody>${src}</tbody></table></div>
    <h3>Credits</h3>
    <p class="small">${CREDITS}</p>
    <p class="small muted">CoolCairo, Team 46 (Egypt), Arab Youth Space Hackathon 2026. Code MIT; data keep their own licences.</p>`;
}

const CREDITS = [
  "Landsat 8/9 surface temperature: USGS",
  "Contains modified Copernicus Sentinel data [2023–2025]",
  d.hyperspectral?.available ? d.hyperspectral.attribution : "",
  "Residents: WorldPop 2024 (CC BY 4.0)",
  "Buildings: © OpenStreetMap contributors (ODbL), Google Open Buildings 2.5D Temporal (CC BY 4.0)",
  "Data access: Microsoft Planetary Computer, DLR EOC Geoservice",
].filter(Boolean).join(" · ");

// ---------- coach (first visit) ----------

const COACH = [
  { id: "read", title: "Read the map", body: "Each square is a 90 m block. Orange blocks are hotter than the typical east-Cairo block, blue ones cooler. Hover a block for its numbers." },
  { id: "plan", title: "Try a targeted plan", body: "Press Apply targeted plan on the left. It puts cool roofs and pocket parks on the riskiest third of blocks and shows the result on the right.", target: "autoApply" },
  { id: "paint", title: "Then paint by hand", body: "Pick a measure, drag across blocks, and watch the heat exposure card. Ctrl+Z undoes a stroke. The heat line chart shows how much the result depends on where “too hot” starts." },
];
let coachStep = 0;
function showCoach() {
  const c = COACH[coachStep];
  $("coachStep").innerHTML = `<h3>${c.title}</h3><p>${c.body}</p>`;
  $("coachCount").textContent = `${coachStep + 1} / ${COACH.length}`;
  $("coachNext").textContent = coachStep === COACH.length - 1 ? "Start planning" : "Next";
  document.querySelectorAll(".pulse-target").forEach((e) => e.classList.remove("pulse-target"));
  if (c.target) {
    $(c.target).classList.add("pulse-target");
    if (matchMedia("(max-width: 900px)").matches) openSheet("plan");
  }
  $("coach").hidden = false;
}
function endCoach() {
  $("coach").hidden = true;
  document.querySelectorAll(".pulse-target").forEach((e) => e.classList.remove("pulse-target"));
  store.set("coolcairo.coached", true);
}
function coachAdvance(id: string) {
  if ($("coach").hidden) return;
  const k = COACH.findIndex((c) => c.id === id);
  if (k >= coachStep) { coachStep = k + 1; if (coachStep >= COACH.length) endCoach(); else showCoach(); }
}
$("coachNext").addEventListener("click", () => { coachStep++; if (coachStep >= COACH.length) endCoach(); else showCoach(); });
$("coachSkip").addEventListener("click", endCoach);

// ---------- toast ----------

let toastTimer = 0;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3200);
}

// ---------- theme ----------

function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--map-bg").trim() || "#0a0f14";
  scene.setBackground(bg);
}
$("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  store.set("coolcairo.theme", root.dataset.theme);
  applyTheme();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// ---------- mobile sheets ----------

function openSheet(which: "plan" | "results" | "map") {
  $("planPanel").classList.toggle("open", which === "plan");
  $("resultsPanel").classList.toggle("open", which === "results");
  for (const b of document.querySelectorAll<HTMLButtonElement>("#sheetTabs button")) b.setAttribute("aria-pressed", String(b.dataset.sheet === which));
}
$("sheetTabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  const which = b.dataset.sheet as "plan" | "results" | "map";
  openSheet(b.getAttribute("aria-pressed") === "true" && which !== "map" ? "map" : which);
});

// ---------- map controls ----------

let is2D = false, buildingsOn = true;
$("zoomIn").addEventListener("click", () => scene.zoom(0.7));
$("zoomOut").addEventListener("click", () => scene.zoom(1.4));
$("homeBtn").addEventListener("click", () => scene.setDefaultView(true));
function toggle2D() {
  is2D = !is2D;
  scene.set2D(is2D);
  $("dimBtn").textContent = is2D ? "3D" : "2D";
  $("dimBtn").setAttribute("aria-pressed", String(is2D));
}
$("dimBtn").addEventListener("click", toggle2D);
function toggleSatellite() {
  scene.setSatellite(!scene.satellite);
  $("satBtn").setAttribute("aria-pressed", String(scene.satellite));
  toast(scene.satellite ? "Satellite photo on: Sentinel-2, summer 2023–25 composite" : "Satellite photo off");
}
$("satBtn").addEventListener("click", toggleSatellite);
$("bldBtn").addEventListener("click", () => {
  buildingsOn = !buildingsOn;
  scene.setBuildingsVisible(buildingsOn);
  $("bldBtn").setAttribute("aria-pressed", String(buildingsOn));
});

// ---------- wiring ----------

$("viewSeg").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-view]");
  if (b) setView(b.dataset.view as View);
});
$("modeSeg").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
  if (b) setMode(b.dataset.mode as Interaction);
});
$("measureList").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-measure]");
  if (b) setMeasure(b.dataset.measure as Measure);
});
$("strengthSeg").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-strength]");
  if (!b) return;
  state.strength = Number(b.dataset.strength);
  for (const x of document.querySelectorAll<HTMLButtonElement>("#strengthSeg button")) x.setAttribute("aria-checked", String(x === b));
  setMode(state.mode);
});
$("brushSize").addEventListener("input", (e) => setRadius(Number((e.target as HTMLInputElement).value)));

document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.querySelector("dialog[open]")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) model.redo(); else model.undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); model.redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const views: View[] = ["heat", "risk", "materials", "effect", "growth"];
  if (k >= "1" && k <= "5") setView(views[Number(k) - 1]);
  else if (k === "v") setMode("inspect");
  else if (k === "b") setMode("paint");
  else if (k === "x") setMode("erase");
  else if (k === "q") setMeasure("roof");
  else if (k === "w") setMeasure("trees");
  else if (k === "e") setMeasure("pavement");
  else if (k === "r") setMeasure("park");
  else if (k === "[") setRadius(state.radius - 1);
  else if (k === "]") setRadius(state.radius + 1);
  else if (k === "m") toggle2D();
  else if (k === "s" && district.photo) toggleSatellite();
  else if (k === "?") ($("helpDlg") as HTMLDialogElement).showModal();
  else if (k === "escape") select(-1);
});

// Everything that depends on the plan or the heat line re-renders here.
model.onChange(() => {
  const lineMoved = Math.abs(model.heatLine - m.heatReferenceC) > 0.04;
  $("heatLineOut").textContent = `${model.heatLine.toFixed(1)} °C`;
  $("heatLineReset").hidden = !lineMoved;
  scene.refresh(false);
  renderKpis();
  renderButtons();
  renderLegend();
  renderInspector();
  if (lastPointer.block >= 0) showTooltip(lastPointer.block, lastPointer.x, lastPointer.y);
  coachAdvance(model.hasPlan ? "plan" : "");
});

// ---------- start ----------

const theme = store.get<string | null>("coolcairo.theme", null);
if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
const sel = $("districtSelect") as HTMLSelectElement;
sel.innerHTML = Object.entries(DISTRICTS).map(([k, v]) => `<option value="${k}"${k === districtKey ? " selected" : ""}>${esc(v.label)} · east Cairo</option>`).join("");
sel.title = district.note;
sel.addEventListener("change", () => {
  store.set("coolcairo.district", sel.value);
  location.hash = sel.value;
  location.reload();
});
if (district.photo) {
  scene.setBasemap(district.photo);
  $("satBtn").hidden = false;
}
for (const el of document.querySelectorAll<HTMLElement>("[data-hosted]")) el.hidden = !HOSTED;
if (!HOSTED) $("reportNote").textContent = "Copy the report into an email or document. Printing and downloads work when the planner is hosted on a website.";
$("modelChip").textContent = `Heat model R² ${m.r2SpatialCv.toFixed(2)} · ±${m.maeSpatialCv.toFixed(1)} °C · ${int(m.nBlocks)} blocks`;
$("credits").textContent = CREDITS;
($("heatLine") as HTMLInputElement).value = m.heatReferenceC.toFixed(1);
$("heatLineOut").textContent = `${m.heatReferenceC.toFixed(1)} °C`;
if (!hasGrowth(d)) document.querySelector<HTMLElement>('[data-view="growth"]')!.hidden = true;
renderMeasures();
renderAbout();
renderSaved();
renderAutoCount();
setRadius(1);
setMode("inspect");
applyTheme();
setView("heat");
renderKpis();
renderButtons();
scene.refresh(false);
scene.intro();
requestAnimationFrame(() => $("loading").classList.add("done"));
if (window.innerWidth < 900) scene.setShadows(false);
if (!store.get("coolcairo.coached", false)) setTimeout(showCoach, 1400);

// For automated checks and the browser console.
Object.assign(window, { coolcairo: { model, scene, setView, select } });
