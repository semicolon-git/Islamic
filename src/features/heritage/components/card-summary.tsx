import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { VerseBlock } from "@/components/ui";
import type { Locale } from "@/i18n/core";
import type { ResolvedCard } from "@/lib/cards/resolve";
import { loc } from "../l10n";

/**
 * Compact view of an approved card linked to an item (the full card lives at /card/<id>).
 * Quran text comes from the resolved card's verses (database), never from the item.
 */
export function CardSummary({ rc, locale, t, demo }: { rc: ResolvedCard; locale: Locale; t: (k: string, v?: Record<string, string | number>) => string; demo: boolean }) {
  const inst = rc.institution ? loc(locale, rc.institution.name_en, rc.institution.name_ar) + (demo && rc.institution.is_demo ? ` (${t("badge.demo")})` : "") : "";
  const explanation = loc(locale, rc.content.explanation.en, rc.content.explanation.ar);
  const short = explanation.length > 320 ? explanation.slice(0, 300).replace(/\s+\S*$/, "") + "…" : explanation;
  const primary = rc.verses.slice(0, 1);
  return (
    <article className="rounded-[var(--radius-lg)] border border-line bg-surface shadow-card overflow-hidden" data-testid="linked-card">
      <header className="flex flex-col gap-1.5 px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
          <BadgeCheck className="size-4" aria-hidden />
          {inst ? t("badge.approved", { institution: inst }) : t("heritage.item.card")}
        </span>
        <h3 className="text-lg font-semibold text-ink">{loc(locale, rc.card.title_en, rc.card.title_ar)}</h3>
      </header>
      <div className="px-5 pb-4 flex flex-col gap-3">
        {short && <p className="text-ink-2 text-[0.95rem]">{short}</p>}
        {primary.length > 0 && <VerseBlock verses={primary} locale={locale} translationLabel={t("quran.translation")} />}
      </div>
      <Link href={`/card/${encodeURIComponent(rc.card.id)}`} className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5 min-h-12 text-sm font-semibold text-accent hover:bg-surface-2 transition-colors">
        {t("heritage.item.openCard")}
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
      </Link>
    </article>
  );
}
