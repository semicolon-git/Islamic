// Turns the plan model into colours for each block and building in the current view.
// Shared by the 3D map, the legend and the block inspector, so all three always agree.

import {
  EFFECT_RAMP, GROWTH, HEAT_RAMPS, MATERIAL, mix, NO_DATA, NO_EXCESS_HEAT, NO_RESIDENTS, RISK_RAMP,
  type HeatPalette, type RGB, type View,
} from "./colors";
import { hasGrowth } from "./data";
import type { PlanModel } from "./model";

const percentile = (sorted: number[], p: number) => sorted[Math.floor(p * (sorted.length - 1))];

export class Colorizer {
  view: View = "heat";
  palette: HeatPalette = "report";
  readonly heatMin: number;
  readonly heatMax: number;
  /** Person·°C at the top of the risk scale: fixed to the baseline at the analysis heat line,
   *  so colours visibly drop while a plan is painted. */
  riskMax: number;
  /** Strongest cooling on the effect scale (°C, positive). */
  readonly effectMax = 3;

  constructor(private model: PlanModel) {
    const temps: number[] = [];
    for (let i = 0; i < model.n; i++) if (model.isValid(i)) temps.push(model.baseline(i));
    temps.sort((a, b) => a - b);
    this.heatMin = temps.length ? percentile(temps, 0.02) : 30;
    this.heatMax = temps.length ? percentile(temps, 0.98) : 50;
    this.riskMax = this.computeRiskMax();
  }

  computeRiskMax(): number {
    const e: number[] = [];
    for (let i = 0; i < this.model.n; i++) {
      const v = this.model.exposure(i, false);
      if (v > 0) e.push(v);
    }
    e.sort((a, b) => a - b);
    this.riskMax = e.length ? Math.max(1, percentile(e, 0.98)) : 1;
    return this.riskMax;
  }

  /** Position of a temperature on the heat legend (0..1). */
  heatT(lst: number): number {
    if (this.palette !== "report") return (lst - this.heatMin) / (this.heatMax - this.heatMin);
    // Report: the grey middle sits on the heat line; the wider side sets the scale.
    const ref = this.model.heatLine;
    const span = Math.max(0.1, Math.max(ref - this.heatMin, this.heatMax - ref));
    return 0.5 + (lst - ref) / (2 * span);
  }

  heat(lst: number): RGB {
    return HEAT_RAMPS[this.palette](this.heatT(lst));
  }

  risk(i: number): RGB {
    const m = this.model;
    if (!m.isValid(i)) return NO_DATA;
    if (m.residents(i) < 1) return NO_RESIDENTS;
    const e = m.exposure(i);
    return e <= 0 ? NO_EXCESS_HEAT : RISK_RAMP(e / this.riskMax);
  }

  effect(i: number): RGB {
    const d = this.model.delta(i);
    if (d > -0.005) return EFFECT_RAMP(0);
    return EFFECT_RAMP(0.12 + 0.88 * Math.min(1, -d / this.effectMax));
  }

  growth(i: number): RGB {
    const d = this.model.d;
    if (!hasGrowth(d)) return NO_DATA;
    return GROWTH[d.blocks.growthClass![i]] ?? NO_DATA;
  }

  /** Ground colour of a block in the current view. */
  ground(i: number): RGB {
    const m = this.model;
    if (this.view === "growth") return this.growth(i);
    if (!m.isValid(i)) return NO_DATA;
    switch (this.view) {
      case "heat": return this.heat(m.lst(i));
      case "risk": return this.risk(i);
      case "effect": return this.effect(i);
      case "materials": {
        const b = m.d.blocks;
        const groundShare = Math.max(1e-4, 1 - b.roofFrac[i]);
        const planted = m.treePlanted(i), coated = m.pavementCoated(i), greened = m.parkGreened(i);
        const clamp = (v: number) => Math.min(1, Math.max(0, v));
        const veg = clamp((b.vegFrac[i] + planted + greened) / groundShare);
        const dark = clamp((b.darkGroundFrac[i] - planted - coated) / groundShare);
        const paved = clamp(coated / groundShare);
        const sand = clamp((b.soilFrac[i] - greened) / groundShare);
        const pale = Math.max(0, 1 - veg - dark - paved - sand);
        const c: RGB = [0, 0, 0];
        for (const [col, w] of [[MATERIAL.pale, pale], [MATERIAL.dark, dark], [MATERIAL.coolPavement, paved], [MATERIAL.sand, sand], [MATERIAL.veg, veg]] as const) {
          c[0] += col[0] * w; c[1] += col[1] * w; c[2] += col[2] * w;
        }
        return c;
      }
    }
  }

  /** Roof and wall colours for a building standing in block i. */
  building(i: number): { roof: RGB; wall: RGB } {
    const m = this.model;
    if (this.view === "materials") {
      const b = m.d.blocks;
      const darkShare = b.roofFrac[i] > 0 ? b.darkRoofFrac[i] / b.roofFrac[i] : 0;
      let roof = mix(MATERIAL.pale, MATERIAL.dark, darkShare);
      roof = mix(roof, MATERIAL.coolRoof, m.getShare("roof", i));
      return { roof, wall: MATERIAL.wall };
    }
    const roof = this.ground(i);
    return { roof, wall: [roof[0] * 0.82, roof[1] * 0.82, roof[2] * 0.82] };
  }
}
