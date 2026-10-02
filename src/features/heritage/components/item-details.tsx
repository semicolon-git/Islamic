"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ConceptImage } from "@/components/ui/concept-image";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import { conceptLabel, loc } from "../l10n";
import type { FormOptions } from "../portal-queries";
import { ItemForm, type ItemFormValue } from "./item-form";

/** Read view of an item's metadata with an inline edit mode (while the item is still editable). */
export function ItemDetails({ value, options, itemId, editable }: { value: ItemFormValue; options: FormOptions; itemId: string; editable: boolean }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  if (editing) return <ItemForm options={options} initial={value} itemId={itemId} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  const find = (list: { id: string; label_en: string; label_ar: string }[], id: string) => {
    const o = list.find((x) => x.id === id);
    return o ? loc(locale, o.label_en, o.label_ar) : "";
  };
  const concept = options.concepts.find((x) => x.id === value.concept_id);
  const rows: [string, string][] = (
    [
      [t("heritage.form.kind"), t(`heritage.kind.${value.kind}`)],
      [t("heritage.form.venue"), find(options.venues, value.venue_id)],
      [t("heritage.item.date"), loc(locale, value.date_text, value.date_text_ar)],
      [t("heritage.item.origin"), loc(locale, value.origin, value.origin_ar)],
      [t("heritage.item.material"), loc(locale, value.material, value.material_ar)],
      [t("heritage.form.concept"), concept ? conceptLabel(t, locale, concept) : ""],
      [t("heritage.form.card"), find(options.cards, value.card_id)],
      [t("heritage.form.manuscript"), find(options.manuscripts, value.manuscript_id)],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <Card className="overflow-hidden" data-testid="item-details">
      {value.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-3 bg-surface-2 scrollbar-thin">
          {value.images.map((im, i) => (
            <figure key={im.src + i} className="shrink-0 w-48">
              <div className="relative">
                <ConceptImage src={im.src} alt={loc(locale, im.alt_en, im.alt_ar) || loc(locale, value.title_en, value.title_ar)} className="aspect-[4/3] w-full rounded-[10px]" rounded={false} hue={200} />
                {im.generated && (
                  <span className="absolute top-1.5 start-1.5 inline-flex items-center gap-1 rounded-full bg-[rgb(7_10_34/0.72)] text-white text-[0.65rem] px-1.5 py-0.5">
                    <Sparkles className="size-3" aria-hidden />
                    {t("heritage.item.illustrative")}
                  </span>
                )}
              </div>
              <figcaption className="mt-1 text-[0.72rem] text-ink-3 leading-snug">
                <bdi>{im.credit}</bdi> · <bdi>{im.license}</bdi>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="font-semibold text-ink text-lg">{value.title_en}</p>
            <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-xl leading-[1.9] text-ink-2 self-start">{value.title_ar}</p>
          </div>
          {editable ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} data-testid="edit-item">
              <Pencil className="size-4" aria-hidden />
              {t("heritage.form.edit")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3 max-w-[28ch] text-end">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              {t("heritage.form.locked")}
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-3">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {(value.description_en || value.description_ar) && (
          <div className="grid gap-4 md:grid-cols-2 border-t border-line pt-4">
            {value.description_en && <p lang="en" dir="ltr" className="text-sm text-ink-2 whitespace-pre-line">{value.description_en}</p>}
            {value.description_ar && <p lang="ar" dir="rtl" className="text-sm text-ink-2 whitespace-pre-line leading-loose">{value.description_ar}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Refresh server data when this item changes (another reviewer acted). */
export function LiveRefresh({ scopes }: { scopes: string[] }) {
  const router = useRouter();
  useEvents(scopes, () => router.refresh());
  return null;
}
