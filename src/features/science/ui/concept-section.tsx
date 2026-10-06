import Link from "next/link";
import { ChevronRight, FlaskConical, Telescope } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { topicFor } from "../server";
import { Chips, L } from "./parts";

/** Sky-mode links for sky concepts. */
const SKY: Record<string, string> = { moon: "/sky/star/moon", stars: "/sky", sun: "/sky", night_day: "/sky" };

/** "From Muslim science" on a concept page: an honest one-line link to scholars, instruments and works. */
export async function ScienceForConcept({ conceptId }: { conceptId: string }) {
  const found = await topicFor(conceptId).catch(() => null);
  const { t, locale } = await getI18n();
  const sky = SKY[conceptId];
  const skyLink = sky ? (
    <Link href={sky} className="flex items-center gap-3 rounded-[18px] bg-[#0b0e29] text-white p-4 mt-4 hover:opacity-95" data-testid="concept-sky">
      <Telescope className="size-6 text-[#f3d27a] shrink-0" aria-hidden />
      <span className="flex-1 flex flex-col"><span className="font-semibold">{t("science.sky")}</span><span className="text-sm text-white/75">{t("science.skyBody")}</span></span>
      <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
    </Link>
  ) : null;
  if (!found) return skyLink;
  const { topic, scientists, instruments, works } = found;
  return (
    <>
    {skyLink}
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5 mt-6" aria-labelledby="sci-h" data-testid="concept-science">
      <h2 id="sci-h" className="text-lg font-semibold text-ink inline-flex items-center gap-2"><FlaskConical className="size-5 text-accent" aria-hidden />{t("science.section")}</h2>
      <p className="text-ink-2 leading-relaxed">{L(locale, topic.note_en, topic.note_ar)}</p>
      <Chips items={instruments} href={(i) => `/science/instrument/${i}`} locale={locale} />
      <Chips items={scientists} href={(i) => `/science/scientist/${i}`} locale={locale} />
      <Chips items={works} href={(i) => `/science/work/${i}`} locale={locale} />
      <Link href="/science" className="self-start text-sm font-medium text-accent inline-flex items-center gap-1 min-h-11">{t("science.sectionMore")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Link>
    </section>
    </>
  );
}
