import Link from "next/link";
import { ChevronRight, FlaskConical } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { topicFor } from "../server";
import { Chips, L } from "./parts";

/** "From Muslim science" on a concept page: an honest one-line link to scholars, instruments and works. */
export async function ScienceForConcept({ conceptId }: { conceptId: string }) {
  const found = await topicFor(conceptId).catch(() => null);
  if (!found) return null;
  const { t, locale } = await getI18n();
  const { topic, scientists, instruments, works } = found;
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5 mt-6" aria-labelledby="sci-h" data-testid="concept-science">
      <h2 id="sci-h" className="text-lg font-semibold text-ink inline-flex items-center gap-2"><FlaskConical className="size-5 text-accent" aria-hidden />{t("science.section")}</h2>
      <p className="text-ink-2 leading-relaxed">{L(locale, topic.note_en, topic.note_ar)}</p>
      <Chips items={instruments} href={(i) => `/science/instrument/${i}`} locale={locale} />
      <Chips items={scientists} href={(i) => `/science/scientist/${i}`} locale={locale} />
      <Chips items={works} href={(i) => `/science/work/${i}`} locale={locale} />
      <Link href="/science" className="self-start text-sm font-medium text-accent inline-flex items-center gap-1 min-h-11">{t("science.sectionMore")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Link>
    </section>
  );
}
