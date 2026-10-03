"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpenText, ClipboardCheck, Library, Plus, ScrollText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/lib/auth";
import type { MsSummary } from "../../types";
import { num } from "../api";
import { LicenceChip } from "../status";
import { AddManuscriptSheet } from "./add-manuscript-sheet";
import { UploadSheet } from "./upload-sheet";

export function LibraryView({ manuscripts, role, demo }: { manuscripts: MsSummary[]; role: Role; demo: boolean }) {
  const { t, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const canAdd = role === "researcher" || role === "institution_admin" || role === "platform_admin";
  const canUpload = role !== "specialist";

  const works = new Map<string, MsSummary[]>();
  const singles: MsSummary[] = [];
  for (const m of manuscripts) {
    if (m.work_id) works.set(m.work_id, [...(works.get(m.work_id) ?? []), m]);
    else singles.push(m);
  }
  for (const [k, v] of works) if (v.length < 2) { singles.push(...v); works.delete(k); }

  const totals = manuscripts.reduce((a, m) => ({ pages: a.pages + m.pages, human: a.human + m.lines_human, approved: a.approved + m.lines_approved, lines: a.lines + m.lines_total }), { pages: 0, human: 0, approved: 0, lines: 0 });

  return (
    <div className="flex flex-col gap-8 animate-rise">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2 max-w-3xl">
          <h1 className="text-[1.75rem] font-semibold tracking-tight flex items-center gap-3">
            <span className="size-10 rounded-[12px] bg-sand text-sand-ink grid place-items-center"><ScrollText className="size-5" /></span>
            {t("manuscripts.title")}
          </h1>
          <p className="text-ink-2 text-[0.98rem]">{t("manuscripts.subtitle")}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/portal/manuscripts/queue" className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[12px] font-medium bg-accent-soft text-ink hover:brightness-95" data-testid="my-work-link"><ClipboardCheck className="size-4" />{t("collab.queue.link")}</Link>
          {canUpload && manuscripts.length > 0 && (
            <Button variant="secondary" onClick={() => setUploading(true)}><Upload className="size-4" />{t("manuscripts.upload")}</Button>
          )}
          {canAdd && <Button onClick={() => setAdding(true)}><Plus className="size-4" />{t("manuscripts.add")}</Button>}
        </div>
      </header>

      {manuscripts.length > 0 && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["manuscripts.stats.copies", manuscripts.length],
            ["manuscripts.stats.pages", totals.pages],
            ["manuscripts.stats.checked", totals.human],
            ["manuscripts.stats.approved", totals.approved],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-[14px] border border-line bg-surface px-4 py-3">
              <dt className="text-xs text-ink-3">{t(k as string)}</dt>
              <dd className="text-2xl font-semibold tabular mt-0.5">{num(v as number, locale)}</dd>
            </div>
          ))}
        </dl>
      )}

      {manuscripts.length === 0 && (
        <div className="rounded-[var(--radius)] border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<Library className="size-7" />} title={t("manuscripts.empty.title")} body={t("manuscripts.empty.body")}
            action={canAdd ? <Button onClick={() => setAdding(true)}><Plus className="size-4" />{t("manuscripts.add")}</Button> : undefined} />
        </div>
      )}

      {[...works.entries()].map(([workId, copies]) => (
        <section key={workId} className="flex flex-col gap-4" aria-labelledby={`work-${workId}`}>
          <div className="flex flex-col gap-1 border-s-4 border-accent ps-4">
            <h2 id={`work-${workId}`} lang="ar" dir="rtl" className="font-ms text-[1.7rem] leading-[1.7] text-ink self-start">{copies[0].title_ar}</h2>
            <p className="text-sm text-ink-2">
              <BookOpenText className="size-4 inline -mt-0.5 me-1.5 text-ink-3" />
              {t("manuscripts.work.copies", { n: num(copies.length, locale) })}
              <span className="text-ink-3"> · {locale === "ar" ? copies[0].author_ar : copies[0].author_en}</span>
            </p>
            <p className="text-xs text-ink-3">{t("manuscripts.work.collation")} · <Link href={`/portal/manuscripts/${copies[0].id}/compare`} className="text-accent underline underline-offset-2" data-testid="compare-link">{t("collab.compare.link")}</Link></p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {copies.map((m) => <li key={m.id}><ManuscriptCard m={m} demo={demo} /></li>)}
          </ul>
        </section>
      ))}

      {singles.length > 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="ms-other">
          <h2 id="ms-other" className="text-lg font-semibold">{works.size ? t("manuscripts.other") : t("manuscripts.title")}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {singles.map((m) => <li key={m.id}><ManuscriptCard m={m} demo={demo} /></li>)}
          </ul>
        </section>
      )}

      <AddManuscriptSheet open={adding} onClose={() => setAdding(false)} works={[...works.keys()]} />
      <UploadSheet open={uploading} onClose={() => setUploading(false)} manuscripts={manuscripts} />
    </div>
  );
}

export function ProgressBar({ total, human, approved, className, label }: { total: number; human: number; approved: number; className?: string; label: string }) {
  const h = total ? (human / total) * 100 : 0;
  const a = total ? (approved / total) * 100 : 0;
  return (
    <div className={cn("h-2 rounded-full bg-surface-3 overflow-hidden flex", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={human}>
      <div className="h-full bg-ok" style={{ width: `${a}%` }} />
      <div className="h-full bg-violet/70" style={{ width: `${Math.max(0, h - a)}%` }} />
    </div>
  );
}

function ManuscriptCard({ m, demo }: { m: MsSummary; demo: boolean }) {
  const { t, locale } = useI18n();
  const library = locale === "ar" ? m.holding_library_ar || m.repository : m.repository;
  return (
    <Link href={`/portal/manuscripts/${m.id}`} className="group flex flex-col h-full rounded-[var(--radius)] border border-line bg-surface shadow-card overflow-hidden transition-[box-shadow,transform] hover:shadow-pop hover:-translate-y-0.5 focus-visible:outline-offset-4">
      <div className="relative h-48 bg-sand overflow-hidden">
        {m.thumb ? (
          <img src={m.thumb} alt="" className="absolute inset-0 size-full object-cover object-[50%_18%] transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sand-ink/50"><ScrollText className="size-10" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgb(16_20_58/0.55)] via-transparent to-transparent" />
        {m.siglum && (
          <span className="absolute top-3 start-3 size-12 rounded-full bg-surface text-ink grid place-items-center font-ms text-[1.6rem] leading-none shadow-card" title={t("manuscripts.siglum", { s: m.siglum })}>
            <span className="inline-block translate-y-[0.14em]">{m.siglum}</span>
            <span className="sr-only">{t("manuscripts.siglum", { s: m.siglum })}</span>
          </span>
        )}
        <span className="absolute top-3 end-3"><LicenceChip license={m.license} confidence={m.license_confidence} /></span>
        <span className="absolute bottom-3 start-4 end-4 text-white text-sm font-medium drop-shadow flex items-center justify-between gap-2">
          <span className="truncate">{m.shelfmark}</span>
          <span className="tabular shrink-0 opacity-90">{t("manuscripts.card.pages", { n: num(m.pages, locale) })}</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4 flex-1">
        <div className="flex flex-col gap-0.5">
          <h3 lang="ar" dir="rtl" className="font-ms text-[1.3rem] leading-[1.75] text-ink line-clamp-2 text-start">{m.title_ar}</h3>
          {locale === "en" && <p className="text-sm text-ink-2 line-clamp-1">{m.title_en}</p>}
        </div>
        <dl className="text-sm text-ink-2 flex flex-col gap-0.5">
          <div className="flex gap-1.5"><dt className="sr-only">{t("manuscripts.meta.library")}</dt><dd className="line-clamp-1">{library}</dd></div>
          {m.script && <div className="flex gap-1.5"><dt className="sr-only">{t("manuscripts.meta.script")}</dt><dd className="text-ink-3 line-clamp-1">{m.script}</dd></div>}
        </dl>
        <div className="mt-auto flex flex-col gap-1.5">
          <ProgressBar total={m.lines_total} human={m.lines_human} approved={m.lines_approved} label={t("manuscripts.progress.label")} />
          <div className="flex items-center justify-between gap-2 text-xs text-ink-3 tabular">
            <span>{t("manuscripts.card.progress", { checked: num(m.lines_human, locale), approved: num(m.lines_approved, locale), total: num(m.lines_total, locale) })}</span>
            {demo && m.institution_is_demo && <Badge>{t("badge.demo")}</Badge>}
          </div>
        </div>
      </div>
    </Link>
  );
}
