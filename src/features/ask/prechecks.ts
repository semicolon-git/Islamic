import { normalizeArabic } from "@/lib/quran/normalize";
import type { GlossaryTerm } from "@/lib/glossary";
import { normalizeEnglish, wordCount } from "./text";

/**
 * Deterministic pre-checks (pure, < 10 ms). They run before any retrieval or model call, and the floors they set
 * (level D, X) can never be lowered by a later step.
 *
 * Floors are deliberately NARROW (review §9.2): only first-person / personal-case ruling patterns force level D,
 * so ordinary newcomer questions ("Can I visit a mosque?", "Why do Muslims fast?") are still answered.
 */

const AR_END = "(?=$|[\\s؟?!.,،:؛])";

// ───────────────────────── Level-D floors (personal rulings)
const D_EN: [string, RegExp][] = [
  ["first_person_ruling", /\b(is|are|was|would|will)\s+(it|this|that)\s+(really\s+|still\s+)?(halal|haram|allowed|permissible|permitted|lawful|unlawful|forbidden|prohibited|a\s+sin|sinful|makruh|valid|invalid)\s+(for|to)\s+(me|us|my|our|him|her|them|his|their)\b/i],
  ["first_person_ruling", /\b(is|are)\s+(it|this|that)\s+(halal|haram|allowed|permissible|permitted|lawful|forbidden|a\s+sin)\s+if\s+(i|we|my|our)\b/i],
  ["first_person_ruling", /\bam\s+i\s+(allowed|permitted|obliged|obligated|required|sinning|committing\s+a\s+sin|in\s+sin|a\s+sinner)\b/i],
  ["first_person_ruling", /\b(do|would|will)\s+i\s+(have|need)\s+to\s+(pray|fast|pay|make\s+up|perform|give|wear|cover|repeat|redo)\b/i],
  ["first_person_ruling", /\b(do|does|did|will|would)\s+(i|we)\s+(commit|incur)\s+(a\s+)?sin\b/i],
  ["my_case", /\b(is|was|are)\s+my\s+(marriage|nikah|nikkah|divorce|talaq|fast|fasting|prayers?|salah|salat|wudu|wudhu|ablution|zakat|zakah|hajj|umrah|inheritance|will|contract|income|salary|job|business|loan|mortgage|investment|vow|oath)\s+(still\s+)?(valid|invalid|allowed|halal|haram|accepted|broken|void|correct|permissible|sound|lawful|unlawful)\b/i],
  ["my_case", /\bmy\s+(marriage|nikah|nikkah|divorce|talaq|fast|fasting|prayers?|salah|wudu|wudhu|inheritance|zakat|zakah|hajj|umrah)\b.{0,80}\b(valid|invalid|allowed|halal|haram|accepted|broken|void|permissible|count|counts|still\s+count|break|breaks|broke|a\s+sin)\b/i],
  ["my_case", /\b(does|did|will|would)\s+(it|this|that)\s+(break|invalidate|nullify|void)\s+my\s+(fast|prayer|salah|wudu|wudhu|marriage|nikah|hajj|umrah)\b/i],
  ["my_case", /\b(should|must|can|may)\s+(i|we)\s+(divorce|marry|re-?marry)\b/i],
  ["my_case", /\bwhat\s+(should|must)\s+i\s+do\b.{0,80}\b(divorce|marriage|nikah|inheritance|fast|prayer|zakat|husband|wife|loan|interest|riba|mortgage)\b/i],
  ["my_case", /\bwhat\s+is\s+the\s+ruling\s+(on|for|about)\s+(my|me|our|us)\b/i],
  ["proxy_case", /\basking\s+for\s+a\s+(friend|relative|family\s+member|cousin|colleague)\b/i],
  ["proxy_case", /\bmy\s+(friend|brother|sister|cousin|husband|wife|son|daughter|father|mother|dad|mom|mum|neighbou?r|colleague|relative)\s+(wants|asks|asked|is\s+asking|would\s+like|needs)\s+to\s+know\s+(if|whether)\b/i],
  ["fatwa_demand", /\b(give|issue|tell|send)\s+(me|us)\s+(a|an|your)\s+(fatwa|fatwah|religious\s+ruling|ruling|verdict)\b/i],
  ["fatwa_demand", /\b(as\s+a\s+(scholar|sheikh|shaykh|mufti|imam))\b.{0,60}\b(rule|ruling|fatwa|halal|haram|allowed)\b/i],
  ["fatwa_demand", /\byes\s+or\s+no\b.{0,80}\b(halal|haram|allowed|permissible|a\s+sin|forbidden)\b/i],
  ["fatwa_demand", /\b(halal|haram|allowed|permissible|a\s+sin|forbidden)\b.{0,80}\b(yes\s+or\s+no|just\s+(say|answer)\s+(yes|no))\b/i],
];

const D_AR: [string, RegExp][] = [
  ["first_person_ruling", new RegExp(`هل\\s+(يجوز|يحل|يحق|يصح|يجب|يلزم|يحرم|يكره|يباح)\\s+(لي|لنا|علي|عليّ|علينا|عليا)${AR_END}`)],
  ["first_person_ruling", new RegExp(`هل\\s+(علي|عليّ|علينا)${AR_END}`)],
  ["first_person_ruling", new RegExp(`هل\\s+(أنا|انا)\\s+(آثم|اثم|آثمة|اثمة|مذنب|مذنبة|عاص|عاصي)${AR_END}`)],
  ["first_person_ruling", /هل\s+(أأثم|اأثم|آثم|أكون\s+آثما|اكون\s+اثما)/],
  ["my_case", /هل\s+(زواجي|طلاقي|صيامي|صومي|صلاتي|وضوئي|زكاتي|حجي|عمرتي|عقدي|ميراثي|زواجنا|نذري|يميني)/],
  ["my_case", /(زواجي|طلاقي|صيامي|صومي|صلاتي|وضوئي|زكاتي|ميراثي|حجي|عمرتي)\s+.{0,60}(صحيح|باطل|جائز|حلال|حرام|مقبول|يصح|فاسد|يبطل|بطل)/],
  ["my_case", /هل\s+(يقع|وقع)\s+(الطلاق|طلاقي)/],
  ["my_case", /(ما|ماهو|ما\s+هو)\s+حكم\s+(زواجي|طلاقي|صيامي|صلاتي|عملي|راتبي|قرضي|حالتي)/],
  ["my_case", /هل\s+(يبطل|يفسد|ينقض)\s+(صيامي|صومي|صلاتي|وضوئي|حجي)/],
  ["proxy_case", /(أسأل|اسأل)\s+(عن|ل|لـ)\s*(صديق|صديقي|صديقة|صديقتي|قريب|قريبي)/],
  ["proxy_case", /(صديقي|صديقتي|أخي|اخي|أختي|اختي|زوجي|زوجتي|أبي|ابي|أمي|امي|جاري)\s+(يسأل|تسأل|يريد\s+أن\s+يعرف|تريد\s+أن\s+تعرف|يريد\s+ان\s+يعرف)/],
  ["proxy_case", /هل\s+يجوز\s+(لصديقي|لأخي|لاخي|لزوجي|لزوجتي|لابني|لابنتي|لأبي|لأمي|لجاري)/],
  ["fatwa_demand", /(أفتني|افتني|أفتوني|افتوني|أعطني\s+فتوى|اعطني\s+فتوى|أريد\s+فتوى|اريد\s+فتوى|ما\s+حكمي)/],
  ["fatwa_demand", /(أجب|اجب|أجبني|اجبني)\s+(ب)?\s*(نعم|بنعم)\s+(أو|او)\s+(لا)/],
];

export interface Floor {
  level: "D";
  kind: string;
}

/** Narrow level-D floors. Returns the first matching pattern kind, or null. */
export function detectFloorD(q: string): Floor | null {
  for (const [kind, re] of D_EN) if (re.test(q)) return { level: "D", kind };
  for (const [kind, re] of D_AR) if (re.test(q)) return { level: "D", kind };
  return null;
}

// ───────────────────────── X: out of scope (judging people or groups, private disputes)
const SUBJECT_STOP = new Set(["a", "an", "the", "it", "this", "that", "what", "who", "there", "one", "someone", "something"]);
const FATE = "(hell|heaven|paradise|jannah|jannat|jahannam|jahannum|hellfire|hell\\s*fire|the\\s+fire)";
const JUDGE_LABELS =
  "(kafir|kaafir|kafirs|kuffar|infidel|infidels|apostate|apostates|murtad|heretic|heretics|hypocrite|munafiq|disbeliever|disbelievers|non-?believer|true\\s+muslim|real\\s+muslim|bad\\s+muslim|good\\s+muslim|fake\\s+muslim|proper\\s+muslim|cursed|damned)";
const GROUPS =
  "(shia|shias|shiites?|shi'?a|sunnis?|sufis?|ahmadis?|ahmadiyya|qadianis?|salafis?|wahhabis?|ismailis?|alawites?|christians?|jews?|jewish\\s+people|hindus?|buddhists?|atheists?|non-?muslims?|westerners?|americans?|europeans?)";

const X_EN: [string, RegExp][] = [
  ["fate", new RegExp(`\\b(will|would|does|do|is|are|did|was|were|shall|can)\\s+([\\w'’. -]{1,50}?)\\s+(go|goes|going|end\\s+up|be\\s+sent|burn|burning|be\\s+thrown|enter|be|get\\s+into|get\\s+to)\\s+(?:to\\s+|in\\s+|into\\s+)?${FATE}\\b`, "i")],
  ["fate", new RegExp(`\\b${GROUPS}\\s+(?:all\\s+|really\\s+)?(?:go(?:ing)?|end\\s+up|burn)\\s+(?:to\\s+|in\\s+)?${FATE}\\b`, "i")],
  ["judge_person", new RegExp(`\\b(is|was|are|were)\\s+([\\w'’. -]{1,50}?)\\s+(?:a\\s+|an\\s+)?${JUDGE_LABELS}\\b`, "i")],
  ["judge_group", new RegExp(`\\b(are|is)\\s+(?:the\\s+|all\\s+)?${GROUPS}\\s+(?:really\\s+|actually\\s+|even\\s+)?(muslims?|kafirs?|kuffar|disbelievers?|saved|deviant|misguided|heretics?|apostates?|cursed|damned|going\\s+to\\s+hell|in\\s+hell)\\b`, "i")],
  ["private_dispute", /\b(my|our)\s+(husband|wife|neighbou?r|boss|brother|sister|father|mother|dad|mom|mum|family|in-?laws?|mother-in-law|father-in-law|friend|partner|imam|landlord|co-?worker)\b.{0,120}\b(who\s+is\s+right|who'?s\s+right|who\s+is\s+wrong|is\s+(he|she|they)\s+(right|wrong|a\s+sinner|sinning)|take\s+(my|his|her)\s+side|on\s+my\s+side)\b/i],
  ["private_dispute", /\b(who\s+is\s+right|who'?s\s+right|who\s+is\s+wrong)\b.{0,120}\b(my|our)\s+(husband|wife|neighbou?r|boss|brother|sister|father|mother|family|in-?laws?|friend|partner)\b/i],
];
const X_AR: [string, RegExp][] = [
  ["judge_person", new RegExp(`هل\\s+(?!هو\\s+معنى)([^\\s؟?]{2,20}(?:\\s+[^\\s؟?]{2,20}){0,3})\\s+(كافر|كافرة|كفار|كافرون|كافرين|مرتد|مرتدة|مرتدون|منافق|منافقة|زنديق|مبتدع|مبتدعة|مشرك|مشركون|ملعون|ملعونة)${AR_END}`)],
  ["fate", /(سيدخل|سيدخلون|ستدخل|يدخل|يدخلون|تدخل)\s+.{0,40}(النار|الجنة|جهنم)/],
  ["fate", /مصير\s*(ه|ها|هم|ي|نا|\s+[^\s؟?]{2,20}).{0,40}(النار|الجنة|جهنم|الآخرة|الاخرة)?/],
  ["fate", /هل\s+.{1,40}\s+(في|من\s+أهل|من\s+اهل)\s+(النار|الجنة|جهنم)/],
  ["private_dispute", /(خلاف|مشكلة|مشكله|نزاع|شجار)\s+(بيني|بيننا)\s+(و|وبين)/],
  ["private_dispute", /(من|مين)\s+(المخطئ|المخطئة|المحق|على\s+حق|الغلطان)\s*.{0,60}(زوجي|زوجتي|أخي|اخي|أختي|جاري|أبي|أمي|مديري|صديقي)/],
];

/** Out-of-scope detection (X). Returns the kind, or null. */
export function detectOutOfScope(q: string): { kind: string } | null {
  for (const [kind, re] of X_EN) {
    const m = q.match(re);
    if (!m) continue;
    if (kind === "fate" || kind === "judge_person") {
      const subject = (m[2] ?? "").trim().toLowerCase();
      // "What is a kafir?" / "Is there a hell?" are questions about concepts, not judgments of people.
      if (!subject || SUBJECT_STOP.has(subject) || /^(it|this|that|there)\b/.test(subject)) continue;
      if (kind === "judge_person" && /^(what|who)\b/i.test(q.trim()) && /\b(what|who)\s+(is|are)\s+(a|an|the)\s/i.test(q)) continue;
    }
    return { kind };
  }
  for (const [kind, re] of X_AR) {
    const m = q.match(re);
    if (!m) continue;
    if (kind === "fate" && /^(ما|ماهي|ما\s+هي|ما\s+هو|كيف|لماذا)\s+(الجنة|النار|جهنم)/.test(q.trim())) continue;
    if (kind === "fate" && /مصير/.test(m[0]) && !/(النار|الجنة|جهنم|الآخرة|الاخرة|غير\s+المسلم|الكفار|المسيحي|اليهود|جاري|صديقي|أبي|ابي|أمي|امي)/.test(q)) continue;
    return { kind };
  }
  return null;
}

// ───────────────────────── Hadith requests
const HADITH_EN = [
  /\b(give|show|tell|find|quote|share|send|cite)\s+(me|us)\s+(a|an|any|some|the|one)?\s*(authentic\s+|sahih\s+|real\s+)?hadiths?\b/i,
  /\b(is\s+there|are\s+there|do\s+you\s+have|any)\s+(a|an|any)?\s*(authentic\s+|sahih\s+|real\s+)?hadiths?\b/i,
  /\bhadiths?\s+(that|which|about|saying|says|proving|proves|prove|on|where|stating|states|mentioning)\b/i,
  /\bdid\s+(the\s+)?(prophet|messenger)(\s+muhammad)?\s+(really\s+|actually\s+)?(say|said|teach|tell)\b/i,
  /\bis\s+(this|it|that)\s+(a|an)\s+(authentic\s+|real\s+|sahih\s+)?hadith\b/i,
  /\bis\s+["“«'‘].{3,200}["”»'’]\s+(a|an)\s+(authentic\s+|real\s+)?hadith\b/i,
  /\bwhich\s+hadith\b/i,
];
const HADITH_AR = [
  /(أعطني|اعطني|أعطيني|اعطيني|هات|اذكر|أذكر|أريد|اريد|ابحث\s+عن|هل\s+تعرف)\s+(لي\s+)?(حديثا|حديثاً|حديث|أحاديث|احاديث)/,
  /هل\s+(يوجد|هناك|ورد|صح|يصح|ثبت|جاء)\s+(حديث|في\s+الحديث|عن\s+النبي|أن\s+النبي)/,
  /هل\s+(هذا|هذه)\s+(حديث|الحديث)/,
  /هل\s+قال\s+(النبي|رسول\s+الله|الرسول)/,
  /(حديث|الحديث)\s+(صحيح|يثبت|يدل|يقول|عن)/,
];

export function isHadithRequest(q: string): boolean {
  return HADITH_EN.some((r) => r.test(q)) || HADITH_AR.some((r) => r.test(q));
}

/** Strip the request wrapper to get the claim being asked about ("give me a hadith that X" → "X"). */
export function hadithClaim(q: string): string {
  return q
    .replace(/^(.*?\bhadiths?\s+(that|which|about|saying|says|proving|proves|prove|on|where|stating|states|mentioning)\s+((says?|states?|proves?|shows?|mentions?)\s+)?(that\s+)?)/i, "")
    .replace(/^(.*?\bdid\s+(the\s+)?(prophet|messenger)(\s+muhammad)?\s+(really\s+|actually\s+)?(say|said|teach|tell)\s+(that\s+)?)/i, "")
    .replace(/^(.*?(حديثا|حديثاً|حديث|أحاديث|احاديث)\s+(عن|في|يقول|يثبت|يدل\s+على|أن|ان)?\s*)/, "")
    .replace(/^(.*?هل\s+قال\s+(النبي|رسول\s+الله|الرسول)\s*(ﷺ|صلى\s+الله\s+عليه\s+وسلم)?\s*)/, "")
    .replace(/[?؟]+$/, "")
    .trim();
}

// ───────────────────────── Known sayings that are NOT in our approved hadith sources (and not Quran)
export interface KnownSaying {
  id: string;
  ar: RegExp[];
  en: RegExp[];
  /** Different, authentic wording on a related theme, verified in the DB (shown as "a different narration", never as proof). */
  related?: string[];
}
export const KNOWN_SAYINGS: KnownSaying[] = [
  { id: "seek-knowledge-china", ar: [/اطلبوا\s+العلم\s+ولو\s+(ب|في\s+)ال?صين/], en: [/\bseek\s+(?:for\s+)?knowledge\b.{0,30}\bchina\b/i] },
  { id: "cleanliness-from-faith", ar: [/النظافة\s+من\s+الإيمان|النظافه\s+من\s+الايمان|النظافة\s+من\s+الايمان/], en: [/\bcleanliness\s+is\s+(part\s+)?of\s+(the\s+)?faith\b/i, /\bcleanliness\s+is\s+next\s+to\s+godliness\b/i], related: ["muslim:223"] },
  { id: "ink-of-scholars", ar: [/مداد\s+العلماء/], en: [/\bink\s+of\s+(the\s+)?(scholars?|learned)\b.{0,40}\bblood\s+of\s+(the\s+)?martyrs?\b/i] },
  { id: "differences-mercy", ar: [/اختلاف\s+أمتي\s+رحمة|اختلاف\s+امتي\s+رحمة/], en: [/\bdifferences?\s+(of\s+opinion\s+)?(among|in|of|within)\s+my\s+(ummah|ummat|nation|community)\s+(is|are)\s+(a\s+)?mercy\b/i] },
  { id: "love-of-homeland", ar: [/حب\s+الوطن\s+من\s+الإيمان|حب\s+الوطن\s+من\s+الايمان/], en: [/\blove\s+of\s+(one'?s\s+|the\s+)?(homeland|country|nation)\s+is\s+(part\s+)?of\s+(the\s+)?faith\b/i] },
];

export function detectKnownSaying(q: string): KnownSaying | null {
  return KNOWN_SAYINGS.find((k) => k.ar.some((r) => r.test(q)) || k.en.some((r) => r.test(q))) ?? null;
}

// ───────────────────────── "Is this a verse?" intent and Arabic spans for the quote auditor
const VERSE_ASK_EN = /\b(is\s+(this|it|that)\s+(a\s+|an\s+)?(quran(ic)?\s+)?(verse|ayah|aya|ayat)|is\s+.{2,200}\s+(a\s+|an\s+)?(quran(ic)?\s+)?(verse|ayah)\b|(is|was)\s+(this|it|that)\s+in\s+the\s+qur'?an|does\s+the\s+qur'?an\s+(say|state|mention)|which\s+(surah|sura|verse|ayah)|from\s+the\s+qur'?an\b|a\s+verse\s+(that|which)\s+says|quran\s+(verse|quote))/i;
const VERSE_ASK_AR = /(هل\s+(هذه|هذا)\s+(آية|اية|الآية)|هل\s+.{2,200}\s+(آية|اية)|هل\s+(قال\s+الله|ورد\s+في\s+القرآن|في\s+القرآن|في\s+القران)|في\s+أي\s+سورة|في\s+اي\s+سورة|قوله\s+تعالى|قال\s+تعالى|آية\s+(تقول|قرآنية)|من\s+القرآن)/;

export function asksIfVerse(q: string): boolean {
  return VERSE_ASK_EN.test(q) || VERSE_ASK_AR.test(q);
}

export interface ArabicSpan {
  text: string;
  quoted: boolean;
}

/** Arabic spans worth checking against the Quran: quoted Arabic of any length, and unquoted Arabic runs of ≥ 4 words. */
export function arabicSpans(q: string): ArabicSpan[] {
  const out: ArabicSpan[] = [];
  const quoted = /[«“"﴿'‘]([^«»“”"﴿﴾'‘’]{2,400})[»”"﴾'’]/g;
  let m: RegExpExecArray | null;
  let rest = q;
  while ((m = quoted.exec(q))) {
    if (/[ء-ي]/.test(m[1])) {
      out.push({ text: m[1].trim(), quoted: true });
      rest = rest.replace(m[0], " | ");
    }
  }
  // Unquoted Arabic runs (Arabic words possibly with diacritics), split on punctuation/Latin.
  for (const run of rest.split(/[|A-Za-z0-9؟?!.,،:؛()\[\]{}\n]+/)) {
    const t = run.trim();
    if (t && /[ء-ي]/.test(t) && wordCount(t) >= 4) out.push({ text: t, quoted: false });
  }
  return out;
}

/** Words that frame a quote rather than belong to it (trimmed from the edges of unquoted runs). */
const FRAME_WORDS = new Set(
  [
    "هل", "ما", "ماذا", "لماذا", "كيف", "معنى", "تفسير", "شرح", "آية", "اية", "الآية", "الاية", "قوله", "تعالى",
    "في", "القرآن", "القران", "هذه", "هذا", "صحيح", "صحيحة", "تقول", "يعني", "سورة", "أي", "اي",
    "اقرأ", "قرأت", "سمعت", "ورد", "عزوجل", "عز", "وجل", "سبحانه", "قرآنية", "قرانية",
  ].map((w) => normalizeArabic(w)),
);
/** Leading framing phrases removed before matching ("قال تعالى:", "قال الله تعالى", "قوله تعالى"). */
const FRAME_PREFIX = /^(قال\s+(الله\s+)?تعالى|قال\s+الله\s+عز\s+وجل|يقول\s+(الله\s+)?تعالى|قوله\s+تعالى)\s*/;

/** Candidate sub-spans of an unquoted run, longest first: trims framing words and up to 3 words at each edge. */
export function subSpans(span: ArabicSpan): string[] {
  if (span.quoted) return [span.text];
  const words = span.text.replace(FRAME_PREFIX, "").split(/\s+/).filter(Boolean);
  let s = 0;
  let e = words.length;
  while (s < e && FRAME_WORDS.has(normalizeArabic(words[s]))) s++;
  while (e > s && FRAME_WORDS.has(normalizeArabic(words[e - 1]))) e--;
  const seen = new Set<string>();
  const out: string[] = [];
  for (let a = 0; a <= 3; a++)
    for (let b = 0; b <= 3; b++) {
      const w = words.slice(s + a, e - b);
      if (w.length < 3) continue;
      const t = w.join(" ");
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  return out.sort((x, y) => wordCount(y) - wordCount(x));
}

// ───────────────────────── Glossary questions ("what does tawhid mean", "translate tawhid", «ما معنى التوحيد»)
const GLOSS_EN = [
  /^\s*what\s+(?:does|do)\s+(?:the\s+)?(?:arabic\s+)?(?:word|term)?\s*(.+?)\s+(?:actually\s+|really\s+)?mean\b/i,
  /^\s*what\s+is\s+(?:the\s+)?(?:meaning|definition|translation)\s+of\s+(?:the\s+)?(?:word|term)?\s*(.+)$/i,
  /^\s*(?:the\s+)?(?:meaning|definition|translation)\s+of\s+(?:the\s+)?(?:word|term)?\s*(.+)$/i,
  /^\s*(?:please\s+)?(?:define|translate|explain\s+the\s+(?:word|term))\s+(?:the\s+)?(?:word|term)?\s*(.+?)(?:\s+(?:in|into|to)\s+(?:english|arabic|simple\s+words|plain\s+english))?$/i,
  /^\s*how\s+(?:do\s+you|would\s+you|to|should\s+i|can\s+i|do\s+we)\s+translate\s+(?:the\s+)?(?:word|term)?\s*(.+?)(?:\s+(?:in|into|to)\s+(?:english|arabic))?$/i,
  /^\s*what\s+is\s+(.+?)\s+in\s+(?:english|arabic)$/i,
  /^\s*what\s+(?:is|are)\s+(?!the\b|a\b|an\b)(.+?)$/i,
  /^\s*(.+?)\s+meaning$/i,
];
const GLOSS_AR = [
  /^\s*(?:ما|وما)\s+(?:معنى|معني|تعريف|ترجمة|مفهوم)\s+(?:كلمة|مصطلح|لفظ)?\s*(.+)$/,
  /^\s*(?:ما|ماذا)\s+(?:يعني|تعني)\s+(?:كلمة|مصطلح)?\s*(.+)$/,
  /^\s*(?:ترجم|ترجمة|عرّف|عرف|اشرح\s+كلمة|اشرح\s+مصطلح)\s+(?:كلمة|مصطلح)?\s*(.+?)(?:\s+(?:إلى|الى|بال)\s*(?:الإنجليزية|الانجليزية|الإنجليزي|العربية))?$/,
  /^\s*كيف\s+(?:نترجم|أترجم|اترجم|تترجم|يترجم)\s+(?:كلمة|مصطلح)?\s*(.+?)(?:\s+(?:إلى|الى)\s*\S+)?$/,
  /^\s*(?:ما|ما\s+هو|ماهو|ما\s+هي|ماهي)\s+(.+)$/,
];

function cleanTerm(s: string): string {
  return s
    .replace(/[?؟!.«»"“”'‘’]/g, " ")
    .replace(/\b(in|of)\s+islam\b/gi, " ")
    .replace(/\b(the|word|term|concept|islamic)\b/gi, " ")
    .replace(/(في\s+الإسلام|في\s+الاسلام|عند\s+المسلمين|بالإنجليزية|بالانجليزية|بالعربية)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termNeedles(t: GlossaryTerm): string[] {
  return [t.term_ar, ...t.term_en.split("/").map((x) => x.trim()), t.term_en, ...t.variants].filter(Boolean);
}

function sameTerm(candidate: string, needle: string): boolean {
  if (/[ء-ي]/.test(needle)) {
    const c = normalizeArabic(candidate);
    const n = normalizeArabic(needle);
    const nNoAl = n.replace(/^ال/, "");
    const cNoAl = c.replace(/^ال/, "");
    return c === n || cNoAl === nNoAl;
  }
  const c = normalizeEnglish(candidate).replace(/^(a|an|the)\s+/, "");
  const n = normalizeEnglish(needle);
  return c === n || c === `${n}s` || `${c}s` === n;
}

/** A question that is (only) about the meaning or translation of a glossary term. */
export function detectGlossaryQuestion(q: string, terms: GlossaryTerm[]): { term: GlossaryTerm; mode: "meaning" | "translate" } | null {
  const mode: "meaning" | "translate" = /\b(translate|translation)\b|ترجم|ترجمة|نترجم|أترجم|اترجم/i.test(q) ? "translate" : "meaning";
  // Try the whole question, then each clause ("I'm new to Islam — what is Tawhid?").
  const clauses = [q, ...q.split(/[.!?؟،,;؛:—–]+|\s-\s/)].map((c) => c.trim().replace(/[?؟!.]+$/, "")).filter((c) => c.length > 2);
  for (const clause of clauses)
    for (const re of [...GLOSS_EN, ...GLOSS_AR]) {
      const m = clause.match(re);
      if (!m?.[1]) continue;
      const cand = cleanTerm(m[1]);
      if (!cand || wordCount(cand) > 5) continue;
      for (const t of terms) if (termNeedles(t).some((n) => sameTerm(cand, n))) return { term: t, mode };
    }
  return null;
}

// ───────────────────────── Culturally loaded terms (term-lock corrections with evidence)
export interface LoadedTerm {
  id: string;
  patterns: RegExp[];
  term: string; // the loaded rendering, for display
  correction_en: string;
  correction_ar: string;
  cites: string[]; // evidence ids shown with the correction
  concept?: string; // related concept → approved card
  glossary?: string;
}
/**
 * Term-lock list for the Ask feature (R5 standard 6). Demo content — pending sign-off by a qualified reviewer.
 * Corrections only restate what the cited verses say.
 */
export const LOADED_TERMS: LoadedTerm[] = [
  {
    id: "moon-god",
    patterns: [/\bmoon[\s-]?gods?\b/i, /(إله|اله|الإله|الاله)\s+(ال)?قمر/],
    term: "moon god",
    correction_en:
      "Muslims do not worship the moon or a “moon god”. They worship Allah alone, the Creator of the sun and the moon. The verse below (41:37) tells people not to prostrate to the sun or the moon, but to Allah who created them.",
    correction_ar:
      "لا يعبد المسلمون القمر ولا ما يُسمّى «إله القمر»، بل يعبدون الله وحده خالق الشمس والقمر. والآية أدناه (فصلت ٣٧) تنهى عن السجود للشمس والقمر، وتأمر بالسجود لله الذي خلقهن.",
    cites: ["Q:41:37"],
    concept: "moon",
  },
  {
    id: "holy-war",
    patterns: [/\bholy\s+wars?\b/i, /(ال)?حرب\s+(ال)?مقدسة/],
    term: "holy war",
    correction_en:
      "“Holy war” is not an accurate rendering of jihad. The Arabic word means striving and exerting effort, and the Quran uses it in that broad sense — see the verse below (29:69) about those who strive for Allah's sake.",
    correction_ar:
      "ترجمة «الجهاد» بعبارة «الحرب المقدسة» غير دقيقة؛ فالكلمة في العربية تعني بذل الجهد والوسع، ويستعملها القرآن بهذا المعنى الواسع، كما في الآية أدناه (العنكبوت ٦٩) عن الذين يجاهدون في سبيل الله.",
    cites: ["Q:29:69"],
  },
  {
    id: "infidel",
    patterns: [/\binfidels?\b/i],
    term: "infidel",
    correction_en:
      "We avoid the loaded English word “infidel”. The Quranic term kāfir describes someone who rejects faith and is usually rendered “disbeliever”. Surah al-Kafirun, which addresses disbelievers, ends with the verse below (109:6).",
    correction_ar:
      "نتجنب الكلمة الإنجليزية المحمّلة «infidel». والمصطلح القرآني «الكافر» يصف من جحد الإيمان، ويُترجم عادةً بكلمة «disbeliever». وتُختم سورة الكافرون، وهي خطاب للكافرين، بالآية أدناه (الكافرون ٦).",
    cites: ["Q:109:6"],
  },
  {
    id: "penal-code",
    patterns: [/\bislamic\s+penal\s+code\b/i, /\bshari'?a+h?\s+(law\s+)?(is|means|=)\s+(just\s+|only\s+|basically\s+)?(punishments?|penal|criminal\s+law|cutting\s+hands)\b/i],
    term: "Islamic penal code",
    correction_en: "Sharia is not reduced to penalties or criminal law: it is Islamic law and guidance as a whole, explained by context.",
    correction_ar: "لا تُختزل الشريعة في العقوبات أو القانون الجنائي، بل هي أحكام الإسلام وهديه في مجمله، وتُشرح بحسب السياق.",
    cites: ["G:shariah"],
    glossary: "shariah",
  },
];

export function detectLoadedTerm(q: string): LoadedTerm | null {
  return LOADED_TERMS.find((t) => t.patterns.some((r) => r.test(q))) ?? null;
}

// ───────────────────────── Framing bait: science-miracle and number-pattern claims (V9)
const SCIENCE = [
  /\b(nasa|scientists?|science|modern\s+science|researchers?|astronomers?|physicists?)\s+(has\s+|have\s+|had\s+)?(now\s+|finally\s+)?(confirm|confirmed|confirms|prove|proved|proves|proven|discover|discovered|discovers|found|verified|verifies|agrees?|agreed)\b/i,
  /\bscientific(ally)?\s+(miracle|miracles|proof|proven|accurate|evidence)\b/i,
  /\b1400\s+years\s+(ago|before)\b/i,
  /(إعجاز\s*علمي|الإعجاز\s+العلمي|أثبت\s+العلم|اثبت\s+العلم|العلم\s+الحديث\s+(أثبت|اثبت|يثبت|أكد|اكد)|ناسا|وكالة\s+الفضاء)/,
];
const NUMBERS = [
  /\b(mentioned|appears|occurs|repeated|used)\s+\d+\s+times\b/i,
  /\b\d+\s+times\b.{0,60}\b(miracle|coincidence|proof|pattern)\b/i,
  /\b(miracle|coincidence|pattern)\b.{0,60}\b\d+\s+times\b/i,
  /\bnumerical\s+(miracle|pattern)\b/i,
  /(إعجاز\s*عددي|الإعجاز\s+العددي|(ذكرت?|تكررت?|وردت?)\s+.{0,20}\d+\s*مرة|[٠-٩]+\s*مرة)/,
];

export function detectFraming(q: string): "framing_science" | "framing_numbers" | null {
  if (NUMBERS.some((r) => r.test(q))) return "framing_numbers";
  if (SCIENCE.some((r) => r.test(q))) return "framing_science";
  return null;
}

// ───────────────────────── Level-C signals and context-dependent questions
const C_SIGNAL = [
  /\b(do|does|did)\s+all\s+(muslims|scholars|the\s+scholars|sunnis|schools)\s+agree\b/i,
  /\bis\s+there\s+(a\s+|any\s+)?(consensus|ijma|agreement)\b/i,
  /\bwhich\s+(view|opinion|madhh?ab|school|position)\s+is\s+(the\s+)?(correct|right|strongest|true|best|preferred)\b/i,
  /\bwhat\s+is\s+the\s+(correct|strongest|right|preferred)\s+(view|opinion|position)\b/i,
  /\bdo\s+(scholars|muslims)\s+(disagree|differ)\s+(on|about)\s+(this|that|it)\b/i,
  /(هل\s+(يتفق|اتفق|يجمع|أجمع|اجمع)\s+(جميع\s+|كل\s+)?(المسلمين|المسلمون|العلماء|المذاهب))/,
  /(الراجح|القول\s+الراجح|أي\s+القولين|اي\s+القولين|ما\s+الصحيح\s+من\s+أقوال|هل\s+(هناك|فيه|يوجد)\s+إجماع|هل\s+(هناك|فيه|يوجد)\s+اجماع)/,
];
export function detectCSignal(q: string): boolean {
  return C_SIGNAL.some((r) => r.test(q));
}

/** Short or deictic questions that only make sense with a topic in context ("Do all Muslims agree on this?"). */
export function isContextDependent(q: string): boolean {
  const t = q.trim();
  return /\b(this|that|it|these|those)\b\s*[?.!]*$/i.test(t) || /\b(on|about|with)\s+(this|that|it)\b/i.test(t) || /(هذا|هذه|ذلك|هذي)\s*[؟?.!]*$/.test(t) || /(على|في|عن)\s+(هذا|هذه|ذلك)/.test(t);
}

// ───────────────────────── Generic ruling questions (no first person): answer only from an approved card, else refer
const RULING_EN = [
  /\bwhat\s+is\s+the\s+(islamic\s+|sharia\s+|religious\s+)?ruling\b/i,
  /\b(is|are)\s+(it|[\w'’ -]{2,40}?)\s+(really\s+)?(halal|haram|permissible|permitted|forbidden|prohibited|lawful|unlawful|allowed\s+in\s+islam|a\s+sin)\b/i,
  /\bis\s+it\s+(halal|haram|permissible|permitted|allowed|forbidden|a\s+sin)\s+to\b/i,
];
const RULING_AR = [/(ما|ماهو|ما\s+هو)\s+حكم\s/, /هل\s+\S+(\s+\S+){0,4}\s+(حلال|حرام|جائز|محرم|مكروه)/, /هل\s+يجوز\s+(أن|ان)\s/, /هل\s+يحرم\s/];
export function isRulingQuestion(q: string): boolean {
  return RULING_EN.some((r) => r.test(q)) || RULING_AR.some((r) => r.test(q));
}
