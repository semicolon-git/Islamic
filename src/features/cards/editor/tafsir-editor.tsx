"use client";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { CardContent } from "@/lib/cards/types";

type Excerpt = CardContent["tafsir"][number];

/** Classical tafsir works most often cited; picking one fills the labels (still editable). */
export const TAFSIR_SOURCES: Record<string, Pick<Excerpt, "book_ar" | "book_en" | "author_ar" | "author_en">> = {
  tabari: { book_ar: "جامع البيان عن تأويل آي القرآن", book_en: "Jami' al-Bayan", author_ar: "ابن جرير الطبري (ت ٣١٠هـ)", author_en: "al-Tabari (d. 310 AH)" },
  ibn_kathir: { book_ar: "تفسير القرآن العظيم", book_en: "Tafsir al-Qur'an al-'Azim", author_ar: "ابن كثير (ت ٧٧٤هـ)", author_en: "Ibn Kathir (d. 774 AH)" },
  saadi: { book_ar: "تيسير الكريم الرحمن في تفسير كلام المنان", book_en: "Taysir al-Karim al-Rahman", author_ar: "عبد الرحمن السعدي (ت ١٣٧٦هـ)", author_en: "al-Sa'di (d. 1376 AH)" },
  qurtubi: { book_ar: "الجامع لأحكام القرآن", book_en: "al-Jami' li-Ahkam al-Qur'an", author_ar: "القرطبي (ت ٦٧١هـ)", author_en: "al-Qurtubi (d. 671 AH)" },
  baghawi: { book_ar: "معالم التنزيل", book_en: "Ma'alim al-Tanzil", author_ar: "البغوي (ت ٥١٦هـ)", author_en: "al-Baghawi (d. 516 AH)" },
};

export function TafsirEditor({ value, onChange, verseKeys, disabled }: { value: Excerpt[]; onChange: (v: Excerpt[]) => void; verseKeys: string[]; disabled?: boolean }) {
  const { t, locale } = useI18n();
  const set = (i: number, patch: Partial<Excerpt>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => onChange([...value, { source_id: "tabari", ...TAFSIR_SOURCES.tabari, verse_key: verseKeys[0] ?? "", excerpt_ar: "", url: "" }]);
  return (
    <div className="flex flex-col gap-4">
      {value.length === 0 && <p className="text-sm text-ink-3">{t("cards.tafsir.none")}</p>}
      {value.map((x, i) => {
        const id = `tafsir-${i}`;
        const preset = x.source_id in TAFSIR_SOURCES;
        return (
          <fieldset key={i} className="rounded-[14px] border border-line p-4 flex flex-col gap-3" disabled={disabled}>
            <legend className="px-1 text-sm font-semibold text-ink">{t("cards.tafsir.n", { n: i + 1 })}</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("cards.tafsir.source")} htmlFor={`${id}-src`}>
                <Select
                  id={`${id}-src`}
                  value={preset ? x.source_id : "other"}
                  onChange={(e) => {
                    const s = e.target.value;
                    if (s === "other") set(i, { source_id: "other" });
                    else set(i, { source_id: s, ...TAFSIR_SOURCES[s] });
                  }}
                >
                  {Object.entries(TAFSIR_SOURCES).map(([k, s]) => <option key={k} value={k}>{locale === "ar" ? `${s.book_ar} — ${s.author_ar}` : `${s.author_en} — ${s.book_en}`}</option>)}
                  <option value="other">{t("cards.tafsir.other")}</option>
                </Select>
              </Field>
              <Field label={t("cards.tafsir.verse")} htmlFor={`${id}-verse`}>
                <Select id={`${id}-verse`} value={x.verse_key} onChange={(e) => set(i, { verse_key: e.target.value })} className="mono">
                  {!verseKeys.includes(x.verse_key) && <option value={x.verse_key}>{x.verse_key || t("cards.tafsir.verseNone")}</option>}
                  {verseKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </Field>
            </div>
            {!preset && (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={t("cards.tafsir.bookEn")} htmlFor={`${id}-be`}><Input id={`${id}-be`} value={x.book_en} onChange={(e) => set(i, { book_en: e.target.value })} /></Field>
                <Field label={t("cards.tafsir.bookAr")} htmlFor={`${id}-ba`}><Input id={`${id}-ba`} dir="rtl" lang="ar" value={x.book_ar} onChange={(e) => set(i, { book_ar: e.target.value })} /></Field>
                <Field label={t("cards.tafsir.authorEn")} htmlFor={`${id}-ae`}><Input id={`${id}-ae`} value={x.author_en} onChange={(e) => set(i, { author_en: e.target.value })} /></Field>
                <Field label={t("cards.tafsir.authorAr")} htmlFor={`${id}-aa`}><Input id={`${id}-aa`} dir="rtl" lang="ar" value={x.author_ar} onChange={(e) => set(i, { author_ar: e.target.value })} /></Field>
              </div>
            )}
            <Field label={t("cards.tafsir.excerptAr")} htmlFor={`${id}-ar`} hint={t("cards.tafsir.hint")}>
              <Textarea id={`${id}-ar`} dir="rtl" lang="ar" rows={4} value={x.excerpt_ar} onChange={(e) => set(i, { excerpt_ar: e.target.value })} className="leading-[1.95] text-[1.02rem]" />
            </Field>
            <Field label={t("cards.tafsir.excerptEn")} htmlFor={`${id}-en`}>
              <Textarea id={`${id}-en`} rows={2} value={x.excerpt_en ?? ""} onChange={(e) => set(i, { excerpt_en: e.target.value || undefined })} />
            </Field>
            <div className="flex items-end gap-2">
              <Field label={t("cards.tafsir.url")} htmlFor={`${id}-url`} className="flex-1">
                <Input id={`${id}-url`} dir="ltr" inputMode="url" value={x.url ?? ""} onChange={(e) => set(i, { url: e.target.value })} />
              </Field>
              {!disabled && <IconButton label={t("cards.tafsir.remove")} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>}
            </div>
          </fieldset>
        );
      })}
      {!disabled && (
        <div><Button type="button" variant="secondary" size="sm" onClick={add}><Plus className="size-4" aria-hidden />{t("cards.tafsir.add")}</Button></div>
      )}
    </div>
  );
}
