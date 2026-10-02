/**
 * Vetted, genre-aware abbreviation lexicon (research memo §2.3, M11).
 *
 * Rules:
 *  (a) the diplomatic layer keeps the abbreviation exactly as written;
 *  (b) an expansion is shown in the reading layer only after a person confirms it;
 *  (c) suggestions depend on the manuscript's genre and the zone (main text vs margin). The same sign means
 *      different things in different genres («خ» = نسخة in a margin, al-Bukhārī in rijāl works), so there is never
 *      a global find-and-replace, and collisions are always shown.
 */
import { stripDiacritics } from "./text";

export const GENRES = ["general", "hadith", "rijal", "fiqh", "lexicon"] as const;
export type Genre = (typeof GENRES)[number];
export type Zone = "main" | "margin";

export interface Expansion {
  expan: string;
  /** Genres where this reading applies. Empty = any genre. */
  genres: Genre[];
  zones?: Zone[];
  noteEn: string;
  noteAr: string;
  /** Warn the transcriber (a known trap). */
  warn?: boolean;
  conf: "H" | "M" | "L";
}

export interface AbbrEntry {
  forms: string[];
  expansions: Expansion[];
}

export const ABBREVIATIONS: AbbrEntry[] = [
  { forms: ["ثنا", "نا", "دثنا"], expansions: [{ expan: "حدثنا", genres: ["hadith", "rijal"], noteEn: "Classic shortening in an isnād", noteAr: "اختصار مشهور في الإسناد", conf: "H" }] },
  { forms: ["ثني"], expansions: [{ expan: "حدثني", genres: ["hadith", "rijal"], noteEn: "Isnād", noteAr: "في الإسناد", conf: "M" }] },
  { forms: ["أنا", "أرنا", "أبنا", "انا"], expansions: [{ expan: "أخبرنا", genres: ["hadith", "rijal"], noteEn: "Isnād; أرنا and أبنا are rarer forms", noteAr: "في الإسناد؛ «أرنا» و«أبنا» أقل استعمالًا", conf: "H" }] },
  {
    forms: ["أنبا", "انبا"],
    expansions: [{ expan: "أنبأنا", genres: ["hadith", "rijal"], noteEn: "A distinct term (often transmission by ijāza). Never map it to أخبرنا.", noteAr: "مصطلح مستقل (كثيرًا ما يدل على الإجازة). لا يُحمل على «أخبرنا».", warn: true, conf: "M" }],
  },
  { forms: ["قثنا"], expansions: [{ expan: "قال حدثنا", genres: ["hadith", "rijal"], noteEn: "قال is often omitted in writing but read aloud", noteAr: "«قال» تُحذف خطًّا وتُنطق قراءةً", conf: "M" }] },
  {
    forms: ["ح"],
    expansions: [
      { expan: "تحويل", genres: ["hadith", "rijal"], noteEn: "Switch to another isnād (between two chains)", noteAr: "التحويل من إسناد إلى آخر", conf: "H" },
      { expan: "حينئذ", genres: ["fiqh", "general"], noteEn: "Inside prose (sharḥ, kalām, fiqh). Collides with ح = taḥwīl in isnāds.", noteAr: "داخل الشرح والفقه. يتعارض مع «ح» للتحويل في الأسانيد.", warn: true, conf: "M" },
    ],
  },
  { forms: ["اهـ", "اه", "ا.هـ"], expansions: [{ expan: "انتهى", genres: [], noteEn: "End of a quotation or gloss", noteAr: "نهاية النقل أو الحاشية", conf: "H" }] },
  { forms: ["إلخ", "الخ"], expansions: [{ expan: "إلى آخره", genres: [], noteEn: "Any genre", noteAr: "عام", conf: "H" }] },
  { forms: ["المص", "المصـ"], expansions: [{ expan: "المصنف", genres: ["fiqh", "general"], noteEn: "Sharḥ / ḥāshiya", noteAr: "في الشروح والحواشي", conf: "H" }] },
  { forms: ["الش", "الشـ"], expansions: [{ expan: "الشارح", genres: ["fiqh", "general"], noteEn: "Sometimes الشيخ: context decides", noteAr: "وقد تكون «الشيخ»: السياق يحدد", warn: true, conf: "M" }] },
  {
    forms: ["ظ"],
    expansions: [{ expan: "الظاهر", genres: [], zones: ["margin"], noteEn: "In a margin: a reader's conjecture. In catalogues ظ = ẓahr (verso).", noteAr: "في الحاشية: ظنّ القارئ. وفي الفهارس «ظ» = ظهر الورقة.", warn: true, conf: "M" }],
  },
  {
    forms: ["خ", "نـ", "نخ"],
    expansions: [
      { expan: "نسخة", genres: [], zones: ["margin"], noteEn: "In a margin: a variant from another copy, not a correction. Prefer the «خ» mark.", noteAr: "في الحاشية: فرق نسخة أخرى وليس تصحيحًا. الأولى استعمال علامة «خ».", conf: "H" },
      { expan: "البخاري", genres: ["rijal"], noteEn: "Rijāl/takhrīj sigla only (al-Mizzī, Ibn Ḥajar). Never outside these works.", noteAr: "رمز في كتب الرجال والتخريج فقط.", warn: true, conf: "H" },
    ],
  },
  {
    forms: ["م"],
    expansions: [
      { expan: "معروف", genres: ["lexicon"], noteEn: "al-Qāmūs al-Muḥīṭ and lexica that follow it", noteAr: "في القاموس المحيط وما تبعه", conf: "H" },
      { expan: "مسلم", genres: ["rijal"], noteEn: "Rijāl sigla", noteAr: "رمز في كتب الرجال", warn: true, conf: "H" },
      { expan: "معًا", genres: [], noteEn: "Over a vowel: both vowellings are valid", noteAr: "فوق الحركة: الوجهان جائزان", conf: "M" },
    ],
  },
  {
    forms: ["ع"],
    expansions: [
      { expan: "موضع", genres: ["lexicon"], noteEn: "In al-Qāmūs ع = a place", noteAr: "في القاموس: «ع» = موضع", conf: "H" },
      { expan: "عليه السلام", genres: ["general", "hadith", "fiqh"], noteEn: "Honorific. Collides with ع = موضع in al-Qāmūs.", noteAr: "دعاء. يتعارض مع «ع» = موضع في القاموس.", warn: true, conf: "M" },
      { expan: "الجماعة (الستة)", genres: ["rijal"], noteEn: "Rijāl sigla: all six", noteAr: "رمز في كتب الرجال: الجماعة", conf: "H" },
    ],
  },
  { forms: ["د"], expansions: [{ expan: "بلد", genres: ["lexicon"], noteEn: "al-Qāmūs", noteAr: "في القاموس", conf: "H" }, { expan: "أبو داود", genres: ["rijal"], noteEn: "Rijāl sigla", noteAr: "رمز في كتب الرجال", conf: "H" }] },
  { forms: ["ة"], expansions: [{ expan: "قرية", genres: ["lexicon"], noteEn: "al-Qāmūs", noteAr: "في القاموس", conf: "H" }] },
  { forms: ["ج"], expansions: [{ expan: "جمع", genres: ["lexicon"], noteEn: "al-Qāmūs", noteAr: "في القاموس", conf: "H" }] },
  { forms: ["جج"], expansions: [{ expan: "جمع الجمع", genres: ["lexicon"], noteEn: "al-Qāmūs", noteAr: "في القاموس", conf: "H" }] },
  { forms: ["ت"], expansions: [{ expan: "الترمذي", genres: ["rijal"], noteEn: "Rijāl sigla", noteAr: "رمز في كتب الرجال", conf: "H" }] },
  {
    forms: ["ق"],
    expansions: [
      { expan: "ابن ماجه", genres: ["rijal"], noteEn: "Rijāl sigla (al-Mizzī, Ibn Ḥajar)", noteAr: "رمز في كتب الرجال", conf: "H" },
      { expan: "متفق عليه", genres: ["hadith"], noteEn: "al-Suyūṭī's al-Jāmiʿ al-Ṣaghīr: here ق = muttafaq ʿalayh, not Ibn Mājah", noteAr: "في الجامع الصغير: «ق» = متفق عليه لا ابن ماجه", warn: true, conf: "M" },
    ],
  },
  {
    forms: ["صلعم", "صلم", "صلع", "صم"],
    expansions: [{ expan: "صلى الله عليه وسلم", genres: [], noteEn: "Record as written; the reading shows the full formula. Do not inject ﷺ.", noteAr: "تُثبت كما كُتبت، وتظهر الصيغة كاملة في القراءة. لا تُستبدل بـ«ﷺ».", conf: "H" }],
  },
  { forms: ["رضه", "رض"], expansions: [{ expan: "رضي الله عنه", genres: [], noteEn: "Any genre", noteAr: "عام", conf: "M" }] },
  { forms: ["رح", "رحه", "ره"], expansions: [{ expan: "رحمه الله", genres: [], noteEn: "Any genre", noteAr: "عام", conf: "M" }] },
  { forms: ["تع", "تعـ"], expansions: [{ expan: "تعالى", genres: [], noteEn: "Any genre", noteAr: "عام", conf: "M" }] },
  { forms: ["قده"], expansions: [{ expan: "قدس سره", genres: [], noteEn: "Ṣūfī and Persianate texts", noteAr: "في كتب التصوف", conf: "M" }] },
];

const key = (s: string) => stripDiacritics(s).replace(/\s+/g, "").trim();

export interface Suggestion extends Expansion {
  form: string;
  /** This reading fits the manuscript's genre (and zone). */
  fits: boolean;
}

/**
 * Candidate expansions for a written form. Readings that fit the genre come first; all others are still listed
 * (never silently dropped) so collisions are visible. Nothing is applied automatically.
 */
export function suggestExpansions(written: string, genre: Genre = "general", zone: Zone = "main"): Suggestion[] {
  const k = key(written);
  if (!k) return [];
  const out: Suggestion[] = [];
  for (const e of ABBREVIATIONS) {
    if (!e.forms.some((f) => key(f) === k)) continue;
    for (const x of e.expansions) {
      const genreOk = x.genres.length === 0 || x.genres.includes(genre);
      const zoneOk = !x.zones || x.zones.includes(zone);
      out.push({ ...x, form: written, fits: genreOk && zoneOk });
    }
  }
  return out.sort((a, b) => Number(b.fits) - Number(a.fits));
}

/** True when the written form has readings with different meanings across genres. */
export const hasCollision = (written: string) => new Set(suggestExpansions(written).map((s) => s.expan)).size > 1;
