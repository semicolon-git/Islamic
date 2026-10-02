/**
 * Turn a matcher result (`@/lib/quran` matchText) into what the inscription screen shows.
 * Pure: the caller passes the verses (from quran_ayah) it fetched for the keys in the result.
 *
 * Wording rules (SPEC §1, review §17):
 *  - exact → every location is listed (2:255 and 3:2 both contain the opening of Ayat al-Kursi).
 *  - near  → neutral: "the inscription reads … / the standard text reads …". Never "wrong":
 *            scribal variation, spelling or the photo reading can explain a difference.
 *  - none  → we say we can't identify a verse and do not guess.
 */
import type { MatchResult } from "@/lib/quran/matcher";
import { diffTokens, skeleton } from "@/lib/quran/normalize";

export interface InscriptionVerse {
  key: string;
  sura: number;
  aya: number;
  text_uthmani: string;
  text_emlaey: string;
  sura_name_ar: string;
  sura_name_en: string;
  translation?: { edition_id: string; edition_name: string; text: string } | null;
}

export interface ViewLocation {
  keys: string[];
  ref: string; // "24:35", "112:1–2"
  sura: number;
  ayaFrom: number;
  ayaTo: number;
  partial: boolean;
  sura_name_ar: string;
  sura_name_en: string;
  verses: InscriptionVerse[];
}

export type WordState = "same" | "differs" | "extra" | "missing";
export interface AlignedWord {
  w: string;
  state: WordState;
}
export interface Difference {
  op: "replace" | "insert" | "delete";
  given: string; // what the inscription reads ("" when a word is missing)
  standard: string; // what the standard text reads ("" when the inscription has an extra word)
}
export interface Alignment {
  inscription: AlignedWord[];
  standard: AlignedWord[];
  differences: Difference[];
}

export interface ViewCandidate extends ViewLocation {
  similarity: number;
  alignment: Alignment;
}

export type InscriptionView =
  | { status: "exact"; input: string; locations: ViewLocation[] }
  | { status: "near"; input: string; candidates: ViewCandidate[] }
  | { status: "none"; input: string }
  | { status: "too_short"; input: string };

/** "24:35", "112:1–2", "2:286–3:1". */
export function refLabel(keys: string[]): string {
  if (!keys.length) return "";
  if (keys.length === 1) return keys[0];
  const [s1, a1] = keys[0].split(":");
  const [s2, a2] = keys[keys.length - 1].split(":");
  return s1 === s2 ? `${s1}:${a1}–${a2}` : `${keys[0]}–${keys[keys.length - 1]}`;
}

function location(keys: string[], partial: boolean, names: { ar: string; en: string }, verseMap: Map<string, InscriptionVerse>): ViewLocation {
  const [sura, ayaFrom] = keys[0].split(":").map(Number);
  const ayaTo = Number(keys[keys.length - 1].split(":")[1]);
  return {
    keys,
    ref: refLabel(keys),
    sura,
    ayaFrom,
    ayaTo,
    partial,
    sura_name_ar: names.ar,
    sura_name_en: names.en,
    verses: keys.map((k) => verseMap.get(k)).filter((v): v is InscriptionVerse => !!v),
  };
}

/** Every verse key a match result refers to (to fetch them in one query). */
export function keysOf(m: MatchResult): string[] {
  const out = new Set<string>();
  if (m.status === "exact") m.locations.forEach((l) => l.verses.forEach((k) => out.add(k)));
  if (m.status === "near") m.candidates.forEach((c) => c.verses.forEach((k) => out.add(k)));
  return [...out];
}

const words = (s: string) => s.split(/\s+/).map((w) => w.trim()).filter(Boolean);

/**
 * Word-level comparison of the inscription with the standard (imlāʾī) text of the matched verse(s),
 * done on letter skeletons (so spelling of alef, hamza, tashkil doesn't count as a difference),
 * but reported with the original words. Standard-text words before/after the quoted portion are
 * trimmed: quoting part of a verse is not a difference.
 */
export function alignWords(inscriptionText: string, standardText: string): Alignment {
  const inW = words(inscriptionText).filter((w) => skeleton(w));
  const stW = words(standardText).filter((w) => skeleton(w));
  const ops = diffTokens(inW.map(skeleton), stW.map(skeleton));
  // Trim leading/trailing standard-only words (the rest of the verse, outside the quote).
  let lo = 0;
  let hi = ops.length;
  while (lo < hi && ops[lo].op === "insert") lo++;
  while (hi > lo && ops[hi - 1].op === "insert") hi--;
  let i = 0;
  let j = 0;
  for (let k = 0; k < lo; k++) j += ops[k].b.length;
  const inscription: AlignedWord[] = [];
  const standard: AlignedWord[] = [];
  const differences: Difference[] = [];
  for (let k = lo; k < hi; k++) {
    const o = ops[k];
    const given = inW.slice(i, i + o.a.length);
    const std = stW.slice(j, j + o.b.length);
    i += o.a.length;
    j += o.b.length;
    if (o.op === "equal") {
      given.forEach((w) => inscription.push({ w, state: "same" }));
      std.forEach((w) => standard.push({ w, state: "same" }));
      continue;
    }
    given.forEach((w) => inscription.push({ w, state: o.op === "delete" ? "extra" : "differs" }));
    std.forEach((w) => standard.push({ w, state: o.op === "insert" ? "missing" : "differs" }));
    differences.push({ op: o.op as Difference["op"], given: given.join(" "), standard: std.join(" ") });
  }
  return { inscription, standard, differences };
}

/** Map a matcher result plus fetched verses to the screen model. */
export function toInscriptionView(m: MatchResult, verses: InscriptionVerse[]): InscriptionView {
  const verseMap = new Map(verses.map((v) => [v.key, v]));
  switch (m.status) {
    case "exact":
      return {
        status: "exact",
        input: m.input,
        locations: m.locations.map((l) => location(l.verses, l.partial, { ar: l.sura_name_ar, en: l.sura_name_en }, verseMap)),
      };
    case "near":
      return {
        status: "near",
        input: m.input,
        candidates: m.candidates.map((c) => {
          const loc = location(c.verses, c.partial, { ar: c.sura_name_ar, en: c.sura_name_en }, verseMap);
          const standardText = loc.verses.map((v) => v.text_emlaey).join(" ");
          return { ...loc, similarity: c.similarity, alignment: alignWords(m.input, standardText) };
        }),
      };
    default:
      return { status: m.status, input: m.input };
  }
}

/** Verse keys a result proposes (for the portal inscription task): all exact locations, else the best near candidate. */
export function proposedKeys(m: MatchResult): string[] {
  if (m.status === "exact") return [...new Set(m.locations.flatMap((l) => l.verses))];
  if (m.status === "near") return m.candidates[0]?.verses ?? [];
  return [];
}
