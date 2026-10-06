/** Manual fallback places for when location is off or denied. Labels live in i18n under "sky.city.<id>". */
export interface City {
  id: string;
  lat: number;
  lon: number;
  timeZone: string;
}

export const CITIES: City[] = [
  { id: "riyadh", lat: 24.7136, lon: 46.6753, timeZone: "Asia/Riyadh" },
  { id: "makkah", lat: 21.4225, lon: 39.8262, timeZone: "Asia/Riyadh" },
  { id: "madinah", lat: 24.4672, lon: 39.6111, timeZone: "Asia/Riyadh" },
  { id: "jeddah", lat: 21.5433, lon: 39.1728, timeZone: "Asia/Riyadh" },
  { id: "dammam", lat: 26.4207, lon: 50.0888, timeZone: "Asia/Riyadh" },
  { id: "cairo", lat: 30.0444, lon: 31.2357, timeZone: "Africa/Cairo" },
  { id: "doha", lat: 25.2854, lon: 51.531, timeZone: "Asia/Qatar" },
  { id: "dubai", lat: 25.2048, lon: 55.2708, timeZone: "Asia/Dubai" },
  { id: "amman", lat: 31.9454, lon: 35.9284, timeZone: "Asia/Amman" },
  { id: "istanbul", lat: 41.0082, lon: 28.9784, timeZone: "Europe/Istanbul" },
  { id: "london", lat: 51.5074, lon: -0.1278, timeZone: "Europe/London" },
];

export const DEFAULT_CITY = CITIES[0];
export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? null;

/** About 1 km: plenty for the sky (which shifts by a degree only over ~110 km) and kinder to privacy. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100;

export function validCoords(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
