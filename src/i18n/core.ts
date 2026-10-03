export type Locale = "en" | "ar";
export type Dict = Record<string, string>;
export type Messages = { en: Dict; ar: Dict };

export const LOCALES: Locale[] = ["en", "ar"];
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

/** Interpolate {name} placeholders. */
export function format(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function makeT(dict: Messages, locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) =>
    format(dict[locale][key] ?? dict.en[key] ?? key, vars);
}

/** Pick the field for the current locale from a bilingual record: pick(row, 'title', 'ar') → row.title_ar || row.title_en */
export function pick<T extends Record<string, unknown>>(row: T, base: string, locale: Locale): string {
  const primary = row[`${base}_${locale}`];
  const other = row[`${base}_${locale === "ar" ? "en" : "ar"}`];
  return String((primary as string) || (other as string) || "");
}

export function fmtNumber(n: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(n);
}

export function fmtDate(d: string | Date, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", opts).format(new Date(d));
}

export function fmtRelative(d: string | Date, locale: Locale) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  // ar-SA gives Arabic-Indic digits, matching fmtNumber/fmtDate (SPEC §7.6).
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-SA" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
