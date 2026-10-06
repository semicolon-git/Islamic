import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin, Star } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { fmtDate } from "@/i18n/core";
import { BackLink } from "@/features/beneficiary/back-link";
import { conceptHref } from "@/features/beneficiary/labels";
import { listConcepts } from "@/features/beneficiary/data";
import { entry, holdingsFor, names, scientistsLinkedTo, type Holding, type Instrument, type Scientist, type Work } from "@/features/science/server";
import { Block, Chips, Eyebrow, L, Sources, starHref } from "@/features/science/ui/parts";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kind: string; id: string }> };
const KINDS = ["scientist", "instrument", "work"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind, id } = await params;
  const { locale } = await getI18n();
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return {};
  const e = await entry<{ name_en?: string; name_ar?: string; title_en?: string; title_ar?: string }>(kind as "scientist", id);
  return { title: e ? L(locale, e.name_en ?? e.title_en, e.name_ar ?? e.title_ar) : undefined };
}

function Stars({ stars, title }: { stars: string[]; title: string }) {
  if (!stars?.length) return null;
  return (
    <Block title={title}>
      <ul className="flex flex-wrap gap-2">
        {stars.map((s) => (
          <li key={s}>
            <Link href={starHref(s)} className="inline-flex items-center gap-1.5 min-h-11 rounded-full bg-[#0b0e29] text-white px-3.5 text-sm font-medium hover:opacity-90">
              <Star className="size-3.5 text-[#f3d27a]" aria-hidden />{s}
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  );
}

async function HoldingCard({ h }: { h: Holding }) {
  const { t, locale } = await getI18n();
  return (
    <li className="rounded-[16px] border border-line bg-surface p-4 flex flex-col gap-1.5">
      <span className="font-medium text-ink">{L(locale, h.object_en, h.object_ar)}</span>
      <span className="text-sm text-ink-2 inline-flex items-center gap-1"><MapPin className="size-4 text-accent" aria-hidden />{L(locale, h.museum_en, h.museum_ar)}{locale === "ar" ? "، " : ", "}{L(locale, h.city_en, h.city_ar)}</span>
      <span className="text-xs text-ink-3">
        {[h.maker_en || h.maker_ar ? `${t("science.by")} ${L(locale, h.maker_en, h.maker_ar)}` : null, h.date_text, h.accession ? t("science.accession", { n: h.accession }) : null].filter(Boolean).join(" · ")}
      </span>
      {L(locale, h.note_en, h.note_ar) && <span className="text-xs text-ink-3">{L(locale, h.note_en, h.note_ar)}</span>}
      <a href={h.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent min-h-11">{t("science.museumPage")}<ExternalLink className="size-3.5" aria-hidden /></a>
      <span className="text-[0.7rem] text-ink-3">{t("science.verified", { date: fmtDate(h.verified_on, locale) })}</span>
    </li>
  );
}

export default async function ScienceEntryPage({ params }: Props) {
  const { kind, id } = await params;
  const { t, locale } = await getI18n();
  if (!KINDS.includes(kind as (typeof KINDS)[number])) notFound();
  const concepts = await listConcepts();
  const conceptChips = (ids: string[]) => concepts.filter((c) => ids?.includes(c.id)).map((c) => ({ id: c.id, name_en: c.label_en, name_ar: c.label_ar }));

  if (kind === "scientist") {
    const s = await entry<Scientist>("scientist", id);
    if (!s) notFound();
    const [works, instruments] = await Promise.all([names("work", s.works ?? []), names("instrument", s.instruments ?? [])]);
    return (
      <article className="flex flex-col gap-7 pb-12" data-testid="science-scientist">
        <BackLink label={t("nav.back")} />
        <header className="flex flex-col gap-2">
          <Eyebrow>{s.fields.map((f) => t(`science.field.${f}`)).join(" · ")}</Eyebrow>
          <h1 className="text-[2rem] leading-tight font-semibold text-ink">{L(locale, s.name_en, s.name_ar)}</h1>
          <p className="text-ink-3">{s.dates} · {L(locale, s.places_en, s.places_ar)}</p>
        </header>
        <p className="text-[1.05rem] leading-relaxed text-ink">{L(locale, s.summary_en, s.summary_ar)}</p>
        {s.contributions?.length > 0 && (
          <Block title={t("science.contributions")}>
            <ul className="list-disc ps-5 flex flex-col gap-1.5">{s.contributions.map((c, i) => <li key={i}>{L(locale, c.en, c.ar)}</li>)}</ul>
          </Block>
        )}
        {works.length > 0 && <Block title={t("science.worksOf")}><Chips items={works} href={(i) => `/science/work/${i}`} locale={locale} /></Block>}
        {instruments.length > 0 && <Block title={t("science.instrumentsOf")}><Chips items={instruments} href={(i) => `/science/instrument/${i}`} locale={locale} /></Block>}
        <Stars stars={s.stars} title={t("science.starsScholar")} />
        {conceptChips(s.concepts).length > 0 && <Block title={t("science.related")}><Chips items={conceptChips(s.concepts)} href={conceptHref} locale={locale} /></Block>}
        <Sources sources={s.sources} title={t("science.sources")} />
      </article>
    );
  }

  if (kind === "work") {
    const w = await entry<Work>("work", id);
    if (!w) notFound();
    const author = await names("scientist", [w.author]);
    return (
      <article className="flex flex-col gap-7 pb-12" data-testid="science-work">
        <BackLink label={t("nav.back")} />
        <header className="flex flex-col gap-2">
          <Eyebrow>{t("science.works")}</Eyebrow>
          <h1 className="text-[2rem] leading-tight font-semibold text-ink">{L(locale, w.title_en, w.title_ar)}</h1>
          <p className="text-ink-3">{w.date_text}</p>
        </header>
        {author.length > 0 && <Block title={t("science.writtenBy")}><Chips items={author} href={(i) => `/science/scientist/${i}`} locale={locale} /></Block>}
        <p className="text-[1.05rem] leading-relaxed text-ink">{L(locale, w.summary_en, w.summary_ar)}</p>
        <Sources sources={w.sources} title={t("science.sources")} />
      </article>
    );
  }

  const i = await entry<Instrument>("instrument", id);
  if (!i) notFound();
  const [scholars, linked, holdings] = await Promise.all([names("scientist", i.scientists ?? []), scientistsLinkedTo("instruments", i.id), holdingsFor(i.id)]);
  const allScholars = [...new Map([...scholars, ...linked].map((s) => [s.id, s])).values()];
  return (
    <article className="flex flex-col gap-7 pb-12" data-testid="science-instrument">
      <BackLink label={t("nav.back")} />
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("science.instruments")}</Eyebrow>
        <h1 className="text-[2rem] leading-tight font-semibold text-ink">{L(locale, i.name_en, i.name_ar)}</h1>
      </header>
      <Block title={t("science.origin")}><p data-testid="instrument-origin">{L(locale, i.origin_en, i.origin_ar)}</p></Block>
      <Block title={t("science.contribution")}><p>{L(locale, i.muslim_contribution_en, i.muslim_contribution_ar)}</p></Block>
      <Block title={t("science.how")}><p>{L(locale, i.how_it_works_en, i.how_it_works_ar)}</p></Block>
      {(locale === "ar" ? i.uses_ar : i.uses_en)?.length > 0 && (
        <Block title={t("science.uses")}><ul className="list-disc ps-5 flex flex-col gap-1">{(locale === "ar" ? i.uses_ar : i.uses_en).map((u, k) => <li key={k}>{u}</li>)}</ul></Block>
      )}
      {allScholars.length > 0 && <Block title={t("science.scholars")}><Chips items={allScholars} href={(x) => `/science/scientist/${x}`} locale={locale} /></Block>}
      <Stars stars={i.stars} title={t("science.stars")} />
      <Block title={t("science.where")}>
        {holdings.length ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2" data-testid="holdings">{holdings.slice(0, 6).map((h) => <HoldingCard key={h.id} h={h} />)}</ul>
            {holdings.length > 6 && (
              <details className="group">
                <summary className="cursor-pointer list-none min-h-11 inline-flex items-center text-sm font-semibold text-accent">{t("science.showAll", { n: holdings.length })}</summary>
                <ul className="grid gap-3 sm:grid-cols-2 mt-2">{holdings.slice(6).map((h) => <HoldingCard key={h.id} h={h} />)}</ul>
              </details>
            )}
          </>
        ) : (
          <p>{t("science.whereNone")}</p>
        )}
      </Block>
      {conceptChips(i.concepts).length > 0 && <Block title={t("science.related")}><Chips items={conceptChips(i.concepts)} href={conceptHref} locale={locale} /></Block>}
      <Sources sources={i.sources} title={t("science.sources")} />
    </article>
  );
}
