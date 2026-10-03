import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BookOpen, Building2, CircleHelp, MapPin, MessageCircle, MessageCircleQuestion, Quote } from "lucide-react";
import { ButtonLink, EmptyState, VerseBlock } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { env } from "@/lib/env";
import { publishedCardForConcept, resolveCard } from "@/lib/cards/resolve";
import { manuscriptTitle, itemInscriptions, publishedItemByCode } from "@/features/heritage/queries";
import { versesForKeys } from "@/features/heritage/verses";
import { refLabel } from "@/features/heritage/inscription-view";
import { ItemGallery } from "@/features/heritage/components/item-gallery";
import { CodeRetry } from "@/features/heritage/components/code-retry";
import { CardSummary } from "@/features/heritage/components/card-summary";
import { loc } from "@/features/heritage/l10n";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const { locale, t } = await getI18n();
  const item = await publishedItemByCode(decodeURIComponent(code));
  return { title: item ? loc(locale, item.title_en, item.title_ar) : t("heritage.title") };
}

const HUES: Record<string, number> = { astrolabe: 40, lamp: 30, tile: 190, manuscript: 60 };

export default async function ItemPage({ params }: Props) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const { t, locale } = await getI18n();
  const item = await publishedItemByCode(code);
  const back = (
    <Link href="/heritage" className="inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {t("heritage.item.back")}
    </Link>
  );

  if (!item) {
    return (
      <div className="flex flex-col gap-2 pb-12">
        {back}
        <EmptyState
          className="rounded-[var(--radius-lg)] border border-line bg-surface mt-2"
          icon={<CircleHelp className="size-7" aria-hidden />}
          title={<span data-testid="item-not-found">{t("heritage.item.notFoundTitle", { code: code.toUpperCase() })}</span>}
          body={t("heritage.item.notFoundBody")}
          action={<CodeRetry initial="" />}
        />
      </div>
    );
  }

  const demo = (flag: boolean | null | undefined) => (env.demoMode && flag ? ` (${t("badge.demo")})` : "");
  const [inscriptions, cardRef, ms] = await Promise.all([
    itemInscriptions(item.id, true),
    item.card_id ? Promise.resolve({ id: item.card_id }) : item.concept_id ? publishedCardForConcept(item.concept_id) : Promise.resolve(null),
    item.manuscript_id ? manuscriptTitle(item.manuscript_id) : Promise.resolve(null),
  ]);
  const [card, verses] = await Promise.all([
    cardRef ? resolveCard(cardRef.id, "published") : Promise.resolve(null),
    versesForKeys(inscriptions.flatMap((i) => i.verse_keys)),
  ]);
  const verseBy = new Map(verses.map((v) => [v.key, v]));
  const title = loc(locale, item.title_en, item.title_ar);
  const otherTitle = locale === "ar" ? item.title_en : item.title_ar;
  const facts = [
    { k: t("heritage.item.date"), v: loc(locale, item.date_text, item.date_text_ar) },
    { k: t("heritage.item.origin"), v: loc(locale, item.origin, item.origin_ar) },
    { k: t("heritage.item.material"), v: loc(locale, item.material, item.material_ar) },
  ].filter((f) => f.v);
  const description = loc(locale, item.description_en, item.description_ar);
  const institution = item.institution_name_en ? loc(locale, item.institution_name_en, item.institution_name_ar) + demo(item.institution_is_demo) : null;
  const venue = item.venue_name_en ? loc(locale, item.venue_name_en, item.venue_name_ar) : null;
  const ask = `/ask?item=${encodeURIComponent(item.item_code!)}`;
  const talk = `/talk?item=${encodeURIComponent(item.item_code!)}`;

  return (
    <article className="flex flex-col gap-7 pb-12" data-testid="item-page" data-code={item.item_code}>
      <div className="flex flex-col gap-2">
        {back}
        <ItemGallery images={item.images} title={title} hue={HUES[item.kind] ?? 200} />
      </div>

      <header className="flex flex-col gap-2 animate-rise">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">{t(`heritage.kind.${item.kind}`)}</span>
          <span className="text-ink-3" aria-hidden>·</span>
          <span className="mono text-xs rounded-full border border-line px-2 py-0.5 text-ink-2" dir="ltr">
            <span className="sr-only">{t("heritage.item.code")}: </span>
            {item.item_code}
          </span>
        </div>
        <h1 className="text-[1.9rem] sm:text-[2.3rem] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {otherTitle && otherTitle !== title && (
          <p lang={locale === "ar" ? "en" : "ar"} dir={locale === "ar" ? "ltr" : "rtl"} className={locale === "ar" ? "text-ink-3 text-base" : "font-[family-name:var(--font-ms)] text-[1.35rem] leading-[1.9] text-ink-2 self-start"}>
            {otherTitle}
          </p>
        )}
      </header>

      {facts.length > 0 && (
        <section aria-label={t("heritage.item.facts")}>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line">
            {facts.map((f) => (
              <div key={f.k} className="bg-surface px-4 py-3">
                <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-3">{f.k}</dt>
                <dd className="text-ink mt-0.5">{f.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {description && (
        <section aria-labelledby="about-h" className="flex flex-col gap-2">
          <h2 id="about-h" className="text-lg font-semibold text-ink">{t("heritage.item.about")}</h2>
          <p className="text-ink-2 text-[1.02rem] leading-relaxed max-w-[65ch] whitespace-pre-line">{description}</p>
        </section>
      )}

      {inscriptions.length > 0 && (
        <section aria-labelledby="ins-h" className="flex flex-col gap-3" data-testid="item-inscriptions">
          <h2 id="ins-h" className="text-lg font-semibold text-ink">{t("heritage.item.inscriptions")}</h2>
          {inscriptions.map((ins) => {
            const vs = ins.verse_keys.map((k) => verseBy.get(k)).filter((v): v is NonNullable<typeof v> => !!v);
            return (
              <div key={ins.id} className="rounded-[var(--radius-lg)] border border-line bg-surface overflow-hidden shadow-card">
                <div className="bg-sand px-5 py-4 flex flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sand-ink">
                      <Quote className="size-3.5" aria-hidden />
                      {t("heritage.item.inscriptionReads")}
                    </span>
                    <span className="text-xs text-sand-ink/75">{t("heritage.item.asRead")}</span>
                  </span>
                  <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-[1.5rem] leading-[2.1] text-sand-ink">{ins.transcription}</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {vs.length ? (
                    <>
                      <p className="text-sm font-semibold text-ok" data-testid="inscription-quotes">
                        {t("heritage.item.quotes", { ref: refLabel(ins.verse_keys) })}
                      </p>
                      <VerseBlock verses={vs} locale={locale} translationLabel={t("quran.translation")} />
                    </>
                  ) : (
                    <p className="text-sm text-ink-2">{t("heritage.item.notQuran")}</p>
                  )}
                  {ins.author_name_en && ins.verifier_name_en && (
                    <p className="text-xs text-ink-3">
                      {t("heritage.item.readBy", {
                        author: loc(locale, ins.author_name_en, ins.author_name_ar) + demo(ins.author_is_demo),
                        verifier: loc(locale, ins.verifier_name_en, ins.verifier_name_ar) + demo(ins.verifier_is_demo),
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {card && (
        <section aria-labelledby="card-h" className="flex flex-col gap-3">
          <h2 id="card-h" className="text-lg font-semibold text-ink">{t("heritage.item.card")}</h2>
          <CardSummary rc={card} locale={locale} t={t} demo={env.demoMode} shownVerseKeys={verses.map((v) => v.key)} />
        </section>
      )}

      {ms?.has_published && (
        <Link href={`/heritage/manuscripts/${encodeURIComponent(ms.id)}`} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card hover:shadow-pop transition-shadow min-h-12" data-testid="item-manuscript-link">
          <span className="size-11 rounded-2xl bg-sand text-sand-ink grid place-items-center shrink-0">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-semibold text-ink">{t("heritage.item.manuscript")}</span>
            <span className="text-sm text-ink-2 line-clamp-1">{loc(locale, ms.title_en, ms.title_ar)}</span>
          </span>
        </Link>
      )}

      {(institution || venue) && (
        <section className="grid gap-3 sm:grid-cols-2" aria-label={t("heritage.item.heldBy")}>
          {institution && (
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-surface-2 px-4 py-3">
              <Building2 className="size-5 text-ink-3 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-3">{t("heritage.item.heldBy")}</p>
                <p className="text-ink font-medium" data-testid="item-institution">{institution}</p>
              </div>
            </div>
          )}
          {venue && (
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-surface-2 px-4 py-3">
              <MapPin className="size-5 text-ink-3 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-3">{t("heritage.item.onView")}</p>
                <p className="text-ink font-medium">{venue}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <ButtonLink href={ask} size="lg" className="sm:flex-1">
          <MessageCircleQuestion className="size-5" aria-hidden />
          {t("heritage.item.ask")}
        </ButtonLink>
        <ButtonLink href={talk} size="lg" variant="secondary" className="sm:flex-1">
          <MessageCircle className="size-5" aria-hidden />
          {t("heritage.item.talk")}
        </ButtonLink>
      </div>
    </article>
  );
}
