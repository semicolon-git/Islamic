/**
 * Pure helpers for scripts/content-check.ts (no I/O). Covered by lib.test.ts.
 * Rules follow docs/review/signs-around-you-review.md §9.2 (V2–V9) and SPEC §1.
 */

// ───────────────────────── Arabic normalisation
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Strip tashkeel/tatweel and fold common letter variants, for comparison only (never for display). */
export function normalizeArabic(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const arabicTokens = (s: string) => normalizeArabic(s).split(" ").filter(Boolean);

export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Longest run of consecutive tokens of `prose` that also occurs, in order, in `verse` (V3 check). */
export function longestSharedRun(prose: string, verse: string): { length: number; text: string } {
  const a = arabicTokens(prose);
  const b = arabicTokens(verse);
  let best = 0;
  let end = 0;
  // classic DP for longest common substring over token arrays
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) {
          best = cur[j];
          end = i;
        }
      }
    }
    prev = cur;
  }
  return { length: best, text: a.slice(end - best, end).join(" ") };
}

// ───────────────────────── Citations
export interface Citation {
  kind: "verse" | "hadith";
  /** "10:5" or "bukhari:1042" */
  ref: string;
  raw: string;
}
export interface CitationParse {
  citations: Citation[];
  /** Parenthetical parts that look like citations but could not be resolved (e.g. an unknown sura name). */
  unresolved: string[];
}

/** suraByName: normalised Arabic sura name → sura number. */
export function parseCitations(text: string, suraByName: Map<string, number>): CitationParse {
  const citations: Citation[] = [];
  const unresolved: string[] = [];
  const groups = text.match(/\(([^()]*)\)/g) ?? [];
  for (const g of groups) {
    const inner = g.slice(1, -1);
    for (let part of inner.split(/[;؛,،]/)) {
      part = part.trim();
      if (!part) continue;
      // English verse: 10:5 or 14:24–25
      let m = part.match(/^(\d{1,3}):(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?$/);
      if (m) {
        const s = Number(m[1]);
        const from = Number(m[2]);
        const to = m[3] ? Number(m[3]) : from;
        for (let a = from; a <= to; a++) citations.push({ kind: "verse", ref: `${s}:${a}`, raw: part });
        continue;
      }
      // English hadith: al-Bukhari 1042 / Bukhari 1042 / Muslim 1716
      m = part.match(/^(?:al-)?(bukhari|muslim)\s+(\d+[a-z]?)$/i);
      if (m) {
        citations.push({ kind: "hadith", ref: `${m[1].toLowerCase()}:${m[2]}`, raw: part });
        continue;
      }
      // Arabic: "يونس ٥", "الإخلاص ١–٤", "البخاري ١٠٤٢", "ومسلم ١٧١٦"
      m = part.match(/^(?:و\s*)?([؀-ۿ][؀-ۿ\s]*?)\s+([٠-٩0-9]+)(?:\s*[–-]\s*([٠-٩0-9]+))?$/);
      if (m) {
        let name = normalizeArabic(m[1]);
        const from = Number(toWesternDigits(m[2]));
        const to = m[3] ? Number(toWesternDigits(m[3])) : from;
        if (name.startsWith("و") && !suraByName.has(name) && (name.slice(1) === "مسلم" || name.slice(1) === "البخاري" || suraByName.has(name.slice(1)))) name = name.slice(1);
        if (name === "البخاري" || name === "مسلم") {
          citations.push({ kind: "hadith", ref: `${name === "البخاري" ? "bukhari" : "muslim"}:${from}`, raw: part });
          continue;
        }
        const s = suraByName.get(name.replace(/^سوره /, ""));
        if (s) {
          for (let a = from; a <= to; a++) citations.push({ kind: "verse", ref: `${s}:${a}`, raw: part });
        } else {
          unresolved.push(part);
        }
      }
    }
  }
  return { citations, unresolved };
}

// ───────────────────────── Sentences
export function sentences(text: string): string[] {
  return text
    .split(/(?:[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────── Banned framings (review §9.2)
export interface Rule {
  id: string;
  re: RegExp;
  why: string;
}

const W = "[A-Za-z]"; // word char class for English boundaries
const AL = "[\\u0621-\\u064A]"; // Arabic letter class for Arabic boundaries
const enWord = (words: string) => new RegExp(`(^|[^A-Za-z])(${words})(?!${W})`, "i");
const arWord = (words: string) => new RegExp(`(^|[^\\u0621-\\u064A])(${words})(?!${AL})`);

/** Applied to every prose field (explanations, notes, tafsir paraphrases). Titles and match phrases are questions and are exempt. */
export const BANNED: Rule[] = [
  // V5: grade words belong to the hadith block, never to prose
  { id: "V5", re: enWord("sahih|hasan|da'?if|authentic|weak|agreed upon"), why: "grade word in prose" },
  { id: "V5", re: arWord("صحيح|حسن|ضعيف|موضوع|متفق عليه"), why: "grade word in prose" },
  // V6: occurrence claims come from code ({{fact}} / show_count), not prose
  { id: "V6", re: /\d+\s+times|mentioned\s+\d+|\d+\s+verses|occurs\s+\d+/i, why: "occurrence count in prose" },
  { id: "V6", re: /ذكر[^.؟!]*\s(مرة|مرات)(?![ء-ي])|[٠-٩0-9]+\s+(مرة|مرات)(?![ء-ي])/, why: "occurrence count in prose" },
  // V7: rulings directed at the reader; preference among views
  { id: "V7", re: enWord("permissible for you|forbidden for you|you must|you may|you should not|you are obliged"), why: "ruling directed at the reader" },
  { id: "V7", re: arWord("يجوز لك|لا يجوز لك|يجب عليك|يحرم عليك|حكمك|عليك أن"), why: "ruling directed at the reader" },
  { id: "V7", re: enWord("the correct view|the strongest opinion|strongest view|the preferred view"), why: "preference among scholarly views (tarjih)" },
  { id: "V7", re: /الراجح|الأرجح|القول الصحيح|والصحيح من/, why: "preference among scholarly views (tarjih)" }, // prefixes (و/ف/ب) allowed
  // V8: glossary term-lock (banned renderings beyond the glossary's own lists)
  { id: "V8", re: enWord("holy war|moon god|moon-god|islamic penal code|proselyti[sz]ing|infidels?"), why: "banned rendering (term-lock)" },
  { id: "V8", re: enWord("unity"), why: "bare 'unity' as a rendering of tawhid" },
  // V9: persona and science/miracle framing
  { id: "V9", re: enWord("as a (scholar|sheikh|mufti)|my fatwa"), why: "persona claim" },
  { id: "V9", re: arWord("أفتيك|فتواي"), why: "persona claim" },
  { id: "V9", re: enWord("scientific miracles?|numerical miracles?|miracles?|science (proves|confirms|has proven)|scientifically proven|modern science|1400 years ago|1,400 years ago"), why: "science / miracle framing" },
  { id: "V9", re: /إعجاز|معجز|أثبت العلم|العلم الحديث|قبل ١٤٠٠ عام|قبل 1400 عام/, why: "science / miracle framing" },
];

/** Consensus words are allowed only when the card is tagged certainty = 'ijma'. */
export const CONSENSUS: Rule[] = [
  { id: "V7", re: enWord("consensus|all scholars agree|scholars unanimously|ijma'?"), why: "consensus claim without an ijma'-tagged card" },
  { id: "V7", re: arWord("إجماع|بالإجماع|أجمع العلماء|اتفق العلماء"), why: "consensus claim without an ijma'-tagged card" },
];

/** V4: a hadith attribution must carry a hadith citation in the same sentence. */
export const ATTRIBUTION = [
  /the Prophet\s*(said|ﷺ)/i,
  /(^|[^A-Za-z])narrated(?![A-Za-z])/i,
  /قال رسول الله|قال النبي|عن النبي|أخبر النبي|وأخبر النبي/,
];

export function bannedHits(text: string, rules: Rule[]): { rule: Rule; match: string }[] {
  const out: { rule: Rule; match: string }[] = [];
  for (const r of rules) {
    const m = text.match(r.re);
    if (m) out.push({ rule: r, match: (m[2] ?? m[0]).trim() });
  }
  return out;
}

/** Return sentences that attribute words or deeds to the Prophet ﷺ without citing a hadith. */
export function unattributedSentences(text: string, suraByName: Map<string, number>): string[] {
  return sentences(text).filter((s) => ATTRIBUTION.some((re) => re.test(s)) && !parseCitations(s, suraByName).citations.some((c) => c.kind === "hadith"));
}
