"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Search } from "lucide-react";
import { Badge, Button, Callout, Card, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { pick, fmtDate } from "@/i18n/core";
import type { BookRow, PassageRow } from "../server";
import { gradeAr, primaryGrade } from "../grades";
import { BookStatus } from "./library-view";

type Action = "approve" | "archive" | "unarchive" | "retry" | "delete";

export function BookDetail({ initial, passages: initialPassages, role, userId }: { initial: BookRow; passages: { rows: PassageRow[]; total: number }; role: string; userId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [book, setBook] = useState(initial);
  const [q, setQ] = useState("");
  const [data, setData] = useState(initialPassages);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<Action | null>(null);
  const admin = role === "institution_admin" || role === "platform_admin";

  const load = useCallback(async (query: string, offset = 0) => {
    setLoading(true);
    const r = await fetch(`/api/library/books/${book.id}?q=${encodeURIComponent(query)}&offset=${offset}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setLoading(false);
    if (!r?.ok) return;
    setBook(r.data.book);
    setData((d) => (offset ? { rows: [...d.rows, ...r.data.passages.rows], total: r.data.passages.total } : r.data.passages));
  }, [book.id]);

  useEffect(() => {
    if (book.status !== "processing") return;
    const id = setInterval(() => load(q), 2500);
    return () => clearInterval(id);
  }, [book.status, load, q]);

  async function act(action: Action) {
    if (action === "delete" && !window.confirm(t("library.action.deleteConfirm"))) return;
    setActing(action);
    const r = await fetch(`/api/library/books/${book.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).then((x) => x.json()).catch(() => null);
    setActing(null);
    if (!r?.ok) return toast({ tone: "bad", text: r?.error?.message ?? "Failed" });
    if (action === "delete") return void (window.location.href = "/portal/library");
    if (r.data) setBook(r.data);
    if (action === "retry") setBook((b) => ({ ...b, status: "processing" }));
  }

  const collection = book.id.replace(/^hadith-/, "");
  const canApprove = admin && book.status === "draft" && (book.origin === "builtin" || book.created_by !== userId || role === "platform_admin");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/library" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink w-fit"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("library.back")}</Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sand">{t(`library.kind.${book.kind}`)}</Badge>
          <BookStatus b={book} />
          {book.extract_method && <Badge>{t(`library.method.${book.extract_method}`)}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold text-ink" data-testid="book-title">{pick(book, "title", locale)}</h1>
        <p className="text-ink-2">{pick(book, "author", locale)}</p>
        {pick(book, "note", locale) && <p className="text-sm text-ink-2 max-w-[80ch]">{pick(book, "note", locale)}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
          {book.pages ? <span>{t("library.pages", { n: book.pages })}</span> : null}
          <span>{t("library.passages", { n: book.passages })}</span>
          {book.created_by_name && <span>{t("library.uploadedBy", { name: book.created_by_name })}</span>}
          {book.approved_at && <span>{t("library.approvedOn", { date: fmtDate(book.approved_at, locale) })}</span>}
          {book.licence_note && <span>{book.licence_note}</span>}
          {book.source_url && <a href={book.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-4" dir="ltr">{new URL(book.source_url).hostname}</a>}
        </div>
        {book.status === "processing" && <Callout tone="accent">{book.pages ? t("library.progress", { done: book.pages_done, total: book.pages }) : t("library.status.processing")}</Callout>}
        {book.error && <Callout tone={book.status === "failed" ? "bad" : "warn"}>{book.error}</Callout>}
        {book.origin === "upload" && (book.extract_method === "ai" || book.extract_method === "mixed") && <Callout tone="warn">{t("library.machineRead")}</Callout>}
        {book.kind === "hadith" && <p className="text-sm text-ink-3">{t("library.gradeOkOnly")}</p>}
        <div className="flex flex-wrap gap-2 mt-1" data-testid="book-actions">
          {canApprove && <Button onClick={() => act("approve")} loading={acting === "approve"}>{t("library.action.approve")}</Button>}
          {admin && book.status === "draft" && book.origin === "upload" && book.created_by === userId && role !== "platform_admin" && <span className="text-sm text-ink-3 self-center">{t("library.fourEyes")}</span>}
          {book.origin === "upload" && <a href={`/api/library/books/${book.id}/file`} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] border border-line-strong bg-surface text-ink text-[0.95rem] font-medium hover:bg-surface-2"><Download className="size-4" aria-hidden />{t("library.download")}</a>}
          {book.origin === "upload" && (book.status === "failed" || book.status === "draft") && <Button variant="secondary" onClick={() => act("retry")} loading={acting === "retry"}>{t("library.action.retry")}</Button>}
          {admin && book.status !== "archived" && book.status !== "processing" && <Button variant="ghost" onClick={() => act("archive")} loading={acting === "archive"}>{t("library.action.archive")}</Button>}
          {admin && book.status === "archived" && <Button variant="secondary" onClick={() => act("unarchive")} loading={acting === "unarchive"}>{t("library.action.unarchive")}</Button>}
          {book.origin === "upload" && (admin || book.created_by === userId) && <Button variant="ghost" className="text-bad" onClick={() => act("delete")} loading={acting === "delete"}>{t("library.action.delete")}</Button>}
        </div>
      </header>

      <section className="flex flex-col gap-3" aria-label={t("library.search")}>
        <form className="flex gap-2 max-w-xl" onSubmit={(e) => { e.preventDefault(); load(q); }} role="search">
          <label className="sr-only" htmlFor="book-q">{t("library.search")}</label>
          <Input id="book-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.search")} dir="auto" />
          <Button type="submit" variant="secondary" loading={loading}><Search className="size-4" aria-hidden /><span className="sr-only">{t("library.search")}</span></Button>
        </form>
        <p className="text-sm text-ink-3" aria-live="polite">{data.total ? t("library.results", { n: data.total }) : q ? t("library.search.none") : ""}</p>
        <ol className="flex flex-col gap-3" data-testid="passages">
          {data.rows.map((p) => {
            const grade = book.kind === "hadith" ? primaryGrade(collection, p.grades ?? []) : null;
            return (
              <li key={p.ref}>
                <Card className="p-4 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <span className="mono" dir="ltr">
                      {p.page != null ? t("library.page", { n: p.page }) : p.sura != null ? t("library.verse", { ref: p.aya_from === p.aya_to ? `${p.sura}:${p.aya_from}` : `${p.sura}:${p.aya_from}–${p.aya_to}` }) : t("library.hadithNo", { n: p.number ?? p.ref })}
                    </span>
                    {grade && <Badge tone={p.grade_ok ? "ok" : "warn"}>{t("library.grade", { grader: grade.name, grade: locale === "ar" ? gradeAr(grade.grade) : grade.grade })}</Badge>}
                  </div>
                  <p className="whitespace-pre-line leading-loose text-ink" dir="auto" lang={book.lang}>{p.text.length > 1800 ? p.text.slice(0, 1800) + " …" : p.text}</p>
                  {p.text_en && <p className="text-sm text-ink-2 leading-relaxed" dir="ltr" lang="en">{p.text_en.length > 900 ? p.text_en.slice(0, 900) + " …" : p.text_en}</p>}
                </Card>
              </li>
            );
          })}
        </ol>
        {data.rows.length < data.total && <Button variant="secondary" onClick={() => load(q, data.rows.length)} loading={loading} className="self-start">{t("library.more")}</Button>}
      </section>
    </div>
  );
}
