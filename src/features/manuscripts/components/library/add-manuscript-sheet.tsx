"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { GENRES } from "../../abbreviations";
import { LICENSE_KINDS } from "../../schema";
import { api, ApiError } from "../api";

const LICENCE_TEXT: Record<string, string> = {
  public_domain: "Public domain",
  pdm: "Public Domain Mark 1.0",
  cc0: "CC0 1.0 Universal",
  cc_by: "CC BY 4.0",
  cc_by_nc: "CC BY-NC 4.0 (non-commercial)",
};

export function AddManuscriptSheet({ open, onClose, works }: { open: boolean; onClose: () => void; works: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lic, setLic] = useState<string>("public_domain");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const license = lic === "other" ? get("license_other") : LICENCE_TEXT[lic];
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/ms/manuscripts", {
        method: "POST",
        json: {
          title_ar: get("title_ar"), title_en: get("title_en"), author_ar: get("author_ar"), author_en: get("author_en"),
          repository: get("repository"), shelfmark: get("shelfmark"), script: get("script"), genre: get("genre"),
          license, credit_line: get("credit_line"), source_url: get("source_url"), siglum: get("siglum"), work_id: get("work_id"),
          copy_date_text: get("copy_date_text"),
        },
      });
      toast({ tone: "ok", text: t("manuscripts.form.save") });
      onClose();
      router.push(`/portal/manuscripts/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("manuscripts.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const req = <span className="text-bad ms-0.5" aria-hidden>*</span>;
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("manuscripts.form.title")} description={t("manuscripts.form.desc")} closeLabel={t("action.close")}>
      <form id="add-ms" onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={<>{t("manuscripts.form.titleAr")}{req}</>} htmlFor="ms-title-ar"><Input id="ms-title-ar" name="title_ar" dir="rtl" lang="ar" required minLength={2} /></Field>
          <Field label={<>{t("manuscripts.form.titleEn")}{req}</>} htmlFor="ms-title-en"><Input id="ms-title-en" name="title_en" dir="ltr" required minLength={2} /></Field>
          <Field label={t("manuscripts.form.authorAr")} htmlFor="ms-author-ar"><Input id="ms-author-ar" name="author_ar" dir="rtl" lang="ar" /></Field>
          <Field label={t("manuscripts.form.authorEn")} htmlFor="ms-author-en"><Input id="ms-author-en" name="author_en" dir="ltr" /></Field>
          <Field label={<>{t("manuscripts.form.repository")}{req}</>} htmlFor="ms-repo"><Input id="ms-repo" name="repository" required minLength={2} /></Field>
          <Field label={<>{t("manuscripts.form.shelfmark")}{req}</>} htmlFor="ms-shelf"><Input id="ms-shelf" name="shelfmark" required dir="ltr" /></Field>
          <Field label={t("manuscripts.form.script")} hint={t("manuscripts.form.scriptHint")} htmlFor="ms-script"><Input id="ms-script" name="script" /></Field>
          <Field label={t("manuscripts.form.copyDate")} htmlFor="ms-date"><Input id="ms-date" name="copy_date_text" /></Field>
          <Field label={t("manuscripts.form.siglum")} hint={t("manuscripts.form.siglumHint")} htmlFor="ms-siglum"><Input id="ms-siglum" name="siglum" dir="rtl" maxLength={8} /></Field>
          <Field label={t("manuscripts.form.genre")} htmlFor="ms-genre">
            <Select id="ms-genre" name="genre" defaultValue="general">
              {GENRES.map((g) => <option key={g} value={g}>{t(`manuscripts.genre.${g}`)}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-ink-3 -mt-2">{t("manuscripts.form.genreHint")}</p>
        {works.length > 0 && (
          <Field label={t("manuscripts.meta.otherCopies")} htmlFor="ms-work">
            <Select id="ms-work" name="work_id" defaultValue="">
              <option value="">—</option>
              {works.map((w) => <option key={w} value={w}>{w.replace(/^work:/, "")}</option>)}
            </Select>
          </Field>
        )}
        <fieldset className="flex flex-col gap-3 rounded-[14px] border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t("manuscripts.meta.rights")}</legend>
          <Field label={<>{t("manuscripts.form.licence")}{req}</>} htmlFor="ms-lic">
            <Select id="ms-lic" value={lic} onChange={(e) => setLic(e.target.value)}>
              {LICENSE_KINDS.map((k) => <option key={k} value={k}>{t(`manuscripts.lic.${k}`)}</option>)}
            </Select>
          </Field>
          {lic === "other" && (
            <Field label={<>{t("manuscripts.form.licenceOther")}{req}</>} htmlFor="ms-lic-other"><Input id="ms-lic-other" name="license_other" required minLength={2} /></Field>
          )}
          <Field label={<>{t("manuscripts.form.credit")}{req}</>} hint={t("manuscripts.form.creditHint")} htmlFor="ms-credit">
            <Textarea id="ms-credit" name="credit_line" required minLength={5} className="min-h-20" />
          </Field>
          <Field label={t("manuscripts.form.source")} htmlFor="ms-src"><Input id="ms-src" name="source_url" type="url" dir="ltr" placeholder="https://" /></Field>
        </fieldset>
        {error && <Callout tone="bad">{error}</Callout>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
          <Button type="submit" loading={busy}>{t("manuscripts.form.save")}</Button>
        </div>
      </form>
    </Sheet>
  );
}
