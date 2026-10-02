/**
 * Transcription token model (SPEC §4, research memo §3.2/§7.2) and its pure utilities.
 *
 * A line is an ordered list of spans. Concatenating the spans' written text gives the line as an editable string;
 * spaces live inside the spans. Zero-width spans (manuscript marks) qualify the word before them and are never text.
 *
 * Layers:
 *  - Diplomatic ("as written in the manuscript"): plainText(). Never auto-corrected.
 *  - Reading (normalised): readingText(). Applies human-confirmed abbreviation expansions, drops scribal deletions,
 *    keeps scribal additions and editor-supplied text. It is a view, never written back into the diplomatic layer.
 *
 * Everything here is pure and shared by the client editor, the API and the exporters.
 */
import { cer as cerOf, normalizeStoreText } from "./text";
import type { MarkKind } from "./marks";

export type GapReason = "illegible" | "damage" | "lacuna";
export type AddPlace = "margin" | "above" | "below" | "inline";
export type HiRend = "red" | "gold" | "overline" | "large";
export type DelRend = "strike" | "la_ila" | "bracket" | "zaid";
export type Cert = "low" | "medium" | "high";
export type { MarkKind };

export type Tok =
  | { t: "text"; v: string }
  | { t: "unclear"; v: string; alts?: string[]; conf?: number; cert?: Cert; rend?: HiRend }
  | { t: "gap"; reason: GapReason; extent?: number; unit?: "char" | "word" }
  | { t: "supplied"; v: string; reason?: "omitted" | "damage" }
  | { t: "del"; v: string; rend?: DelRend }
  | { t: "add"; v: string; place: AddPlace }
  | { t: "abbr"; v: string; expan: string; confirmed?: boolean }
  | { t: "mark"; kind: MarkKind; v: string; note?: string }
  | { t: "hi"; rend: HiRend; v: string };

export type TokType = Tok["t"];

/** The placeholder a gap occupies in the editable string (atomic: editing any of it removes the whole gap). */
export const GAP_TEXT = "[…]";

/** Tokens whose `v` is part of the editable line string. */
export const isTextual = (k: Tok): k is Extract<Tok, { v: string }> & { t: Exclude<TokType, "gap" | "mark"> } =>
  k.t !== "gap" && k.t !== "mark";

/** Characters a token occupies in the editable string. */
export function editText(k: Tok): string {
  if (k.t === "gap") return GAP_TEXT;
  if (k.t === "mark") return "";
  return k.v;
}

// ───────────────────────────────────────────── Text forms

/** Editable string: what the transcriber sees and types in the line input. */
export const editorString = (toks: Tok[]) => toks.map(editText).join("");

/** Diplomatic plain text (SPEC §4): written text joined, gaps as […], editor-supplied text in [ ], marks excluded. */
export function plainText(toks: Tok[]): string {
  return toks
    .map((k) => {
      switch (k.t) {
        case "gap": return GAP_TEXT;
        case "mark": return "";
        case "supplied": return `[${k.v}]`;
        default: return k.v;
      }
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reading (normalised) text: confirmed expansions applied, scribal deletions dropped, marks excluded. */
export function readingText(toks: Tok[]): string {
  return toks
    .map((k) => {
      switch (k.t) {
        case "gap": return GAP_TEXT;
        case "mark":
        case "del": return "";
        case "abbr": return k.confirmed === false ? k.v : k.expan;
        default: return k.v;
      }
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens from a plain string (one text span). */
export const fromPlain = (s: string): Tok[] => (s ? [{ t: "text", v: s }] : []);

/** Tokens from OCR words with confidences: low-confidence words become `unclear` with the model score kept. */
export function fromWords(words: { t: string; conf?: number }[], threshold = 60): Tok[] {
  const out: Tok[] = [];
  words.forEach((w, i) => {
    const v = w.t.trim();
    if (!v) return;
    if (out.length && i > 0) out.push({ t: "text", v: " " });
    if (typeof w.conf === "number" && w.conf < threshold) out.push({ t: "unclear", v, conf: Math.round(w.conf) });
    else out.push({ t: "text", v });
  });
  return mergeAdjacent(out);
}

// ───────────────────────────────────────────── Structure helpers

const sameAttrs = (a: Tok, b: Tok) => {
  if (a.t !== b.t) return false;
  if (a.t === "text") return true;
  if (a.t === "hi" && b.t === "hi") return a.rend === b.rend;
  return false;
};

/** Merge adjacent text spans (and adjacent same-rend rubrics); drop empty textual spans. */
export function mergeAdjacent(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (const k of toks) {
    if (isTextual(k) && k.v === "") continue;
    const last = out[out.length - 1];
    if (last && sameAttrs(last, k) && isTextual(last) && isTextual(k)) {
      out[out.length - 1] = { ...last, v: last.v + k.v } as Tok;
      continue;
    }
    out.push(k);
  }
  return out;
}

export interface Segment {
  index: number;
  start: number;
  end: number;
  tok: Tok;
}

/** Character ranges of each token in the editable string. Marks have start === end. */
export function segments(toks: Tok[]): Segment[] {
  let pos = 0;
  return toks.map((tok, index) => {
    const len = editText(tok).length;
    const s = { index, start: pos, end: pos + len, tok };
    pos += len;
    return s;
  });
}

/** Index of the token under a caret/character position (prefers the span that contains pos, then the one before). */
export function tokenAt(toks: Tok[], pos: number): number {
  const segs = segments(toks);
  const str = editorString(toks);
  const before = [...segs].reverse().find((s) => s.end === pos && s.end > s.start);
  // a caret right after a word belongs to that word unless the next character continues another word
  if (before && (pos >= str.length || /\s/.test(str[pos]))) return before.index;
  const inside = segs.find((s) => s.start <= pos && pos < s.end && s.end > s.start);
  if (inside) return inside.index;
  return before ? before.index : -1;
}

const withV = (k: Tok, v: string): Tok => ({ ...(k as Extract<Tok, { v: string }>), v }) as Tok;

/** Split textual tokens so that `pos` falls on a token boundary. Returns the new list. */
export function splitAt(toks: Tok[], pos: number): Tok[] {
  const out: Tok[] = [];
  for (const s of segments(toks)) {
    if (isTextual(s.tok) && s.start < pos && pos < s.end) {
      const v = s.tok.v;
      const cut = pos - s.start;
      const a = withV(s.tok, v.slice(0, cut));
      const b = withV(s.tok, v.slice(cut));
      if (a.t === "unclear") delete (a as { alts?: string[] }).alts;
      if (b.t === "unclear") delete (b as { alts?: string[] }).alts;
      out.push(a, b);
    } else out.push(s.tok);
  }
  return out;
}

// ───────────────────────────────────────────── Editing: plain typing

/**
 * Apply a plain-text edit made in the line input to the token list, keeping markup on untouched text.
 * The edit is found by common prefix/suffix; `caret` (selection end after the edit) disambiguates repeated characters.
 * - Deleting any part of a gap removes the whole gap (it is atomic).
 * - A mark is removed only if the deleted range strictly surrounds it.
 * - Inserted text joins a neighbouring plain-text span, or the span it was typed inside.
 */
export function applyTextEdit(toks: Tok[], oldStr: string, newStr: string, caret?: number): Tok[] {
  if (oldStr === newStr) return toks;
  const oldLen = oldStr.length, newLen = newStr.length, minLen = Math.min(oldLen, newLen);
  let pFull = 0;
  while (pFull < minLen && oldStr[pFull] === newStr[pFull]) pFull++;
  let sFull = 0;
  while (sFull < minLen && oldStr[oldLen - 1 - sFull] === newStr[newLen - 1 - sFull]) sFull++;
  let s = Math.min(sFull, minLen - pFull);
  if (caret !== undefined && caret >= 0 && caret <= newLen) s = Math.min(sFull, newLen - caret);
  const p = Math.min(pFull, minLen - s);
  const delStart = p, delEnd = oldLen - s;
  const ins = newStr.slice(p, newLen - s);

  // 1) deletion
  const out: Tok[] = [];
  let insertInto = -1; // index (in out) of the span the edit happened inside
  for (const seg of segments(toks)) {
    const k = seg.tok;
    if (k.t === "mark") {
      if (!(delStart < seg.start && seg.start < delEnd)) out.push(k);
      continue;
    }
    const overlaps = seg.start < delEnd && delStart < seg.end;
    if (!overlaps) { out.push(k); continue; }
    if (k.t === "gap") continue; // atomic
    const v = (k as { v: string }).v;
    const a = Math.max(delStart, seg.start) - seg.start;
    const b = Math.min(delEnd, seg.end) - seg.start;
    const nv = v.slice(0, a) + v.slice(b);
    const within = seg.start <= delStart && delEnd <= seg.end;
    if (nv.length) {
      if (within) insertInto = out.length;
      out.push(withV(k, nv));
    } else if (within && ins && k.t !== "text") {
      // the whole span was selected and retyped: keep its markup (e.g. retyping an unclear word)
      insertInto = out.length;
      out.push(withV(k, ""));
    }
  }

  // 2) insertion at delStart
  if (ins) {
    const segs = segments(out);
    const put = (i: number, at: number) => {
      const k = out[i] as Extract<Tok, { v: string }>;
      out[i] = withV(k, k.v.slice(0, at) + ins + k.v.slice(at));
      if (out[i].t === "unclear") delete (out[i] as { alts?: string[] }).alts;
    };
    if (insertInto >= 0) put(insertInto, delStart - segs[insertInto].start);
    else {
      const noWs = !/\s/.test(ins);
      const left = [...segs].reverse().find((g) => g.end === delStart && g.end > g.start && isTextual(g.tok));
      const right = segs.find((g) => g.start === delStart && g.end > g.start && isTextual(g.tok));
      const marksHere = segs.some((g) => g.tok.t === "mark" && g.start === delStart);
      const lv = left ? (left.tok as { v: string }).v : "";
      const rv = right ? (right.tok as { v: string }).v : "";
      if (left && noWs && /\S$/.test(lv)) put(left.index, lv.length);
      else if (right && noWs && /^\S/.test(rv) && !(left && /\S$/.test(lv))) put(right.index, 0);
      else if (left && left.tok.t === "text" && !marksHere) put(left.index, lv.length);
      else if (right && right.tok.t === "text") put(right.index, 0);
      else {
        // a new plain span; marks sitting at this position stay attached to the word before them
        const firstAfter = segs.find((g) => g.start >= delStart && !(g.tok.t === "mark" && g.start === delStart));
        out.splice(firstAfter ? firstAfter.index : out.length, 0, { t: "text", v: ins });
      }
    }
  }
  return mergeAdjacent(out);
}

// ───────────────────────────────────────────── Editing: markup operations

export type MarkupOp =
  | { op: "unclear"; alts?: string[]; cert?: Cert }
  | { op: "supplied"; reason?: "omitted" | "damage" }
  | { op: "del"; rend?: DelRend }
  | { op: "add"; place: AddPlace }
  | { op: "abbr"; expan: string; confirmed?: boolean }
  | { op: "hi"; rend: HiRend }
  | { op: "clear" };

export type OpResult = { ok: true; tokens: Tok[]; range: [number, number] } | { ok: false; reason: "empty" | "contains_gap" | "bad_range" };

/** Shrink a range so it does not start or end on whitespace. */
export function trimRange(str: string, start: number, end: number): [number, number] {
  let a = Math.max(0, Math.min(start, end)), b = Math.min(str.length, Math.max(start, end));
  while (a < b && /\s/.test(str[a])) a++;
  while (b > a && /\s/.test(str[b - 1])) b--;
  return [a, b];
}

/** The word around a caret position (used when a markup op is applied without a selection). */
export function wordAt(str: string, pos: number): [number, number] {
  let a = Math.max(0, Math.min(pos, str.length)), b = a;
  const isWord = (c: string | undefined) => !!c && !/\s/.test(c) && c !== "[" && c !== "]" && c !== "…";
  if (!isWord(str[a]) && isWord(str[a - 1])) { a--; b = a; }
  while (a > 0 && isWord(str[a - 1])) a--;
  while (b < str.length && isWord(str[b])) b++;
  return [a, b];
}

/** Apply a markup operation to the character range [start, end) of the editable string. */
export function applyMarkup(toks: Tok[], start: number, end: number, op: MarkupOp): OpResult {
  const str = editorString(toks);
  if (start < 0 || end > str.length || start > end) return { ok: false, reason: "bad_range" };
  const [a, b] = trimRange(str, start, end);
  if (a === b) return { ok: false, reason: "empty" };
  const split = splitAt(splitAt(toks, a), b);
  const before: Tok[] = [], inside: Tok[] = [], after: Tok[] = [];
  for (const seg of segments(split)) {
    const k = seg.tok;
    if (k.t === "mark") {
      // a mark qualifies the word before it: marks at the end of the selection travel with the new span
      if (seg.start <= a) before.push(k);
      else if (seg.start <= b) inside.push(k);
      else after.push(k);
      continue;
    }
    if (seg.end <= a) before.push(k);
    else if (seg.start >= b) after.push(k);
    else inside.push(k);
  }
  if (inside.some((k) => k.t === "gap")) return { ok: false, reason: "contains_gap" };
  const marks = inside.filter((k) => k.t === "mark");
  const textual = inside.filter(isTextual) as Extract<Tok, { v: string }>[];
  const v = textual.map((k) => k.v).join("");
  let made: Tok[];
  switch (op.op) {
    case "clear":
      made = textual.map((k) => ({ t: "text", v: k.v }) as Tok);
      break;
    case "unclear": {
      const prev = textual.length === 1 && textual[0].t === "unclear" ? textual[0] : null;
      made = [{ t: "unclear", v, ...(op.alts?.length ? { alts: op.alts } : prev?.alts ? { alts: prev.alts } : {}), ...(op.cert ? { cert: op.cert } : {}), ...(prev?.conf !== undefined ? { conf: prev.conf } : {}), ...(prev?.rend ? { rend: prev.rend } : {}) }];
      break;
    }
    case "supplied": made = [{ t: "supplied", v, ...(op.reason ? { reason: op.reason } : {}) }]; break;
    case "del": made = [{ t: "del", v, ...(op.rend ? { rend: op.rend } : {}) }]; break;
    case "add": made = [{ t: "add", v, place: op.place }]; break;
    case "abbr": made = [{ t: "abbr", v, expan: op.expan, ...(op.confirmed === false ? { confirmed: false } : {}) }]; break;
    case "hi": made = [{ t: "hi", rend: op.rend, v }]; break;
  }
  const tokens = mergeAdjacent([...before, ...made, ...marks, ...after]);
  return { ok: true, tokens, range: [a, b] };
}

/** Insert a zero-width or atomic token (gap, mark) at a position. Marks snap to the end of the word they follow. */
export function insertAt(toks: Tok[], pos: number, tok: Tok): Tok[] {
  const str = editorString(toks);
  let at = Math.max(0, Math.min(pos, str.length));
  if (tok.t === "mark") at = wordAt(str, at)[1] || at;
  const split = splitAt(toks, at);
  const out: Tok[] = [];
  let placed = false;
  for (const seg of segments(split)) {
    if (!placed && seg.start >= at && !(seg.tok.t === "mark" && seg.start === at)) {
      out.push(tok);
      placed = true;
    }
    out.push(seg.tok);
  }
  if (!placed) out.push(tok);
  return mergeAdjacent(out);
}

/** Replace the range [start, end) by a gap (illegible text is not guessed). Empty range inserts the gap. */
export function replaceWithGap(toks: Tok[], start: number, end: number, gap: Extract<Tok, { t: "gap" }>): Tok[] {
  const str = editorString(toks);
  const [a, b] = start === end ? [start, end] : trimRange(str, start, end);
  const removed = a === b ? toks : applyTextEdit(toks, str, str.slice(0, a) + str.slice(b), a);
  return insertAt(removed, a, gap);
}

/** Accept one of an unclear token's alternatives: it becomes the reading, as plain (certain) text. */
export function acceptAlternative(toks: Tok[], index: number, alt: string): Tok[] {
  const k = toks[index];
  if (!k || k.t !== "unclear") return toks;
  const out = toks.slice();
  out[index] = { t: "text", v: alt };
  return mergeAdjacent(out);
}

/** Update the fields of one token (e.g. a mark's note, an abbreviation's expansion). */
export function updateToken(toks: Tok[], index: number, patch: Partial<Tok>): Tok[] {
  if (!toks[index]) return toks;
  const out = toks.slice();
  out[index] = { ...toks[index], ...patch } as Tok;
  return mergeAdjacent(out);
}

export function removeToken(toks: Tok[], index: number): Tok[] {
  return mergeAdjacent(toks.filter((_, i) => i !== index));
}

// ───────────────────────────────────────────── Normalisation & comparison

/** Unicode hygiene on every string field of every token (NFC, no presentation forms/Persian letters/bidi controls). */
export function normalizeTokens(toks: Tok[], opts: { persianHand?: boolean } = {}): { tokens: Tok[]; changes: string[] } {
  const changes = new Set<string>();
  const n = (s: string) => {
    const r = normalizeStoreText(s, opts);
    r.changes.forEach((c) => changes.add(c));
    return r.text;
  };
  const tokens = toks.map((k): Tok => {
    switch (k.t) {
      case "gap": return k;
      case "unclear": return { ...k, v: n(k.v), ...(k.alts ? { alts: k.alts.map(n).filter(Boolean) } : {}) };
      case "abbr": return { ...k, v: n(k.v), expan: n(k.expan) };
      case "mark": return { ...k, v: n(k.v), ...(k.note !== undefined ? { note: n(k.note) } : {}) };
      default: return { ...k, v: n(k.v) } as Tok;
    }
  });
  return { tokens: mergeAdjacent(tokens), changes: [...changes] };
}

/** Structural equality after normalisation (no phantom diffs from shadda/vowel order). */
export function sameTokens(a: Tok[], b: Tok[]): boolean {
  return JSON.stringify(normalizeTokens(a).tokens) === JSON.stringify(normalizeTokens(b).tokens);
}

/** CER of the line's diplomatic text against a reference (dataset ground truth). */
export const tokensCer = (toks: Tok[], ref: string, fold = false) => cerOf(plainText(toks), ref, fold);
export { cerOf as cer };

/** Counts used by status pills and progress. */
export function tokenStats(toks: Tok[]) {
  const c = { unclear: 0, gap: 0, abbr: 0, mark: 0, edits: 0 };
  for (const k of toks) {
    if (k.t === "unclear") c.unclear++;
    else if (k.t === "gap") c.gap++;
    else if (k.t === "abbr") c.abbr++;
    else if (k.t === "mark") c.mark++;
    else if (k.t !== "text") c.edits++;
  }
  return c;
}

// ───────────────────────────────────────────── Rendering (pure → React in token-view.tsx)

export type RenderSpan =
  | { kind: "text"; text: string; index: number }
  | { kind: "unclear"; text: string; index: number; alts: string[]; conf?: number; cert?: Cert; rend?: HiRend }
  | { kind: "gap"; text: string; index: number; reason: GapReason; extent?: number; unit?: "char" | "word" }
  | { kind: "supplied"; text: string; index: number }
  | { kind: "del"; text: string; index: number; rend?: DelRend }
  | { kind: "add"; text: string; index: number; place: AddPlace }
  | { kind: "abbr"; text: string; index: number; expan: string; confirmed: boolean }
  | { kind: "mark"; text: string; index: number; mark: MarkKind; note?: string }
  | { kind: "hi"; text: string; index: number; rend: HiRend };

/**
 * Render plan for a line. `layer: "diplomatic"` shows what is written (abbreviations as written, deletions struck);
 * `layer: "reading"` shows expansions and hides deletions.
 */
export function toRenderSpans(toks: Tok[], layer: "diplomatic" | "reading" = "diplomatic"): RenderSpan[] {
  const out: RenderSpan[] = [];
  toks.forEach((k, index) => {
    switch (k.t) {
      case "text": out.push({ kind: "text", text: k.v, index }); break;
      case "unclear": out.push({ kind: "unclear", text: k.v, index, alts: k.alts ?? [], conf: k.conf, cert: k.cert, rend: k.rend }); break;
      case "gap": out.push({ kind: "gap", text: GAP_TEXT, index, reason: k.reason, extent: k.extent, unit: k.unit }); break;
      case "supplied": out.push({ kind: "supplied", text: k.v, index }); break;
      case "del": if (layer === "diplomatic") out.push({ kind: "del", text: k.v, index, rend: k.rend }); break;
      case "add": out.push({ kind: "add", text: k.v, index, place: k.place }); break;
      case "abbr":
        out.push({ kind: "abbr", text: layer === "reading" && k.confirmed !== false ? k.expan : k.v, index, expan: k.expan, confirmed: k.confirmed !== false });
        break;
      case "mark": if (layer === "diplomatic") out.push({ kind: "mark", text: k.v, index, mark: k.kind, note: k.note }); break;
      case "hi": out.push({ kind: "hi", text: k.v, index, rend: k.rend }); break;
    }
  });
  return out;
}

// ───────────────────────────────────────────── TEI (inline)

export const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const certOf = (k: { conf?: number; cert?: Cert }): Cert => k.cert ?? (k.conf === undefined ? "medium" : k.conf < 40 ? "low" : k.conf < 75 ? "medium" : "high");
const DEL_REND: Record<DelRend, string> = { strike: "strikethrough", la_ila: "la-ila", bracket: "bracketed", zaid: "zaid" };
const DEL_REND_BACK: Record<string, DelRend> = { strikethrough: "strike", "la-ila": "la_ila", bracketed: "bracket", zaid: "zaid" };

/**
 * Lossless TEI P5 serialisation of one line's tokens (memo §3.2 mapping). Round-trips through teiToTokens().
 * unclear → <unclear cert n=score> (alternatives follow it in the same <choice>, first = current reading), gap → <gap reason extent unit>, supplied → <supplied>,
 * del → <del rend>, add → <add place>, abbr → <choice><abbr/><expan/></choice>, mark → <metamark function>[+<note>],
 * hi → <hi rend>.
 */
export function tokensToTei(toks: Tok[]): string {
  return toks
    .map((k) => {
      switch (k.t) {
        case "text": return xmlEscape(k.v);
        case "unclear": {
          const attrs = `cert="${certOf(k)}"${k.cert ? ` resp="#human"` : ""}${k.conf !== undefined ? ` n="${k.conf}"` : ""}${k.rend ? ` rend="${k.rend}"` : ""}`;
          const main = `<unclear ${attrs}>${xmlEscape(k.v)}</unclear>`;
          if (!k.alts?.length) return main;
          return `<choice>${main}${k.alts.map((a) => `<unclear>${xmlEscape(a)}</unclear>`).join("")}</choice>`;
        }
        case "gap": return `<gap reason="${k.reason}"${k.extent !== undefined ? ` extent="${k.extent}" unit="${k.unit ?? "word"}"` : ""}/>`;
        case "supplied": return `<supplied${k.reason ? ` reason="${k.reason}"` : ""}>${xmlEscape(k.v)}</supplied>`;
        case "del": return `<del${k.rend ? ` rend="${DEL_REND[k.rend]}"` : ""}>${xmlEscape(k.v)}</del>`;
        case "add": return `<add place="${k.place}">${xmlEscape(k.v)}</add>`;
        case "abbr": return `<choice><abbr>${xmlEscape(k.v)}</abbr><expan${k.confirmed === false ? ` cert="low"` : ""}>${xmlEscape(k.expan)}</expan></choice>`;
        case "mark": {
          const mm = `<metamark function="${k.kind}">${xmlEscape(k.v)}</metamark>`;
          return k.note !== undefined && k.note !== "" ? `${mm}<note type="${k.kind}">${xmlEscape(k.note)}</note>` : mm;
        }
        case "hi": return `<hi rend="${k.rend}">${xmlEscape(k.v)}</hi>`;
      }
    })
    .join("");
}

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Parse what tokensToTei() produced back into tokens (used to prove the mapping is lossless). */
export function teiToTokens(xml: string): Tok[] {
  const out: Tok[] = [];
  const re = /<choice><unclear ([^>]*)>([^<]*)<\/unclear>((?:<unclear>[^<]*<\/unclear>)+)<\/choice>|<choice><abbr>([^<]*)<\/abbr><expan( cert="low")?>([^<]*)<\/expan><\/choice>|<unclear ([^>]*)>([^<]*)<\/unclear>|<gap ([^>]*)\/>|<supplied( reason="(\w+)")?>([^<]*)<\/supplied>|<del( rend="([\w-]+)")?>([^<]*)<\/del>|<add place="(\w+)">([^<]*)<\/add>|<metamark function="(\w+)">([^<]*)<\/metamark>(?:<note type="\w+">([^<]*)<\/note>)?|<hi rend="(\w+)">([^<]*)<\/hi>|([^<]+)/g;
  const attr = (s: string, name: string) => s.match(new RegExp(`${name}="([^"]*)"`))?.[1];
  const unclear = (attrs: string, v: string, alts?: string[]): Tok => {
    const tok: Extract<Tok, { t: "unclear" }> = { t: "unclear", v: unescape(v) };
    if (alts?.length) tok.alts = alts;
    const n = attr(attrs, "n");
    if (n !== undefined) tok.conf = Number(n);
    if (attr(attrs, "resp")) tok.cert = attr(attrs, "cert") as Cert;
    const rend = attr(attrs, "rend");
    if (rend) tok.rend = rend as HiRend;
    return tok;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      const alts = [...m[3].matchAll(/<unclear>([^<]*)<\/unclear>/g)].map((x) => unescape(x[1]));
      out.push(unclear(m[1], m[2], alts));
    } else if (m[4] !== undefined) {
      out.push({ t: "abbr", v: unescape(m[4]), expan: unescape(m[6]), ...(m[5] ? { confirmed: false } : {}) });
    } else if (m[7] !== undefined) out.push(unclear(m[7], m[8]));
    else if (m[9] !== undefined) {
      const ext = attr(m[9], "extent");
      out.push({ t: "gap", reason: attr(m[9], "reason") as GapReason, ...(ext !== undefined ? { extent: Number(ext), unit: (attr(m[9], "unit") as "char" | "word") ?? "word" } : {}) });
    } else if (m[12] !== undefined) out.push({ t: "supplied", v: unescape(m[12]), ...(m[11] ? { reason: m[11] as "omitted" | "damage" } : {}) });
    else if (m[15] !== undefined) out.push({ t: "del", v: unescape(m[15]), ...(m[14] ? { rend: DEL_REND_BACK[m[14]] } : {}) });
    else if (m[16] !== undefined) out.push({ t: "add", place: m[16] as AddPlace, v: unescape(m[17]) });
    else if (m[18] !== undefined) out.push({ t: "mark", kind: m[18] as MarkKind, v: unescape(m[19]), ...(m[20] !== undefined ? { note: unescape(m[20]) } : {}) });
    else if (m[21] !== undefined) out.push({ t: "hi", rend: m[21] as HiRend, v: unescape(m[22]) });
    else if (m[23] !== undefined) out.push({ t: "text", v: unescape(m[23]) });
  }
  return out;
}
