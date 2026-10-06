/**
 * Sky mode engine: pure, deterministic and offline. Given a place and a time it computes where the bright stars, the Sun,
 * the Moon and the naked-eye planets are (altitude/azimuth), what a phone held up to the sky is pointing at, the Moon's
 * phase and the Umm al-Qura Hijri date. No network, no AI, nothing stored.
 *
 * Conventions: azimuth in degrees clockwise from true north (E = 90°); altitude in degrees above the horizon, including
 * standard atmospheric refraction. Star positions are J2000 (HYG v4.1) and are precessed/nutated to the date by
 * astronomy-engine's EQJ→HOR rotation.
 */
import * as A from "astronomy-engine";

// ─────────────────────────────────────────── Types

export interface StarRecord {
  id: string;
  iau: string | null;
  name_ar: string | null;
  bayer: string | null;
  hip: number;
  constellation: string;
  constellation_en: string;
  constellation_ar: string;
  ra_hours: number;
  dec_deg: number;
  mag: number;
  distance_ly: number | null;
  spectral: string | null;
  arabic_name?: string;
  arabic_translit?: string;
  arabic_part?: "full" | "hybrid";
  meaning_en?: string;
  meaning_ar?: string;
  name_source?: { citation: string; url: string };
}

export type SkyKind = "star" | "planet" | "moon" | "sun";
export type BodyId = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";

export interface SkyObject {
  id: string;
  kind: SkyKind;
  name_en: string;
  name_ar: string;
  /** Original Arabic name when the IAU name is of Arabic origin. */
  arabic_name?: string;
  mag: number;
  az: number;
  alt: number;
}

export interface Place {
  lat: number;
  lon: number;
  /** Metres above sea level (optional, defaults to 0). */
  elevation?: number;
}

export interface Pointer {
  az: number;
  alt: number;
}

export interface Hit {
  object: SkyObject;
  /** Angular distance from the pointer, degrees. */
  separation: number;
}

// ─────────────────────────────────────────── Bodies

export const BODIES: { id: BodyId; kind: SkyKind; body: A.Body; name_en: string; name_ar: string }[] = [
  { id: "sun", kind: "sun", body: A.Body.Sun, name_en: "Sun", name_ar: "الشمس" },
  { id: "moon", kind: "moon", body: A.Body.Moon, name_en: "Moon", name_ar: "القمر" },
  { id: "mercury", kind: "planet", body: A.Body.Mercury, name_en: "Mercury", name_ar: "عطارد" },
  { id: "venus", kind: "planet", body: A.Body.Venus, name_en: "Venus", name_ar: "الزهرة" },
  { id: "mars", kind: "planet", body: A.Body.Mars, name_en: "Mars", name_ar: "المريخ" },
  { id: "jupiter", kind: "planet", body: A.Body.Jupiter, name_en: "Jupiter", name_ar: "المشتري" },
  { id: "saturn", kind: "planet", body: A.Body.Saturn, name_en: "Saturn", name_ar: "زحل" },
];
export const BODY_IDS = BODIES.map((b) => b.id);

// ─────────────────────────────────────────── Geometry helpers

const RAD = Math.PI / 180;
export const norm360 = (x: number) => ((x % 360) + 360) % 360;
/** Signed difference b − a wrapped into (−180, 180]. */
export const azDelta = (a: number, b: number) => {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
};

/** Great-circle angle between two horizontal directions, degrees (haversine: stable for small angles). */
export function angularSeparation(a: Pointer, b: Pointer): number {
  const φ1 = a.alt * RAD;
  const φ2 = b.alt * RAD;
  const dφ = φ2 - φ1;
  const dλ = (b.az - a.az) * RAD;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / RAD;
}

const observerOf = (p: Place) => new A.Observer(p.lat, p.lon, p.elevation ?? 0);

/** Display name of a star: its IAU name, or its Bayer designation when it has none. */
export function starNames(s: StarRecord): { name_en: string; name_ar: string } {
  const fallback = s.bayer ?? `HIP ${s.hip}`;
  return { name_en: s.iau ?? fallback, name_ar: s.name_ar ?? fallback };
}

// ─────────────────────────────────────────── Positions

/** Alt/az of J2000 catalogue stars for a place and time (one rotation matrix, then a cheap vector rotation per star). */
export function starPositions(place: Place, date: Date, stars: StarRecord[]): SkyObject[] {
  const time = A.MakeTime(date);
  const rot = A.Rotation_EQJ_HOR(time, observerOf(place));
  return stars.map((s) => {
    const v = A.VectorFromSphere(new A.Spherical(s.dec_deg, s.ra_hours * 15, 1), time);
    const h = A.HorizonFromVector(A.RotateVector(rot, v), "normal");
    return { id: s.id, kind: "star", ...starNames(s), ...(s.arabic_name ? { arabic_name: s.arabic_name } : {}), mag: s.mag, az: norm360(h.lon), alt: h.lat };
  });
}

/** Alt/az and visual magnitude of the Sun, Moon and the five naked-eye planets. */
export function bodyPositions(place: Place, date: Date): SkyObject[] {
  const time = A.MakeTime(date);
  const obs = observerOf(place);
  return BODIES.map((b) => {
    const eq = A.Equator(b.body, time, obs, true, true);
    const hor = A.Horizon(time, obs, eq.ra, eq.dec, "normal");
    const mag = b.id === "sun" ? -26.7 : A.Illumination(b.body, time).mag;
    return { id: b.id, kind: b.kind, name_en: b.name_en, name_ar: b.name_ar, mag: Math.round(mag * 100) / 100, az: norm360(hor.azimuth), alt: hor.altitude };
  });
}

/**
 * The Sun counts as "up" while any part of its disc shows above the horizon: its geometric (unrefracted) centre is above
 * −0.833° (16′ semi-diameter + 34′ standard refraction), the same rule as astronomy-engine's rise/set search.
 */
export const SUN_UP_ALT = -0.833;

export function sunIsUp(place: Place, date: Date): boolean {
  const time = A.MakeTime(date);
  const obs = observerOf(place);
  const eq = A.Equator(A.Body.Sun, time, obs, true, true);
  return A.Horizon(time, obs, eq.ra, eq.dec).altitude > SUN_UP_ALT;
}

export interface SkySnapshot {
  at: Date;
  place: Place;
  /** Everything (above and below the horizon), brightest first. */
  objects: SkyObject[];
  sun: SkyObject;
  moon: SkyObject;
  isDay: boolean;
}

export function computeSky(place: Place, date: Date, stars: StarRecord[]): SkySnapshot {
  const bodies = bodyPositions(place, date);
  const objects = [...bodies, ...starPositions(place, date, stars)].sort((a, b) => a.mag - b.mag);
  const sun = bodies.find((b) => b.id === "sun")!;
  const moon = bodies.find((b) => b.id === "moon")!;
  return { at: date, place, objects, sun, moon, isDay: sunIsUp(place, date) };
}

/**
 * What is visible to the naked eye right now: above `minAlt`, and in daylight only the Sun and the Moon (stars and planets
 * are washed out; Venus can sometimes be glimpsed, but we would rather not promise it). Brightest first.
 */
export function visibleNow(snap: SkySnapshot, { minAlt = 3, limit = Infinity }: { minAlt?: number; limit?: number } = {}): SkyObject[] {
  return snap.objects
    .filter((o) => o.alt >= minAlt && (!snap.isDay || o.kind === "sun" || o.kind === "moon"))
    .slice(0, limit);
}

// ─────────────────────────────────────────── Pointing

/** How much brightness pulls the pick toward a star: degrees of tolerance per magnitude (phone compasses drift by several degrees). */
const MAG_PULL = 0.5;
const score = (h: Hit) => h.separation + MAG_PULL * Math.min(4, Math.max(-1.5, h.object.mag));

/**
 * Objects above the horizon within `fovDeg` of where the phone points, best match first. The ranking is angular distance,
 * nudged toward brighter objects, so a slightly-off compass still lands on the bright star the visitor is looking at.
 */
export function whatAmIPointingAt(pointer: Pointer, objects: SkyObject[], fovDeg = 12): Hit[] {
  return objects
    .filter((o) => o.alt > 0)
    .map((object) => ({ object, separation: angularSeparation(pointer, object) }))
    .filter((h) => h.separation <= fovDeg)
    .sort((a, b) => score(a) - score(b));
}

/** Which way to turn to reach a target: Δaz (+ = turn right/clockwise) and Δalt (+ = tilt up), degrees. */
export function steer(pointer: Pointer, target: Pointer): { dAz: number; dAlt: number; separation: number } {
  return { dAz: azDelta(pointer.az, target.az), dAlt: target.alt - pointer.alt, separation: angularSeparation(pointer, target) };
}

export interface Orientation {
  /** DeviceOrientationEvent.alpha (W3C: counter-clockwise from north when absolute), degrees. */
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * Where the back of the phone (the camera axis, device −Z) points, from W3C device orientation (Z-X'-Y'' Euler angles).
 * If `compassHeading` is given (iOS `webkitCompassHeading`, clockwise from magnetic north) it replaces alpha, because iOS's
 * alpha is relative to an arbitrary start. Held upright in portrait (beta 90°, gamma 0°) the phone points at the horizon.
 */
export function pointingFromOrientation(o: Orientation, compassHeading?: number | null): Pointer {
  const a = (compassHeading != null && Number.isFinite(compassHeading) ? 360 - compassHeading : o.alpha) * RAD;
  const b = o.beta * RAD;
  const g = o.gamma * RAD;
  // −(third column of Rz(a)·Rx(b)·Ry(g)) in an East-North-Up frame.
  const x = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const y = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
  const z = -Math.cos(b) * Math.cos(g);
  const alt = Math.asin(Math.max(-1, Math.min(1, z))) / RAD;
  const az = Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 ? 0 : norm360(Math.atan2(x, y) / RAD);
  return { az, alt };
}

/** Exponential smoothing of a pointer on the sphere (wrap-safe for azimuth). `k` = weight of the new sample. */
export function smoothPointer(prev: Pointer | null, next: Pointer, k = 0.35): Pointer {
  if (!prev) return next;
  return { az: norm360(prev.az + k * azDelta(prev.az, next.az)), alt: prev.alt + k * (next.alt - prev.alt) };
}

// ─────────────────────────────────────────── Words for directions

export const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass8 = (typeof COMPASS_8)[number];
export const compassPoint = (az: number): Compass8 => COMPASS_8[Math.round(norm360(az) / 45) % 8];

export type AltitudeBand = "below" | "horizon" | "low" | "mid" | "high" | "overhead";
export function altitudeBand(alt: number): AltitudeBand {
  if (alt < 0) return "below";
  if (alt < 10) return "horizon";
  if (alt < 30) return "low";
  if (alt < 60) return "mid";
  if (alt < 80) return "high";
  return "overhead";
}

// ─────────────────────────────────────────── Moon & calendar

export type MoonPhaseKey = "new" | "waxing_crescent" | "first_quarter" | "waxing_gibbous" | "full" | "waning_gibbous" | "last_quarter" | "waning_crescent";

export const MOON_PHASE_NAMES: Record<MoonPhaseKey, { en: string; ar: string }> = {
  new: { en: "New moon", ar: "محاق" },
  waxing_crescent: { en: "Waxing crescent", ar: "هلال متزايد" },
  first_quarter: { en: "First quarter", ar: "تربيع أول" },
  waxing_gibbous: { en: "Waxing gibbous", ar: "أحدب متزايد" },
  full: { en: "Full moon", ar: "بدر" },
  waning_gibbous: { en: "Waning gibbous", ar: "أحدب متناقص" },
  last_quarter: { en: "Last quarter", ar: "تربيع ثانٍ" },
  waning_crescent: { en: "Waning crescent", ar: "هلال متناقص" },
};

export interface MoonPhaseInfo {
  /** Moon−Sun ecliptic longitude difference: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  angle: number;
  /** Illuminated fraction of the disc, 0..1. */
  fraction: number;
  waxing: boolean;
  key: MoonPhaseKey;
  name_en: string;
  name_ar: string;
}

export function moonPhase(date: Date): MoonPhaseInfo {
  const angle = A.MoonPhase(date);
  const fraction = A.Illumination(A.Body.Moon, date).phase_fraction;
  // Named phases are moments; give each a ±~7° (about half a day) window and name the stretches between them.
  const key: MoonPhaseKey =
    angle < 7 || angle >= 353 ? "new"
    : angle < 83 ? "waxing_crescent"
    : angle < 97 ? "first_quarter"
    : angle < 173 ? "waxing_gibbous"
    : angle < 187 ? "full"
    : angle < 263 ? "waning_gibbous"
    : angle < 277 ? "last_quarter"
    : "waning_crescent";
  return { angle, fraction, waxing: angle < 180, key, name_en: MOON_PHASE_NAMES[key].en, name_ar: MOON_PHASE_NAMES[key].ar };
}

export interface HijriDate {
  day: number;
  month: number;
  year: number;
  /** e.g. "Ramadan 1, 1447 AH" / «١ رمضان ١٤٤٧ هـ». */
  label: string;
}

/**
 * The civil Umm al-Qura date (the calendar used officially in Saudi Arabia) for `date` in `timeZone` (default: the
 * device's). It is a calculated calendar: the start of a month may be fixed by sighting or announcement and differ by a day.
 */
export function hijriDate(date: Date, locale: "en" | "ar", timeZone?: string): HijriDate {
  const tz = timeZone ? { timeZone } : {};
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", ...tz }).formatToParts(date);
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const label = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", ...tz }).format(date);
  return { day: num("day"), month: num("month"), year: parseInt(String(num("year")), 10), label };
}

// ─────────────────────────────────────────── Sun times

export interface SunTimes {
  /** Next sunset after `date` (within a day), or null in polar day/night. */
  sunset: Date | null;
  /** Next moment the Sun is 12° below the horizon (nautical dusk): bright stars and planets are easy to see. */
  dark: Date | null;
  /** Next sunrise after `date`. */
  sunrise: Date | null;
}

export function sunTimes(place: Place, date: Date): SunTimes {
  const obs = observerOf(place);
  const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, date, 1.5);
  const dark = A.SearchAltitude(A.Body.Sun, obs, -1, date, 1.5, -12);
  const sunrise = A.SearchRiseSet(A.Body.Sun, obs, +1, date, 1.5);
  return { sunset: sunset?.date ?? null, dark: dark?.date ?? null, sunrise: sunrise?.date ?? null };
}

/** Next time an object rises above the horizon within ~a day (null if it doesn't, e.g. never rises at this latitude). */
export function nextRise(place: Place, date: Date, target: { body: BodyId } | { star: StarRecord }): Date | null {
  const obs = observerOf(place);
  let body: A.Body;
  if ("body" in target) body = BODIES.find((b) => b.id === target.body)!.body;
  else {
    A.DefineStar(A.Body.Star1, target.star.ra_hours, target.star.dec_deg, target.star.distance_ly ?? 1000);
    body = A.Body.Star1;
  }
  return A.SearchRiseSet(body, obs, +1, date, 1.1)?.date ?? null;
}
