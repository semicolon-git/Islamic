import type { Locale } from "@/i18n/core";

/** Pick the text for the current locale, falling back to the other language. */
export function loc(locale: Locale, en: string | null | undefined, ar: string | null | undefined): string {
  return (locale === "ar" ? ar || en : en || ar) || "";
}

/** Arabic-Indic digits in Arabic UI (SPEC §7), Western digits in English. Verse keys are never passed here. */
export function num(locale: Locale, n: number | string): string {
  return locale === "ar" ? String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : String(n);
}
