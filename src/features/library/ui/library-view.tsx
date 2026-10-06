"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FileUp, Library as LibraryIcon, Loader2 } from "lucide-react";
import { Badge, Button, Callout, Card, Field, Input, Select, StatusPill } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { pick } from "@/i18n/core";
import type { BookRow } from "../server";

const STATUS_PILL: Record<string, string> = { processing: "student_submitted", draft: "returned", approved: "approved", failed: "returned", archived: "archived" };

export function BookStatus({ b }: { b: BookRow }) {
  const { t } = useI18n();
  return <StatusPill status={b.status === "failed" ? "disputed" : STATUS_PILL[b.status] ?? b.status} label={t(`library.status.${b.status}`)} />;
}

export function LibraryView({ initial, canUpload }: { initial: BookRow[]; canUpload: boolean }) {
  const { t } = useI18n();
  const [books, setBooks] = useState(initial);
  const busy = books.some((b) => b.status === "processing");

  const refresh = useCallback(async () => {
    const r = await fetch("/api/library/books", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setBooks(r.data);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [busy, refresh]);

  const builtin = books.filter((b) => b.origin === "builtin");
  const uploads = books.filter((b) => b.origin === "upload");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink flex items-center gap-2"><LibraryIcon className="size-6 text-accent" aria-hidden />{t("library.title")}</h1>
        <p className="text-ink-2 max-w-[80ch]">{t("library.subtitle")}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <section aria-labelledby="lib-up" className="flex flex-col gap-3">
            <h2 id="lib-up" className="text-sm font-semibold uppercase tracking-wider text-ink-3">{t("library.uploads")}</h2>
            {uploads.length === 0 ? (
              <Card className="p-5 text-ink-2">{t("library.uploads.empty")}</Card>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="uploaded-books">
                {uploads.map((b) => <BookRowItem key={b.id} b={b} />)}
              </ul>
            )}
          </section>
          <section aria-labelledby="lib-bi" className="flex flex-col gap-3">
            <h2 id="lib-bi" className="text-sm font-semibold uppercase tracking-wider text-ink-3">{t("library.builtin")}</h2>
            <ul className="grid gap-2 md:grid-cols-2" data-testid="builtin-books">
              {builtin.map((b) => <BookRowItem key={b.id} b={b} />)}
            </ul>
            <p className="text-xs text-ink-3">{t("library.mirror")} {t("library.gradeOkOnly")}</p>
          </section>
        </div>
        <aside className="xl:sticky xl:top-6">
          {canUpload ? <UploadForm onUploaded={refresh} /> : <Callout tone="neutral">{t("library.upload.noRole")}</Callout>}
        </aside>
      </div>
      <span className="sr-only" aria-live="polite">{busy ? t("library.status.processing") : ""}</span>
    </div>
  );
}

function BookRowItem({ b }: { b: BookRow }) {
  const { t, locale } = useI18n();
  return (
    <li>
      <Link href={`/portal/library/${b.id}`} className="group block rounded-[var(--radius)] border border-line bg-surface p-4 hover:border-line-strong focus-visible:outline-2" data-book={b.id}>
        <div className="flex items-start gap-3">
          <BookOpen className="size-5 mt-0.5 text-ink-3 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="font-medium text-ink leading-snug">{pick(b, "title", locale)}</span>
            <span className="text-sm text-ink-2 truncate">{pick(b, "author", locale)}</span>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge tone="sand">{t(`library.kind.${b.kind}`)}</Badge>
              <BookStatus b={b} />
              {b.passages > 0 && <span className="text-xs text-ink-3">{t("library.passages", { n: b.passages.toLocaleString(locale === "ar" ? "ar-SA" : "en-US") })}</span>}
              {b.status === "processing" && b.pages ? (
                <span className="text-xs text-ink-3 inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden />{t("library.progress", { done: b.pages_done, total: b.pages })}</span>
              ) : null}
            </div>
            {b.status === "failed" && b.error && <span className="text-sm text-bad">{b.error}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await fetch("/api/library/books", { method: "POST", body: fd }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error?.message ?? "Upload failed");
      formRef.current?.reset();
      toast({ tone: "ok", text: t("library.upload.done") });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" data-testid="upload-form">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2"><FileUp className="size-5 text-accent" aria-hidden />{t("library.upload.title")}</h2>
          <p className="text-sm text-ink-2">{t("library.upload.hint")}</p>
        </div>
        <Field label={t("library.upload.file")} htmlFor="lib-file">
          <input id="lib-file" name="file" type="file" accept="application/pdf,.pdf" required className="block w-full text-sm file:me-3 file:rounded-[10px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-ink" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label={t("library.upload.titleAr")} htmlFor="lib-tar"><Input id="lib-tar" name="title_ar" dir="rtl" /></Field>
          <Field label={t("library.upload.titleEn")} htmlFor="lib-ten"><Input id="lib-ten" name="title_en" dir="ltr" /></Field>
          <Field label={t("library.upload.authorAr")} htmlFor="lib-aar"><Input id="lib-aar" name="author_ar" dir="rtl" /></Field>
          <Field label={t("library.upload.authorEn")} htmlFor="lib-aen"><Input id="lib-aen" name="author_en" dir="ltr" /></Field>
        </div>
        <Field label={t("library.upload.lang")} htmlFor="lib-lang">
          <Select id="lib-lang" name="lang" defaultValue="ar">
            <option value="ar">{t("library.upload.langAr")}</option>
            <option value="en">{t("library.upload.langEn")}</option>
          </Select>
        </Field>
        <Field label={t("library.upload.source")} htmlFor="lib-src"><Input id="lib-src" name="source_url" type="url" dir="ltr" placeholder="https://" /></Field>
        <Field label={t("library.upload.licence")} hint={t("library.upload.licenceHint")} htmlFor="lib-lic"><Input id="lib-lic" name="licence_note" required /></Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="rights" value="yes" required className="mt-1 size-4 accent-[var(--color-accent)]" />
          <span>{t("library.upload.rights")}</span>
        </label>
        {error && <Callout tone="bad">{error}</Callout>}
        <Button type="submit" loading={busy} size="lg">{busy ? t("library.upload.busy") : t("library.upload.submit")}</Button>
      </form>
    </Card>
  );
}
