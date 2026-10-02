import type { Locale } from "@/i18n/core";

/** Pick the text for the current locale, falling back to the other language. */
export function loc(locale: Locale, en: string | null | undefined, ar: string | null | undefined): string {
  return (locale === "ar" ? ar || en : en || ar) || "";
}

/** Arabic-Indic digits in Arabic UI (SPEC §7), Western digits in English. Verse keys are never passed here. */
export function num(locale: Locale, n: number | string): string {
  return locale === "ar" ? String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : String(n);
}

/**
 * Label for a concept. When the content set has no proper label yet (the seed falls back to the id,
 * e.g. "pen_and_ink" / "Pen And Ink"), use our own bilingual fallback "heritage.concept.<id>".
 */
export function conceptLabel(t: (k: string) => string, locale: Locale, c: { id: string; label_en: string; label_ar: string }): string {
  const raw = locale === "ar" ? c.label_ar : c.label_en;
  const looksLikeId = !raw || raw === c.id || /_/.test(raw) || raw.toLowerCase().replace(/ /g, "_") === c.id;
  const key = `heritage.concept.${c.id}`;
  const fallback = t(key);
  return looksLikeId && fallback !== key ? fallback : loc(locale, c.label_en, c.label_ar);
}
