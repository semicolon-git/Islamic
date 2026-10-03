/**
 * Quran-quotation detection on a manuscript page (research memo §5.1, M10). Code proposes; a researcher confirms.
 * Pure: the caller passes the matcher index (src/lib/quran) so this runs in tests and on the server alike.
 *
 * - Runs on the page's reading layer joined across line breaks: quotes often run over two lines.
 * - Word windows (4–12 words, ≥ 8 letters) are checked for exact matches; whole lines and two-line windows are also
 *   checked for near matches (misquote / scribal variant / OCR noise).
 * - Liturgical formulae (بسم الله الرحمن الرحيم …) are not quotations and are skipped.
 * - The manuscript text is never changed: a quote is an annotation shown *beside* the text with a neutral diff.
 */
import { matchQuran, MIN_CHARS, type QuranIndex } from "@/lib/quran/matcher";
import { diffTokens, skeleton } from "@/lib/quran/normalize";
import { stripDiacritics } from "../manuscripts/text";

export interface PageLineText {
  line_id: string;
  n: number;
  text: string;
}

export interface QuoteProposal {
  key: string;
  verse_keys: string[];
  match: "exact" | "near";
  partial: boolean;
  line_ids: string[];
  from_n: number;
  to_n: number;
  /** The manuscript words covered (reading layer). */
  ms_text: string;
  similarity?: number;
  /** A cue phrase (قال تعالى، قوله تعالى …) precedes the quote. */
  cue: boolean;
  sura_name_ar: string;
  sura_name_en: string;
}

const FORMULAE_TEXT = ["بسم الله الرحمن الرحيم", "الحمد لله", "رب العالمين", "انا لله وانا اليه راجعون", "لا حول ولا قوة الا بالله", "سبحانه وتعالى", "صلى الله عليه وسلم", "رضي الله عنه", "ان شاء الله", "عز وجل", "الله اعلم"];
const FORMULAE = FORMULAE_TEXT.map((f) => skeleton(f).replace(/ /g, "")).sort((a, b) => b.length - a.length);
const FORMULA_WORDS = FORMULAE_TEXT.map((f) => skeleton(f).split(" ").filter(Boolean)).sort((a, b) => b.length - a.length);
const CUES = ["قال تعالى", "قوله تعالى", "لقوله تعالى", "قال الله", "عز وجل", "كما قال", "التنزيل", "قوله عز"].map((c) => skeleton(c));

const MIN_WORDS = 4;
const MAX_WORDS = 12;

interface W { w: string; line_id: string; n: number }

/** A line made only of liturgical formulae (and a few letters around them) is not a quotation. */
const isFormula = (text: string) => {
  let q = skeleton(text).replace(/ /g, "");
  for (const f of FORMULAE) q = q.split(f).join("");
  return q.length < MIN_CHARS;
};

/** Words that belong to a liturgical formula (بسم الله الرحمن الرحيم …), wherever a window starts or ends. */
function formulaWords(sk: string[]): Set<number> {
  const out = new Set<number>();
  for (let s = 0; s < sk.length; s++)
    for (const f of FORMULA_WORDS) {
      if (s + f.length > sk.length) continue;
      if (f.every((w, k) => sk[s + k] === w || (k === 0 && sk[s] === `و${w}`))) for (let k = 0; k < f.length; k++) out.add(s + k);
    }
  return out;
}

function hasCue(words: W[], start: number): boolean {
  const before = skeleton(words.slice(Math.max(0, start - 4), start).map((x) => x.w).join(" "));
  return !!before && CUES.some((c) => before.includes(c));
}

/** Detect Quran quotations on a page. Lines must be in reading order. */
export function detectQuotes(ix: QuranIndex, lines: PageLineText[]): QuoteProposal[] {
  const words: W[] = [];
  for (const l of lines) for (const w of (l.text ?? "").split(/\s+/)) if (w && skeleton(w)) words.push({ w, line_id: l.line_id, n: l.n });
  const found: { s: number; e: number; verses: string[]; partial: boolean; ar: string; en: string }[] = [];
  const sk = words.map((x) => skeleton(x.w).replace(/ /g, ""));
  const formula = formulaWords(sk);
  // a window needs MIN_CHARS letters outside formulae
  const ownLetters = (s: number, e: number) => { let n = 0; for (let k = s; k < e; k++) if (!formula.has(k)) n += sk[k].length; return n; };

  // 1) exact word windows, longest first from each start; a cheap substring test avoids the full matcher
  for (let s = 0; s + MIN_WORDS <= words.length; s++) {
    // every longer window starts with the shortest one: if that is not in the Quran, nothing from here is
    if (!ix.G.includes(skeleton(words.slice(s, s + MIN_WORDS).map((x) => x.w).join(" ")).replace(/ /g, ""))) continue;
    for (let len = Math.min(MAX_WORDS, words.length - s); len >= MIN_WORDS; len--) {
      const text = words.slice(s, s + len).map((x) => x.w).join(" ");
      const q = skeleton(text).replace(/ /g, "");
      if (q.length < MIN_CHARS || !ix.G.includes(q)) continue;
      if (ownLetters(s, s + len) < MIN_CHARS) continue;
      const r = matchQuran(ix, text);
      if (r.status !== "exact") continue;
      const loc = r.locations[0];
      found.push({ s, e: s + len, verses: loc.verses, partial: loc.partial, ar: loc.sura_name_ar, en: loc.sura_name_en });
      break;
    }
  }
  // merge overlapping windows that point at the same verses
  found.sort((a, b) => a.s - b.s || b.e - a.e);
  const merged: typeof found = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.s < last.e && f.verses.join() === last.verses.join()) last.e = Math.max(last.e, f.e);
    else if (!last || f.s >= last.e) merged.push({ ...f });
  }
  const out: QuoteProposal[] = merged.map((m) => {
    const span = words.slice(m.s, m.e);
    const line_ids = [...new Set(span.map((x) => x.line_id))];
    return {
      key: `quran:${m.verses.join(",")}:${line_ids[0]}`,
      verse_keys: m.verses,
      match: "exact",
      partial: m.partial,
      line_ids,
      from_n: span[0].n,
      to_n: span[span.length - 1].n,
      ms_text: span.map((x) => x.w).join(" "),
      cue: hasCue(words, m.s),
      sura_name_ar: m.ar,
      sura_name_en: m.en,
    };
  });

  // 2) near matches on whole lines and two-line windows (only where no exact quote was found)
  const covered = new Set(out.flatMap((o) => o.line_ids));
  for (let i = 0; i < lines.length; i++) {
    for (const w of [1, 2]) {
      const win = lines.slice(i, i + w);
      if (win.length < w || win.some((l) => covered.has(l.line_id))) continue;
      const text = win.map((l) => l.text).join(" ");
      if (skeleton(text).split(" ").filter(Boolean).length < MIN_WORDS || isFormula(text)) continue;
      const r = matchQuran(ix, text);
      if (r.status !== "near") continue;
      const c = r.candidates[0];
      const key = `quran:${c.verses.join(",")}:${win[0].line_id}`;
      if (out.some((o) => o.key === key)) continue;
      out.push({
        key, verse_keys: c.verses, match: "near", partial: c.partial, line_ids: win.map((l) => l.line_id), from_n: win[0].n, to_n: win[win.length - 1].n,
        ms_text: text, similarity: c.similarity, cue: false, sura_name_ar: c.sura_name_ar, sura_name_en: c.sura_name_en,
      });
      win.forEach((l) => covered.add(l.line_id));
    }
  }
  return out.sort((a, b) => a.from_n - b.from_n);
}

export type WordDiff =
  | { op: "same"; ms: string; std: string }
  | { op: "spelling"; ms: string; std: string }
  | { op: "differs"; ms: string; std: string }
  | { op: "missing"; ms: ""; std: string }
  | { op: "extra"; ms: string; std: "" };

const letters = (w: string) => stripDiacritics(w).replace(/[^\p{L}]/gu, "");

/**
 * Neutral word-level comparison of the manuscript words with the standard text of the verse(s) (KFGQPC Ḥafṣ, standard
 * spelling `text_emlaey`), restricted to the part of the verse the scribe quoted.
 *  - same: identical letters, hamza seats included (vowel signs are not compared)
 *  - spelling: same letter skeleton, different alef/hamza/yāʾ/tāʾ marbūṭa spelling
 *  - differs / missing / extra: a real difference — classified later by a researcher, never called an "error"
 */
export function quoteDiff(msText: string, standard: string): WordDiff[] {
  const ms = msText.split(/\s+/).filter((w) => skeleton(w));
  const std = standard.split(/\s+/).filter((w) => skeleton(w));
  const ops = diffTokens(ms.map((w) => skeleton(w).replace(/ /g, "")), std.map((w) => skeleton(w).replace(/ /g, "")));
  // trim the unquoted remainder of the verse (leading/trailing inserts): the scribe quoted only part of it
  let a = 0, b = ops.length;
  while (a < b && ops[a].op === "insert") a++;
  while (b > a && ops[b - 1].op === "insert") b--;
  const out: WordDiff[] = [];
  let i = 0, j = 0;
  ops.forEach((o, k) => {
    const msW = ms.slice(i, i + o.a.length), stdW = std.slice(j, j + o.b.length);
    i += o.a.length; j += o.b.length;
    if (k < a || k >= b) return;
    if (o.op === "equal") {
      msW.forEach((w, x) => out.push(letters(w) === letters(stdW[x]) ? { op: "same", ms: w, std: stdW[x] } : { op: "spelling", ms: w, std: stdW[x] }));
    } else if (o.op === "replace") {
      const n = Math.max(msW.length, stdW.length);
      for (let x = 0; x < n; x++) {
        if (msW[x] && stdW[x]) out.push({ op: "differs", ms: msW[x], std: stdW[x] });
        else if (msW[x]) out.push({ op: "extra", ms: msW[x], std: "" });
        else out.push({ op: "missing", ms: "", std: stdW[x] });
      }
    } else if (o.op === "delete") msW.forEach((w) => out.push({ op: "extra", ms: w, std: "" }));
    else stdW.forEach((w) => out.push({ op: "missing", ms: "", std: w }));
  });
  return out;
}

export const QUOTE_CLASSES = ["scribal_slip", "qiraa_variant", "orthographic", "paraphrase", "unknown"] as const;
export type QuoteClass = (typeof QUOTE_CLASSES)[number];
