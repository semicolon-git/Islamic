"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import { ConceptImage } from "@/components/ui/concept-image";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { loc, num } from "../l10n";
import type { ItemImage } from "../types";

/** Item images with their credit and licence. Generated illustrations are always labelled as such. */
export function ItemGallery({ images, title, hue = 200 }: { images: ItemImage[]; title: string; hue?: number }) {
  const { t, locale } = useI18n();
  const [i, setI] = useState(0);
  const img = images[i];
  const n = images.length;
  const alt = img ? loc(locale, img.alt_en, img.alt_ar) || title : title;
  return (
    <figure className="flex flex-col gap-2.5" data-testid="item-gallery">
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-brand shadow-card">
        <ConceptImage src={img?.src} alt={alt} className="aspect-[4/5] sm:aspect-[4/3] w-full" rounded={false} hue={hue} />
        {img?.generated && (
          <span className="absolute top-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-[rgb(7_10_34/0.7)] text-white px-3 py-1 text-xs font-medium backdrop-blur-sm" data-testid="generated-label">
            <Sparkles className="size-3.5" aria-hidden />
            {t("heritage.item.illustrative")}
          </span>
        )}
        {n > 1 && (
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
            <button type="button" onClick={() => setI((i - 1 + n) % n)} aria-label={t("heritage.item.prevImage")} className="size-11 grid place-items-center rounded-full bg-[rgb(7_10_34/0.6)] text-white backdrop-blur-sm hover:bg-[rgb(7_10_34/0.8)]">
              <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
            </button>
            <span className="rounded-full bg-[rgb(7_10_34/0.6)] text-white text-xs px-2.5 py-1 tabular" aria-live="polite">
              {t("heritage.item.imageCount", { i: num(locale, i + 1), n: num(locale, n) })}
            </span>
            <button type="button" onClick={() => setI((i + 1) % n)} aria-label={t("heritage.item.nextImage")} className="size-11 grid place-items-center rounded-full bg-[rgb(7_10_34/0.6)] text-white backdrop-blur-sm hover:bg-[rgb(7_10_34/0.8)]">
              <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
            </button>
          </div>
        )}
      </div>
      {img && (
        <figcaption className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 text-xs text-ink-3")}>
          {img.generated && <span className="text-ink-2">{t("heritage.item.illustrativeNote")}</span>}
          <span>
            <span className="font-medium text-ink-2">{t("heritage.item.credit")}:</span> <bdi>{img.credit}</bdi>
          </span>
          <span>
            <span className="font-medium text-ink-2">{t("heritage.item.license")}:</span> <bdi>{img.license}</bdi>
          </span>
          {img.source_url && (
            <a href={img.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
              {t("heritage.item.source")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
