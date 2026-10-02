import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, BookOpen, ScanText, ScrollText } from "lucide-react";
import { Khatam, Skeleton } from "@/components/ui";
import { ConceptImage } from "@/components/ui/concept-image";
import { getI18n } from "@/i18n/server";
import { HeritageExplorer, SectionHead } from "@/features/heritage/components/heritage-explorer";
import type { ItemSummary } from "@/features/heritage/components/item-tile";
import { artConcepts, conceptImage, publishedItems, publishedManuscripts } from "@/features/heritage/queries";
import { thumbOf } from "@/features/heritage/uploads";
import { loc, num } from "@/features/heritage/l10n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("heritage.title") };
}

export default async function HeritagePage() {
  const { t, locale } = await getI18n();
  const [items, art, manuscripts] = await Promise.all([publishedItems(), artConcepts(), publishedManuscripts()]);
  const summaries: ItemSummary[] = items
    .filter((i) => i.item_code)
    .map((i) => ({
      code: i.item_code!,
      kind: i.kind,
      title_en: i.title_en,
      title_ar: i.title_ar,
      date_text: i.date_text,
      date_text_ar: i.date_text_ar,
      venue_code: i.venue_code,
      thumb: i.images[0] ? thumbOf(i.images[0].src) : null,
      generated: !!i.images[0]?.generated,
    }));

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Hero */}
      <section className="relative -mx-4 sm:mx-0 sm:mt-1" aria-labelledby="heritage-h1">
        <div className="relative h-[19rem] sm:h-[22rem] overflow-hidden sm:rounded-[var(--radius-lg)] bg-brand">
          <ConceptImage src={conceptImage("hero_heritage")} alt={t("heritage.hero.title")} className="absolute inset-0 size-full" rounded={false} hue={230} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_10_34/0.15)_0%,rgb(7_10_34/0.35)_45%,rgb(7_10_34/0.88)_100%)]" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 px-5 sm:px-8 pb-20 flex flex-col gap-2 text-white">
            <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/80">
              <Khatam size={16} />
              {t("heritage.hero.eyebrow")}
            </span>
            <h1 id="heritage-h1" className="text-[2.1rem] sm:text-[2.6rem] font-semibold leading-tight tracking-tight">{t("heritage.hero.title")}</h1>
            <p className="text-white/85 text-[0.98rem] max-w-[46ch]">{t("heritage.hero.body")}</p>
          </div>
        </div>
      </section>

      <div className="-mt-8 flex flex-col gap-8">
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <HeritageExplorer items={summaries} />
        </Suspense>

        {/* Inscription entry point */}
        <Link
          href="/inscription"
          className="group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-lg)] bg-sand p-5 border border-line transition-shadow hover:shadow-card"
          data-testid="inscription-cta"
        >
          <span className="absolute -end-6 -top-6 text-sand-ink/10" aria-hidden>
            <Khatam size={140} strokeWidth={0.8} />
          </span>
          <span className="relative size-12 shrink-0 rounded-full bg-surface grid place-items-center text-accent shadow-card">
            <ScanText className="size-6" aria-hidden />
          </span>
          <span className="relative flex-1 min-w-0">
            <span className="block font-semibold text-sand-ink text-lg">{t("heritage.cta.inscriptionTitle")}</span>
            <span className="block text-sm text-sand-ink/80">{t("heritage.cta.inscriptionBody")}</span>
          </span>
          <ArrowRight className="relative size-5 text-sand-ink transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden />
        </Link>

        {/* Art & architecture */}
        {art.length > 0 && (
          <section aria-labelledby="art-h" className="flex flex-col gap-3">
            <SectionHead id="art-h" title={t("heritage.art.title")} subtitle={t("heritage.art.subtitle")} />
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {art.map((c) => {
                const label = loc(locale, c.label_en, c.label_ar);
                return (
                  <li key={c.id}>
                    <Link href={`/c/${c.id}`} className="group relative block overflow-hidden rounded-[var(--radius)] border border-line bg-brand" data-testid="art-tile">
                      <ConceptImage src={c.image} alt={label} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.04]" rounded={false} hue={170 + (c.id.length * 23) % 120} />
                      <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgb(7_10_34/0.82)_100%)]" aria-hidden />
                      <span className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1">
                        {c.has_card && (
                          <span className="self-start inline-flex items-center gap-1 rounded-full bg-white/90 text-[#0a3d33] px-2 py-0.5 text-[0.68rem] font-semibold">
                            <BadgeCheck className="size-3" aria-hidden />
                            {t("heritage.art.hasCard")}
                          </span>
                        )}
                        <span className="text-white font-semibold leading-snug">{label}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Manuscripts */}
        <section aria-labelledby="ms-h" className="flex flex-col gap-3" data-testid="manuscripts-section">
          <SectionHead id="ms-h" title={t("heritage.ms.title")} subtitle={t("heritage.ms.subtitle")} />
          {manuscripts.length ? (
            <ul className="flex flex-col gap-3">
              {manuscripts.map((m) => (
                <li key={m.id}>
                  <Link href={`/heritage/manuscripts/${encodeURIComponent(m.id)}`} className="group flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-card hover:shadow-pop transition-shadow" data-testid="manuscript-link">
                    <ConceptImage src={m.thumb} alt={loc(locale, m.title_en, m.title_ar)} className="w-20 sm:w-24 aspect-[3/4] shrink-0 bg-sand" hue={50} />
                    <span className="flex flex-col gap-1 min-w-0 py-1">
                      <span className="font-semibold text-ink leading-snug line-clamp-2">{loc(locale, m.title_en, m.title_ar)}</span>
                      {(m.author_en || m.author_ar) && <span className="text-sm text-ink-2 line-clamp-1">{loc(locale, m.author_en, m.author_ar)}</span>}
                      <span className="text-xs text-ink-3 line-clamp-1">{[m.repository, m.shelfmark].filter(Boolean).join(" · ")}</span>
                      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                        <BookOpen className="size-4" aria-hidden />
                        {m.pages === 1 ? t("heritage.ms.page1") : t("heritage.ms.pages", { n: num(locale, m.pages) })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-6 flex gap-4 items-start" data-testid="manuscripts-soon">
              <span className="absolute -end-10 -bottom-10 text-ink/[0.05]" aria-hidden>
                <Khatam size={180} strokeWidth={0.6} />
              </span>
              <span className="relative size-12 shrink-0 rounded-2xl bg-sand text-sand-ink grid place-items-center">
                <ScrollText className="size-6" aria-hidden />
              </span>
              <span className="relative flex flex-col gap-1">
                <span className="font-semibold text-ink">{t("heritage.ms.soonTitle")}</span>
                <span className="text-sm text-ink-2 max-w-[52ch]">{t("heritage.ms.soonBody")}</span>
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
