/**
 * Automatic line segmentation for an uploaded page (no ML, deterministic, fast).
 *
 *  1. Binarise with Otsu's threshold (ink = dark).
 *  2. Detect the text block from the column ink profile (longest dense run of columns), ignoring frame rules.
 *  3. Horizontal projection profile inside the block; estimate the line pitch by autocorrelation.
 *  4. Lines = profile peaks at least ~0.6 pitch apart; boundaries at the valleys between peaks.
 *  5. Each line's horizontal extent is trimmed to its own ink (short last lines of a paragraph stay short).
 *
 * Works on a greyscale raster; the server scales results back to the stored image. Marginal glosses written
 * obliquely are out of scope: draw them by hand with the layout tools (memo §1.3: "layout fails before recognition").
 */
import type { Box } from "./geometry";

export interface SegLine extends Box { baseline: number }
export interface SegResult { block: Box | null; pitch: number; lines: SegLine[]; threshold: number }

export function otsu(gray: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

export function smooth(a: number[], win: number): number[] {
  const r = Math.max(0, Math.floor(win / 2));
  if (!r) return a.slice();
  const pre = new Array<number>(a.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) pre[i + 1] = pre[i] + a[i];
  return a.map((_, i) => {
    const lo = Math.max(0, i - r), hi = Math.min(a.length, i + r + 1);
    return (pre[hi] - pre[lo]) / (hi - lo);
  });
}

const percentile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0;
};

/** Longest run of indices where pred holds, allowing internal gaps up to maxGap. */
function longestRun(n: number, pred: (i: number) => boolean, maxGap: number): [number, number] | null {
  let best: [number, number] | null = null, start = -1, lastOn = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && pred(i);
    if (on) {
      if (start < 0) start = i;
      else if (i - lastOn - 1 > maxGap) {
        if (!best || lastOn - start > best[1] - best[0]) best = [start, lastOn];
        start = i;
      }
      lastOn = i;
    }
  }
  if (start >= 0 && (!best || lastOn - start > best[1] - best[0])) best = [start, lastOn];
  return best;
}

/** Estimate the dominant period of a profile (the line pitch) by autocorrelation. */
export function estimatePitch(profile: number[], minLag: number, maxLag: number): number {
  const n = profile.length;
  const mean = profile.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const d = profile.map((v) => v - mean);
  const ac: number[] = [];
  for (let lag = 0; lag <= Math.min(maxLag + 1, n - 1); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += d[i] * d[i + lag];
    ac[lag] = s / (n - lag);
  }
  const locals: number[] = [];
  for (let lag = Math.max(1, minLag); lag < ac.length - 1; lag++) if (ac[lag] > 0 && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) locals.push(lag);
  if (!locals.length) return minLag;
  const gmax = Math.max(...locals.map((l) => ac[l]));
  // The first strong local maximum is the pitch; later ones are its multiples.
  return locals.find((l) => ac[l] >= 0.7 * gmax) ?? locals[0];
}

export function segmentLines(gray: ArrayLike<number>, w: number, h: number): SegResult {
  const thr = Math.min(otsu(gray), 200);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = gray[i] <= thr ? 1 : 0;

  // Column profile over the central 90% of rows (drop scan borders top/bottom).
  const y0 = Math.floor(h * 0.05), y1 = Math.ceil(h * 0.95);
  const col = new Array<number>(w).fill(0);
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) col[x] += ink[y * w + x];
  // Vertical rules and dark scan edges: columns that are ink over most of the height carry no text.
  const colFrac = col.map((c) => c / (y1 - y0));
  const colClean = colFrac.map((f) => (f > 0.55 ? 0 : f));
  const colS = smooth(colClean, Math.max(3, Math.round(w / 60)));
  const colThr = Math.max(0.01, 0.3 * percentile(colS, 0.9));
  const run = longestRun(w, (x) => colS[x] > colThr, Math.round(w / 40));
  if (!run) return { block: null, pitch: 0, lines: [], threshold: thr };
  const bx0 = run[0], bx1 = run[1] + 1, bw = bx1 - bx0;

  // Row profile inside the block; horizontal rules (very dense rows) are removed.
  const row = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = bx0; x < bx1; x++) c += ink[y * w + x];
    const f = c / bw;
    row[y] = f > 0.6 ? 0 : f;
  }
  const pitch = Math.max(6, estimatePitch(smooth(row, 3), Math.max(6, Math.round(h / 90)), Math.round(h / 6)));
  const prof = smooth(row, Math.max(3, Math.round(pitch / 3)));
  const maxV = Math.max(...prof);
  if (maxV <= 0) return { block: null, pitch, lines: [], threshold: thr };

  // Peaks: highest first, suppress neighbours closer than 0.6 pitch.
  const cand: number[] = [];
  for (let y = 1; y < h - 1; y++) if (prof[y] >= prof[y - 1] && prof[y] > prof[y + 1] && prof[y] > 0.22 * maxV) cand.push(y);
  cand.sort((a, b) => prof[b] - prof[a]);
  const peaks: number[] = [];
  for (const y of cand) if (peaks.every((p) => Math.abs(p - y) >= 0.6 * pitch)) peaks.push(y);
  peaks.sort((a, b) => a - b);

  // Keep the main stack of lines: drop isolated peaks far from the rest (stamps, footers).
  const kept = peaks.filter((p, i) => {
    const near = (q: number | undefined) => q !== undefined && Math.abs(q - p) < 2.6 * pitch;
    return near(peaks[i - 1]) || near(peaks[i + 1]) || peaks.length === 1;
  });

  const lines: SegLine[] = [];
  kept.forEach((p, i) => {
    const prevP = kept[i - 1], nextP = kept[i + 1];
    const valley = (a: number, b: number) => {
      let m = a, mv = Infinity;
      for (let y = a; y <= b; y++) if (prof[y] < mv) { mv = prof[y]; m = y; }
      return m;
    };
    const top = prevP !== undefined && p - prevP < 1.6 * pitch ? valley(prevP, p) : Math.max(0, Math.round(p - 0.62 * pitch));
    const bot = nextP !== undefined && nextP - p < 1.6 * pitch ? valley(p, nextP) : Math.min(h - 1, Math.round(p + 0.45 * pitch));
    // Horizontal extent from this band's own ink.
    const bandCols = new Array<number>(bw).fill(0);
    for (let y = top; y <= bot; y++) for (let x = bx0; x < bx1; x++) bandCols[x - bx0] += ink[y * w + x];
    const bs = smooth(bandCols.map((c) => (c >= 1 ? 1 : 0)), Math.max(3, Math.round(pitch / 2)));
    const inkCols = bs.map((v, i2) => (v > 0.15 ? i2 : -1)).filter((v) => v >= 0);
    if (!inkCols.length) return;
    const lx0 = bx0 + inkCols[0], lx1 = bx0 + inkCols[inkCols.length - 1] + 1;
    const fill = bandCols.reduce((s, v) => s + v, 0) / ((bot - top + 1) * bw);
    if (fill < 0.01 || lx1 - lx0 < pitch) return;
    lines.push({ x: lx0, y: top, w: lx1 - lx0, h: bot - top, baseline: p });
  });
  const by0 = lines.length ? Math.min(...lines.map((l) => l.y)) : 0;
  const by1 = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) : 0;
  return { block: lines.length ? { x: bx0, y: by0, w: bw, h: by1 - by0 } : null, pitch, lines, threshold: thr };
}
