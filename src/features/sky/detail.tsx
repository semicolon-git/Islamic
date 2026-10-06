import Link from "next/link";
import * as A from "astronomy-engine";
import { BookOpen, ChevronRight, Compass, Navigation2, Sparkles } from "lucide-react";
import { ButtonLink, VerseBlock } from "@/components/ui";
import { fmtNumber, type Locale } from "@/i18n/core";
import { getI18n } from "@/i18n/server";
import type { Ayah } from "@/lib/quran";
import { BackLink } from "@/features/beneficiary/back-link";
import { BODIES, moonPhase, starNames, type BodyId, type StarRecord } from "./engine";
import { MoonGlyph } from "./moon-glyph";
import { brightnessKey, fmtMag } from "./words";

const ASTROLABE_HREF = "/science/instrument/astrolabe";
const AU_KM = 149_597_870.7;
const LIGHT_MIN_PER_AU = 8.316746;

type T = Awaited<ReturnType<typeof getI18n>>["t"];

function Facts({ items, label }: { items: { k: string; v: React.ReactNode; note?: React.ReactNode }[]; label: string }) {
  return (
    <section aria-label={label}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line">
        {items.map((f) => (
          <div key={f.k} className="bg-surface px-4 py-3">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-3">{f.k}</dt>
            <dd className="text-ink mt-0.5">{f.v}</dd>
            {f.note && <dd className="text-sm text-ink-3 mt-0.5">{f.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function Title({ eyebrow, name, other, locale }: { eyebrow: string; name: string; other: string | null; locale: Locale }) {
  return (
    <header className="flex flex-col gap-1.5 animate-rise">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
      <h1 className="text-[2rem] sm:text-[2.4rem] font-semibold leading-tight tracking-tight text-ink">{name}</h1>
      {other && other !== name && (
        <p lang={locale === "ar" ? "en" : "ar"} dir={locale === "ar" ? "ltr" : "rtl"} className={locale === "ar" ? "text-ink-3 text-lg self-start" : "font-[family-name:var(--font-ms)] text-[1.5rem] leading-[1.9] text-ink-2 self-start"}>
          {other}
        </p>
      )}
    </header>
  );
}

function FindButton({ id, t }: { id: string; t: T }) {
  return (
    <ButtonLink href={`/sky?find=${encodeURIComponent(id)}`} size="lg" className="self-start">
      <Navigation2 className="size-5" aria-hidden />
      {t("sky.detail.findIt")}
    </ButtonLink>
  );
}

function AstrolabeLink({ t }: { t: T }) {
  return (
    <Link href={ASTROLABE_HREF} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card hover:shadow-pop transition-shadow min-h-12" data-testid="astrolabe-link">
      <span className="size-11 rounded-2xl bg-sand text-sand-ink grid place-items-center shrink-0">
        <Compass className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="font-semibold text-ink">{t("sky.detail.astrolabe")}</span>
        <span className="text-sm text-ink-2">{t("sky.detail.astrolabeBody")}</span>
      </span>
      <ChevronRight className="size-5 text-ink-3 shrink-0 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

// ─────────────────────────────────────────── Stars

export async function StarDetail({ star, verses }: { star: StarRecord; verses: Ayah[] }) {
  const { t, locale } = await getI18n();
  const { name_en, name_ar } = starNames(star);
  const name = locale === "ar" ? name_ar : name_en;
  const other = locale === "ar" ? name_en : null;
  const constellation = locale === "ar" ? star.constellation_ar : star.constellation_en;
  const ly = star.distance_ly;
  const lyRounded = ly == null ? null : ly < 100 ? Math.round(ly) : Math.round(ly / 10) * 10;

  const facts = [
    {
      k: t("sky.detail.constellation"),
      v: (
        <>
          {constellation}{" "}
          <span className="text-ink-3" lang={locale === "ar" ? "en" : "ar"}>
            · {locale === "ar" ? star.constellation_en : star.constellation_ar}
          </span>
        </>
      ),
    },
    { k: t("sky.detail.brightness"), v: t(brightnessKey(star.mag)), note: `${t("sky.detail.magnitude", { mag: fmtMag(star.mag, locale) })}. ${t("sky.detail.magNote")}` },
    ...(ly != null && lyRounded != null
      ? [{ k: t("sky.detail.distance"), v: t("sky.detail.ly", { n: fmtNumber(ly, locale) }), note: t(lyRounded > 100 ? "sky.detail.lyNoteOld" : "sky.detail.lyNote", { n: fmtNumber(lyRounded, locale) }) }]
      : []),
    {
      k: t("sky.detail.designation"),
      v: (
        <span dir="ltr" className="mono text-[0.95rem]">
          {[star.bayer, `HIP ${star.hip}`].filter(Boolean).join(" · ")}
        </span>
      ),
    },
    ...(star.spectral ? [{ k: t("sky.detail.spectral"), v: <span dir="ltr" className="mono text-[0.95rem]">{star.spectral}</span> }] : []),
  ];

  return (
    <article className="flex flex-col gap-7 pb-12" data-testid="sky-detail" data-id={star.id}>
      <div>
        <BackLink label={t("sky.detail.back")} fallback="/sky" />
        <Title eyebrow={`${t("sky.kind.star")} · ${constellation}`} name={name} other={other} locale={locale} />
      </div>

      {star.arabic_name ? (
        <section aria-labelledby="arabic-h" className="rounded-[var(--radius-lg)] bg-sand text-sand-ink overflow-hidden shadow-card" data-testid="arabic-name">
          <div className="px-5 pt-4 pb-5 flex flex-col gap-2">
            <h2 id="arabic-h" className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="size-3.5" aria-hidden />
              {star.arabic_part === "hybrid" ? t("sky.detail.arabicHybrid") : t("sky.detail.arabicTitle")}
            </h2>
            <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-[2.1rem] leading-[1.7] self-start">
              {star.arabic_name}
            </p>
            <p dir="ltr" lang="ar-Latn" className="italic text-sand-ink/85 self-start">
              {star.arabic_translit}
            </p>
            <p>
              <span className="font-semibold">{t("sky.detail.meaning")}: </span>
              {locale === "ar" ? star.meaning_ar : `“${star.meaning_en}”`}
            </p>
          </div>
          <div className="bg-surface/50 px-5 py-4 flex flex-col gap-2 text-sm text-ink-2">
            <p className="leading-relaxed">{t("sky.detail.arabicNote")}</p>
            {star.name_source && (
              <p className="text-xs text-ink-3">
                <span className="font-semibold">{t("sky.detail.source")}: </span>
                <span dir="ltr" lang="en">
                  {star.name_source.citation}
                </span>
                {". "}
                {t("sky.detail.sourceMore")} {t("sky.detail.secondary")}{" "}
                <a href={star.name_source.url} className="underline underline-offset-2 hover:text-ink" rel="noopener noreferrer" target="_blank" lang="en" dir="ltr">
                  Wikipedia, “List of Arabic star names”
                </a>
              </p>
            )}
            <p className="text-xs text-ink-3">{t("sky.detail.review")}</p>
          </div>
        </section>
      ) : null}

      <Facts items={facts} label={t("sky.detail.facts")} />

      <FindButton id={star.id} t={t} />

      {verses.length > 0 && (
        <section aria-labelledby="quran-h" className="flex flex-col gap-4" data-testid="sky-quran">
          <div>
            <h2 id="quran-h" className="text-lg font-semibold text-ink inline-flex items-center gap-2">
              <BookOpen className="size-5 text-accent" aria-hidden />
              {t("sky.detail.quranTitle")}
            </h2>
            <p className="text-sm text-ink-2">{t("sky.detail.quranBody")}</p>
          </div>
          {verses.map((v) => (
            <div key={v.key} className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-card">
              <VerseBlock verses={[v]} locale={locale} translationLabel={t("quran.translation")} showTranslation={locale === "en"} />
            </div>
          ))}
        </section>
      )}

      <AstrolabeLink t={t} />

      <p className="text-xs text-ink-3">{t("sky.detail.sources")}</p>
    </article>
  );
}

// ─────────────────────────────────────────── Sun, Moon and planets

export async function BodyDetail({ id, now }: { id: BodyId; now: Date }) {
  const { t, locale } = await getI18n();
  const b = BODIES.find((x) => x.id === id)!;
  const name = locale === "ar" ? b.name_ar : b.name_en;
  const other = locale === "ar" ? b.name_en : null;
  const au = A.GeoVector(b.body, now, true).Length();
  const mag = b.id === "sun" ? -26.7 : A.Illumination(b.body, now).mag;
  const phase = b.id === "moon" ? moonPhase(now) : null;

  const distance =
    b.id === "moon"
      ? t("sky.detail.km", { n: fmtNumber(Math.round((au * AU_KM) / 100) * 100, locale) })
      : b.id === "sun"
        ? t("sky.detail.km", { n: fmtNumber(Math.round((au * AU_KM) / 1e5) * 1e5, locale) })
        : t("sky.detail.au", { n: fmtNumber(Math.round(au * 100) / 100, locale) });
  const facts = [
    { k: t("sky.detail.fromEarth"), v: distance, note: b.id === "moon" ? undefined : t("sky.detail.lightTime", { n: fmtNumber(Math.round(au * LIGHT_MIN_PER_AU * 10) / 10, locale) }) },
    ...(phase
      ? [
          {
            k: t("sky.detail.phase"),
            v: (
              <span className="inline-flex items-center gap-2">
                <MoonGlyph fraction={phase.fraction} waxing={phase.waxing} className="size-7" />
                {locale === "ar" ? phase.name_ar : phase.name_en}
              </span>
            ),
            note: t("sky.today.lit", { pct: fmtNumber(Math.round(phase.fraction * 100), locale) }),
          },
        ]
      : []),
    ...(b.id !== "sun" ? [{ k: t("sky.detail.brightness"), v: t("sky.detail.magnitude", { mag: fmtMag(mag, locale) }), note: t("sky.detail.magNote") }] : []),
  ];
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(now);

  return (
    <article className="flex flex-col gap-7 pb-12" data-testid="sky-detail" data-id={b.id}>
      <div>
        <BackLink label={t("sky.detail.back")} fallback="/sky" />
        <Title eyebrow={t(`sky.kind.${b.kind}`)} name={name} other={other} locale={locale} />
      </div>
      <p className="text-ink-2 text-[1.05rem] leading-relaxed max-w-[65ch]">{t(`sky.body.${b.id}`)}</p>
      <section aria-labelledby="now-h" className="flex flex-col gap-2">
        <h2 id="now-h" className="text-lg font-semibold text-ink">
          {t("sky.detail.now")}
        </h2>
        <Facts items={facts} label={t("sky.detail.now")} />
        <p className="text-xs text-ink-3">{t("sky.detail.computedAt", { time: `${time} UTC` })}</p>
      </section>
      <FindButton id={b.id} t={t} />
      {b.id === "moon" && (
        <Link href="/c/moon" className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card hover:shadow-pop transition-shadow min-h-12" data-testid="moon-card-link">
          <span className="size-11 rounded-2xl bg-accent-soft text-accent grid place-items-center shrink-0">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className="font-semibold text-ink flex-1">{t("sky.detail.moonCard")}</span>
          <ChevronRight className="size-5 text-ink-3 shrink-0 rtl:rotate-180" aria-hidden />
        </Link>
      )}
      <p className="text-xs text-ink-3">{t("sky.detail.bodySources")}</p>
    </article>
  );
}
