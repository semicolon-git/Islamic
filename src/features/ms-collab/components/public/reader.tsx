"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, Fingerprint, HelpCircle, Info, ScrollText, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/chip";
import { VerseBlock } from "@/components/ui/quran";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/components/ui/cn";
import { fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { num } from "../../../manuscripts/components/api";
import { LineCrop } from "../../../manuscripts/components/line-crop";
import { TokenText } from "../../../manuscripts/components/token-view";
import { toPoints } from "../../../manuscripts/geometry";
import type { PublishedManuscript, PublishedPage } from "../../types";

const LEGEND: { key: string; sample: React.ReactNode }[] = [
  { key: "unclear", sample: <span className="underline decoration-dashed decoration-warn decoration-[1.5px] underline-offset-[0.45em] bg-warn-soft/70 rounded-[3px] font-ms text-lg px-0.5">كلمة</span> },
  { key: "gap", sample: <span className="inline-block px-1 rounded-md border border-dashed border-line-strong text-ink-3 text-sm">[…]</span> },
  { key: "supplied", sample: <span className="text-violet font-ms text-lg">[كلمة]</span> },
  { key: "del", sample: <del className="line-through decoration-bad decoration-2 text-ink-2 font-ms text-lg">كلمة</del> },
  { key: "add", sample: <span className="underline decoration-dotted decoration-accent decoration-[1.5px] underline-offset-[0.45em] font-ms text-lg">كلمة<sup className="text-accent text-[0.6em] ms-0.5">⇥</sup></span> },
  { key: "abbr", sample: <span className="underline decoration-dotted decoration-violet decoration-[1.5px] underline-offset-[0.45em] font-ms text-lg">ج</span> },
  { key: "mark", sample: <span className="inline-flex items-center px-1.5 rounded-full bg-violet-soft text-violet font-ms text-sm leading-[1.6]">صح</span> },
  { key: "red", sample: <span className="text-bad font-ms text-lg">باب</span> },
];

/** Public, mobile-first reader of a published page: image ↔ line sync, diplomatic ↔ reading, legend, Quran chips, credits. */
export function PublicReader({ manuscript: m, pages, demo }: { manuscript: PublishedManuscript; pages: PublishedPage[]; demo: boolean }) {
  const { t, locale, dir } = useI18n();
  const [pi, setPi] = useState(0);
  const [layer, setLayer] = useState<"diplomatic" | "reading">("reading");
  const [sel, setSel] = useState<string | null>(null);
  const [verse, setVerse] = useState<PublishedPage["quotes"][number] | null>(null);
  const [legend, setLegend] = useState(false);
  const page = pages[pi];
  useEffect(() => setSel(null), [pi]);
  const quoteLines = useMemo(() => new Map((page?.quotes ?? []).flatMap((q) => q.line_ids.map((l) => [l, q] as const))), [page]);
  if (!page) return null;
  const select = (id: string) => {
    setSel(id);
    requestAnimationFrame(() => document.getElementById(`pl-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;
  const library = locale === "ar" ? m.holding_library_ar || m.repository : m.repository;
  const W = page.image.width, H = page.image.height;
  const selected = page.lines.find((l) => l.line_id === sel) ?? null;

  return (
    <div className="flex flex-col gap-5 pb-10" data-testid="public-reader">
      <nav aria-label="breadcrumb"><Link href="/heritage/manuscripts" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink min-h-11"><Back className="size-4" />{t("collab.pub.all")}</Link></nav>
      <header className="flex flex-col gap-2">
        <Badge tone="ok" className="self-start"><ShieldCheck className="size-3.5" />{t("collab.pub.reviewed")}</Badge>
        <h1 className="text-ink"><span lang="ar" dir="rtl" className="font-ms text-[1.9rem] leading-[1.6] block">{m.title_ar}</span></h1>
        {locale === "en" && <p className="text-ink-2 -mt-1">{m.title_en}</p>}
        <p className="text-sm text-ink-3">{locale === "ar" ? m.author_ar : m.author_en}</p>
        <p className="text-sm text-ink-2">{library} · <bdi>{m.shelfmark}</bdi>{m.siglum ? ` · ${t("manuscripts.siglum", { s: m.siglum })}` : ""}</p>
      </header>

      <p className="text-sm text-ink-2 rounded-[14px] bg-surface-2 px-4 py-3 flex gap-2.5"><Info className="size-4 shrink-0 mt-0.5 text-ink-3" />{t("collab.pub.endorsement")}</p>

      {pages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1" role="tablist" aria-label={t("collab.pub.pages")}>
          {pages.map((p, i) => (
            <button key={p.page_id} type="button" role="tab" aria-selected={i === pi} onClick={() => setPi(i)}
              className={cn("shrink-0 h-11 px-4 rounded-full border text-sm font-medium", i === pi ? "bg-ink text-bg border-ink" : "border-line-strong bg-surface")}>
              {t("collab.pageN", { n: num(p.seq, locale) })}
            </button>
          ))}
        </div>
      )}

      <figure className="flex flex-col gap-2">
        <div className="rounded-[var(--radius-lg)] border border-line bg-sand overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto max-h-[70vh]" role="img" aria-label={t("collab.pub.imageAlt", { n: num(page.seq, locale) })}>
            <image href={page.image.src} x={0} y={0} width={W} height={H} />
            {page.lines.map((l) => l.polygon && (
              <polygon key={l.line_id} points={toPoints(l.polygon)} onClick={() => select(l.line_id)} data-line={l.line_id}
                fill={sel === l.line_id ? "#36dcb8" : quoteLines.has(l.line_id) ? "#36dcb8" : "transparent"} fillOpacity={sel === l.line_id ? 0.3 : quoteLines.has(l.line_id) ? 0.12 : 0}
                stroke={sel === l.line_id ? "#0a8c77" : "transparent"} strokeWidth={3} vectorEffect="non-scaling-stroke" className="cursor-pointer" />
            ))}
          </svg>
        </div>
        <figcaption className="text-xs text-ink-3 leading-relaxed" dir="ltr">{m.credit_line}</figcaption>
      </figure>

      {page.quotes.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="pq-h">
          <h2 id="pq-h" className="text-sm font-semibold">{t("collab.pub.quotes")}</h2>
          <div className="flex flex-wrap gap-2">
            {page.quotes.map((q) => (
              <button key={q.id} type="button" onClick={() => setVerse(q)} data-testid="quote-chip"
                className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-accent-soft text-ink text-sm font-medium hover:brightness-95">
                <BookOpenText className="size-4 text-accent" />{locale === "ar" ? `سورة ${q.sura_name_ar}` : `Surah ${q.sura_name_en}`} <bdi dir="ltr" className="mono text-xs">{q.verse_keys.join(", ")}</bdi>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="pt-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pt-h" className="text-lg font-semibold me-auto">{t("collab.pub.text")}</h2>
          <button type="button" onClick={() => setLegend(true)} className="inline-flex items-center gap-1.5 h-11 px-3 rounded-full text-sm text-ink-2 hover:bg-surface-2" data-testid="legend-open"><HelpCircle className="size-4" />{t("collab.pub.legend")}</button>
        </div>
        <Segmented label={t("collab.pub.layer")} value={layer} onChange={setLayer} className="self-start"
          options={[{ value: "reading", label: t("collab.pub.reading") }, { value: "diplomatic", label: t("collab.pub.diplomatic") }]} />
        <p className="text-xs text-ink-3">{t(layer === "reading" ? "collab.pub.readingHint" : "collab.pub.diplomaticHint")}</p>
        <ol className="flex flex-col gap-0.5 rounded-[var(--radius)] border border-line bg-surface p-2" data-testid="public-lines">
          {page.lines.map((l) => (
            <li key={l.line_id} id={`pl-${l.line_id}`}>
              <button type="button" onClick={() => select(l.line_id)} aria-pressed={sel === l.line_id} data-line-btn={l.line_id}
                className={cn("w-full flex items-start gap-3 rounded-[10px] px-2 py-1 text-start", sel === l.line_id ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <span className="w-7 shrink-0 pt-2.5 text-xs text-ink-3 tabular text-center">{num(l.n, locale)}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  {l.zone && l.zone !== "main" && <span className="text-[0.68rem] text-violet font-medium">{t(`manuscripts.region.${l.zone}`)}</span>}
                  <TokenText tokens={l.tokens} layer={layer} className="block text-[1.25rem] leading-[2.1]" />
                </span>
                {quoteLines.has(l.line_id) && <BookOpenText className="size-4 text-accent shrink-0 mt-3" aria-label={t("collab.pub.hasQuote")} />}
              </button>
              {sel === l.line_id && selected?.polygon && (
                <div className="px-2 pb-2 animate-pop">
                  <LineCrop src={page.image.src} width={W} height={H} polygon={selected.polygon} label={t("collab.pub.lineImage", { n: num(l.n, locale) })} legible maxHeight={110} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4" aria-labelledby="pc-h" data-testid="credits">
        <h2 id="pc-h" className="text-lg font-semibold inline-flex items-center gap-2"><Users className="size-5 text-accent" />{t("collab.pub.credits")}</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {page.credits.map((c) => (
            <div key={c.role} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
              <dt className="text-ink-3">{t(`collab.pub.role.${c.role}`)}</dt>
              <dd>{c.names.map((n) => `${locale === "ar" ? n.ar : n.en}${demo && n.demo ? ` ${t("collab.demo")}` : ""}`).join(locale === "ar" ? "، " : ", ")}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
            <dt className="text-ink-3">{t("collab.pub.machine")}</dt>
            <dd><bdi>{page.machine.engines.join(", ") || "—"}</bdi>{page.machine.date ? ` · ${fmtDate(page.machine.date, locale)}` : ""}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
            <dt className="text-ink-3">{t("collab.pub.library")}</dt>
            <dd>{library} · <bdi>{m.shelfmark}</bdi></dd>
          </div>
          {m.institution_en && (
            <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
              <dt className="text-ink-3">{t("collab.pub.publisher")}</dt>
              <dd>{locale === "ar" ? m.institution_ar : m.institution_en}{demo && m.institution_demo ? ` ${t("collab.demo")}` : ""}</dd>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
            <dt className="text-ink-3">{t("collab.pub.licence")}</dt>
            <dd dir="ltr" className="text-start">{m.license}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
            <dt className="text-ink-3">{t("collab.pub.creditLine")}</dt>
            <dd dir="ltr" className="text-start text-ink-2">{m.credit_line}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
            <dt className="text-ink-3">{t("collab.pub.version")}</dt>
            <dd>{t("collab.pub.versionN", { v: num(page.version, locale), date: fmtDate(page.published_at, locale) })}</dd>
          </div>
        </dl>
        <p className="flex flex-col gap-1 rounded-[12px] bg-surface-2 px-3 py-2">
          <span className="text-xs text-ink-3 inline-flex items-center gap-1.5"><Fingerprint className="size-3.5" />{t("collab.pub.sha")}</span>
          <bdi className="mono text-xs break-all" dir="ltr" data-testid="sha">{page.sha}</bdi>
        </p>
        <p className="text-xs text-ink-3">{t("collab.pub.studentsInitials")}</p>
        {m.source_url && <a href={m.source_url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline self-start min-h-11 inline-flex items-center">{t("collab.pub.source")}</a>}
      </section>

      <Sheet open={!!verse} onClose={() => setVerse(null)} title={t("collab.pub.verseTitle")} closeLabel={t("action.close")}>
        {verse && (
          <div className="flex flex-col gap-4" data-testid="verse-sheet">
            <VerseBlock verses={verse.verses} locale={locale} translationLabel={t("collab.quote.translation")} />
            <div className="rounded-[12px] bg-sand px-3 py-2">
              <p className="text-xs text-sand-ink">{t("collab.pub.verseInMs", { a: num(verse.from_n, locale), b: num(verse.to_n, locale) })}</p>
              <p className="ms-text text-[1.25rem]" dir="rtl" lang="ar">{verse.ms_text}</p>
            </div>
            <p className="text-xs text-ink-3">{t("collab.pub.verseNote")}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={legend} onClose={() => setLegend(false)} title={t("collab.pub.legend")} description={t("collab.pub.legendDesc")} closeLabel={t("action.close")}>
        <dl className="flex flex-col gap-3" data-testid="legend">
          {LEGEND.map((x) => (
            <div key={x.key} className="flex items-center gap-4">
              <dt className="w-20 shrink-0 text-center" dir="rtl">{x.sample}</dt>
              <dd className="text-sm text-ink-2 leading-relaxed">{t(`collab.pub.lg.${x.key}`)}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}

/** Published manuscripts (public list). */
export function PublicList({ items }: { items: PublishedManuscript[] }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col gap-6 pb-10" data-testid="public-list">
      <header className="flex flex-col gap-2">
        <nav aria-label="breadcrumb"><Link href="/heritage" className="text-sm text-ink-2 hover:text-ink min-h-11 inline-flex items-center">{t("collab.pub.backHeritage")}</Link></nav>
        <h1 className="text-[1.9rem] font-semibold leading-tight">{t("collab.pub.listTitle")}</h1>
        <p className="text-ink-2">{t("collab.pub.listSub")}</p>
      </header>
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 flex flex-col items-center text-center gap-3" data-testid="public-empty">
          <span className="size-14 rounded-2xl bg-sand text-sand-ink grid place-items-center"><ScrollText className="size-7" aria-hidden /></span>
          <h2 className="text-lg font-semibold">{t("collab.pub.emptyTitle")}</h2>
          <p className="text-ink-2 max-w-[44ch]">{t("collab.pub.emptyBody")}</p>
          <Link href="/heritage" className="mt-1 inline-flex items-center h-11 px-5 rounded-[12px] bg-accent text-accent-ink font-medium">{t("collab.pub.backHeritage")}</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((m) => (
            <li key={m.id}>
              <Link href={`/heritage/manuscripts/${encodeURIComponent(m.id)}`} className="group flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-card hover:shadow-pop transition-shadow" data-testid="public-ms">
                <span className="w-20 sm:w-24 aspect-[3/4] shrink-0 rounded-[12px] bg-sand overflow-hidden">{m.thumb && <img src={m.thumb} alt="" className="size-full object-cover object-top" loading="lazy" />}</span>
                <span className="flex flex-col gap-1 min-w-0 py-1">
                  <span className="font-ms text-[1.25rem] leading-[1.7] text-ink line-clamp-2" dir="rtl" lang="ar">{m.title_ar}</span>
                  {locale === "en" && <span className="text-sm text-ink-2 line-clamp-1">{m.title_en}</span>}
                  <span className="text-xs text-ink-3 line-clamp-1">{(locale === "ar" ? m.holding_library_ar || m.repository : m.repository) ?? ""} · <bdi>{m.shelfmark}</bdi></span>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                    <BookOpenText className="size-4" aria-hidden />{t("collab.pub.pagesN", { n: num(m.pages, locale) })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
