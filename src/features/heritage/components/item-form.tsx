"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button, Callout, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConceptImage } from "@/components/ui/concept-image";
import { useI18n } from "@/i18n/client";
import { ITEM_KINDS } from "../codes";
import { loc } from "../l10n";
import { LICENSES, LICENSE_TEXT } from "../schemas";
import type { ItemImage } from "../types";
import type { FormOptions } from "../portal-queries";

export interface ItemFormValue {
  title_en: string;
  title_ar: string;
  kind: string;
  venue_id: string;
  concept_id: string;
  card_id: string;
  manuscript_id: string;
  date_text: string;
  date_text_ar: string;
  origin: string;
  origin_ar: string;
  material: string;
  material_ar: string;
  description_en: string;
  description_ar: string;
  images: ItemImage[];
}

export const EMPTY_ITEM: ItemFormValue = {
  title_en: "", title_ar: "", kind: "other", venue_id: "", concept_id: "", card_id: "", manuscript_id: "",
  date_text: "", date_text_ar: "", origin: "", origin_ar: "", material: "", material_ar: "",
  description_en: "", description_ar: "", images: [],
};

/** Register / edit form for a heritage item. Every image must carry a licence and a credit line. */
export function ItemForm({
  options,
  initial = EMPTY_ITEM,
  itemId,
  onSaved,
  onCancel,
}: {
  options: FormOptions;
  initial?: ItemFormValue;
  itemId?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [v, setV] = useState<ItemFormValue>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ItemFormValue>(k: K, val: ItemFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const setImg = (i: number, patch: Partial<ItemImage>) => setV((s) => ({ ...s, images: s.images.map((im, j) => (j === i ? { ...im, ...patch } : im)) }));
  const id = (k: string) => `${uid}-${k}`;

  const titlesMissing = !v.title_en.trim() || !v.title_ar.trim();
  const rightsMissing = v.images.some((im) => !im.credit.trim() || !im.license.trim());

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 8 - v.images.length)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/items/upload", { method: "POST", body: fd });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error?.message);
        setV((s) => ({ ...s, images: [...s.images, { src: j.data.src, credit: "", license: "", source_url: null, generated: false }] }));
      }
    } catch {
      setError(t("heritage.form.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (titlesMissing) return setError(t("heritage.form.needTitles"));
    if (rightsMissing) return setError(t("heritage.form.needRights"));
    setSaving(true);
    try {
      const payload = { ...v, images: v.images.map((im) => ({ ...im, source_url: im.source_url || null })) };
      const r = await fetch(itemId ? `/api/items/${itemId}` : "/api/items", {
        method: itemId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error?.message ?? t("state.error"));
      if (itemId) {
        toast({ tone: "ok", text: t("heritage.form.saved") });
        onSaved?.();
        router.refresh();
      } else {
        toast({ tone: "ok", text: t("heritage.portal.created") });
        router.push(`/portal/items/${j.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("state.error"));
    } finally {
      setSaving(false);
    }
  };

  const opt = (o: { id: string; label_en: string; label_ar: string }) => (
    <option key={o.id} value={o.id}>
      {loc(locale, o.label_en, o.label_ar)}
    </option>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate data-testid="item-form">
      <Card className="p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-ink">{t("heritage.form.sectionObject")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("heritage.form.titleEn")} htmlFor={id("ten")} error={touched && !v.title_en.trim() ? t("heritage.form.needTitles") : undefined}>
            <Input id={id("ten")} name="title_en" dir="ltr" lang="en" value={v.title_en} onChange={(e) => set("title_en", e.target.value)} required />
          </Field>
          <Field label={t("heritage.form.titleAr")} htmlFor={id("tar")} error={touched && !v.title_ar.trim() ? t("heritage.form.needTitles") : undefined}>
            <Input id={id("tar")} name="title_ar" dir="rtl" lang="ar" value={v.title_ar} onChange={(e) => set("title_ar", e.target.value)} required />
          </Field>
          <Field label={t("heritage.form.kind")} htmlFor={id("kind")}>
            <Select id={id("kind")} name="kind" value={v.kind} onChange={(e) => set("kind", e.target.value)}>
              {ITEM_KINDS.map((k) => (
                <option key={k} value={k}>{t(`heritage.kind.${k}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("heritage.form.venue")} htmlFor={id("venue")}>
            <Select id={id("venue")} name="venue_id" value={v.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
              <option value="">{t("heritage.form.noVenue")}</option>
              {options.venues.map(opt)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-ink">{t("heritage.form.sectionDetails")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["date_text", "heritage.form.dateEn", "ltr"],
              ["date_text_ar", "heritage.form.dateAr", "rtl"],
              ["origin", "heritage.form.originEn", "ltr"],
              ["origin_ar", "heritage.form.originAr", "rtl"],
              ["material", "heritage.form.materialEn", "ltr"],
              ["material_ar", "heritage.form.materialAr", "rtl"],
            ] as const
          ).map(([k, label, dir]) => (
            <Field key={k} label={t(label)} htmlFor={id(k)}>
              <Input id={id(k)} name={k} dir={dir} lang={dir === "rtl" ? "ar" : "en"} value={v[k]} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
          <Field label={t("heritage.form.descEn")} htmlFor={id("den")}>
            <Textarea id={id("den")} name="description_en" dir="ltr" lang="en" rows={5} value={v.description_en} onChange={(e) => set("description_en", e.target.value)} />
          </Field>
          <Field label={t("heritage.form.descAr")} htmlFor={id("dar")}>
            <Textarea id={id("dar")} name="description_ar" dir="rtl" lang="ar" rows={5} value={v.description_ar} onChange={(e) => set("description_ar", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-ink">{t("heritage.form.sectionLinks")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("heritage.form.concept")} htmlFor={id("concept")}>
            <Select id={id("concept")} name="concept_id" value={v.concept_id} onChange={(e) => set("concept_id", e.target.value)}>
              <option value="">{t("heritage.form.noConcept")}</option>
              {options.concepts.map(opt)}
            </Select>
          </Field>
          <Field label={t("heritage.form.card")} htmlFor={id("card")}>
            <Select id={id("card")} name="card_id" value={v.card_id} onChange={(e) => set("card_id", e.target.value)}>
              <option value="">{t("heritage.form.noCard")}</option>
              {options.cards.map(opt)}
            </Select>
          </Field>
          <Field label={t("heritage.form.manuscript")} htmlFor={id("ms")}>
            <Select id={id("ms")} name="manuscript_id" value={v.manuscript_id} onChange={(e) => set("manuscript_id", e.target.value)}>
              <option value="">{t("heritage.form.noManuscript")}</option>
              {options.manuscripts.map(opt)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">{t("heritage.form.sectionImages")}</h2>
            <p className="text-sm text-ink-3">{t("heritage.form.imagesHint")}</p>
          </div>
          <label className={cn("inline-flex items-center gap-2 h-11 px-4 rounded-[12px] border border-line-strong bg-surface text-ink font-medium cursor-pointer hover:bg-surface-2 focus-within:ring-2 focus-within:ring-violet/40", (uploading || v.images.length >= 8) && "opacity-60 pointer-events-none")}>
            <ImagePlus className="size-4" aria-hidden />
            {uploading ? t("heritage.form.uploading") : t("heritage.form.addImage")}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} data-testid="image-input" />
          </label>
        </div>
        {v.images.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{t("heritage.form.noImages")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {v.images.map((im, i) => {
              const known = Object.values(LICENSE_TEXT).includes(im.license);
              return (
                <li key={im.src + i} className="grid gap-3 rounded-[14px] border border-line p-3 sm:grid-cols-[112px_1fr]" data-testid="image-row">
                  <div className="relative">
                    <ConceptImage src={im.src} alt={t("heritage.form.images")} className="aspect-square w-28 sm:w-full rounded-[10px]" rounded={false} hue={200} />
                    {im.generated && <span className="absolute bottom-1 start-1 rounded-full bg-[rgb(7_10_34/0.7)] text-white text-[0.65rem] px-1.5">{t("heritage.form.generated")}</span>}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={t("heritage.form.license")} htmlFor={id(`lic${i}`)} error={touched && !im.license ? t("heritage.form.needRights") : undefined}>
                      <Select id={id(`lic${i}`)} value={known ? im.license : im.license ? "__custom" : ""} onChange={(e) => setImg(i, { license: e.target.value === "__custom" ? im.license : e.target.value })} data-testid="image-license">
                        <option value="">{t("heritage.form.licensePick")}</option>
                        {LICENSES.map((l) => (
                          <option key={l} value={LICENSE_TEXT[l]}>{t(`heritage.license.${l}`)}</option>
                        ))}
                        {!known && im.license && <option value="__custom">{im.license}</option>}
                      </Select>
                    </Field>
                    <Field label={t("heritage.form.credit")} htmlFor={id(`cr${i}`)} error={touched && !im.credit.trim() ? t("heritage.form.needRights") : undefined}>
                      <Input id={id(`cr${i}`)} value={im.credit} placeholder={t("heritage.form.creditPlaceholder")} onChange={(e) => setImg(i, { credit: e.target.value })} data-testid="image-credit" />
                    </Field>
                    <Field label={t("heritage.form.sourceUrl")} htmlFor={id(`src${i}`)} className="md:col-span-2">
                      <div className="flex gap-2">
                        <Input id={id(`src${i}`)} type="url" dir="ltr" value={im.source_url ?? ""} placeholder="https://" onChange={(e) => setImg(i, { source_url: e.target.value })} />
                        <Button type="button" variant="ghost" aria-label={t("heritage.form.removeImage")} title={t("heritage.form.removeImage")} onClick={() => setV((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </Field>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div aria-live="polite">{error && <Callout tone="bad">{error}</Callout>}</div>

      <div className="flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur py-3 -mx-1 px-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("heritage.form.cancelEdit")}
          </Button>
        )}
        <Button type="submit" size="lg" loading={saving} disabled={uploading} data-testid="item-save">
          {itemId ? t("heritage.form.save") : t("heritage.form.create")}
        </Button>
      </div>
    </form>
  );
}
