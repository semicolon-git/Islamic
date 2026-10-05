/** Arabic normalisation shared by matching, search and comparison. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ‌-‏]/g;

/** Strip diacritics/Quranic marks/tatweel and unify letter variants. Keeps alef. */
export function normalizeArabic(s: string): string {
  return s
    .normalize("NFC")
    // Uthmani rasm writes a long ā on a bare waw seat (ٱلصَّلَوٰةَ, صَلَوٰتَكَ, كَمِشۡكَوٰةٖ, ٱلرِّبَوٰاْ); standard spelling has alef
    // (الصلاة, صلاتك, كمشكاة, الربا). Only a waw with no vowel of its own (dagger directly after it), so ٱلسَّمَٰوَٰتِ stays السموات.
    .replace(/وٰ(?:[ۡۖ-ۭ]*)ا/g, "ا")
    .replace(/وٰ/g, "ا")
    // Alef maqṣūra with a dagger alef inside a word is a plain alef in standard spelling (ءَاتَىٰهُمُ = آتاهم, ٱلتَّوۡرَىٰةَ = التوراة).
    .replace(/ىٰ(?=[ً-ْٰۖ-ۭ]*[ء-ي])/g, "ا")
    // The small high yeh is a real yā' (إِبۡرَٰهِـۧمَ = إبراهيم, ٱلنَّبِيِّـۧنَ = النبيين).
    .replace(/ۧ/g, "ي")
    .replace(MARKS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ء/g, "")
    .replace(/[^ء-ي ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Letter skeleton for matching only: spelling-agnostic between the Uthmani mushaf and standard (imlā'ī) orthography.
 * On top of normalizeArabic it drops alef and hamza seats on yā' (شَيۡـًٔا / شيئا, يَسۡتَهۡزِءُونَ / يستهزئون), reduces a final
 * hamza-on-waw + alef to alef (نَبَؤُاْ / نبأ), compares a final open tā' as tā' marbūṭa (رَحۡمَتِ / رحمة), and writes doubled letters once (ٱلَّيۡلَ / الليل, ٱلنَّبِيِّـۧنَ / النبيين).
 * A full sweep of the KFGQPC text checks that every verse in Uthmani script matches itself (normalize.test.ts).
 */
export function skeleton(s: string): string {
  const pre = s
    .normalize("NFC")
    .replace(/ئ/g, "ء")
    .replace(/ؤ[ً-ْٰۖ-ۭ]*ا(?=[ً-ْٰۖ-ۭ]*(?:\s|$))/g, "ا");
  return normalizeArabic(pre)
    .replace(/ا/g, "")
    // Open tā' (نِعۡمَتَ, رَحۡمَتِ) vs tā' marbūṭa (نعمة, رحمة): same word, so a word-final ت compares as ه.
    .replace(/ت(?= |$)/g, "ه")
    .replace(/([^ ])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasArabic(s: string) {
  return /[؀-ۿ]/.test(s);
}

/** Levenshtein distance (iterative, O(n·m) time, O(m) memory). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Character error rate of hypothesis vs. reference (both normalised). */
export function cer(hyp: string, ref: string): number {
  const r = normalizeArabic(ref).replace(/ /g, "");
  const h = normalizeArabic(hyp).replace(/ /g, "");
  if (!r.length) return h.length ? 1 : 0;
  return levenshtein(h, r) / r.length;
}

/** Token-level diff (LCS) → edit ops, for showing "manuscript reads X; standard text reads Y". */
export type DiffOp = { op: "equal" | "replace" | "insert" | "delete"; a: string[]; b: string[] };
export function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], x: string[], y: string[]) => {
    const last = ops.at(-1);
    if (last && last.op === op) { last.a.push(...x); last.b.push(...y); }
    else ops.push({ op, a: [...x], b: [...y] });
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { push("equal", [a[i]], [b[j]]); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { push("insert", [], [b[j]]); j++; }
    else { push("delete", [a[i]], []); i++; }
  }
  // merge adjacent delete+insert into replace
  const merged: DiffOp[] = [];
  for (const o of ops) {
    const last = merged.at(-1);
    if (last && ((last.op === "delete" && o.op === "insert") || (last.op === "insert" && o.op === "delete"))) {
      merged[merged.length - 1] = { op: "replace", a: [...last.a, ...o.a], b: [...last.b, ...o.b] };
    } else merged.push(o);
  }
  return merged;
}
