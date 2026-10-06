import { describe, expect, it } from "vitest";
import * as A from "astronomy-engine";
import data from "../../../data/sky/stars.json";
import {
  altitudeBand,
  angularSeparation,
  bodyPositions,
  compassPoint,
  computeSky,
  hijriDate,
  moonPhase,
  nextRise,
  pointingFromOrientation,
  smoothPointer,
  steer,
  sunTimes,
  visibleNow,
  whatAmIPointingAt,
  type StarRecord,
} from "./engine";

const stars = data.stars as StarRecord[];
const RIYADH = { lat: 24.7136, lon: 46.6753 };
const LONDON = { lat: 51.5074, lon: -0.1278 };
// 21:00 in Riyadh (UTC+3) on 6 October 2026: the Sun is well down, Vega is in the west-north-west.
const NIGHT = new Date("2026-10-06T18:00:00Z");
const NOON = new Date("2026-10-06T09:00:00Z");

describe("star catalogue (data/sky/stars.json)", () => {
  it("has the bright stars with unique ids and complete records", () => {
    expect(stars.length).toBeGreaterThanOrEqual(150);
    expect(stars.length).toBeLessThanOrEqual(250);
    expect(new Set(stars.map((s) => s.id)).size).toBe(stars.length);
    for (const s of stars) {
      expect(s.ra_hours).toBeGreaterThanOrEqual(0);
      expect(s.ra_hours).toBeLessThan(24);
      expect(Math.abs(s.dec_deg)).toBeLessThanOrEqual(90);
      expect(s.constellation_en && s.constellation_ar).toBeTruthy();
      if (s.arabic_name) {
        // An Arabic etymology is never shown without its meaning and its source.
        expect(s.arabic_translit && s.meaning_en && s.meaning_ar && s.name_source?.citation && s.name_source?.url).toBeTruthy();
        expect(s.arabic_name).toMatch(/^[؀-ۿ ]+$/);
      }
    }
  });

  it("carries Vega's Arabic name and J2000 position", () => {
    const vega = stars.find((s) => s.id === "vega")!;
    expect(vega).toMatchObject({ iau: "Vega", bayer: "α Lyr", arabic_name: "النسر الواقع", constellation_en: "Lyra" });
    expect(vega.ra_hours).toBeCloseTo(18.6156, 3); // 18h 36m 56s
    expect(vega.dec_deg).toBeCloseTo(38.7837, 3); // +38° 47′ 01″
  });
});

describe("positions", () => {
  const snap = computeSky(RIYADH, NIGHT, stars);
  const vega = snap.objects.find((o) => o.id === "vega")!;

  it("matches astronomy-engine's own equator-of-date → Horizon path for Vega", () => {
    const s = stars.find((x) => x.id === "vega")!;
    const time = A.MakeTime(NIGHT);
    const v = A.RotateVector(A.Rotation_EQJ_EQD(time), A.VectorFromSphere(new A.Spherical(s.dec_deg, s.ra_hours * 15, 1), time));
    const eq = A.EquatorFromVector(v);
    const hor = A.Horizon(time, new A.Observer(RIYADH.lat, RIYADH.lon, 0), eq.ra, eq.dec, "normal");
    expect(vega.az).toBeCloseTo(hor.azimuth, 2);
    expect(vega.alt).toBeCloseTo(hor.altitude, 2);
  });

  it("agrees with an independent textbook (Meeus) computation for Vega within 0.1°", () => {
    // Low-precision method: annual precession in RA/Dec, GMST, spherical trig. No refraction (≈0.02° at this altitude).
    const s = stars.find((x) => x.id === "vega")!;
    const r = Math.PI / 180;
    const jd = NIGHT.getTime() / 86400000 + 2440587.5;
    const years = (jd - 2451545) / 365.25;
    let ra = s.ra_hours * 15;
    let dec = s.dec_deg;
    ra += ((3.075 + 1.336 * Math.sin(ra * r) * Math.tan(dec * r)) * years * 15) / 3600;
    dec += (20.04 * Math.cos(ra * r) * years) / 3600;
    const T = (jd - 2451545) / 36525;
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
    const H = (gmst + RIYADH.lon - ra) * r;
    const φ = RIYADH.lat * r;
    const δ = dec * r;
    const alt = Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H)) / r;
    const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ)) / r + 540) % 360;
    expect(Math.abs(vega.az - az)).toBeLessThan(0.1);
    expect(Math.abs(vega.alt - alt)).toBeLessThan(0.1);
    // And the plain-words answer: high-ish in the north-west.
    expect(compassPoint(vega.az)).toBe("NW");
    expect(altitudeBand(vega.alt)).toBe("mid");
  });

  it("puts Polaris within a degree of due north at an altitude equal to the latitude", () => {
    for (const [place, iso] of [
      [RIYADH, "2026-10-06T18:00:00Z"],
      [RIYADH, "2026-04-01T23:00:00Z"],
      [LONDON, "2026-12-21T22:00:00Z"],
    ] as const) {
      const polaris = computeSky(place, new Date(iso), stars).objects.find((o) => o.id === "polaris")!;
      expect(Math.abs(polaris.alt - place.lat)).toBeLessThan(1.1); // Polaris is ~0.65° from the pole (+ refraction)
      expect(Math.min(polaris.az, 360 - polaris.az)).toBeLessThan(1.5);
    }
  });

  it("computes planets exactly as astronomy-engine's Equator → Horizon", () => {
    const jupiter = bodyPositions(RIYADH, NIGHT).find((b) => b.id === "jupiter")!;
    const obs = new A.Observer(RIYADH.lat, RIYADH.lon, 0);
    const eq = A.Equator(A.Body.Jupiter, NIGHT, obs, true, true);
    const hor = A.Horizon(NIGHT, obs, eq.ra, eq.dec, "normal");
    expect(jupiter.az).toBeCloseTo(hor.azimuth, 6);
    expect(jupiter.alt).toBeCloseTo(hor.altitude, 6);
    expect(jupiter.mag).toBeLessThan(-1.5); // Jupiter is always brighter than about −1.6
    expect(jupiter.name_ar).toBe("المشتري");
  });

  it("knows day from night and only offers the Sun and Moon by day", () => {
    expect(snap.isDay).toBe(false);
    expect(visibleNow(snap).some((o) => o.kind === "star")).toBe(true);
    const day = computeSky(RIYADH, NOON, stars);
    expect(day.isDay).toBe(true);
    expect(day.sun.alt).toBeGreaterThan(50);
    expect(visibleNow(day).every((o) => o.kind === "sun" || o.kind === "moon")).toBe(true);
  });

  it("finds the next sunset and dusk (Riyadh sets at about 17:35 local on 6 October)", () => {
    const t = sunTimes(RIYADH, NOON);
    expect(t.sunset!.toISOString()).toMatch(/^2026-10-06T14:3\d/);
    expect(t.dark!.getTime()).toBeGreaterThan(t.sunset!.getTime());
    expect(t.sunrise!.getTime()).toBeGreaterThan(t.dark!.getTime());
    // Day/night flips at the computed sunset (upper limb on the horizon).
    expect(computeSky(RIYADH, new Date(t.sunset!.getTime() - 60_000), stars).isDay).toBe(true);
    expect(computeSky(RIYADH, new Date(t.sunset!.getTime() + 60_000), stars).isDay).toBe(false);
  });
});

describe("what am I pointing at?", () => {
  const snap = computeSky(RIYADH, NIGHT, stars);
  const vega = snap.objects.find((o) => o.id === "vega")!;

  it("names Vega when pointing straight at it, with its neighbours", () => {
    const hits = whatAmIPointingAt({ az: vega.az, alt: vega.alt }, snap.objects, 25);
    expect(hits[0].object.id).toBe("vega");
    expect(hits[0].separation).toBeLessThan(0.01);
    expect(hits.length).toBeGreaterThan(2);
    expect(hits.every((h) => h.separation <= 25 && h.object.alt > 0)).toBe(true);
  });

  it("tolerates a few degrees of compass error", () => {
    expect(whatAmIPointingAt({ az: vega.az + 4, alt: vega.alt - 2 }, snap.objects, 12)[0].object.id).toBe("vega");
  });

  it("returns nothing below the horizon or outside the field", () => {
    expect(whatAmIPointingAt({ az: 0, alt: -45 }, snap.objects, 20)).toEqual([]);
    expect(whatAmIPointingAt({ az: vega.az, alt: vega.alt }, snap.objects, 0.001).map((h) => h.object.id)).toEqual(["vega"]);
  });

  it("steers toward a target", () => {
    const s = steer({ az: 350, alt: 10 }, { az: 20, alt: 40 });
    expect(s.dAz).toBeCloseTo(30);
    expect(s.dAlt).toBeCloseTo(30);
    expect(angularSeparation({ az: 0, alt: 0 }, { az: 90, alt: 0 })).toBeCloseTo(90);
    expect(angularSeparation({ az: 10, alt: 89.9 }, { az: 190, alt: 89.9 })).toBeCloseTo(0.2, 3);
  });
});

describe("device orientation → pointing", () => {
  it("held upright facing north points at the northern horizon", () => {
    const p = pointingFromOrientation({ alpha: 0, beta: 90, gamma: 0 });
    expect(p.alt).toBeCloseTo(0);
    expect(p.az).toBeCloseTo(0);
  });
  it("tilted back 45° points 45° up", () => {
    expect(pointingFromOrientation({ alpha: 0, beta: 135, gamma: 0 }).alt).toBeCloseTo(45);
  });
  it("uses W3C alpha (counter-clockwise) and iOS compass heading (clockwise)", () => {
    expect(pointingFromOrientation({ alpha: 90, beta: 90, gamma: 0 }).az).toBeCloseTo(270);
    expect(pointingFromOrientation({ alpha: 123, beta: 90, gamma: 0 }, 90).az).toBeCloseTo(90);
  });
  it("lying flat, screen up, points at the ground", () => {
    expect(pointingFromOrientation({ alpha: 0, beta: 0, gamma: 0 }).alt).toBeCloseTo(-90);
  });
  it("smooths across north without spinning", () => {
    const s = smoothPointer({ az: 358, alt: 10 }, { az: 4, alt: 20 }, 0.5);
    expect(s.az).toBeCloseTo(1);
    expect(s.alt).toBeCloseTo(15);
  });
});

describe("words for directions", () => {
  it("names compass points", () => {
    expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 350].map(compassPoint)).toEqual(["N", "NE", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]);
  });
  it("bands altitude", () => {
    expect([-5, 5, 20, 45, 70, 85].map(altitudeBand)).toEqual(["below", "horizon", "low", "mid", "high", "overhead"]);
  });
});

describe("Moon and calendar", () => {
  it("new moon on 17 February 2026 (the day of the annular solar eclipse)", () => {
    const m = moonPhase(new Date("2026-02-17T12:00:00Z"));
    expect(m.key).toBe("new");
    expect(m.fraction).toBeLessThan(0.01);
  });
  it("first quarter on 24 February 2026", () => {
    const m = moonPhase(new Date("2026-02-24T12:00:00Z"));
    expect(m.key).toBe("first_quarter");
    expect(m.fraction).toBeCloseTo(0.5, 1);
    expect(m.waxing).toBe(true);
  });
  it("full moon on 3 March 2026 (the night of the total lunar eclipse), then waning", () => {
    const full = moonPhase(new Date("2026-03-03T12:00:00Z"));
    expect(full).toMatchObject({ key: "full", name_ar: "بدر" });
    expect(full.fraction).toBeGreaterThan(0.99);
    const later = moonPhase(new Date("2026-03-08T12:00:00Z"));
    expect(later).toMatchObject({ key: "waning_gibbous", waxing: false });
  });
  it("Umm al-Qura: 18 February 2026 is 1 Ramadan 1447 (and the 17th is 29 Shaʿban)", () => {
    const ram = hijriDate(new Date("2026-02-18T09:00:00Z"), "en", "Asia/Riyadh");
    expect(ram).toMatchObject({ day: 1, month: 9, year: 1447 });
    expect(ram.label).toMatch(/Ramadan 1, 1447/);
    expect(hijriDate(new Date("2026-02-18T09:00:00Z"), "ar", "Asia/Riyadh").label).toContain("رمضان");
    expect(hijriDate(new Date("2026-02-17T09:00:00Z"), "en", "Asia/Riyadh")).toMatchObject({ day: 29, month: 8, year: 1447 });
    // 1 Shawwal 1447 (Eid al-Fitr) per Umm al-Qura: 20 March 2026.
    expect(hijriDate(new Date("2026-03-20T09:00:00Z"), "en", "Asia/Riyadh")).toMatchObject({ day: 1, month: 10, year: 1447 });
  });
});

describe("rise times", () => {
  it("finds when a set star rises next, and agrees with the computed positions", () => {
    const at = new Date("2026-10-06T09:00:00Z");
    const sirius = stars.find((s) => s.id === "sirius")!;
    const before = computeSky(RIYADH, at, stars).objects.find((o) => o.id === "sirius")!;
    expect(before.alt).toBeLessThan(0);
    const rise = nextRise(RIYADH, at, { star: sirius })!;
    expect(rise).not.toBeNull();
    const after = computeSky(RIYADH, new Date(rise.getTime() + 5 * 60_000), stars).objects.find((o) => o.id === "sirius")!;
    expect(after.alt).toBeGreaterThan(0);
    expect(after.alt).toBeLessThan(2);
    expect(nextRise(RIYADH, at, { body: "moon" })).toBeInstanceOf(Date);
  });
});
