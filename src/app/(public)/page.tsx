import { Suspense } from "react";
import Link from "next/link";
import { BadgeCheck, Camera, ChevronRight, Leaf, Landmark, Shapes, ShieldCheck, Sparkles, LayoutGrid, MessageCircleQuestion, Building2 } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { fmtNumber, fmtRelative, type Locale } from "@/i18n/core";
import { env } from "@/lib/env";
import { ConceptImage } from "@/components/ui/concept-image";
import { Khatam } from "@/components/ui/khatam";
import { cn } from "@/components/ui/cn";
import { heroImage, listConcepts, recentApproved } from "@/features/beneficiary/data";
import { cardHref, cardsFirst, conceptHref, conceptHue, conceptLabel, TRACKS, type ConceptSummary, type Track } from "@/features/beneficiary/labels";
import { ApprovedSinceYouAsked, FirstVisitGate } from "@/features/beneficiary/home-client";

export const dynamic = "force-dynamic";

const TRACK_ICON: Record<Track, typeof Leaf> = { nature: Leaf, art: Shapes, heritage: Landmark };

function Tile({ c, locale, approvedLabel }: { c: ConceptSummary; locale: Locale; approvedLabel: string }) {
  const label = conceptLabel(c, locale);
  return (
    <li className="snap-start shrink-0 w-[9.25rem] sm:w-[10rem]">
      <Link href={conceptHref(c.id)} className="group relative block rounded-[18px] overflow-hidden focus-visible:outline-offset-4" aria-label={c.has_card ? `${label} · ${approvedLabel}` : label}>
        <ConceptImage src={c.image} alt="" hue={conceptHue(c.id, c.track)} className="aspect-[4/5] w-full rounded-[18px] transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="pointer-events-none absolute inset-0 rounded-[18px] bg-gradient-to-t from-[rgb(6_8_26/0.82)] via-[rgb(6_8_26/0.15)] to-transparent" aria-hidden />
        {c.has_card && (
          <span className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-white/95 text-[#0a6b5b] px-2 py-0.5 text-[0.7rem] font-semibold shadow-sm" aria-hidden>
            <BadgeCheck className="size-3.5" />
            {approvedLabel}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 p-3 text-[0.95rem] font-semibold leading-snug text-white line-clamp-2" aria-hidden>
          {label}
        </span>
      </Link>
    </li>
  );
}

export default async function Home() {
  const { t, locale } = await getI18n();
  const [concepts, recent] = await Promise.all([listConcepts(), recentApproved(5)]);
  const hero = heroImage("hero_home");
  const byTrack = Object.fromEntries(TRACKS.map((tr) => [tr, cardsFirst(concepts.filter((c) => c.track === tr))])) as Record<Track, ConceptSummary[]>;
  const labels = Object.fromEntries(concepts.map((c) => [c.id, conceptLabel(c, locale)]));
  const demo = env.demoMode;

  return (
    <div className="flex flex-col gap-10 pb-12">
      <Suspense fallback={null}>
        <FirstVisitGate />
      </Suspense>

      {/* Hero */}
      <section className="relative -mx-4 -mt-4 sm:mt-0 sm:mx-0 overflow-hidden sm:rounded-[28px] bg-[#0b0e29] text-white min-h-[30rem] sm:min-h-[28rem] flex flex-col justify-end" aria-labelledby="hero-h">
        <ConceptImage src={hero} alt="" hue={232} rounded={false} className="absolute inset-0" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0e29] via-[#0b0e29]/70 to-[#0b0e29]/10" aria-hidden />
        <span className="pointer-events-none absolute -top-16 -end-16 text-[#36dcb8] opacity-20" aria-hidden><Khatam size={260} strokeWidth={0.5} /></span>
        <div className="relative flex flex-col gap-4 px-5 pt-24 pb-6 sm:px-8 sm:pb-8">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15">
            <ShieldCheck className="size-3.5 text-[#36dcb8]" aria-hidden />
            {t("beneficiary.home.eyebrow")}
          </span>
          <h1 id="hero-h" className="text-[2.25rem] sm:text-[2.75rem] leading-[1.12] font-semibold tracking-tight max-w-[16ch]">
            {t("beneficiary.home.title")}
          </h1>
          <p className="text-white/80 text-[1.02rem] leading-relaxed max-w-[38ch]">{t("beneficiary.home.subtitle")}</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
            <Link
              href="/snap"
              className="inline-flex items-center justify-center gap-3 h-[3.75rem] sm:px-7 rounded-[18px] bg-[#36dcb8] text-[#052a22] text-[1.06rem] font-semibold shadow-[0_8px_30px_rgb(54_220_184/0.35)] transition-transform active:scale-[0.98] hover:bg-[#5ae6c7]"
            >
              <Camera className="size-6" aria-hidden />
              {t("beneficiary.home.cta")}
            </Link>
            <Link href="/snap?pick=1" className="inline-flex items-center justify-center gap-2 h-11 sm:px-4 rounded-[14px] text-sm font-medium text-white/85 hover:text-white hover:bg-white/10">
              <LayoutGrid className="size-4" aria-hidden />
              {t("beneficiary.home.ctaPick")}
            </Link>
          </div>
        </div>
      </section>

      <ApprovedSinceYouAsked labels={labels} />

      {/* Explore */}
      <section className="flex flex-col gap-6" aria-labelledby="explore-h">
        <div className="flex flex-col gap-1">
          <h2 id="explore-h" className="text-2xl font-semibold text-ink">{t("beneficiary.home.explore")}</h2>
          <p className="text-ink-2">{t("beneficiary.home.exploreBody")}</p>
        </div>
        {TRACKS.map((tr) => {
          const list = byTrack[tr];
          if (!list.length) return null;
          const Icon = TRACK_ICON[tr];
          const approved = list.filter((c) => c.has_card).length;
          return (
            <div key={tr} className="flex flex-col gap-3" data-testid={`track-${tr}`}>
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center"><Icon className="size-4" aria-hidden /></span>
                <h3 className="text-lg font-semibold text-ink">{t(`beneficiary.track.${tr}`)}</h3>
                <span className="ms-auto text-xs text-ink-3">{t("beneficiary.home.trackCount", { n: fmtNumber(list.length, locale), approved: fmtNumber(approved, locale) })}</span>
              </div>
              <ul className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 scrollbar-thin" aria-label={t(`beneficiary.track.${tr}`)}>
                {list.map((c) => (
                  <Tile key={c.id} c={c} locale={locale} approvedLabel={t("beneficiary.tile.approved")} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Recently approved */}
      <section className="flex flex-col gap-3" aria-labelledby="recent-h">
        <h2 id="recent-h" className="text-2xl font-semibold text-ink">{t("beneficiary.home.recent")}</h2>
        {recent.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-[20px] border border-line bg-surface overflow-hidden">
            {recent.map((r) => {
              const inst = locale === "ar" ? r.institution_ar : r.institution_en;
              return (
                <li key={r.id}>
                  <Link href={cardHref(r)} className="flex items-center gap-3 px-4 py-3 min-h-[4.5rem] hover:bg-surface-2">
                    {r.image ? (
                      <ConceptImage src={r.image} alt="" hue={conceptHue(r.concept_id ?? r.id, r.track ?? "art")} className="size-12 shrink-0 rounded-[12px]" />
                    ) : (
                      <span className="size-12 shrink-0 rounded-[12px] bg-violet-soft text-violet grid place-items-center"><MessageCircleQuestion className="size-5" aria-hidden /></span>
                    )}
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="font-medium text-ink truncate">{locale === "ar" ? r.title_ar : r.title_en}</span>
                      <span className="text-xs text-ink-3 line-clamp-2">
                        <BadgeCheck className="inline size-3.5 text-ok -mt-0.5 me-1" aria-hidden />
                        {inst ? t("beneficiary.home.approvedBy", { institution: inst }) : t("beneficiary.tile.approved")}
                        {demo && r.institution_demo ? ` (${t("badge.demo")})` : ""}
                        {r.published_at ? ` · ${fmtRelative(r.published_at, locale)}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-ink-3 shrink-0 rtl:rotate-180" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-[20px] border border-dashed border-line-strong p-6 text-center flex flex-col gap-2 items-center">
            <p className="text-ink-2">{t("beneficiary.home.recentEmpty")}</p>
            <Link href="/snap?pick=1" className="text-accent font-medium underline underline-offset-4 min-h-11 inline-flex items-center">{t("beneficiary.home.ctaPick")}</Link>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="flex flex-col gap-3" aria-labelledby="how-h">
        <h2 id="how-h" className="text-2xl font-semibold text-ink">{t("beneficiary.home.how")}</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Camera, k: "1" },
            { icon: BadgeCheck, k: "2" },
            { icon: Sparkles, k: "3" },
          ].map(({ icon: Icon, k }) => (
            <li key={k} className="rounded-[18px] border border-line bg-surface p-4 flex sm:flex-col gap-3">
              <span className="size-10 shrink-0 rounded-[12px] bg-accent-soft text-accent grid place-items-center"><Icon className="size-5" aria-hidden /></span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-ink">{t(`beneficiary.home.how${k}`)}</span>
                <span className="text-sm text-ink-2">{t(`beneficiary.home.how${k}Body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Privacy + about */}
      <section className="rounded-[20px] bg-surface-2 p-5 flex flex-col gap-3" aria-labelledby="privacy-h">
        <h2 id="privacy-h" className="inline-flex items-center gap-2 font-semibold text-ink">
          <ShieldCheck className="size-5 text-accent" aria-hidden />
          {t("beneficiary.home.privacyTitle")}
        </h2>
        <p className="text-sm text-ink-2 leading-relaxed">{t("privacy.short")} {t("beneficiary.home.privacyMore")}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/about" className={cn("inline-flex items-center gap-1 min-h-11 text-sm font-medium text-accent hover:underline underline-offset-4")}>
            {t("beneficiary.home.aboutLink")}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <Link href="/portal" className="inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-ink-2 hover:text-ink">
            <Building2 className="size-4" aria-hidden />
            {t("beneficiary.home.forInstitutions")}
          </Link>
        </div>
      </section>
    </div>
  );
}
