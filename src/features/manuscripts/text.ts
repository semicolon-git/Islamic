/**
 * Unicode hygiene for manuscript transcription (research memo §3.5, M15).
 * Pure functions, shared by client and server.
 *
 * - NFC on store; shadda + vowel in either order normalise to the same string.
 * - Presentation forms (U+FB50–FDFF, U+FE70–FEFF) are decomposed to base letters, except deliberately chosen
 *   signs: ﷺ-type honorific ligatures (U+FDFA–FDFD) and the ornate parentheses ﴾ ﴿ (U+FD3E/FD3F).
 * - Persian ی (U+06CC) and ک (U+06A9) become Arabic ي/ك unless the hand is Persian.
 * - Bidi controls are never stored in token text.
 */

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const PRESENTATION = /[ﭐ-ﷹ﷾-﷿ﹰ-﻿]/g;
const KEEP_PRESENTATION = /[﴾﴿ﷺ-﷽]/;

export interface NormalizeResult {
  text: string;
  changes: ("bidi" | "presentation" | "persian" | "nfc")[];
}

export function normalizeStoreText(input: string, opts: { persianHand?: boolean } = {}): NormalizeResult {
  const changes = new Set<NormalizeResult["changes"][number]>();
  let s = input;
  if (new RegExp(BIDI.source).test(s)) {
    changes.add("bidi");
    s = s.replace(BIDI, "");
  }
  if (new RegExp(PRESENTATION.source).test(s)) {
    s = s.replace(PRESENTATION, (ch) => {
      if (KEEP_PRESENTATION.test(ch)) return ch;
      changes.add("presentation");
      return ch.normalize("NFKC");
    });
  }
  if (!opts.persianHand && /[یک]/.test(s)) {
    changes.add("persian");
    s = s.replace(/ی/g, "ي").replace(/ک/g, "ك");
  }
  const nfc = s.normalize("NFC");
  if (nfc !== s) changes.add("nfc");
  return { text: nfc, changes: [...changes] };
}

/** Arabic diacritics (tashkil), Quranic annotation marks, dagger alef and tatweel. */
export const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g;

export const stripDiacritics = (s: string) => s.normalize("NFC").replace(DIACRITICS, "");

/** Fold letter variants that scribes and transcribers use interchangeably (hamza seats, alef maqsura, ta marbuta). */
export const foldLetters = (s: string) =>
  s
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه");

/**
 * Text form used for CER, matching the dataset's own scoring (data/manuscripts/README.md):
 * diacritics and tatweel stripped, punctuation, separators and digits removed, whitespace collapsed. Spaces count.
 */
export function cerForm(s: string, fold = false): string {
  let t = stripDiacritics(s ?? "");
  if (fold) t = foldLetters(t);
  return t
    .replace(/\[…\]|\[\.\.\.\]/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/[0-9٠-٩۰-۹]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Search form: no tashkil, unified letters, digits mapped to ASCII. */
export function searchForm(s: string): string {
  return foldLetters(stripDiacritics(s))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance (O(n·m) time, O(m) memory). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const A = [...a], B = [...b];
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = new Array<number>(B.length + 1);
  let cur = new Array<number>(B.length + 1);
  for (let j = 0; j <= B.length; j++) prev[j] = j;
  for (let i = 1; i <= A.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[B.length];
}

/** Character error rate of a hypothesis against a reference, on the CER form. null when the reference is empty. */
export function cer(hyp: string, ref: string, fold = false): number | null {
  const r = cerForm(ref, fold);
  const h = cerForm(hyp, fold);
  if (!r.length) return null;
  return levenshtein(h, r) / [...r].length;
}

/** Character totals so page-level CER is weighted by reference length (Σ distance / Σ ref chars). */
export function cerParts(hyp: string, ref: string, fold = false): { dist: number; chars: number } {
  const r = cerForm(ref, fold);
  const h = cerForm(hyp, fold);
  return { dist: levenshtein(h, r), chars: [...r].length };
}

export type DiffPart = { op: "equal" | "insert" | "delete"; text: string };

/** Character-level diff (LCS) from a to b, for "theirs vs mine" and "ground truth vs current". */
export function diffChars(a: string, b: string): DiffPart[] {
  const A = [...a], B = [...b];
  const n = A.length, m = B.length;
  // Bound the work for very long inputs: fall back to a coarse replace.
  if (n * m > 400_000) return [{ op: "delete", text: a }, { op: "insert", text: b }].filter((p) => p.text) as DiffPart[];
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (op: DiffPart["op"], ch: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ch;
    else out.push({ op, text: ch });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("equal", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("delete", A[i]); i++; }
    else { push("insert", B[j]); j++; }
  }
  while (i < n) push("delete", A[i++]);
  while (j < m) push("insert", B[j++]);
  return out;
}

/** Words typed inline that are really manuscript marks («صح», «كذا», «بلغ»). Marks are not text (memo §2.1, §7.3 D). */
export function detectTypedMarks(s: string): string[] {
  const found: string[] = [];
  const words = stripDiacritics(s).split(/\s+/);
  for (const w of words) if (["صح", "كذا", "بلغ"].includes(w) && !found.includes(w)) found.push(w);
  return found;
}
