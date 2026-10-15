// TypeScript port of analysis/src/coolcairo/interventions.py and the Unity InterventionModel.cs.
// Pure arithmetic on the coefficients in district.json: no model solving in the browser.
// test/model.test.ts checks it against the numbers the Python analysis publishes.
// All temperatures are land SURFACE temperature (Landsat LST), not air temperature.

import { blockCount, type District } from "./data";

export type Measure = "roof" | "trees" | "pavement" | "park";
export const MEASURES: Measure[] = ["roof", "trees", "pavement", "park"];

export interface PlanSummary {
  meanBefore: number;
  meanAfter: number;
  /** Mean surface temperature change over residents (°C): the threshold-free headline. */
  residentWeightedDelta: number;
  exposureBefore: number;
  exposureAfter: number;
  exposureChangePct: number;
  residents: number;
  residentsCooled: number;
  /** Residents of cooled blocks that were above the heat line before the plan. */
  residentsCooledAbove: number;
  blocksTreated: number;
  areaM2: Record<Measure, number>;
  cost: { low: number; high: number };
}

/** Indicative installed cost (EGP per m² converted), from docs/intervention_research.md
 *  at 51.5 EGP per USD. Ranges are wide on purpose: no Egyptian supplier quotes yet. */
export const COST_EGP_PER_M2: Record<Measure, { low: number; high: number; basis: string }> = {
  roof: { low: 80, high: 1400, basis: "Reflective roof coating, $1.6–27/m² (US prices)" },
  trees: { low: 309, high: 3090, basis: "Established street tree, $150–1,500 each, one per 25 m² of canopy" },
  pavement: { low: 88, high: 1944, basis: "Reflective pavement coating, $1.70–37.75/m² (typical $7)" },
  park: { low: 90, high: 400, basis: "Grass to native-plant landscaping, EGP 90–400/m² installed" },
};

const MAX_UNDO = 60;

export class PlanModel {
  readonly d: District;
  readonly n: number;
  /** Per measure, per block: 0..1 of that measure's full adoption within its cap. */
  private share: Record<Measure, Float32Array>;
  private undoStack: Record<Measure, Float32Array>[] = [];
  private redoStack: Record<Measure, Float32Array>[] = [];
  private listeners = new Set<() => void>();
  /** Reference ("typical block") temperature for heat exposure. Defaults to the analysis value. */
  heatLine: number;
  version = 0;
  /** Why the last decode() failed, for the interface. */
  decodeError = "";

  constructor(d: District, readonly districtKey = "nasr-city") {
    this.d = d;
    this.n = blockCount(d);
    this.share = this.emptyShares();
    this.heatLine = d.model.heatReferenceC;
  }

  private emptyShares(): Record<Measure, Float32Array> {
    return {
      roof: new Float32Array(this.n),
      trees: new Float32Array(this.n),
      pavement: new Float32Array(this.n),
      park: new Float32Array(this.n),
    };
  }

  private clone(): Record<Measure, Float32Array> {
    return {
      roof: this.share.roof.slice(),
      trees: this.share.trees.slice(),
      pavement: this.share.pavement.slice(),
      park: this.share.park.slice(),
    };
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---------- caps and block quantities ----------

  get treeMax() { return this.d.model.treeMaxShare > 0 ? this.d.model.treeMaxShare : 0.25; }
  get parkMax() { return this.d.model.parkMaxShare > 0 ? this.d.model.parkMaxShare : 0.5; }

  isValid(i: number) { return this.d.blocks.valid[i] === 1; }
  getShare(m: Measure, i: number) { return this.share[m][i]; }
  baseline(i: number) { return this.d.blocks.lstC[i]; }
  residents(i: number) { return this.isValid(i) ? Math.max(0, this.d.blocks.population[i]) : 0; }

  /** Block-area shares changed by each measure. */
  roofCoated(i: number) { return this.share.roof[i] * (this.d.blocks.darkRoofFrac[i] + this.d.blocks.paleRoofFrac[i]); }
  treePlanted(i: number) { return this.share.trees[i] * this.treeMax * this.d.blocks.darkGroundFrac[i]; }
  /** Pavements coat the dark ground that trees have not taken. */
  pavementCoated(i: number) { return this.share.pavement[i] * (this.d.blocks.darkGroundFrac[i] - this.treePlanted(i)); }
  parkGreened(i: number) { return this.share.park[i] * this.parkMax * this.d.blocks.soilFrac[i]; }

  /** Whether a measure can do anything in this block (e.g. no roofs → no cool roofs). */
  applicable(m: Measure, i: number): boolean {
    const b = this.d.blocks;
    if (!this.isValid(i)) return false;
    switch (m) {
      case "roof": return b.darkRoofFrac[i] + b.paleRoofFrac[i] > 1e-4;
      case "trees":
      case "pavement": return b.darkGroundFrac[i] > 1e-4;
      case "park": return b.soilFrac[i] > 1e-4;
    }
  }

  /** ΔLST (°C, negative = cooler) of each measure in one block. */
  contributions(i: number): Record<Measure, number> {
    if (!this.isValid(i)) return { roof: 0, trees: 0, pavement: 0, park: 0 };
    const b = this.d.blocks, m = this.d.model;
    return {
      roof: this.share.roof[i] * (m.coolRoofDarkDeltaC * b.darkRoofFrac[i] + m.coolRoofPaleDeltaC * b.paleRoofFrac[i]),
      trees: (m.vegFrac - m.darkGroundFrac) * this.treePlanted(i),
      pavement: m.coolPavementDeltaC * this.pavementCoated(i),
      park: m.pocketParkDeltaC * this.parkGreened(i),
    };
  }

  delta(i: number): number {
    const c = this.contributions(i);
    return c.roof + c.trees + c.pavement + c.park;
  }

  lst(i: number) { return this.baseline(i) + this.delta(i); }

  exposure(i: number, withPlan = true, line = this.heatLine): number {
    if (!this.isValid(i)) return 0;
    const t = withPlan ? this.lst(i) : this.baseline(i);
    return this.residents(i) * Math.max(0, t - line);
  }

  treated(i: number) { return MEASURES.some((m) => this.share[m][i] >= 0.01); }
  get hasPlan() { return MEASURES.some((m) => this.share[m].some((v) => v > 0)); }

  // ---------- editing ----------

  /** Call once before a group of edits (a brush stroke, an auto-plan) so it undoes as one step. */
  checkpoint() {
    this.undoStack.push(this.clone());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Drop the last checkpoint if nothing changed since (an empty stroke). */
  dropCheckpointIfUnchanged(versionAtCheckpoint: number) {
    if (this.version === versionAtCheckpoint) this.undoStack.pop();
  }

  /** Set a block's share for a measure (0..1). Returns true if anything changed. */
  set(m: Measure, i: number, value: number, silent = false): boolean {
    if (i < 0 || i >= this.n || !this.isValid(i)) return false;
    const v = Math.min(1, Math.max(0, value));
    if (Math.abs(this.share[m][i] - v) < 1e-6) return false;
    this.share[m][i] = v;
    if (!silent) this.emit();
    return true;
  }

  setMany(m: Measure, blocks: number[], value: number): boolean {
    let changed = false;
    for (const i of blocks) changed = this.set(m, i, value, true) || changed;
    if (changed) this.emit();
    return changed;
  }

  /** Remove every measure from these blocks. */
  eraseMany(blocks: number[]): boolean {
    let changed = false;
    for (const i of blocks) for (const m of MEASURES) changed = this.set(m, i, 0, true) || changed;
    if (changed) this.emit();
    return changed;
  }

  reset() {
    if (!this.hasPlan) return;
    this.checkpoint();
    this.share = this.emptyShares();
    this.emit();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.clone());
    this.share = prev;
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.clone());
    this.share = next;
    this.emit();
  }

  setHeatLine(c: number) {
    this.heatLine = c;
    this.emit();
  }

  // ---------- planning helpers ----------

  /** Valid blocks ranked by baseline heat exposure, ties broken by surface temperature
   *  (hottest first): the ranking interventions.targeted_plan_delta uses. */
  rankedByRisk(line = this.d.model.heatReferenceC): number[] {
    const idx: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.isValid(i)) idx.push(i);
    return idx
      .map((i, order) => ({ i, e: this.exposure(i, false, line), t: this.baseline(i), order }))
      .sort((a, b) => b.e - a.e || b.t - a.t || a.order - b.order)
      .map((r) => r.i);
  }

  /** Replace the plan: the chosen measures at full adoption on the riskiest `fraction` of blocks. */
  autoPlan(measures: Measure[], fraction: number) {
    const ranked = this.rankedByRisk(this.heatLine);
    const chosen = ranked.slice(0, Math.floor(ranked.length * fraction));
    this.checkpoint();
    this.share = this.emptyShares();
    for (const m of measures) for (const i of chosen) this.share[m][i] = 1;
    this.emit();
    return chosen.length;
  }

  // ---------- summaries ----------

  summary(line = this.heatLine): PlanSummary {
    let sumBefore = 0, sumAfter = 0, nValid = 0, eB = 0, eA = 0, res = 0, cooled = 0, cooledAbove = 0, wDelta = 0, treated = 0;
    const area: Record<Measure, number> = { roof: 0, trees: 0, pavement: 0, park: 0 };
    const blockArea = this.d.blockSize * this.d.blockSize;
    for (let i = 0; i < this.n; i++) {
      if (!this.isValid(i)) continue;
      const dl = this.delta(i), r = this.residents(i), t0 = this.baseline(i);
      nValid++;
      sumBefore += t0;
      sumAfter += t0 + dl;
      eB += r * Math.max(0, t0 - line);
      eA += r * Math.max(0, t0 + dl - line);
      res += r;
      wDelta += r * dl;
      if (dl < -0.01) { cooled += r; if (t0 > line) cooledAbove += r; }
      if (this.treated(i)) treated++;
      area.roof += this.roofCoated(i) * blockArea;
      area.trees += this.treePlanted(i) * blockArea;
      area.pavement += this.pavementCoated(i) * blockArea;
      area.park += this.parkGreened(i) * blockArea;
    }
    let low = 0, high = 0;
    for (const m of MEASURES) {
      low += area[m] * COST_EGP_PER_M2[m].low;
      high += area[m] * COST_EGP_PER_M2[m].high;
    }
    return {
      meanBefore: nValid ? sumBefore / nValid : 0,
      meanAfter: nValid ? sumAfter / nValid : 0,
      residentWeightedDelta: res ? wDelta / res : 0,
      exposureBefore: eB,
      exposureAfter: eA,
      exposureChangePct: eB > 0 ? (100 * (eA - eB)) / eB : 0,
      residents: res,
      residentsCooled: cooled,
      residentsCooledAbove: cooledAbove,
      blocksTreated: treated,
      areaM2: area,
      cost: { low, high },
    };
  }

  /** Exposure change (%) of the current plan for a range of heat lines: how much the
   *  headline depends on where "too hot" starts. */
  sensitivity(lines: number[]): { line: number; pct: number; before: number }[] {
    return lines.map((line) => {
      const s = this.summary(line);
      return { line, pct: s.exposureChangePct, before: s.exposureBefore };
    });
  }

  /** Measures in the current plan (at least 1% adoption somewhere). */
  planMeasures(): Measure[] {
    return MEASURES.filter((m) => this.share[m].some((v) => v >= 0.01));
  }

  /** Summary of a hypothetical plan: these measures at full adoption on these blocks.
   *  Leaves the current plan untouched. */
  scenario(measures: Measure[], blocks: number[]): PlanSummary {
    const saved = this.share;
    this.share = this.emptyShares();
    for (const m of measures) for (const i of blocks) if (this.isValid(i)) this.share[m][i] = 1;
    const s = this.summary();
    this.share = saved;
    return s;
  }

  /** How much does choosing the blocks matter? The current plan's measures on every block, only
   *  on the blocks above the heat line, and on random sets of the same size (median of draws). */
  targetingComparison(draws = 200): { label: string; summary: PlanSummary; note?: string }[] | null {
    const measures = this.planMeasures();
    const treated = [...Array(this.n).keys()].filter((i) => this.treated(i));
    if (!measures.length || !treated.length) return null;
    const valid = [...Array(this.n).keys()].filter((i) => this.isValid(i));
    const above = valid.filter((i) => this.baseline(i) > this.heatLine && this.residents(i) >= 1);
    // Seeded shuffle, so the comparison is the same on every run.
    let seed = 20261015;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const randomRuns: PlanSummary[] = [];
    for (let k = 0; k < draws; k++) {
      const pool = valid.slice();
      for (let j = pool.length - 1; j > 0; j--) { const r = Math.floor(rand() * (j + 1)); [pool[j], pool[r]] = [pool[r], pool[j]]; }
      randomRuns.push(this.scenario(measures, pool.slice(0, treated.length)));
    }
    randomRuns.sort((a, b) => a.exposureChangePct - b.exposureChangePct);
    const median = randomRuns[Math.floor(randomRuns.length / 2)];
    const lo = randomRuns[Math.floor(0.05 * randomRuns.length)].exposureChangePct;
    const hi = randomRuns[Math.floor(0.95 * randomRuns.length)].exposureChangePct;
    return [
      { label: "Your plan", summary: this.summary() },
      { label: `Only the ${above.length} blocks above the line`, summary: this.scenario(measures, above) },
      { label: "Every block", summary: this.scenario(measures, valid) },
      { label: `${treated.length} random blocks`, summary: median, note: `median of ${draws} draws; 90% between \u2212${Math.abs(Math.round(lo))}% and \u2212${Math.abs(Math.round(hi))}%` },
    ];
  }

  // ---------- serialisation ----------

  /** Compact plan code: district, then per measure the non-zero blocks as index[.percent]. */
  encode(): string {
    const parts = MEASURES.map((m) => {
      const items: string[] = [];
      this.share[m].forEach((v, i) => { if (v > 0) items.push(`${i.toString(36)}${v >= 0.995 ? "" : "." + Math.round(v * 100)}`); });
      return items.join(",");
    });
    return `CC2|${this.districtKey}|` + parts.join("|");
  }

  decode(code: string): boolean {
    let parts = code.trim().split("|");
    // CC1 codes (first web release) carry no district and are always Nasr City.
    if (parts[0] === "CC1") parts = ["CC2", "nasr-city", ...parts.slice(1)];
    if (parts[0] !== "CC2" || parts.length !== MEASURES.length + 2) {
      this.decodeError = "That is not a CoolCairo plan code. Codes start with CC2|.";
      return false;
    }
    if (parts[1] !== this.districtKey) {
      this.decodeError = `That plan is for another district (${parts[1]}). Switch district first.`;
      return false;
    }
    const next = this.emptyShares();
    for (let k = 0; k < MEASURES.length; k++) {
      const field = parts[k + 2];
      if (!field) continue;
      for (const item of field.split(",")) {
        const [idx, pct] = item.split(".");
        const i = parseInt(idx, 36);
        const v = pct === undefined ? 1 : Number(pct) / 100;
        if (!/^[0-9a-z]+$/.test(idx) || i >= this.n || !Number.isFinite(v)) {
          this.decodeError = "That plan code is damaged. Copy it again from the source.";
          return false;
        }
        next[MEASURES[k]][i] = Math.min(1, Math.max(0, v));
      }
    }
    this.decodeError = "";
    this.checkpoint();
    this.share = next;
    this.emit();
    return true;
  }

  /** Plan as CSV, one row per treated block, for a spreadsheet or GIS join. */
  toCsv(): string {
    const b = this.d.blocks;
    const rows = ["block,row,col,easting,northing,cool_roof_pct,street_trees_pct,cool_pavement_pct,pocket_park_pct,lst_before_c,lst_after_c,residents,exposure_before,exposure_after"];
    for (let i = 0; i < this.n; i++) {
      if (!this.treated(i)) continue;
      const r = Math.floor(i / this.d.cols), c = i % this.d.cols;
      const e = this.d.originX + (c + 0.5) * this.d.blockSize, nn = this.d.originY + (r + 0.5) * this.d.blockSize;
      rows.push([
        i, r, c, e.toFixed(0), nn.toFixed(0),
        ...MEASURES.map((m) => Math.round(this.share[m][i] * 100)),
        b.lstC[i].toFixed(2), this.lst(i).toFixed(2), this.residents(i).toFixed(0),
        this.exposure(i, false).toFixed(1), this.exposure(i).toFixed(1),
      ].join(","));
    }
    return rows.join("\n");
  }
}
