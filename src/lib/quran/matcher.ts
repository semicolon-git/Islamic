import { diffTokens, levenshtein, skeleton } from "./normalize";

/**
 * Find Quranic passages in arbitrary Arabic text (OCR'd inscription, typed quote, manuscript line).
 * TS port of prep/scripts/match_inscription.py (same behaviour, same test cases).
 *   exact     — appears verbatim after normalisation; every location listed
 *   near      — close but different (misquote, OCR noise, swapped words); show canonical + differences
 *   none      — nothing close enough: say so, never guess
 *   too_short — fewer than MIN_CHARS letters; a phrase cannot identify a verse
 */
export interface VerseRow {
  key: string;
  sura: number;
  aya: number;
  text_emlaey: string;
  text_uthmani: string;
  sura_name_ar: string;
  sura_name_en: string;
}
export interface MatchLocation {
  verses: string[];
  partial: boolean;
  sura_name_ar: string;
  sura_name_en: string;
  canonical_uthmani: string[];
}
export interface NearCandidate extends MatchLocation {
  similarity: number;
  differences: { op: string; given: string; quran: string }[];
}
export type MatchResult =
  | { status: "exact"; input: string; locations: MatchLocation[] }
  | { status: "near"; input: string; candidates: NearCandidate[] }
  | { status: "none"; input: string }
  | { status: "too_short"; input: string };

export const MIN_CHARS = 8;
export const NEAR_THRESHOLD = 0.82;
const PREFIXES = new Set(["و", "ف", "ب", "ل"]);

export interface QuranIndex {
  toks: string[];
  tokKey: number[]; // index into verses
  starts: number[];
  G: string;
  verses: VerseRow[];
  byToken: Map<string, number[]>;
}

export function buildIndex(verses: VerseRow[]): QuranIndex {
  const toks: string[] = [];
  const tokKey: number[] = [];
  verses.forEach((v, vi) => {
    for (const t of skeleton(v.text_emlaey).split(" ")) {
      if (!t) continue;
      toks.push(t);
      tokKey.push(vi);
    }
  });
  const starts: number[] = [];
  let off = 0;
  for (const t of toks) {
    starts.push(off);
    off += t.length;
  }
  const byToken = new Map<string, number[]>();
  toks.forEach((t, i) => {
    const arr = byToken.get(t);
    if (arr) arr.push(i);
    else byToken.set(t, [i]);
  });
  return { toks, tokKey, starts, G: toks.join(""), verses, byToken };
}

function tokAt(ix: QuranIndex, charOff: number) {
  let lo = 0, hi = ix.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ix.starts[mid] <= charOff) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function span(ix: QuranIndex, t0: number, t1: number): MatchLocation {
  const vis: number[] = [];
  for (let i = t0; i <= t1; i++) if (vis.at(-1) !== ix.tokKey[i]) vis.push(ix.tokKey[i]);
  const wholeFirst = t0 === 0 || ix.tokKey[t0 - 1] !== vis[0];
  const wholeLast = t1 === ix.toks.length - 1 || ix.tokKey[t1 + 1] !== vis.at(-1);
  const first = ix.verses[vis[0]];
  return {
    verses: vis.map((v) => ix.verses[v].key),
    partial: !(wholeFirst && wholeLast),
    sura_name_ar: first.sura_name_ar,
    sura_name_en: first.sura_name_en,
    canonical_uthmani: vis.map((v) => ix.verses[v].text_uthmani),
  };
}

function exactHits(ix: QuranIndex, q: string): [number, number][] {
  const hits: [number, number][] = [];
  let i = ix.G.indexOf(q);
  while (i !== -1) {
    const t0 = tokAt(ix, i);
    const okStart = i === ix.starts[t0] || (i === ix.starts[t0] + 1 && PREFIXES.has(ix.G[ix.starts[t0]]));
    const end = i + q.length;
    const t1 = tokAt(ix, end - 1);
    const okEnd = end === ix.starts[t1] + ix.toks[t1].length;
    if (okStart && okEnd) hits.push([t0, t1]);
    i = ix.G.indexOf(q, i + 1);
  }
  return hits;
}

const stripW = (t: string) => (t.length > 2 && (t[0] === "و" || t[0] === "ف") ? t.slice(1) : t);
function bagRatio(a: string[], b: string[]) {
  const ca = new Map<string, number>();
  for (const t of a.map(stripW)) ca.set(t, (ca.get(t) ?? 0) + 1);
  let inter = 0;
  const cb = new Map<string, number>();
  for (const t of b.map(stripW)) cb.set(t, (cb.get(t) ?? 0) + 1);
  for (const [t, n] of cb) inter += Math.min(n, ca.get(t) ?? 0);
  return inter / Math.max(a.length, b.length);
}
function charRatio(a: string, b: string) {
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function nearHits(ix: QuranIndex, qtoks: string[], q: string) {
  const votes = new Map<number, number>();
  qtoks.forEach((t, j) => {
    for (const pos of (ix.byToken.get(t) ?? []).slice(0, 2000)) votes.set(pos - j, (votes.get(pos - j) ?? 0) + 1);
  });
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  const n = qtoks.length;
  const scored: [number, number, number][] = [];
  for (const [start] of top) {
    for (let s = Math.max(0, start - 2); s <= start + 2; s++) {
      for (let len = Math.max(1, n - 2); len <= n + 2; len++) {
        const e = Math.min(ix.toks.length - 1, s + len - 1);
        const wt = ix.toks.slice(s, e + 1);
        const r = Math.max(charRatio(q, wt.join("")), bagRatio(qtoks, wt));
        scored.push([r, s, e]);
      }
    }
  }
  scored.sort((a, b) => b[0] - a[0]);
  const out: [number, number, number][] = [];
  for (const [r, s, e] of scored) {
    if (r < NEAR_THRESHOLD) break;
    if (out.some(([, s2]) => Math.abs(s - s2) < 3)) continue;
    out.push([r, s, e]);
    if (out.length === 3) break;
  }
  return out;
}

export function matchQuran(ix: QuranIndex, text: string): MatchResult {
  const nt = skeleton(text);
  const q = nt.replace(/ /g, "");
  const qtoks = nt.split(" ").filter(Boolean);
  if (q.length < MIN_CHARS) return { status: "too_short", input: text };
  const hits = exactHits(ix, q);
  if (hits.length) return { status: "exact", input: text, locations: hits.map(([a, b]) => span(ix, a, b)) };
  const near = nearHits(ix, qtoks, q);
  if (near.length)
    return {
      status: "near",
      input: text,
      candidates: near.map(([r, s, e]) => ({
        ...span(ix, s, e),
        similarity: Math.round(r * 1000) / 1000,
        differences: diffTokens(qtoks, ix.toks.slice(s, e + 1))
          .filter((d) => d.op !== "equal")
          .map((d) => ({ op: d.op, given: d.a.join(" "), quran: d.b.join(" ") })),
      })),
    };
  return { status: "none", input: text };
}
