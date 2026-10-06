import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Compass, Landmark, MapPin, Telescope } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { entries, type Holding, type Instrument, type Scientist, type Work } from "@/features/science/server";
import { Eyebrow, L } from "@/features/science/ui/parts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("science.title") };
}

export default async function SciencePage() {
  const { t, locale } = await getI18n();
  const [instruments, scientists, works, holdings] = await Promise.all([
    entries<Instrument>("instrument"), entries<Scientist>("scientist"), entries<Work>("work"), entries<Holding>("holding"),
  ]);
  const byCity = new Map<string, Holding[]>();
  for (const h of holdings) {
    const k = `${L(locale, h.museum_en, h.museum_ar)} · ${L(locale, h.city_en, h.city_ar)}`;
    byCity.set(k, [...(byCity.get(k) ?? []), h]);
  }
  const instName = new Map(instruments.map((i) => [i.id, L(locale, i.name_en, i.name_ar)]));

  return (
    <div className="flex flex-col gap-10 pb-12" data-testid="science-index">
      <header className="flex flex-col gap-3">
        <Eyebrow>{t("science.eyebrow")}</Eyebrow>
        <h1 className="text-[2rem] leading-tight font-semibold text-ink">{t("science.title")}</h1>
        <p className="text-ink-2 leading-relaxed max-w-[65ch]">{t("science.intro")}</p>
        <p className="text-sm text-ink-3 max-w-[65ch]">{t("science.honesty")}</p>
        <Link href="/sky" className="mt-2 flex items-center gap-3 rounded-[18px] bg-[#0b0e29] text-white p-4 hover:opacity-95 max-w-xl">
          <Telescope className="size-7 text-[#36dcb8] shrink-0" aria-hidden />
          <span className="flex-1 flex flex-col"><span className="font-semibold">{t("science.sky")}</span><span className="text-sm text-white/75">{t("science.skyBody")}</span></span>
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="sci-inst">
        <h2 id="sci-inst" className="text-2xl font-semibold text-ink inline-flex items-center gap-2"><Compass className="size-6 text-accent" aria-hidden />{t("science.instruments")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {instruments.map((i) => (
            <li key={i.id}>
              <Link href={`/science/instrument/${i.id}`} className="flex h-full flex-col gap-1.5 rounded-[18px] border border-line bg-surface p-4 hover:border-line-strong" data-instrument={i.id}>
                <span className="font-semibold text-ink">{L(locale, i.name_en, i.name_ar)}</span>
                <span className="text-sm text-ink-2 line-clamp-3">{L(locale, i.muslim_contribution_en, i.muslim_contribution_ar)}</span>
                {holdings.some((h) => h.instrument === i.id) && (
                  <span className="mt-auto pt-1 text-xs text-ink-3 inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{holdings.filter((h) => h.instrument === i.id).length} · {t("science.museums")}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sci-people">
        <h2 id="sci-people" className="text-2xl font-semibold text-ink">{t("science.scholars")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {scientists.map((s) => (
            <li key={s.id}>
              <Link href={`/science/scientist/${s.id}`} className="flex flex-col rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-line-strong" data-scientist={s.id}>
                <span className="font-medium text-ink">{L(locale, s.name_en, s.name_ar)}</span>
                <span className="text-xs text-ink-3">{s.dates} · {s.fields.map((f) => t(`science.field.${f}`)).join("، ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sci-works">
        <h2 id="sci-works" className="text-2xl font-semibold text-ink">{t("science.works")}</h2>
        <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line bg-surface overflow-hidden">
          {works.map((w) => (
            <li key={w.id}>
              <Link href={`/science/work/${w.id}`} className="flex items-center gap-3 px-4 py-3 min-h-14 hover:bg-surface-2">
                <span className="flex-1 flex flex-col"><span className="font-medium text-ink">{L(locale, w.title_en, w.title_ar)}</span><span className="text-xs text-ink-3">{w.date_text}</span></span>
                <ChevronRight className="size-4 text-ink-3 rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sci-museums">
        <h2 id="sci-museums" className="text-2xl font-semibold text-ink inline-flex items-center gap-2"><Landmark className="size-6 text-accent" aria-hidden />{t("science.museums")}</h2>
        <p className="text-sm text-ink-2">{t("science.museumsBody")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {[...byCity.entries()].map(([place, hs]) => (
            <div key={place} className="rounded-[18px] border border-line bg-surface p-4 flex flex-col gap-2">
              <h3 className="font-semibold text-ink">{place}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {hs.map((h) => (
                  <li key={h.id}>
                    <a href={h.url} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink underline underline-offset-4 decoration-line-strong">{L(locale, h.object_en, h.object_ar)}</a>
                    <span className="text-ink-3"> · {instName.get(h.instrument) ?? h.instrument} · {h.date_text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
