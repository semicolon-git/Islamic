"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Compass, Crosshair, LocateFixed, MapPin, Moon, Navigation2, Search, ShieldCheck, Sun, Sunset, X } from "lucide-react";
import { Button, Callout, Field, Input, Select, Skeleton } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { fmtNumber, type Locale } from "@/i18n/core";
import { useI18n } from "@/i18n/client";
import { STARS, STAR_COUNT, getStar, isBodyId, skyHref } from "./catalog";
import {
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
  type Hit,
  type Pointer,
  type SkyObject,
  type SkySnapshot,
} from "./engine";
import { MoonGlyph } from "./moon-glyph";
import { CITIES, DEFAULT_CITY, cityById, roundCoord, validCoords } from "./places";
import { SkyView } from "./sky-view";
import { directionChip, fmtDeg, fmtMag, fmtTime, primaryName, secondaryName, whereWords } from "./words";

type T = ReturnType<typeof useI18n>["t"];

type PlaceChoice = { source: "city"; cityId: string } | { source: "gps"; lat: number; lon: number } | { source: "coords"; lat: number; lon: number };
type GeoState = "idle" | "asking" | "granted" | "denied" | "unavailable" | "unsupported";
type CompassState = "off" | "starting" | "live" | "denied" | "unsupported" | "nodata";

/** Positions drift by ~0.25° a minute: recompute every 20 s. */
const RECOMPUTE_MS = 20_000;
/** A lock within this many degrees names the object; beyond it we say "nothing bright here". */
const LOCK_DEG = 8;
const NEAR_DEG = 30;
const COMPASS_TIMEOUT_MS = 4000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export function SkyScreen({ find }: { find: string | null }) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();

  // ── Time (client only: the server never guesses the visitor's clock)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), RECOMPUTE_MS);
    return () => clearInterval(iv);
  }, []);

  // ── Place (in memory only; never stored or sent)
  const [choice, setChoice] = useState<PlaceChoice>({ source: "city", cityId: DEFAULT_CITY.id });
  const [geo, setGeo] = useState<GeoState>("idle");
  const [placeOpen, setPlaceOpen] = useState(false);

  const place = useMemo(() => {
    if (choice.source === "city") {
      const c = cityById(choice.cityId) ?? DEFAULT_CITY;
      return { lat: c.lat, lon: c.lon, timeZone: c.timeZone as string | undefined, label: t(`sky.city.${c.id}`) };
    }
    return {
      lat: choice.lat,
      lon: choice.lon,
      timeZone: undefined,
      label: choice.source === "gps" ? t("sky.place.you") : t("sky.place.coords", { lat: fmtNumber(choice.lat, locale), lon: fmtNumber(choice.lon, locale) }),
    };
  }, [choice, t, locale]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setGeo("unsupported");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setChoice({ source: "gps", lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) });
        setGeo("granted");
        setPlaceOpen(false);
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  }, []);

  // If the visitor already allowed location for this site, use it without asking again.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!cancelled && s.state === "granted") locate();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locate]);

  // ── The sky
  const snap = useMemo(() => (now ? computeSky({ lat: place.lat, lon: place.lon }, now, STARS) : null), [now, place.lat, place.lon]);
  const times = useMemo(() => (now ? sunTimes({ lat: place.lat, lon: place.lon }, now) : null), [now, place.lat, place.lon]);

  // ── Compass
  const [compass, setCompass] = useState<CompassState>("off");
  const rawRef = useRef<Pointer | null>(null);
  const smoothRef = useRef<Pointer | null>(null);
  const absoluteSeen = useRef(false);
  const [pointer, setPointer] = useState<Pointer | null>(null);

  const startCompass = useCallback(async () => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return setCompass("unsupported");
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    // iOS 13+: must be asked from this tap.
    if (typeof DOE.requestPermission === "function") {
      try {
        if ((await DOE.requestPermission()) !== "granted") return setCompass("denied");
      } catch {
        return setCompass("denied");
      }
    }
    rawRef.current = null;
    smoothRef.current = null;
    absoluteSeen.current = false;
    setPointer(null);
    setCompass("starting");
  }, []);

  const listening = compass === "starting" || compass === "live" || compass === "nodata";
  useEffect(() => {
    if (!listening) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (e.beta == null || e.gamma == null) return;
      const absolute = e.type === "deviceorientationabsolute" || e.absolute === true;
      if (ios == null && (!absolute || e.alpha == null)) return; // relative alpha can't tell north
      if (e.type === "deviceorientationabsolute") absoluteSeen.current = true;
      else if (absoluteSeen.current && ios == null) return; // prefer the absolute stream when both fire
      rawRef.current = pointingFromOrientation({ alpha: e.alpha ?? 0, beta: e.beta, gamma: e.gamma }, ios ?? null);
      setCompass((c) => (c === "live" ? c : "live"));
    };
    window.addEventListener("deviceorientationabsolute", onOrient as EventListener);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient as EventListener);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [listening]);

  useEffect(() => {
    if (compass !== "starting") return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const timer = setTimeout(() => setCompass((c) => (c === "starting" ? (coarse ? "nodata" : "unsupported") : c)), COMPASS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [compass]);

  // ~10 updates a second (4 with reduced motion), smoothed so the label doesn't flicker.
  useEffect(() => {
    if (compass !== "live") return;
    const iv = setInterval(
      () => {
        const raw = rawRef.current;
        if (!raw) return;
        const prev = smoothRef.current;
        const next = smoothPointer(prev, raw, reduced ? 0.6 : 0.35);
        if (prev && Math.abs(next.az - prev.az) < 0.05 && Math.abs(next.alt - prev.alt) < 0.05) return;
        smoothRef.current = next;
        setPointer(next);
      },
      reduced ? 250 : 100,
    );
    return () => clearInterval(iv);
  }, [compass, reduced]);

  const stopCompass = () => setCompass("off");

  // ── Find mode (?find=vega)
  const findObj = useMemo(() => (snap && find ? snap.objects.find((o) => o.id === find) ?? null : null), [snap, find]);

  if (!now || !snap || !times) {
    return (
      <div className="flex flex-col gap-5 pb-12" aria-busy="true">
        <Header t={t} />
        <Skeleton className="h-28" />
        <Skeleton className="h-14" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const twilight = !snap.isDay && snap.sun.alt > -12;

  return (
    <div className="flex flex-col gap-5 pb-12" data-testid="sky-screen">
      <Header t={t} />

      {find && findObj && <FindBanner obj={findObj} snap={snap} timeZone={place.timeZone} />}

      <TonightCard now={now} timeZone={place.timeZone} />

      <PlaceBar
        label={place.label}
        isCity={choice.source === "city"}
        isGps={choice.source === "gps"}
        geo={geo}
        open={placeOpen}
        setOpen={setPlaceOpen}
        onLocate={locate}
        cityId={choice.source === "city" ? choice.cityId : ""}
        onCity={(id) => {
          setChoice({ source: "city", cityId: id });
        }}
        onCoords={(lat, lon) => {
          setChoice({ source: "coords", lat: roundCoord(lat), lon: roundCoord(lon) });
          setPlaceOpen(false);
        }}
      />

      {snap.isDay ? (
        <Callout tone="warn" icon={<Sunset className="size-5" aria-hidden />} title={t("sky.day.title")} className="animate-rise">
          <span data-testid="sky-day">
            {times.sunset && times.dark
              ? t("sky.day.body", { sunset: fmtTime(times.sunset, locale, place.timeZone), dark: fmtTime(times.dark, locale, place.timeZone) })
              : t("sky.day.bodyNoTimes")}{" "}
            <strong className="font-semibold text-ink">{t("sky.day.safety")}</strong>
          </span>
        </Callout>
      ) : (
        twilight && times.dark && <Callout tone="violet" icon={<Moon className="size-5" aria-hidden />}>{t("sky.night.twilight", { dark: fmtTime(times.dark, locale, place.timeZone) })}</Callout>
      )}

      <PointerCard compass={compass} pointer={pointer} snap={snap} onStart={startCompass} onStop={stopCompass} findId={findObj?.id ?? null} />

      <VisibleList snap={snap} highlight={findObj?.id ?? null} />

      <section aria-labelledby="how-h" className="rounded-[var(--radius)] bg-surface-2 p-4 flex flex-col gap-2 text-sm">
        <h2 id="how-h" className="font-semibold text-ink inline-flex items-center gap-2">
          <ShieldCheck className="size-4 text-ok" aria-hidden />
          {t("sky.how.title")}
        </h2>
        <p className="text-ink-2">{t("sky.how.body", { n: fmtNumber(STAR_COUNT, locale) })}</p>
        <p className="text-ink-3 text-xs">{t("sky.how.sources")}</p>
      </section>
    </div>
  );
}

function Header({ t }: { t: T }) {
  return (
    <header className="flex flex-col gap-1.5 pt-1">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">{t("sky.eyebrow")}</p>
      <h1 className="text-[1.9rem] sm:text-[2.3rem] font-semibold leading-tight tracking-tight text-ink">{t("sky.h1")}</h1>
      <p className="text-ink-2 max-w-[60ch]">{t("sky.lead")}</p>
    </header>
  );
}

// ─────────────────────────────────────────── Tonight: Hijri date + Moon

function TonightCard({ now, timeZone }: { now: Date; timeZone?: string }) {
  const { t, locale } = useI18n();
  const hijri = hijriDate(now, locale, timeZone);
  const moon = moonPhase(now);
  const pct = Math.round(moon.fraction * 100);
  return (
    <section aria-label={t("sky.today.hijri")} className="rounded-[var(--radius-lg)] bg-brand text-brand-ink p-4 sm:p-5 shadow-card flex flex-col gap-3 animate-rise" data-testid="sky-today">
      <div className="flex items-center gap-4">
        <Link href={skyHref("moon")} className="rounded-full shrink-0" aria-label={t("sky.today.moonLink")}>
          <MoonGlyph fraction={moon.fraction} waxing={moon.waxing} className="size-16" />
        </Link>
        <div className="flex flex-col min-w-0 gap-0.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-brand-ink/75">{t("sky.today.hijri")}</p>
          <p className="text-xl font-semibold leading-snug" data-testid="sky-hijri">
            {hijri.label}
          </p>
          <p className="text-sm text-brand-ink/85" data-testid="sky-moon-phase">
            {locale === "ar" ? moon.name_ar : moon.name_en} · {t("sky.today.lit", { pct: fmtNumber(pct, locale) })} · {moon.waxing ? t("sky.today.waxing") : t("sky.today.waning")}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-brand-ink/80">{t("sky.today.note")}</p>
    </section>
  );
}

// ─────────────────────────────────────────── Place

function PlaceBar({
  label,
  isCity,
  isGps,
  geo,
  open,
  setOpen,
  onLocate,
  cityId,
  onCity,
  onCoords,
}: {
  label: string;
  isCity: boolean;
  isGps: boolean;
  geo: GeoState;
  open: boolean;
  setOpen: (v: boolean) => void;
  onLocate: () => void;
  cityId: string;
  onCity: (id: string) => void;
  onCoords: (lat: number, lon: number) => void;
}) {
  const { t } = useI18n();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [bad, setBad] = useState(false);
  const geoProblem = geo === "denied" || geo === "unavailable" || geo === "unsupported" ? geo : null;
  const showPermissions = isCity && geo !== "asking" && !geoProblem;

  return (
    <section aria-labelledby="place-h" className="rounded-[var(--radius-lg)] border border-line bg-surface shadow-card p-4 flex flex-col gap-3" data-testid="sky-place">
      <div className="flex items-center gap-3">
        <span className="size-10 rounded-2xl bg-accent-soft text-accent grid place-items-center shrink-0">
          {isGps ? <LocateFixed className="size-5" aria-hidden /> : <MapPin className="size-5" aria-hidden />}
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="place-h" className="font-semibold text-ink leading-snug" data-testid="sky-place-label">
            {t("sky.place.over", { place: label })}
          </h2>
          <p className="text-sm text-ink-3">{isGps ? t("sky.place.approx") : isCity ? t("sky.place.cityNote", { place: label }) : t("sky.place.approx")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="place-panel">
          {open ? t("sky.place.hide") : t("sky.place.change")}
        </Button>
      </div>

      {geoProblem && (
        <Callout tone="warn" className="py-2.5">
          <span role="status">{t(`sky.place.${geoProblem}`)}</span>
        </Callout>
      )}

      {showPermissions && !open && (
        <div className="rounded-[12px] bg-surface-2 p-3.5 flex flex-col gap-3" data-testid="sky-permissions">
          <p className="text-sm font-semibold text-ink">{t("sky.perm.title")}</p>
          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="flex gap-2.5">
              <MapPin className="size-4 shrink-0 mt-1 text-accent" aria-hidden />
              <span>
                <strong className="font-semibold text-ink">{t("sky.perm.location")}.</strong> <span className="text-ink-2">{t("sky.perm.locationBody")}</span>
              </span>
            </li>
            <li className="flex gap-2.5">
              <Compass className="size-4 shrink-0 mt-1 text-accent" aria-hidden />
              <span>
                <strong className="font-semibold text-ink">{t("sky.perm.compass")}.</strong> <span className="text-ink-2">{t("sky.perm.compassBody")}</span>
              </span>
            </li>
          </ul>
          <Button onClick={onLocate} className="self-start">
            <LocateFixed className="size-4" aria-hidden />
            {t("sky.place.useMine")}
          </Button>
        </div>
      )}
      {geo === "asking" && (
        <p className="text-sm text-ink-2 inline-flex items-center gap-2" role="status">
          <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />
          {t("sky.place.locating")}
        </p>
      )}

      {open && (
        <div id="place-panel" className="flex flex-col gap-4 border-t border-line pt-4 animate-rise">
          <Button variant="soft" onClick={onLocate} className="self-start" loading={geo === "asking"}>
            <LocateFixed className="size-4" aria-hidden />
            {t("sky.place.useMine")}
          </Button>
          <Field label={t("sky.place.city")} htmlFor="sky-city">
            <Select id="sky-city" value={cityId} onChange={(e) => e.target.value && onCity(e.target.value)}>
              {!cityId && <option value="">—</option>}
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`sky.city.${c.id}`)}
                </option>
              ))}
            </Select>
          </Field>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const la = Number(lat.replace(",", "."));
              const lo = Number(lon.replace(",", "."));
              if (!lat.trim() || !lon.trim() || !validCoords(la, lo)) return setBad(true);
              setBad(false);
              onCoords(la, lo);
            }}
          >
            <p className="text-sm font-medium text-ink">{t("sky.place.orCoords")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("sky.place.lat")} htmlFor="sky-lat" hint={t("sky.place.latHint")}>
                <Input id="sky-lat" inputMode="decimal" dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} autoComplete="off" />
              </Field>
              <Field label={t("sky.place.lon")} htmlFor="sky-lon" hint={t("sky.place.lonHint")}>
                <Input id="sky-lon" inputMode="decimal" dir="ltr" value={lon} onChange={(e) => setLon(e.target.value)} autoComplete="off" />
              </Field>
            </div>
            {bad && (
              <p className="text-sm text-bad" role="alert">
                {t("sky.place.invalid")}
              </p>
            )}
            <Button type="submit" variant="secondary" className="self-start">
              {t("sky.place.apply")}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────── Find banner

function FindBanner({ obj, snap, timeZone }: { obj: SkyObject; snap: SkySnapshot; timeZone?: string }) {
  const { t, locale } = useI18n();
  const name = primaryName(obj, locale);
  let extra: string | null = null;
  if (obj.alt <= 0) {
    const star = getStar(obj.id);
    const rise = star ? nextRise(snap.place, snap.at, { star }) : isBodyId(obj.id) ? nextRise(snap.place, snap.at, { body: obj.id }) : null;
    extra = `${t("sky.find.below", { name })}${rise ? ` ${t("sky.find.rises", { time: fmtTime(rise, locale, timeZone) })}` : ""}`;
  } else if (snap.isDay && obj.kind !== "sun" && obj.kind !== "moon") extra = t("sky.find.day");
  return (
    <section className="rounded-[var(--radius)] border border-accent/40 bg-accent-soft p-3.5 flex items-start gap-3 animate-rise" aria-live="polite" data-testid="sky-find">
      <Search className="size-5 text-accent shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-semibold text-ink">{t("sky.find.title", { name })}</p>
        <p className="text-ink-2">{obj.alt > 0 ? `${whereWords(obj, t)} · ${t("sky.where.alt", { deg: fmtDeg(obj.alt, locale) })}` : null}</p>
        {extra && <p className="text-ink-2">{extra}</p>}
      </div>
      <Link href="/sky" className="size-11 -m-2 grid place-items-center rounded-full text-ink-2 hover:bg-surface/60" aria-label={t("sky.find.clear")}>
        <X className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

// ─────────────────────────────────────────── Pointer

function PointerCard({
  compass,
  pointer,
  snap,
  onStart,
  onStop,
  findId,
}: {
  compass: CompassState;
  pointer: Pointer | null;
  snap: SkySnapshot;
  onStart: () => void;
  onStop: () => void;
  findId: string | null;
}) {
  const { t, locale } = useI18n();
  // In daylight only the Sun and Moon are pointable; at night everything above the horizon.
  const candidates = useMemo(() => (snap.isDay ? visibleNow(snap, { minAlt: 0 }) : snap.objects), [snap]);
  const hits = useMemo(() => (pointer ? whatAmIPointingAt(pointer, candidates, NEAR_DEG) : []), [pointer, candidates]);
  const target: Hit | null = hits[0] && hits[0].separation <= LOCK_DEG ? hits[0] : null;
  const nearby = hits.filter((h) => h !== target).slice(0, 3);
  const live = compass === "live" && pointer;
  const findObj = findId ? snap.objects.find((o) => o.id === findId) ?? null : null;

  return (
    <section aria-labelledby="point-h" className="rounded-[var(--radius-lg)] border border-line bg-surface shadow-card overflow-hidden" data-testid="sky-pointer">
      <div className="p-4 flex items-center gap-3">
        <span className="size-10 rounded-2xl bg-violet-soft text-violet grid place-items-center shrink-0">
          <Crosshair className="size-5" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="point-h" className="font-semibold text-ink">
            {t("sky.point.title")}
          </h2>
          <p className="text-sm text-ink-3">{live ? t("sky.point.portrait") : t("sky.point.body")}</p>
        </div>
        {(compass === "live" || compass === "starting") && (
          <Button variant="ghost" size="sm" onClick={onStop}>
            {t("sky.point.stop")}
          </Button>
        )}
      </div>

      {(compass === "off" || compass === "denied" || compass === "unsupported" || compass === "nodata") && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {compass !== "off" && (
            <Callout tone={compass === "denied" ? "warn" : "neutral"} icon={<Compass className="size-5" aria-hidden />}>
              <span role="status" data-testid="compass-status">
                {t(`sky.point.${compass}`)}
              </span>
            </Callout>
          )}
          {compass !== "unsupported" && (
            <Button onClick={onStart} size="lg" full>
              <Navigation2 className="size-5" aria-hidden />
              {compass === "off" ? t("sky.point.start") : t("sky.point.retry")}
            </Button>
          )}
        </div>
      )}

      {compass === "starting" && (
        <p className="px-4 pb-4 text-sm text-ink-2 inline-flex items-center gap-2" role="status">
          <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />
          {t("sky.point.starting")}
        </p>
      )}

      {live && pointer && (
        <div className="bg-[#05060f] text-white">
          <SkyView
            pointer={pointer}
            objects={candidates}
            targetId={target?.object.id ?? null}
            findId={findObj && findObj.alt > 0 ? findObj.id : null}
            locale={locale}
            label={t("sky.point.view")}
            cardinal={(k) => t(`sky.dirShort.${k}`)}
          />
          <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <div aria-live="polite" aria-atomic="true" data-testid="sky-target" className="min-h-[4.5rem]">
              {pointer.alt < -5 ? (
                <p className="text-lg font-semibold">{t("sky.point.ground")}</p>
              ) : target ? (
                <TargetName obj={target.object} />
              ) : (
                <>
                  <p className="text-lg font-semibold">{t("sky.point.nothing")}</p>
                  {hits[0] && <p className="text-sm text-white/75">{t("sky.point.nearest", { name: primaryName(hits[0].object, locale), deg: fmtDeg(hits[0].separation, locale) })}</p>}
                </>
              )}
            </div>
            <p className="text-sm text-white/75">
              {t("sky.point.aiming", { where: lowerFirst(whereWords(pointer, t), locale) })} · {directionChip(pointer, t, locale)}
            </p>
            {findObj && findObj.alt > 0 && findObj.id !== target?.object.id && <Steer pointer={pointer} target={findObj} />}
            {snap.isDay && <p className="text-xs text-white/70">{t("sky.point.dayOnly")}</p>}
            {nearby.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{t("sky.point.nearby")}</p>
                <ul className="flex flex-wrap gap-2" data-testid="sky-nearby">
                  {nearby.map((h) => (
                    <li key={h.object.id}>
                      <Link href={skyHref(h.object.id)} className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium">
                        {primaryName(h.object, locale)}
                        <span className="text-white/70 tabular">{fmtDeg(h.separation, locale)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-white/70">{t("sky.point.calibrate")}</p>
          </div>
        </div>
      )}
    </section>
  );
}

const lowerFirst = (s: string, locale: Locale) => (locale === "en" ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function TargetName({ obj }: { obj: SkyObject }) {
  const { t, locale } = useI18n();
  const name = primaryName(obj, locale);
  const second = secondaryName(obj, locale);
  return (
    <div className="flex flex-col gap-1.5 animate-rise">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[1.9rem] font-semibold leading-tight" data-testid="sky-target-name">
          {name}
        </span>
        {second && (
          <span lang={second.lang} dir={second.lang === "ar" ? "rtl" : "ltr"} className={cn(second.lang === "ar" ? "font-[family-name:var(--font-ms)] text-[1.6rem] leading-snug text-[#ffd99a]" : "text-lg text-white/80")} data-testid="sky-target-second">
            {second.lang === "ar" ? `«${second.text}»` : second.text}
          </span>
        )}
      </p>
      <Link href={skyHref(obj.id)} className="self-start inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-[#36dcb8] hover:underline underline-offset-4">
        {t("sky.point.about", { name })}
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );
}

function Steer({ pointer, target }: { pointer: Pointer; target: Pointer }) {
  const { t, locale } = useI18n();
  const s = steer(pointer, target);
  if (s.separation < 3) return <p className="text-sm font-semibold text-[#36dcb8]">{t("sky.find.onTarget")}</p>;
  const turn = Math.abs(s.dAz) >= 3 ? t(s.dAz > 0 ? "sky.find.turnRight" : "sky.find.turnLeft", { deg: fmtDeg(Math.abs(s.dAz), locale) }) : null;
  const tilt = Math.abs(s.dAlt) >= 3 ? t(s.dAlt > 0 ? "sky.find.tiltUp" : "sky.find.tiltDown", { deg: fmtDeg(Math.abs(s.dAlt), locale) }) : null;
  return (
    <p className="text-sm font-semibold text-[#ffd99a]" data-testid="sky-steer">
      {[turn, tilt].filter(Boolean).join(locale === "ar" ? " " : ", ")}
    </p>
  );
}

// ─────────────────────────────────────────── Visible now

const PAGE = 12;

function VisibleList({ snap, highlight }: { snap: SkySnapshot; highlight: string | null }) {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const all = visibleNow(snap);
  const shown = more ? all.slice(0, 40) : all.slice(0, PAGE);
  return (
    <section aria-labelledby="visible-h" className="flex flex-col gap-3">
      <div>
        <h2 id="visible-h" className="text-lg font-semibold text-ink">
          {t("sky.visible.title")}
        </h2>
        <p className="text-sm text-ink-3">{snap.isDay ? t("sky.visible.daySubtitle") : t("sky.visible.subtitle")}</p>
      </div>
      {all.length === 0 ? (
        <p className="rounded-[var(--radius)] bg-surface-2 p-4 text-ink-2">{t("sky.visible.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="visible-list">
          {shown.map((o) => (
            <VisibleRow key={o.id} o={o} highlight={o.id === highlight} />
          ))}
        </ul>
      )}
      {all.length > PAGE && (
        <Button variant="ghost" onClick={() => setMore(!more)} className="self-center" aria-expanded={more}>
          {more ? t("sky.visible.less") : t("sky.visible.more")}
        </Button>
      )}
    </section>
  );
}

function VisibleRow({ o, highlight }: { o: SkyObject; highlight: boolean }) {
  const { t, locale } = useI18n();
  const name = primaryName(o, locale);
  const second = secondaryName(o, locale);
  const Icon = o.kind === "sun" ? Sun : o.kind === "moon" ? Moon : null;
  return (
    <li>
      <Link
        href={skyHref(o.id)}
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius)] border bg-surface p-3 min-h-16 shadow-card hover:shadow-pop transition-shadow",
          highlight ? "border-accent ring-2 ring-accent/30" : "border-line",
        )}
        data-testid={`visible-${o.id}`}
      >
        <span className="size-10 rounded-full bg-brand grid place-items-center shrink-0" aria-hidden>
          {Icon ? (
            <Icon className={cn("size-5", o.kind === "sun" ? "text-[#ffd147]" : "text-[#f4ecd2]")} />
          ) : (
            <span className={cn("rounded-full", o.kind === "planet" ? "bg-[#ffd99a]" : "bg-white")} style={{ width: `${Math.max(4, 12 - o.mag * 2.4)}px`, height: `${Math.max(4, 12 - o.mag * 2.4)}px` }} />
          )}
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-ink">{name}</span>
            {second && (
              <span lang={second.lang} dir={second.lang === "ar" ? "rtl" : "ltr"} className={second.lang === "ar" ? "font-[family-name:var(--font-ms)] text-[1.05rem] text-ink-2" : "text-sm text-ink-3"}>
                {second.text}
              </span>
            )}
          </span>
          <span className="text-sm text-ink-2">
            {o.kind === "moon" ? whereWords(o, t) : `${t(`sky.kind.${o.kind}`)} · ${whereWords(o, t)}`}
          </span>
        </span>
        <span className="flex flex-col items-end gap-0.5 shrink-0 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2">
            <Navigation2 className="size-3" style={{ transform: `rotate(${Math.round(o.az)}deg)` }} aria-hidden />
            {directionChip(o, t, locale)}
          </span>
          <span className="tabular">{t("sky.where.alt", { deg: fmtDeg(o.alt, locale) })}</span>
          <span className="sr-only">{t("sky.visible.mag", { mag: fmtMag(o.mag, locale) })}</span>
        </span>
      </Link>
    </li>
  );
}
