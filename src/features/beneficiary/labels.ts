import type { Locale } from "@/i18n/core";

/** A concept as the visitor app sees it (serialisable; safe to pass to client components). */
export interface ConceptSummary {
  id: string;
  track: "nature" | "art" | "heritage";
  label_en: string;
  label_ar: string;
  image: string | null;
  has_card: boolean;
  card_id: string | null;
}

export const TRACKS = ["nature", "art", "heritage"] as const;
export type Track = (typeof TRACKS)[number];

/**
 * Display labels. The concept table holds the research labels (some long, e.g. "Kaaba / qibla direction (compass, prayer mat)",
 * and the art/heritage rows have no Arabic label yet). These are the short, visitor-facing names.
 */
const DISPLAY: Record<string, { en?: string; ar?: string }> = {
  night_day: { en: "Night & day" },
  rain_water: { en: "Rain & water", ar: "المطر والماء" },
  iron: { en: "Iron" },
  ships: { en: "Ships & boats" },
  salt_fresh: { en: "Fresh & salt water" },
  date_palm: { en: "Date palm" },
  olive: { en: "Olive" },
  tree_leaf: { en: "Trees & leaves" },
  grain: { en: "Grain & wheat" },
  onion_garlic: { en: "Onion & garlic" },
  spider: { en: "Spider & web" },
  livestock: { en: "Cattle & sheep" },
  fish: { en: "Fish & whale" },
  pen: { en: "Pen & writing" },
  lamp: { en: "Lamp & light" },
  qibla: { en: "Qibla (prayer direction)" },
  time_asr: { en: "Time of day" },
  stone: { en: "Stone & rock" },
  soil: { en: "Soil & dust" },
  calligraphy_inscription: { en: "Calligraphy & inscriptions", ar: "الخط والنقوش" },
  pen_and_ink: { en: "Pen & ink", ar: "القلم والمداد" },
  mihrab: { en: "Mihrab", ar: "المحراب" },
  minaret_call_to_prayer: { en: "Minaret & call to prayer", ar: "المئذنة والأذان" },
  mosque_dome: { en: "Mosque & dome", ar: "المسجد والقبة" },
  mosque_lamp: { en: "Mosque lamp", ar: "قنديل المسجد" },
  geometric_pattern: { en: "Geometric pattern", ar: "الزخرفة الهندسية" },
  arabesque: { en: "Arabesque", ar: "الزخرفة النباتية" },
  muqarnas: { en: "Muqarnas", ar: "المقرنصات" },
  illuminated_mushaf: { en: "Illuminated mushaf", ar: "المصحف المذهّب" },
  astrolabe: { en: "Astrolabe", ar: "الأسطرلاب" },
  manuscript_page: { en: "Manuscript page", ar: "صفحة مخطوط" },
  kiswa_textile: { en: "Kiswa textile", ar: "نسيج الكسوة" },
};

/** Arabic labels for concepts that were seeded without one (used by the beneficiary seed). */
export const ARABIC_LABEL_FIXES: Record<string, string> = Object.fromEntries(
  Object.entries(DISPLAY).filter(([, v]) => v.ar).map(([k, v]) => [k, v.ar!]),
);

const AR_RE = /[؀-ۿ]/;
export const hasArabic = (s: string | null | undefined) => !!s && AR_RE.test(s);

/** Short visitor-facing label for a concept in the given locale (never shows a raw id). */
export function conceptLabel(c: { id: string; label_en: string; label_ar: string }, locale: Locale): string {
  const d = DISPLAY[c.id];
  if (locale === "ar") {
    if (d?.ar) return d.ar;
    if (hasArabic(c.label_ar)) return c.label_ar;
    return d?.en ?? c.label_en;
  }
  return d?.en ?? c.label_en;
}

/** Normalise text for forgiving search: lower-case Latin; strip Arabic diacritics/tatweel; unify alef, ya and ta marbuta forms. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Strip the Arabic definite article from each word so «القمر» matches «قمر». */
const stripAl = (s: string) => s.replace(/(^|\s)ال(?=\S{2,})/g, "$1");

/** Search concepts by English or Arabic label (forgiving), or id. Empty query returns all, in input order. */
export function searchConcepts<T extends { id: string; label_en: string; label_ar: string }>(concepts: T[], query: string): T[] {
  const q = stripAl(normalizeSearch(query));
  if (!q) return concepts;
  const terms = q.split(" ").filter(Boolean);
  const scored = concepts
    .map((c, i) => {
      const hay = stripAl(
        normalizeSearch([c.id.replace(/_/g, " "), c.label_en, c.label_ar, conceptLabel(c, "en"), conceptLabel(c, "ar")].join(" ")),
      );
      const words = hay.split(" ");
      let score = 0;
      for (const t of terms) {
        if (words.some((w) => w === t)) score += 3;
        else if (words.some((w) => w.startsWith(t))) score += 2;
        else if (hay.includes(t)) score += 1;
        else return null;
      }
      return { c, i, score };
    })
    .filter((x): x is { c: T; i: number; score: number } => !!x);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.c);
}

/** Order concepts for display: those with an approved card first, then the curated sort order (input order). */
export function cardsFirst<T extends { has_card: boolean }>(list: T[]): T[] {
  return list.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.has_card) - Number(a.c.has_card) || a.i - b.i).map((x) => x.c);
}

/** Pick a stable hue for a concept's fallback tile (so tiles don't all look the same when images are blocked). */
export function conceptHue(id: string, track: string): number {
  const base = track === "nature" ? 165 : track === "art" ? 250 : 35;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return base + (h % 50) - 25;
}

/** Path for a concept page. */
export const conceptHref = (id: string) => `/c/${encodeURIComponent(id)}`;
/** Path for a card page (concept cards go to their concept page so the URL stays friendly). */
export function cardHref(card: { id: string; kind: string; concept_id: string | null }) {
  if ((card.kind === "concept" || card.kind === "art") && card.concept_id) return conceptHref(card.concept_id);
  return `/card/${encodeURIComponent(card.id)}`;
}
