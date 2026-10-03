/**
 * Hard words: blind double-keying of uncertain tokens (research memo §4.2/§4.3, S4). Pure, shared by client and server.
 *
 * - A token marked `unclear` (by the machine with a low model score, or by a person) becomes a hard word.
 * - Two different students key it independently; neither sees the other reading nor the machine guess until they submit.
 * - Agreement after normalisation becomes consensus automatically; disagreement goes to a researcher.
 * - The result is written as a new `consensus` line version through the normal versioning (base_version), never in place.
 */
import { normalizeStoreText, stripDiacritics } from "../manuscripts/text";
import { editorString, mergeAdjacent, segments, type Tok } from "../manuscripts/tokens";
import { bbox, type Polygon } from "../manuscripts/geometry";

export type CantRead = "illegible" | "damage";

/** One keyer's answer: a reading, or "can't read" with a reason. */
export type Keying = { reading: string; cant_read?: null } | { reading?: null; cant_read: CantRead };

/** Form used to compare two readings: NFC, no tatweel/diacritics, no bidi or punctuation, single spaces. */
export function keyForm(s: string): string {
  return stripDiacritics(normalizeStoreText(s ?? "").text)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact form (keeps vowel signs) after Unicode hygiene, for deciding whether two keyers also agree on the vowels. */
export const exactForm = (s: string) => normalizeStoreText(s ?? "").text.replace(/ـ/g, "").replace(/\s+/g, " ").trim();

export type ConsensusOutcome =
  | { kind: "agree"; reading: string; vowelsDiffer: boolean }
  | { kind: "agree_gap"; reason: CantRead }
  | { kind: "disagree" };

/**
 * Compare two independent keyings.
 * - Same letters → consensus. If they also agree on the vowel signs, keep them; otherwise keep the letters only
 *   (vowels nobody agreed on are not written into the manuscript text).
 * - Both "can't read" → consensus on a gap (damage wins over illegible: it is the stronger, physical claim).
 * - Anything else → a researcher adjudicates.
 */
export function compareKeyings(a: Keying, b: Keying): ConsensusOutcome {
  if (a.cant_read && b.cant_read) return { kind: "agree_gap", reason: a.cant_read === "damage" || b.cant_read === "damage" ? "damage" : "illegible" };
  if (a.cant_read || b.cant_read) return { kind: "disagree" };
  const ra = a.reading ?? "", rb = b.reading ?? "";
  const ka = keyForm(ra), kb = keyForm(rb);
  if (!ka || !kb || ka !== kb) return { kind: "disagree" };
  const ea = exactForm(ra), eb = exactForm(rb);
  if (ea === eb) return { kind: "agree", reading: ea, vowelsDiffer: false };
  return { kind: "agree", reading: ka, vowelsDiffer: true };
}

/** Whether a keyer's answer matches the final decision (used for points: only accepted work earns). */
export function keyingMatches(k: Keying, final: { text: string | null; gap: CantRead | null }): boolean {
  if (final.gap) return !!k.cant_read;
  if (k.cant_read || !final.text) return false;
  return keyForm(k.reading ?? "") === keyForm(final.text);
}

export interface UnclearToken {
  index: number;
  v: string;
  alts: string[];
  conf?: number;
  /** A person marked it (cert set) rather than the machine (model score). */
  person: boolean;
}

/** Uncertain tokens of a line version, in order. */
export function unclearTokens(toks: Tok[]): UnclearToken[] {
  const out: UnclearToken[] = [];
  toks.forEach((k, index) => {
    if (k.t === "unclear" && k.v.trim()) out.push({ index, v: k.v, alts: k.alts ?? [], conf: k.conf, person: !!k.cert && k.conf === undefined });
  });
  return out;
}

/**
 * Re-find a hard word in a newer version of its line: the first still-uncertain token with the same text that is not
 * already claimed by another hard word. Returns -1 when the word was edited away (the item becomes stale).
 */
export function remapToken(toks: Tok[], text: string, claimed: Set<number> = new Set()): number {
  const want = exactForm(text);
  const hit = toks.findIndex((k, i) => k.t === "unclear" && !claimed.has(i) && exactForm(k.v) === want);
  return hit;
}

export const MASK = "▒▒▒";

/** The line around the hard word, with the word itself masked (keyers must not see the guess). */
export function maskedContext(toks: Tok[], index: number): { before: string; after: string } {
  const str = editorString(toks);
  const seg = segments(toks)[index];
  if (!seg) return { before: str, after: "" };
  return { before: str.slice(0, seg.start), after: str.slice(seg.end) };
}

/** Replace the hard word by the decided reading (plain, now certain text) or by a gap. Never touches other tokens. */
export function applyDecision(toks: Tok[], index: number, decision: { text: string } | { gap: CantRead }): Tok[] {
  const k = toks[index];
  if (!k || k.t !== "unclear") throw new Error("not an uncertain token");
  const out = toks.slice();
  if ("gap" in decision) {
    // keep the word boundaries: a gap is atomic, surrounding spaces stay in the neighbouring text spans
    out[index] = { t: "gap", reason: decision.gap, extent: 1, unit: "word" };
  } else {
    const v = exactForm(decision.text);
    if (!v) throw new Error("empty reading");
    out[index] = { t: "text", v };
  }
  return mergeAdjacent(out);
}

/**
 * Approximate the token's box on the page image from its character position in the line (RTL: the line starts at the
 * right edge of its bounding box). It is an estimate only — the UI labels it "approximate" and always shows the whole line.
 */
export function approxTokenBox(polygon: Polygon, toks: Tok[], index: number): { x: number; y: number; w: number; h: number } | null {
  const b = bbox(polygon);
  const str = editorString(toks);
  const seg = segments(toks)[index];
  if (!seg || !str.length || b.w <= 0 || b.h <= 0 || b.h > b.w * 1.6) return null; // vertical glosses: no estimate
  const from = seg.start / str.length, to = seg.end / str.length;
  const pad = 0.04;
  const x1 = b.x + b.w * (1 - Math.min(1, to + pad));
  const x0 = b.x + b.w * (1 - Math.max(0, from - pad));
  return { x: Math.round(x1), y: Math.round(b.y), w: Math.max(8, Math.round(x0 - x1)), h: Math.round(b.h) };
}
