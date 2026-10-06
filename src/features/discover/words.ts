import { normalizeArabic } from "@/lib/quran/normalize";

/** Word-form matchers for lexical search (pure; unit-tested). */

const PREFIX = "(?:و|ف)?(?:ب|ك|ل)?(?:ال|ل)?";
const SUFFIX = "(?:ه|ها|هم|هما|هن|كم|كما|كن|ك|نا|ني|ي|ات|ون|ين|ان|تان|تين|ا)?";

/**
 * A matcher for one Arabic subject word over normalised Quran tokens: the stem with the usual clitics
 * (و/ف, ب/ك/ل, ال) and endings (pronouns, sound plurals, dual). Broken plurals are not derived: the vision step
 * supplies them as separate terms. Stems shorter than 3 letters are ignored (too ambiguous).
 */
export function arabicWordMatcher(term: string, opts: { strict?: boolean } = {}): ((token: string) => boolean) | null {
  let stem = normalizeArabic(term).replace(/\s+/g, " ").trim();
  if (!stem || stem.includes(" ")) return null;
  stem = stem.replace(/^(?:و|ف)?(?:ب|ك|ل)?ال(?=...)/, "");
  if ([...stem].length < 3) return null;
  // A final tā' marbūṭa (normalised to ه) becomes ت before endings: نخله / نخلتين.
  const core = stem.endsWith("ه") ? `${escape(stem.slice(0, -1))}(?:ه|ت)` : escape(stem);
  // strict: the word itself with its proclitics only (no endings) — used when no AI judges the matches.
  const re = new RegExp(`^${PREFIX}${opts.strict ? escape(stem) : core}${opts.strict ? "" : SUFFIX}$`);
  return (token: string) => re.test(token);
}

/** A matcher for one English word over a lower-cased translation (whole word, simple plural). */
export function englishWordMatcher(term: string): ((text: string) => boolean) | null {
  const w = term.toLowerCase().replace(/[^a-z' -]/g, "").trim();
  if (w.length < 3 || STOP.has(w)) return null;
  const base = w.replace(/(?:es|s)$/, "");
  const re = new RegExp(`\\b${escape(w)}\\b|\\b${escape(base)}(?:s|es)?\\b`);
  return (text: string) => re.test(text);
}

const STOP = new Set(["the", "and", "with", "from", "that", "this", "thing", "object", "photo", "picture", "image"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A stable cache key for a subject: the English label (lower-case words) or else the normalised Arabic label. */
export function subjectKey(label_en: string, label_ar: string): string {
  const en = label_en.toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (en) return `en:${en}`;
  const ar = normalizeArabic(label_ar).replace(/^ال/, "").trim();
  return ar ? `ar:${ar}` : "";
}

/** Which of the terms occur as words in a text (Arabic via normalised tokens, English whole words). */
export function termsIn(text: string, terms: string[], opts: { strict?: boolean } = {}): string[] {
  const tokens = normalizeArabic(text).split(" ");
  const lower = text.toLowerCase();
  return terms.filter((t) => {
    if (/[\u0600-\u06FF]/.test(t)) {
      const m = arabicWordMatcher(t, opts);
      return !!m && tokens.some(m);
    }
    const m = englishWordMatcher(t);
    return !!m && m(lower);
  });
}
