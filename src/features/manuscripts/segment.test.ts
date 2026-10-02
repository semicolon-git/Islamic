import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { estimatePitch, otsu, segmentLines, smooth } from "./segment";
import { bbox, hOverlap, vIoU, type Polygon } from "./geometry";

const DATA = path.join(process.cwd(), "data/manuscripts");

/** Line-detection recall against the dataset's ground-truth main-text lines (vertical IoU ≥ 0.5). */
async function recallOn(ms: string, pageId: string) {
  const page = JSON.parse(fs.readFileSync(path.join(DATA, ms, "pages", `${pageId}.json`), "utf8"));
  const { data, info } = await sharp(path.join(DATA, ms, "pages", `${pageId}.jpg`)).greyscale().resize({ width: 1000 }).raw().toBuffer({ resolveWithObject: true });
  const r = segmentLines(data, info.width, info.height);
  const sc = page.width / info.width;
  const found = r.lines.map((l) => ({ x: l.x * sc, y: l.y * sc, w: l.w * sc, h: l.h * sc }));
  const main = new Set(page.regions.filter((g: { type: string }) => g.type === "main").map((g: { id: string }) => g.id));
  const gt = page.lines.filter((l: { region_id: string }) => main.has(l.region_id)).map((l: { polygon: Polygon }) => bbox(l.polygon));
  const hits = gt.filter((g: ReturnType<typeof bbox>) => found.some((d) => vIoU(d, g) >= 0.5 && hOverlap(d, g) > 0.3 * g.w)).length;
  return { recall: hits / gt.length, gt: gt.length, detected: found.length, precision: hits / Math.max(1, found.length) };
}

describe("segmentation primitives", () => {
  it("otsu splits a bimodal histogram", () => {
    const px = [...new Array(500).fill(30), ...new Array(500).fill(220)];
    const t = otsu(px);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });
  it("smooth keeps length and averages", () => {
    expect(smooth([0, 3, 0], 3)).toEqual([1.5, 1, 1.5]);
  });
  it("estimates the period of a synthetic line profile", () => {
    const prof = Array.from({ length: 600 }, (_, y) => (y % 40 < 14 ? 1 : 0));
    expect(estimatePitch(smooth(prof, 5), 8, 120)).toBe(40);
  });
  it("finds lines on a synthetic page", () => {
    const w = 400, h = 600;
    const g = new Uint8Array(w * h).fill(235);
    for (let line = 0; line < 10; line++)
      for (let y = 100 + line * 40; y < 112 + line * 40; y++) for (let x = 60; x < 340; x++) if ((x >> 2) % 3 === 0) g[y * w + x] = 20; // ~33% ink, like a dense text row
    const r = segmentLines(g, w, h);
    expect(r.lines).toHaveLength(10);
    expect(r.pitch).toBe(40);
    expect(r.lines[0].x).toBeLessThanOrEqual(64);
  });
  it("returns no lines for a blank page", () => {
    expect(segmentLines(new Uint8Array(200 * 300).fill(240), 200, 300).lines).toEqual([]);
  });
});

describe("segmentation on real dataset pages (vs ground-truth lines)", () => {
  const pages: [string, string, number][] = [
    ["umich-isl-22", "umich-isl-22_02", 0.85],
    ["sbb-or-fol-215", "sbb-or-fol-215_01", 0.85],
    ["bnf-arabe-5341", "bnf-arabe-5341_01", 0.85],
  ];
  for (const [ms, page, min] of pages)
    it(`${page}: line-detection recall ≥ ${min}`, async () => {
      const r = await recallOn(ms, page);
      console.log(`[segment] ${page}: recall ${r.recall.toFixed(2)} (${r.gt} GT main lines, ${r.detected} detected, precision ${r.precision.toFixed(2)})`);
      expect(r.recall).toBeGreaterThanOrEqual(min);
    });
});
