"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, Flag, ImagePlus, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/lib/auth";
import type { MsSummary, PageSummary } from "../../types";
import { num, pct } from "../api";
import { ExportSheet } from "../export-sheet";
import { ProgressBar } from "../library/library-view";
import { UploadSheet } from "../library/upload-sheet";
import { LicenceChip, PageStatus } from "../status";

type Sibling = { id: string; siglum: string | null; shelfmark: string | null; repository: string | null; holding_library_ar: string | null };

export function ManuscriptView({ manuscript: m, pages, siblings, role, demo }: { manuscript: MsSummary; pages: PageSummary[]; siblings: Sibling[]; role: Role; demo: boolean }) {
  const { t, locale, dir } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;
  const seeEval = role === "researcher" || role === "institution_admin" || role === "platform_admin";
  const library = locale === "ar" ? m.holding_library_ar || m.repository : m.repository;
  const lowGt = m.gt_reliability === "low";

  return (
    <div className="flex flex-col gap-6 animate-rise">
      <nav aria-label="breadcrumb">
        <Link href="/portal/manuscripts" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><Back className="size-4" />{t("manuscripts.back")}</Link>
      </nav>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          {m.siglum && (
            <span className="size-16 shrink-0 rounded-[18px] bg-sand text-sand-ink grid place-items-center font-ms text-[2.1rem] leading-none" title={t("manuscripts.siglum", { s: m.siglum })}>
              <span className="inline-block translate-y-[0.14em]">{m.siglum}</span>
            </span>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <h1 lang="ar" dir="rtl" className="font-ms text-[1.9rem] leading-[1.6] text-ink self-start">{m.title_ar}</h1>
            <p className="text-ink-2" dir="auto">{m.title_en}</p>
            <p className="text-sm text-ink-3">{locale === "ar" ? m.author_ar : m.author_en}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge tone="sand">{library} · <bdi>{m.shelfmark}</bdi></Badge>
              <LicenceChip license={m.license} confidence={m.license_confidence} />
              {m.siglum && <Badge>{t("manuscripts.siglum", { s: m.siglum })}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setExporting(true)}><Download className="size-4" />{t("manuscripts.export")}</Button>
          {role !== "specialist" && <Button onClick={() => setUploading(true)}><ImagePlus className="size-4" />{t("manuscripts.upload")}</Button>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section aria-labelledby="pages-h" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="pages-h" className="text-lg font-semibold">{t("manuscripts.pages.title")} <span className="text-ink-3 font-normal tabular">({num(pages.length, locale)})</span></h2>
          </div>
          {pages.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-line-strong bg-surface">
              <EmptyState icon={<ScrollText className="size-7" />} title={t("manuscripts.pages.empty")} body={t("manuscripts.pages.emptyBody")}
                action={role !== "specialist" ? <Button onClick={() => setUploading(true)}><ImagePlus className="size-4" />{t("manuscripts.upload")}</Button> : undefined} />
            </div>
          ) : (
            <ul className="grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
              {pages.map((p) => (
                <li key={p.id}>
                  <Link href={`/portal/manuscripts/${m.id}/pages/${p.id}`} aria-label={`${t("manuscripts.page.n", { n: num(p.seq, locale) })} · ${t(`manuscripts.status.${p.status}`)}`}
                    className="group flex flex-col rounded-[var(--radius)] border border-line bg-surface shadow-card overflow-hidden transition-[box-shadow,transform] hover:shadow-pop hover:-translate-y-0.5">
                    <div className="relative aspect-[2/3] bg-sand overflow-hidden">
                      {p.thumb_path && (
                        <img src={p.thumb_path} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.03]" />
                      )}
                      <span className="absolute top-2 start-2"><PageStatus status={p.status} /></span>
                      {p.flagged && <span className="absolute top-2 end-2"><Badge tone="warn"><Flag className="size-3" />{t("manuscripts.page.flagged")}</Badge></span>}
                    </div>
                    <div className="flex flex-col gap-1.5 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-sm">{t("manuscripts.page.n", { n: num(p.seq, locale) })}</span>
                        <span className="text-xs text-ink-3 tabular">{t("manuscripts.page.lines", { done: num(p.lines_human, locale), total: num(p.lines_total, locale) })}</span>
                      </div>
                      {p.label && <p className="text-xs text-ink-2 line-clamp-2" dir="auto">{p.label}</p>}
                      <ProgressBar total={p.lines_total} human={p.lines_human} approved={p.lines_approved} label={t("manuscripts.progress.label")} />
                      {seeEval && p.draft_cer != null && (
                        <span className="text-[0.72rem] text-ink-3">{t("manuscripts.page.draftCer", { v: pct(p.draft_cer, locale, 0) })} · {t(`manuscripts.draft.engine.${p.draft_engine ?? "none"}`)}</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20" aria-label={t("manuscripts.meta.catalogue")}>
          <MetaCard title={t("manuscripts.meta.catalogue")}>
            <Row k={t("manuscripts.meta.library")} v={library} />
            <Row k={t("manuscripts.meta.shelfmark")} v={<bdi>{m.shelfmark}</bdi>} />
            <Row k={t("manuscripts.meta.author")} v={locale === "ar" ? m.author_ar : m.author_en} />
            <Row k={t("manuscripts.meta.script")} v={<span title={m.script_description ?? undefined}>{m.script}</span>} />
            <Row k={t("manuscripts.meta.genre")} v={t(`manuscripts.genre.${m.genre}`)} />
            <Row k={t("manuscripts.meta.copyDate")} v={m.copy_date_text ?? <span className="text-ink-3" title={m.copy_date_note ?? undefined}>{t("manuscripts.meta.notVerified")}</span>} />
            {m.institution_name_en && (
              <Row k={t("manuscripts.meta.institution")} v={<>{locale === "ar" ? m.institution_name_ar : m.institution_name_en}{demo && m.institution_is_demo && <span className="text-ink-3"> {t("manuscripts.demoInstitution")}</span>}</>} />
            )}
            {m.script_description && <p className="text-xs text-ink-3 leading-relaxed pt-1" dir="ltr">{m.script_description}</p>}
            {siblings.length > 0 && (
              <div className="pt-2 flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-3 flex items-center justify-between gap-2">{t("manuscripts.meta.otherCopies")}<Link href={`/portal/manuscripts/${m.id}/compare`} className="text-accent hover:underline font-normal" data-testid="compare-link">{t("collab.compare.link")}</Link></span>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((s) => (
                    <Link key={s.id} href={`/portal/manuscripts/${s.id}`} className="inline-flex items-center gap-2 rounded-full border border-line px-3 h-9 text-sm hover:bg-surface-2">
                      <span className="font-ms text-lg leading-none">{s.siglum}</span>
                      <span className="text-ink-2"><bdi>{s.shelfmark}</bdi></span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </MetaCard>
          <MetaCard title={t("manuscripts.meta.rights")}>
            <Row k={t("manuscripts.meta.licence")} v={<span className="flex flex-col gap-1"><span>{m.license}</span>{m.license_confidence && <span className="text-xs text-ink-3">{t("manuscripts.meta.confidence", { c: m.license_confidence })}</span>}</span>} />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-3">{t("manuscripts.meta.credit")}</span>
              <p className="text-sm text-ink-2 leading-relaxed" dir="ltr">{m.credit_line}</p>
            </div>
            {m.license_note && <p className="text-xs text-ink-3 leading-relaxed" dir="ltr">{m.license_note}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {m.source_url && <a href={m.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">{t("manuscripts.meta.source")}<ExternalLink className="size-3.5" /></a>}
              {m.catalogue_url && /^https?:/.test(m.catalogue_url) && <a href={m.catalogue_url.split(/\s/)[0]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">{t("manuscripts.meta.catalogueLink")}<ExternalLink className="size-3.5" /></a>}
            </div>
            <Row k={t("manuscripts.meta.training")} v={m.ai_training_allowed ? t("manuscripts.meta.trainingYes") : t("manuscripts.meta.trainingNo")} />
            <Row k={t("manuscripts.meta.scope")} v={t(`manuscripts.meta.scope.${m.publish_scope}`)} />
            <p className="text-xs text-ink-3 leading-relaxed border-t border-line pt-3">{t("manuscripts.meta.endorsement")}</p>
          </MetaCard>
          {lowGt && (
            <Callout tone="warn" icon={<AlertTriangle className="size-4 text-warn" />} title={t("manuscripts.meta.gtCaveatTitle")}>
              {t("manuscripts.meta.gtCaveat")}
            </Callout>
          )}
        </aside>
      </div>
      <ExportSheet open={exporting} onClose={() => setExporting(false)} msId={m.id} />
      <UploadSheet open={uploading} onClose={() => setUploading(false)} fixedMsId={m.id} />
    </div>
  );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-4 flex flex-col gap-2.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-2 text-sm">
      <span className="text-ink-3">{k}</span>
      <span className="text-ink min-w-0 break-words">{v}</span>
    </div>
  );
}
