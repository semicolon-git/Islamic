// Parity with the Python analysis: the numbers in results/summary.md and the README
// (Nasr City, 576 blocks of 90 m, heat line 45.7 °C).
import { describe, expect, it } from "vitest";
import raw from "../src/assets/district.json";
import { parseDistrict } from "../src/data";
import { MEASURES, PlanModel, type Measure } from "../src/model";

const district = parseDistrict(raw);
const fresh = () => new PlanModel(district);

describe("baseline", () => {
  it("matches the published district totals", () => {
    const s = fresh().summary();
    expect(s.residents).toBeCloseTo(95141, -1);
    expect(s.exposureBefore).toBeCloseTo(6460, -1);
    expect(s.meanBefore).toBeCloseTo(44.75, 1);
    expect(s.exposureChangePct).toBe(0);
  });
});

describe("targeted plan: cool roofs + pocket parks on the riskiest third", () => {
  const m = fresh();
  const blocks = m.autoPlan(["roof", "park"], 1 / 3);
  const s = m.summary();
  it("treats 192 blocks", () => expect(blocks).toBe(192));
  it("cuts heat exposure 6,460 → 1,686 person·°C (−74%)", () => {
    expect(s.exposureAfter).toBeCloseTo(1686, -1);
    expect(Math.round(s.exposureChangePct)).toBe(-74);
  });
  it("cools 22,588 residents' blocks", () => expect(s.residentsCooled).toBeCloseTo(22588, -1));
  it("lowers the district mean 44.7 → 44.3 °C", () => expect(s.meanAfter).toBeCloseTo(44.3, 1));
  it("is about −0.32 °C weighted by residents", () => expect(s.residentWeightedDelta).toBeCloseTo(-0.32, 2));
});

describe("one measure in every block", () => {
  const expected: Record<Measure, number> = { roof: -41, trees: -24, pavement: -52, park: -60 };
  for (const measure of MEASURES) {
    it(`${measure}: ${expected[measure]}%`, () => {
      const m = fresh();
      m.autoPlan([measure], 1);
      expect(Math.round(m.summary().exposureChangePct)).toBe(expected[measure]);
    });
  }
});

describe("editing", () => {
  it("undo and redo restore plans", () => {
    const m = fresh();
    m.checkpoint();
    m.set("roof", 100, 1);
    const after = m.summary().exposureAfter;
    m.undo();
    expect(m.hasPlan).toBe(false);
    m.redo();
    expect(m.summary().exposureAfter).toBe(after);
  });

  it("pavements only coat ground trees have not taken", () => {
    const m = fresh();
    const i = district.blocks.darkGroundFrac.findIndex((v, k) => v > 0.2 && district.blocks.valid[k] === 1);
    m.set("pavement", i, 1);
    const full = m.pavementCoated(i);
    m.set("trees", i, 1);
    expect(m.pavementCoated(i)).toBeCloseTo(full * (1 - m.treeMax), 5);
  });

  it("plan codes round-trip", () => {
    const a = fresh();
    a.autoPlan(["roof", "trees"], 0.2);
    a.set("park", 5, 0.5);
    const b = fresh();
    expect(b.decode(a.encode())).toBe(true);
    expect(b.summary()).toEqual(a.summary());
    expect(b.decode("garbage")).toBe(false);
  });

  it("the headline depends on the heat line", () => {
    const m = fresh();
    m.autoPlan(["roof", "park"], 1 / 3);
    const [low, , high] = m.sensitivity([43.7, 45.7, 47.7]).map((r) => r.pct);
    expect(low).toBeGreaterThan(-40);
    expect(high).toBeLessThan(-95);
  });
});
