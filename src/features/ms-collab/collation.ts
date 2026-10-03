/**
 * Collation of copies (مقابلة النسخ): word-by-word alignment of the current reading text of two or more copies of the
 * same work, and an apparatus in the Arabic editorial style («في (ب): …»، «سقط من (ب)»، «زيادة في (ج): …»).
 * Research memo §2.4. Pure; shared by the server (alignment) and the client (rendering).
 *
 * Words are compared on a folded form (no vowel signs, hamza seats/alef forms, ى/ي and ة/ه unified), so spelling
 * conventions do not show up as variants. The displayed words are always the copies' own text.
 */
import { foldLetters, stripDiacritics } from "../manuscripts/text";

export interface Word {
  /** The word as it stands in the copy's reading text. */
  w: string;
  line_id: string;
  /** Line number in reading order (for «س ١٢»). */
  n: number;
}

export type AlignOp =
  | { op: "equal"; a: Word[]; b: Word[] }
  | { op: "replace"; a: Word[]; b: Word[] }
  | { op: "delete"; a: Word[]; b: [] }
  | { op: "insert"; a: []; b: Word[] };

/** Comparison form of a word. */
export function foldWord(w: string): string {
  return foldLetters(stripDiacritics(w ?? ""))
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/ء/g, "");
}

/** Split reading text into words (punctuation-only runs and the gap placeholder are dropped). */
export function wordsOf(text: string, line_id: string, n: number): Word[] {
  return (text ?? "")
    .split(/\s+/)
    .filter((w) => w && foldWord(w) !== "" && w !== "[…]")
    .map((w) => ({ w, line_id, n }));
}

/** LCS alignment of two word sequences (O(n·m), bounded by the caller to a passage). */
export function alignWords(a: Word[], b: Word[]): AlignOp[] {
  const A = a.map((x) => foldWord(x.w)), B = b.map((x) => foldWord(x.w));
  const n = A.length, m = B.length;
  if (n * m > 1_500_000) throw new Error("passage too long to align");
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw: { op: "equal" | "delete" | "insert"; a?: Word; b?: Word }[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { raw.push({ op: "equal", a: a[i], b: b[j] }); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] > dp[i + 1][j])) { raw.push({ op: "insert", b: b[j] }); j++; }
    else { raw.push({ op: "delete", a: a[i] }); i++; }
  }
  // group runs; a run of deletes and inserts between two equal words is one replacement
  const out: AlignOp[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].op === "equal") {
      const last = out[out.length - 1];
      if (last && last.op === "equal") { last.a.push(raw[k].a!); last.b.push(raw[k].b!); }
      else out.push({ op: "equal", a: [raw[k].a!], b: [raw[k].b!] });
      k++;
      continue;
    }
    const da: Word[] = [], db: Word[] = [];
    while (k < raw.length && raw[k].op !== "equal") {
      if (raw[k].op === "delete") da.push(raw[k].a!);
      else db.push(raw[k].b!);
      k++;
    }
    if (da.length && db.length) out.push({ op: "replace", a: da, b: db });
    else if (da.length) out.push({ op: "delete", a: da, b: [] });
    else out.push({ op: "insert", a: [], b: db });
  }
  return out;
}

/** Share of base words that the witness has too. */
export function agreement(ops: AlignOp[]): number {
  let same = 0, total = 0;
  for (const o of ops) {
    total += o.a.length;
    if (o.op === "equal") same += o.a.length;
  }
  return total ? same / total : 1;
}

export type VariantKind = "reads" | "omits" | "adds";

export interface Reading {
  siglum: string;
  ms_id: string;
  kind: VariantKind;
  /** The witness's words (empty for an omission). */
  text: string;
  lines: string[];
}

export interface ApparatusEntry {
  /** Footnote number, 1-based, in base-text order. */
  no: number;
  /** Base word range [from, to) in the base word list. For an addition, from === to = the position it follows. */
  from: number;
  to: number;
  /** The base words (lemma). Empty for an addition. */
  lemma: string;
  base_lines: string[];
  readings: Reading[];
}

/**
 * Merge pairwise alignments (base ↔ each witness) into one apparatus keyed by base position, so a place where two
 * witnesses differ is one footnote: «في (ب): … · في (ج): …».
 */
export function buildApparatus(base: Word[], witnesses: { siglum: string; ms_id: string; ops: AlignOp[] }[]): ApparatusEntry[] {
  const byKey = new Map<string, ApparatusEntry>();
  const linesOf = (ws: Word[]) => [...new Set(ws.map((w) => w.line_id))];
  for (const wit of witnesses) {
    let pos = 0;
    for (const o of wit.ops) {
      if (o.op === "equal") { pos += o.a.length; continue; }
      const from = pos, to = pos + o.a.length;
      const key = o.op === "insert" ? `i:${from}` : `r:${from}:${to}`;
      let e = byKey.get(key);
      if (!e) {
        e = { no: 0, from, to, lemma: o.a.map((w) => w.w).join(" "), base_lines: linesOf(o.op === "insert" ? base.slice(Math.max(0, from - 1), from) : o.a), readings: [] };
        byKey.set(key, e);
      }
      e.readings.push({
        siglum: wit.siglum,
        ms_id: wit.ms_id,
        kind: o.op === "replace" ? "reads" : o.op === "delete" ? "omits" : "adds",
        text: o.b.map((w) => w.w).join(" "),
        lines: linesOf(o.b),
      });
      pos = to;
    }
  }
  const entries = [...byKey.values()].sort((x, y) => x.from - y.from || Number(x.to !== x.from) - Number(y.to !== y.from) || x.to - y.to);
  entries.forEach((e, i) => (e.no = i + 1));
  return entries;
}

/** Apparatus note in the Arabic editorial convention (display string; the siglum stays in parentheses). */
export function noteAr(r: Reading): string {
  if (r.kind === "omits") return `سقط من (${r.siglum})`;
  if (r.kind === "adds") return `زيادة في (${r.siglum}): ${r.text}`;
  return `في (${r.siglum}): ${r.text}`;
}

export function noteEn(r: Reading): string {
  if (r.kind === "omits") return `omitted in (${r.siglum})`;
  if (r.kind === "adds") return `added in (${r.siglum}): ${r.text}`;
  return `(${r.siglum}) reads: ${r.text}`;
}

/** Base word indexes that carry a footnote (for highlighting the base text). */
export function markedWords(entries: ApparatusEntry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) {
    if (e.from === e.to) { if (e.from > 0 && !m.has(e.from - 1)) m.set(e.from - 1, e.no); continue; }
    for (let i = e.from; i < e.to; i++) if (!m.has(i)) m.set(i, e.no);
  }
  return m;
}
