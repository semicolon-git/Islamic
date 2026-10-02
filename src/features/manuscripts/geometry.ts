/** Polygon and layout helpers (image pixel coordinates). Pure, shared by client and server. */
export type Pt = [number, number];
export type Polygon = Pt[];
export interface Box { x: number; y: number; w: number; h: number }

export function bbox(poly: Polygon): Box {
  if (!poly.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const rectPolygon = (b: Box): Polygon => [
  [Math.round(b.x), Math.round(b.y)],
  [Math.round(b.x + b.w), Math.round(b.y)],
  [Math.round(b.x + b.w), Math.round(b.y + b.h)],
  [Math.round(b.x), Math.round(b.y + b.h)],
];

export const toPoints = (poly: Polygon) => poly.map(([x, y]) => `${x},${y}`).join(" ");

export const center = (poly: Polygon): Pt => {
  const b = bbox(poly);
  return [b.x + b.w / 2, b.y + b.h / 2];
};

export function pointInPolygon([px, py]: Pt, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Map a polygon from one bounding box to another (move and/or resize, keeping its shape). */
export function fitPolygon(poly: Polygon, to: Box): Polygon {
  const from = bbox(poly);
  const sx = from.w ? to.w / from.w : 1, sy = from.h ? to.h / from.h : 1;
  return poly.map(([x, y]) => [Math.round(to.x + (x - from.x) * sx), Math.round(to.y + (y - from.y) * sy)] as Pt);
}

export const clampBox = (b: Box, w: number, h: number): Box => {
  const x = Math.max(0, Math.min(b.x, w)), y = Math.max(0, Math.min(b.y, h));
  return { x, y, w: Math.max(1, Math.min(b.w, w - x)), h: Math.max(1, Math.min(b.h, h - y)) };
};

/** Normalise a drag rectangle (any direction) into a box. */
export const boxFromPoints = (a: Pt, b: Pt): Box => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });

export function padBox(b: Box, pad: number, w: number, h: number): Box {
  return clampBox({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, w, h);
}

/** Vertical intersection-over-union of two boxes (line detection evaluation). */
export function vIoU(a: Box, b: Box): number {
  const inter = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const union = Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y);
  return union > 0 ? inter / union : 0;
}

export const hOverlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));

/** Region whose polygon contains the point (smallest first, so margins nested in a page block win). */
export function regionAt<R extends { id: string; polygon: Polygon }>(regions: R[], pt: Pt): R | null {
  const hits = regions.filter((r) => pointInPolygon(pt, r.polygon));
  hits.sort((a, b) => bbox(a.polygon).w * bbox(a.polygon).h - bbox(b.polygon).w * bbox(b.polygon).h);
  return hits[0] ?? null;
}

/** Reading order: by region (region seq), then line seq. Lines without a region come last. */
export function orderLines<L extends { region_id: string | null; seq: number }, R extends { id: string; seq: number }>(lines: L[], regions: R[]): L[] {
  const rs = new Map(regions.map((r) => [r.id, r.seq]));
  const key = (l: L) => (l.region_id && rs.has(l.region_id) ? rs.get(l.region_id)! : Number.MAX_SAFE_INTEGER);
  return [...lines].sort((a, b) => key(a) - key(b) || a.seq - b.seq);
}

export type Turn = "none" | "cw" | "ccw";

/** Marginal glosses are often written vertically; turn their crop so the line reads horizontally (memo §1.3). */
export function autoTurn(polygon: Polygon, baseline?: Polygon | null): Turn {
  const b = bbox(polygon);
  if (b.h < b.w * 1.6) return "none";
  if (baseline && baseline.length >= 2) {
    const dy = baseline[baseline.length - 1][1] - baseline[0][1];
    if (dy > 0) return "ccw";
  }
  return "cw";
}
