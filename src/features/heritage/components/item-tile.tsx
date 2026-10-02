"use client";
import Link from "next/link";
import { ConceptImage } from "@/components/ui/concept-image";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { loc } from "../l10n";

export interface ItemSummary {
  code: string;
  kind: string;
  title_en: string;
  title_ar: string;
  date_text: string | null;
  date_text_ar: string | null;
  venue_code: string | null;
  thumb: string | null;
  generated: boolean;
}

const HUES: Record<string, number> = { astrolabe: 40, lamp: 30, tile: 190, manuscript: 60, folio: 60, textile: 340 };

/** A museum-catalogue style tile: image, kind, title, date and the label code. */
export function ItemTile({ item, className }: { item: ItemSummary; className?: string }) {
  const { t, locale } = useI18n();
  const title = loc(locale, item.title_en, item.title_ar);
  const date = loc(locale, item.date_text, item.date_text_ar);
  return (
    <Link
      href={`/heritage/item/${encodeURIComponent(item.code)}`}
      className={cn("group flex flex-col rounded-[var(--radius-lg)] bg-surface border border-line shadow-card overflow-hidden transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop focus-visible:-translate-y-0.5", className)}
      data-testid="item-tile"
      data-code={item.code}
    >
      <div className="relative">
        <ConceptImage src={item.thumb} alt={title} className="aspect-[4/5] w-full" rounded={false} hue={HUES[item.kind] ?? 200} />
        <span className="absolute top-2.5 start-2.5 mono text-[0.72rem] font-medium tracking-wide rounded-full bg-[rgb(7_10_34/0.62)] text-white px-2 py-0.5 backdrop-blur-sm" dir="ltr">
          {item.code}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-3 sm:p-3.5">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-accent">{t(`heritage.kind.${item.kind}`)}</span>
        <span className="font-semibold text-ink leading-snug line-clamp-2">{title}</span>
        {date && <span className="text-sm text-ink-3 line-clamp-1">{date}</span>}
      </div>
    </Link>
  );
}
