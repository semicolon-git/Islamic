// The plan report: a one-page summary a planner can paste into an email or print.
// Built from the same PlanModel numbers as the results panel.

import type { District } from "./data";
import { COST_EGP_PER_M2, MEASURES, type Measure, type PlanModel, type PlanSummary } from "./model";

type Comparison = { label: string; summary: PlanSummary; note?: string }[] | null;

const MINUS = "−";
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const signed = (v: number, digits = 1) => (v < -1e-9 ? MINUS : v > 1e-9 ? "+" : "") + Math.abs(v).toFixed(digits);
const pct = (v: number) => `${v < -0.5 ? MINUS : v > 0.5 ? "+" : ""}${Math.abs(Math.round(v))}%`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export function egp(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)} bn`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return int(v);
}

export const MEASURE_NAME: Record<Measure, string> = {
  roof: "Cool roofs", trees: "Street trees", pavement: "Cool pavements", park: "Pocket parks",
};

const blockId = (d: District, i: number) => `R${String(Math.floor(i / d.cols)).padStart(2, "0")}·C${String(i % d.cols).padStart(2, "0")}`;

export function buildReport(model: PlanModel, d: District, districtLabel: string, mapUrl: string, credits: string, comparison: Comparison = null) {
  const ha = (s: PlanSummary) => Object.values(s.areaM2).reduce((a, b) => a + b, 0) / 1e4;
  const s = model.summary();
  const line = model.heatLine;
  const blockArea = d.blockSize * d.blockSize;

  // Per measure: blocks, area, cost, resident-weighted cooling.
  const rows = MEASURES.map((k) => {
    let blocks = 0, wsum = 0;
    for (let i = 0; i < model.n; i++) {
      if (model.getShare(k, i) >= 0.01) blocks++;
      wsum += model.residents(i) * model.contributions(i)[k];
    }
    const area = s.areaM2[k];
    return { k, blocks, area, low: area * COST_EGP_PER_M2[k].low, high: area * COST_EGP_PER_M2[k].high, perResident: s.residents ? wsum / s.residents : 0 };
  }).filter((r) => r.blocks > 0);

  // Threshold sensitivity around the current heat line.
  const lines = [line - 1, line - 0.5, line, line + 0.5, line + 1].map((v) => +v.toFixed(1));
  const sens = model.sensitivity(lines);

  // Blocks where the plan removes the most heat exposure.
  const top = [];
  for (let i = 0; i < model.n; i++) {
    if (!model.treated(i)) continue;
    const e0 = model.exposure(i, false), e1 = model.exposure(i);
    top.push({ i, removed: e0 - e1, e0, e1, t0: model.baseline(i), t1: model.lst(i), r: model.residents(i),
      ms: MEASURES.filter((k) => model.getShare(k, i) >= 0.01) });
  }
  top.sort((a, b) => b.removed - a.removed || a.t1 - a.t0 - (b.t1 - b.t0));
  const top10 = top.slice(0, 10);

  const date = new Date().toISOString().slice(0, 10);
  const caveats = [
    "Land surface temperature (Landsat, summer 2023–25 median), not air temperature.",
    `Heat model fits modestly (spatial cross-validated R² ${d.model.r2SpatialCv.toFixed(2)}, ±${d.model.maeSpatialCv.toFixed(1)} °C): compare options, do not predict single blocks.`,
    "Cool roofs and cool pavements use published values; street trees and pocket parks use the CoolCairo regression.",
    "The pocket-park effect is likely overstated: allowing for sand in neighbouring blocks roughly halves it. Water for planting is not modelled.",
    "Percent cuts in heat exposure depend on the heat line (see the sensitivity row); the change felt per resident does not.",
    "Costs are indicative installed ranges from published prices; no Egyptian supplier quotes yet.",
  ];

  const html = `
  <div class="rep-head">
    <div><div class="rep-title">Cooling plan · ${esc(districtLabel)}</div>
    <div class="muted small">${date} · ${s.blocksTreated} of ${model.rankedByRisk().length} blocks of ${d.blockSize} m · heat line ${line.toFixed(1)} °C · CoolCairo planner</div></div>
  </div>
  <div class="rep-grid">
    ${mapUrl ? `<img src="${mapUrl}" alt="Map of the plan">` : ""}
    <div>
      <h3>Result</h3>
      <table>
        <tr><th></th><th class="n">Today</th><th class="n">With plan</th></tr>
        <tr><td>Heat exposure (person·°C)</td><td class="n">${int(s.exposureBefore)}</td><td class="n">${int(s.exposureAfter)} (${pct(s.exposureChangePct)})</td></tr>
        <tr><td>Average surface temperature</td><td class="n">${s.meanBefore.toFixed(2)} °C</td><td class="n">${s.meanAfter.toFixed(2)} °C</td></tr>
        <tr><td>Change felt per resident</td><td class="n">—</td><td class="n">${signed(s.residentWeightedDelta, 2)} °C</td></tr>
        <tr><td>Residents in treated blocks</td><td class="n">—</td><td class="n">${int(s.residentsCooled)} (${int(s.residentsCooledAbove)} above the line)</td></tr>
        <tr><td>Indicative cost (EGP)</td><td class="n">—</td><td class="n">${egp(s.cost.low)}–${egp(s.cost.high)}</td></tr>
      </table>
      <h3 style="margin-top:14px">Heat-line sensitivity</h3>
      <table>
        <tr>${sens.map((r) => `<th class="n">${r.line.toFixed(1)} °C</th>`).join("")}</tr>
        <tr>${sens.map((r) => `<td class="n">${pct(r.pct)}</td>`).join("")}</tr>
      </table>
    </div>
  </div>
  ${comparison ? `<div>
    <h3>Does choosing the blocks matter?</h3>
    <div class="table-wrap"><table>
      <tr><th>Same measures on…</th><th class="n">Exposure</th><th class="n">Area treated</th><th class="n">Cost, EGP</th></tr>
      ${comparison.map((r) => `<tr><td>${esc(r.label)}${r.note ? ` <span class="muted">(${esc(r.note)})</span>` : ""}</td><td class="n">${pct(r.summary.exposureChangePct)}</td><td class="n">${ha(r.summary).toFixed(1)} ha</td><td class="n">${egp(r.summary.cost.low)}–${egp(r.summary.cost.high)}</td></tr>`).join("")}
    </table></div>
  </div>` : ""}
  <div>
    <h3>Measures</h3>
    <div class="table-wrap"><table>
      <tr><th>Measure</th><th class="n">Blocks</th><th class="n">Area treated</th><th class="n">Cost, EGP</th><th class="n">Per resident</th></tr>
      ${rows.map((r) => `<tr><td>${MEASURE_NAME[r.k]}</td><td class="n">${r.blocks}</td><td class="n">${int(r.area)} m²</td><td class="n">${egp(r.low)}–${egp(r.high)}</td><td class="n">${signed(r.perResident, 2)} °C</td></tr>`).join("")}
    </table></div>
  </div>
  <div>
    <h3>Blocks where the plan removes the most heat exposure</h3>
    <div class="table-wrap"><table>
      <tr><th>Block</th><th>Measures</th><th class="n">Surface °C</th><th class="n">Residents</th><th class="n">Exposure</th></tr>
      ${top10.map((b) => `<tr><td class="n" style="text-align:left">${blockId(d, b.i)}</td><td>${b.ms.map((k) => MEASURE_NAME[k]).join(", ")}</td><td class="n">${b.t0.toFixed(1)} → ${b.t1.toFixed(1)}</td><td class="n">${int(b.r)}</td><td class="n">${int(b.e0)} → ${int(b.e1)}</td></tr>`).join("")}
    </table></div>
  </div>
  <div><h3>Read with care</h3><ul>${caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
  <p class="muted small">${esc(credits)}. Block area ${int(blockArea)} m².</p>`;

  const text = [
    `Cooling plan · ${districtLabel} (${date})`,
    `${s.blocksTreated} blocks treated · heat line ${line.toFixed(1)} °C · CoolCairo planner`,
    "",
    `Heat exposure: ${int(s.exposureBefore)} → ${int(s.exposureAfter)} person·°C (${pct(s.exposureChangePct)})`,
    `Average surface temperature: ${s.meanBefore.toFixed(2)} → ${s.meanAfter.toFixed(2)} °C`,
    `Change felt per resident: ${signed(s.residentWeightedDelta, 2)} °C`,
    `Residents in treated blocks: ${int(s.residentsCooled)} of ${int(s.residents)} (${int(s.residentsCooledAbove)} above the heat line)`,
    `Indicative cost: EGP ${egp(s.cost.low)}–${egp(s.cost.high)}`,
    `Sensitivity: ${sens.map((r) => `${r.line.toFixed(1)} °C ${pct(r.pct)}`).join(" · ")}`,
    ...(comparison ? ["", "Does choosing the blocks matter? Same measures on:",
      ...comparison.map((r) => `- ${r.label}: ${pct(r.summary.exposureChangePct)} exposure, ${ha(r.summary).toFixed(1)} ha${r.note ? ` (${r.note})` : ""}`)] : []),
    "",
    "Measures:",
    ...rows.map((r) => `- ${MEASURE_NAME[r.k]}: ${r.blocks} blocks, ${int(r.area)} m², EGP ${egp(r.low)}–${egp(r.high)}, ${signed(r.perResident, 2)} °C per resident`),
    "",
    "Top blocks by exposure removed:",
    ...top10.map((b) => `- ${blockId(d, b.i)} (${b.ms.map((k) => MEASURE_NAME[k]).join(", ")}): ${b.t0.toFixed(1)} → ${b.t1.toFixed(1)} °C, ${int(b.r)} residents, exposure ${int(b.e0)} → ${int(b.e1)}`),
    "",
    "Read with care:",
    ...caveats.map((c) => `- ${c}`),
    "",
    `Plan code: ${model.encode()}`,
    credits,
  ].join("\n");

  return { html, text };
}
