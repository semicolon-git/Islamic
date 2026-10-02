import { normalizeArabic } from "@/lib/quran/normalize";
import type { Lang } from "./types";

/** Text helpers for the Ask pipeline (pure). */

const AR_LETTER = /[ء-يٱ-ۓ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** Language of a question: 'ar' if Arabic letters dominate, 'en' if Latin letters do, else the fallback. */
export function detectLang(text: string, fallback: Lang = "en"): Lang {
  // A quoted Arabic phrase inside an English question ("Is this a verse: …") does not make the question Arabic.
  const latinWords = text.match(/[A-Za-z]{2,}/g)?.length ?? 0;
  const framed = latinWords >= 2 ? text.replace(/[«“"﴿][^«»“”"﴿﴾]*[»”"﴾]/g, " ").replace(/[\u0600-\u06FF\u064B-\u065F]+(\s+[\u0600-\u06FF\u064B-\u065F]+){3,}/g, " ") : text;
  const ar = framed.match(AR_LETTER)?.length ?? 0;
  const la = framed.match(LATIN_LETTER)?.length ?? 0;
  if (!ar && !la) return fallback;
  return ar >= la ? "ar" : "en";
}

/** Redact e-mail addresses and phone-like numbers before anything is logged. Verse keys (10:5) survive. */
export function redactPII(text: string): { text: string; redacted: string[] } {
  const redacted: string[] = [];
  let out = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, () => {
    redacted.push("email");
    return "[email]";
  });
  // 7+ digits, optionally separated by spaces, dashes, dots or parentheses, optional leading +
  out = out.replace(/(?:\+|00)?\d[\d\s().-]{5,}\d/g, (m) => {
    if ((m.match(/\d/g)?.length ?? 0) < 7) return m;
    redacted.push("phone");
    return "[phone]";
  });
  // Eastern Arabic digits
  out = out.replace(/[٠-٩][٠-٩\s-]{5,}[٠-٩]/g, (m) => {
    if ((m.match(/[٠-٩]/g)?.length ?? 0) < 7) return m;
    redacted.push("phone");
    return "[phone]";
  });
  return { text: out, redacted };
}

export const MAX_QUESTION = 500;
export const MIN_QUESTION = 2;

/** Lower-case Latin text with punctuation stripped and apostrophes unified. */
export function normalizeEnglish(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EN_STOP = new Set(
  (
    "a an the and or but if then so of to in on at by for with from about into over under as is are was were be been being am do does did done doing " +
    "have has had having i me my mine we us our you your yours he him his she her it its they them their this that these those there here " +
    "what which who whom whose why how when where whether can could would should will shall may might must just also very really actually " +
    "please tell explain say says said know want like give some any all not no yes than too more most much many one ones " +
    "s t don doesn didn isn aren wasn weren im ive id ill youre thats whats theres"
  ).split(" "),
);
/** Generic domain words that appear in almost every question: never enough on their own to match a card. */
export const EN_GENERIC = new Set(
  "muslim muslims islam islamic quran koran qur'an allah god religion religious believe belief faith people person prophet muhammad".split(" "),
);

const AR_STOP = new Set(
  (
    "في من على الى إلى عن ما ماذا لماذا لما كيف هل هو هي هم هن انا أنا نحن انت أنت انتم أنتم هذا هذه ذلك تلك الذي التي الذين " +
    "و او أو ثم ان أن إن كان كانت يكون لا لم لن قد كل بعض اي أي مع عند بين حتى اذا إذا لو ليس غير بل اذن إذن " +
    "يا ايها أيها له لها لهم به بها فيه فيها منه منها عليه عليها اليه إليه معنى يعني ارجو أرجو اريد أريد ممكن " +
    "اعطني أعطني اخبرني أخبرني قل"
  )
    .split(" ")
    .map((w) => normalizeArabic(w)),
);
export const AR_GENERIC = new Set(
  ["مسلم", "مسلمون", "مسلمين", "المسلمون", "المسلمين", "الاسلام", "اسلام", "القران", "قران", "الله", "دين", "الدين", "النبي", "محمد"].map((w) =>
    normalizeArabic(w),
  ),
);

/** Light English stemmer: enough to match fast/fasting/fasts, worship/worshipping, pillar/pillars. */
export function stemEn(w: string): string {
  let s = w.replace(/'s$/, "").replace(/'/g, "");
  if (s.length > 6 && s.endsWith("dden")) s = s.slice(0, -3); // forbidden → forbid, hidden → hid
  else if (s.length > 5 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("es") && /(ch|sh|x|ss|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) s = s.slice(0, -1);
  if (s.length > 4 && /(pp|tt|mm|nn|ll|gg)$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Light Arabic stemmer over normalised text: strips the article, common proclitics and a few suffixes. */
export function stemAr(w: string): string {
  let s = w;
  for (const p of ["وبال", "وال", "فال", "بال", "كال", "لل", "ال"]) {
    if (s.startsWith(p) && s.length - p.length >= 2) {
      s = s.slice(p.length);
      break;
    }
  }
  if (s.length > 3 && (s[0] === "و" || s[0] === "ف") && !/^(وح|وس|وض|ول|وق|وج|وص|وع|فت|فر|فق|فك|فه|فع)/.test(s)) s = s.slice(1);
  for (const suf of ["ات", "ون", "ين", "ان", "ها", "هم", "ه", "ي"]) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

export interface Tokens {
  all: string[]; // stems, in order (stop words removed)
  content: string[]; // stems minus generic domain words
}

/** Tokenise text in either language into comparable stems (EN and AR stems share one space). */
export function tokenize(text: string): Tokens {
  const all: string[] = [];
  const content: string[] = [];
  const ar = normalizeArabic(text.replace(/[A-Za-z]+/g, " "));
  for (const w of ar.split(" ")) {
    if (!w || w.length < 2 || AR_STOP.has(w)) continue;
    const st = stemAr(w);
    all.push(st);
    if (!AR_GENERIC.has(w) && !AR_GENERIC.has(st)) content.push(st);
  }
  const en = normalizeEnglish(text.replace(/[؀-ۿ]+/g, " "));
  for (const w of en.split(" ")) {
    if (!w || w.length < 2 || EN_STOP.has(w)) continue;
    const st = stemEn(w);
    if (!st || EN_STOP.has(st)) continue;
    all.push(st);
    if (!EN_GENERIC.has(w) && !EN_GENERIC.has(st)) content.push(st);
  }
  return { all, content };
}

/** Normalised form for phrase containment checks (both scripts). */
export function phraseNorm(s: string): string {
  const ar = normalizeArabic(s.replace(/[A-Za-z]+/g, " "));
  const en = normalizeEnglish(s.replace(/[؀-ۿ]+/g, " "));
  return `${en} ${ar}`.replace(/\s+/g, " ").trim();
}

/** True if `needle` appears in `hay` on word boundaries (both already phraseNorm'd). */
export function containsPhrase(hay: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
