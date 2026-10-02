/**
 * Live lint for card prose (explanation, civilisational note, disagreement note).
 * Mirrors the deterministic validators of the review doc §9.2 (V4–V9) so authors see problems while typing,
 * long before a reviewer does. Pure and shared by the editor (live) and the server (on submit/publish).
 */

export type LintRule =
  | "hadith_attribution" // V4
  | "grade_words" // V5
  | "occurrence_count" // V6
  | "ruling_phrase" // V7 (level D / everywhere)
  | "tarjih" // V7 (level C: no preference)
  | "consensus" // V7 (consensus words without an ijma-tagged source)
  | "glossary_banned" // V8
  | "persona" // V9
  | "science_framing" // V9
  | "quran_in_prose"; // V3 (light: ornate brackets typed into prose)

export type LintField = "explanation" | "civilizational_note" | "disagreement_note";
export type LintLang = "en" | "ar";

export interface LintWarning {
  rule: LintRule;
  field: LintField;
  lang: LintLang;
  /** The exact text that triggered the rule. */
  match: string;
  /** Validator id from the review doc, for the "why" tooltip. */
  ref: "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9";
}

export interface LintInput {
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  hadithIds: string[];
  explanation?: { en?: string; ar?: string };
  civilizational_note?: { en?: string; ar?: string } | null;
  disagreement_note?: { en?: string; ar?: string } | null;
  /** Glossary banned renderings (e.g. "holy war"), lower-case or Arabic. */
  bannedRenderings?: { term: string; rendering: string }[];
}

const AR = "؀-ۿ";
/** Arabic "word" boundary helpers (JS \b does not understand Arabic letters). */
const arWord = (alts: string, prefix = "(?:و|ف|ب|ل)?(?:ال)?") => new RegExp(`(?:^|[^${AR}])(${prefix}(?:${alts}))(?=$|[^${AR}])`, "g");

// V4 — attributing words to the Prophet ﷺ needs a hadith reference in the same sentence.
const ATTRIBUTION_EN = /\b(?:the prophet(?: muhammad)?(?:\s*(?:ﷺ|\(ﷺ\)|\(pbuh\)|pbuh|\(saw\)))?\s+(?:said|taught|told|stated|declared|used to say)|allah's messenger(?:\s*\(ﷺ\))?\s+said|narrated)\b/gi;
const ATTRIBUTION_AR = /(?:قال|أخبر|حدّث|حدث|قول)\s+(?:رسول\s+الله|النبي|النبيّ)|عن\s+(?:النبي|النبيّ|رسول\s+الله)/g;
const HADITH_REF = /(?:(?:al-)?(bukh[aā]r[iī])|(muslim)|(البخاري)|(مسلم))\s*[(:#]?\s*([0-9٠-٩]+[a-z]?)/gi;

/** Hadith ids referenced in prose, e.g. "(al-Bukhari 1042)" or "(البخاري ١٠٤٢)" → ["bukhari:1042"]. */
export function citedHadith(text: string): string[] {
  const out: string[] = [];
  HADITH_REF.lastIndex = 0;
  for (const m of text.matchAll(HADITH_REF)) {
    const coll = m[1] || m[3] ? "bukhari" : "muslim";
    const num = m[5].replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    out.push(`${coll}:${num}`);
  }
  return out;
}

// V5 — grades are shown from the database, never written in prose.
const GRADE_EN = /\b(sahih|hasan|da['’]?if|daif|authentic|weak|agreed upon|fabricated)\b(?!\s+(?:al-)?(?:bukhari|muslim))/gi;
const GRADE_AR = arWord("صحيح|حسن|ضعيف|موضوع|متفق عليه", "(?:و)?(?:ال)?");
const BOOK_AR = /صحيح\s+(?:البخاري|مسلم)/g;

// V6 — occurrence counts come from code (show_count), never from prose.
const COUNT_EN = /\b(?:\d+\s+times|mentioned\s+\d+|\d+\s+(?:verses|occurrences))\b/gi;
const COUNT_AR = /ذُ?كِ?ر.{0,40}?[0-9٠-٩]+\s*مر(?:ة|ات)|[0-9٠-٩]+\s*مر(?:ة|ات)\s+في\s+القرآن/g;

// V7 — no rulings, no preference between scholarly views, consensus only with an ijma-tagged source.
const RULING_EN = /\b(?:permissible for you|forbidden for you|you (?:must|may|should not|are (?:not )?allowed to)|it is (?:haram|halal) for you)\b/gi;
const RULING_AR = /(?:يجوز لك|لا يجوز لك|يجب عليك|يحرم عليك|حكمك|عليك أن)/g;
const TARJIH_EN = /\b(?:the correct view|the strongest (?:opinion|view)|the preponderant (?:opinion|view)|the right opinion)\b/gi;
const TARJIH_AR = /(?:الراجح|القول الصحيح|الصواب أن)/g;
const CONSENSUS_EN = /\b(?:consensus|ijma['’]?|all (?:scholars|muslims) agree|scholars (?:all )?agree|unanimous(?:ly)?)\b/gi;
const CONSENSUS_AR = /(?:إجماع|الإجماع|بالإجماع|أجمع(?:ت)?\s+(?:العلماء|الأمة)|اتفق العلماء)/g;

// V9 — persona and "scientific miracle" framing.
const PERSONA_EN = /\b(?:as a (?:scholar|sheikh|shaykh|mufti)|my fatwa)\b/gi;
const PERSONA_AR = /(?:أفتيك|فتواي)/g;
const SCIENCE_EN = /\b(?:scientific miracles?|science (?:proves|confirms|has proven|has confirmed)|modern science (?:proves|confirms|discovered)|1400 years ago)\b/gi;
const SCIENCE_AR = /(?:إعجاز علمي|الإعجاز العلمي|أثبت العلم|العلم الحديث أثبت|أكد العلم)/g;

// V3 (light) — ornate Quran brackets typed into prose mean Quran text was pasted instead of referenced.
const QURAN_BRACKETS = /[﴿﴾][^﴿﴾]{0,80}[﴿﴾]?/g;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?؟。])\s+|\n+/).filter((s) => s.trim());
}

function all(re: RegExp, text: string, group = 0): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) out.push((m[group] ?? m[0]).trim());
  return out;
}

function lintText(text: string, lang: LintLang, field: LintField, input: LintInput): LintWarning[] {
  if (!text.trim()) return [];
  const w: LintWarning[] = [];
  const push = (rule: LintRule, ref: LintWarning["ref"], matches: string[]) => {
    for (const match of new Set(matches)) w.push({ rule, field, lang, match, ref });
  };

  // V4: sentence-level — every attribution sentence needs a hadith reference that the card actually cites.
  const attr = lang === "en" ? ATTRIBUTION_EN : ATTRIBUTION_AR;
  for (const s of sentences(text)) {
    const hits = all(attr, s);
    if (!hits.length) continue;
    const refs = citedHadith(s);
    const cited = refs.some((r) => input.hadithIds.includes(r));
    if (!cited) push("hadith_attribution", "V4", hits);
  }

  // V5
  if (lang === "en") push("grade_words", "V5", all(GRADE_EN, text));
  else push("grade_words", "V5", all(GRADE_AR, text.replace(BOOK_AR, " "), 1));

  // V6
  push("occurrence_count", "V6", all(lang === "en" ? COUNT_EN : COUNT_AR, text));

  // V7
  push("ruling_phrase", "V7", all(lang === "en" ? RULING_EN : RULING_AR, text));
  push("tarjih", "V7", all(lang === "en" ? TARJIH_EN : TARJIH_AR, text));
  if (input.certainty !== "ijma") push("consensus", "V7", all(lang === "en" ? CONSENSUS_EN : CONSENSUS_AR, text));

  // V8
  for (const b of input.bannedRenderings ?? []) {
    const r = b.rendering.trim();
    if (!r) continue;
    const isAr = new RegExp(`[${AR}]`).test(r);
    if ((lang === "ar") !== isAr) continue;
    const re = isAr ? new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g") : new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    push("glossary_banned", "V8", all(re, text));
  }

  // V9
  push("persona", "V9", all(lang === "en" ? PERSONA_EN : PERSONA_AR, text));
  push("science_framing", "V9", all(lang === "en" ? SCIENCE_EN : SCIENCE_AR, text));

  // V3
  push("quran_in_prose", "V3", all(QURAN_BRACKETS, text));
  return w;
}

/** Run every rule over every prose field. Empty fields produce no warnings (the checklist reports them). */
export function lintCard(input: LintInput): LintWarning[] {
  const out: LintWarning[] = [];
  const fields: [LintField, { en?: string; ar?: string } | null | undefined][] = [
    ["explanation", input.explanation],
    ["civilizational_note", input.civilizational_note],
    ["disagreement_note", input.disagreement_note],
  ];
  for (const [field, val] of fields) {
    if (!val) continue;
    out.push(...lintText(val.en ?? "", "en", field, input));
    out.push(...lintText(val.ar ?? "", "ar", field, input));
  }
  return out;
}

/** Stable fingerprint of a warning set, so an acknowledgement is tied to the exact warnings the author saw. */
export function lintFingerprint(w: LintWarning[]): string {
  return w
    .map((x) => `${x.rule}|${x.field}|${x.lang}|${x.match.toLowerCase()}`)
    .sort()
    .join("\n");
}
