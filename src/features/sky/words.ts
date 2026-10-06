import { fmtNumber, type Locale } from "@/i18n/core";
import { altitudeBand, compassPoint, type Pointer, type SkyObject } from "./engine";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** "Low in the east", «مرتفع في الشمال الغربي», "Almost straight overhead". */
export function whereWords(p: Pointer, t: T): string {
  const band = altitudeBand(p.alt);
  if (band === "below" || band === "overhead") return t(`sky.where.${band}`);
  return t(`sky.where.${band}`, { dir: t(`sky.dir.${compassPoint(p.az)}`) });
}

/** Short direction chip: "NE · 47°" / «شمال شرق · ٤٧°». */
export function directionChip(p: Pointer, t: T, locale: Locale): string {
  return `${t(`sky.dirShort.${compassPoint(p.az)}`)} · ${fmtDeg(Math.round(p.az) % 360, locale)}`;
}

/**
 * Whole degrees with the sign: "47°" / «٤٧°». In Arabic the number and its sign are wrapped in a left-to-right isolate,
 * otherwise the bidi algorithm puts the ° on the far side of the digits («°٤٧»).
 */
export function fmtDeg(n: number, locale: Locale): string {
  const s = `${fmtNumber(Math.round(n), locale)}°`;
  return locale === "ar" ? `⁦${s}⁩` : s;
}

type Named = Pick<SkyObject, "name_en" | "name_ar" | "arabic_name">;

/** The name to lead with: the IAU name in English; the Arabic (original or transliterated) name in Arabic. */
export const primaryName = (o: Named, locale: Locale) => (locale === "ar" ? o.name_ar : o.name_en);

/**
 * The second name, in the other script: in English, the original Arabic name when the star's name is of Arabic origin
 * (never a mere transliteration); in Arabic, the international (IAU) name.
 */
export function secondaryName(o: Named, locale: Locale): { text: string; lang: "ar" | "en" } | null {
  if (locale === "ar") return o.name_en !== o.name_ar ? { text: o.name_en, lang: "en" } : null;
  return o.arabic_name ? { text: o.arabic_name, lang: "ar" } : null;
}

export function fmtTime(d: Date, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(d);
}

export function fmtMag(mag: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "negative" }).format(mag);
}

/** Plain-words brightness bucket for a star's magnitude: sky.detail.bright0..4. */
export function brightnessKey(mag: number) {
  if (mag < 0.5) return "sky.detail.bright0";
  if (mag < 1.5) return "sky.detail.bright1";
  if (mag < 2.5) return "sky.detail.bright2";
  if (mag <= 3.5) return "sky.detail.bright3";
  return "sky.detail.bright4";
}
