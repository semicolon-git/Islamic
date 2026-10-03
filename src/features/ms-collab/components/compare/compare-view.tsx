"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Columns2, ExternalLink, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { num, pct } from "../../../manuscripts/components/api";
import { bbox, padBox, toPoints, type Polygon } from "../../../manuscripts/geometry";
import { markedWords, noteAr, noteEn, type ApparatusEntry } from "../../collation";
import type { CollationView } from "../../types";
import { FirstTip, Siglum } from "../bits";

const toAr = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

/** One copy's page image, cropped to the lines in view and highlighting the selected ones. */
function PagePane({ title, siglum, image, polygons, focus, href }: {
  title: string; siglum: string | null; image: { src: string; width: number; height: number }; polygons: Record<string, Polygon>; focus: string[]; href: string;
}) {
  const { t } = useI18n();
  const ids = focus.length ? focus.filter((id) => polygons[id]) : Object.keys(polygons);
  const all = ids.flatMap((id) => polygons[id]);
  const b = all.length ? bbox(all) : { x: 0, y: 0, w: image.width, h: image.height };
  const v = padBox({ x: b.x, y: b.y - b.h * (focus.length ? 1.2 : 0.05), w: b.w, h: b.h * (focus.length ? 3.4 : 1.1) }, 24, image.width, image.height);
  return (
    <figure className="flex flex-col gap-1.5 min-w-0" data-testid="compare-pane">
      <figcaption className="flex items-center gap-2 text-sm">
        <Siglum s={siglum} size="sm" />
        <span className="font-medium truncate">{title}</span>
        <Link href={href} className="ms-auto inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0">{t("collab.compare.openPage")}<ExternalLink className="size-3" /></Link>
      </figcaption>
      <div className="rounded-[12px] border border-line bg-sand overflow-hidden">
        <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} className="block w-full h-[clamp(200px,42vh,460px)]" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("collab.compare.imageOf", { s: siglum ?? "" })}>
          <image href={image.src} x={0} y={0} width={image.width} height={image.height} />
          {Object.entries(polygons).map(([id, p]) => (
            <polygon key={id} points={toPoints(p)} fill={focus.includes(id) ? "#f2c45a" : "#36dcb8"} fillOpacity={focus.includes(id) ? 0.32 : 0.07}
              stroke={focus.includes(id) ? "#c98a00" : "transparent"} strokeWidth={2} vectorEffect="non-scaling-stroke" data-focus={focus.includes(id) ? "1" : "0"} />
          ))}
        </svg>
      </div>
    </figure>
  );
}

/** Collation of copies (مقابلة النسخ): base text with apparatus, images side by side, synced to the selected variant. */
export function CompareView({ data }: { data: CollationView }) {
  const { t, locale } = useI18n();
  const [pi, setPi] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const passage = data.passages[pi];
  useEffect(() => setSel(null), [pi]);
  const marks = useMemo(() => (passage ? markedWords(passage.apparatus) : new Map<number, number>()), [passage]);
  const entry: ApparatusEntry | null = passage && sel !== null ? passage.apparatus.find((e) => e.no === sel) ?? null : null;
  const baseFocus = entry ? entry.base_lines : [];
  const witFocus = (msId: string, pageId: string) => (entry ? entry.readings.filter((r) => r.ms_id === msId).flatMap((r) => r.lines).filter((l) => l.startsWith(`${pageId}-`)) : []);
  const numLocal = (n: number) => (locale === "ar" ? toAr(n) : String(n));
  const baseTitle = locale === "ar" ? data.base.title_ar : data.base.title_en;

  // base words grouped by line, with footnote numbers after marked words
  const byLine = useMemo(() => {
    const out: { line_id: string; n: number; words: { w: string; i: number }[] }[] = [];
    passage?.base_words.forEach((w, i) => {
      const last = out[out.length - 1];
      if (last && last.line_id === w.line_id) last.words.push({ w: w.w, i });
      else out.push({ line_id: w.line_id, n: w.n, words: [{ w: w.w, i }] });
    });
    return out;
  }, [passage]);

  return (
    <div className="flex flex-col gap-5 animate-rise" data-testid="compare">
      <header className="flex flex-col gap-3">
        <nav aria-label="breadcrumb"><Link href={`/portal/manuscripts/${data.base.id}`} className="text-sm text-ink-2 hover:text-ink">{baseTitle}</Link></nav>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1.5 max-w-3xl">
            <h1 className="text-[1.6rem] font-semibold tracking-tight flex items-center gap-3">
              <span className="size-10 rounded-[12px] bg-sand text-sand-ink grid place-items-center"><Columns2 className="size-5" /></span>{t("collab.compare.title")}
            </h1>
            <p className="text-ink-2">{t("collab.compare.sub")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("collab.compare.base")}>
            <span className="text-sm text-ink-3">{t("collab.compare.base")}</span>
            {data.copies.map((c) => (
              <Link key={c.id} href={`/portal/manuscripts/${c.id}/compare`} aria-current={c.id === data.base.id ? "page" : undefined}
                className={cn("inline-flex items-center gap-2 h-11 rounded-full border ps-1.5 pe-3.5 text-sm", c.id === data.base.id ? "border-accent bg-accent-soft font-medium" : "border-line hover:bg-surface-2")}>
                <Siglum s={c.siglum} size="sm" /><bdi>{c.shelfmark}</bdi>
              </Link>
            ))}
          </div>
        </div>
      </header>

      {data.caveat && (
        <Callout tone="warn" icon={<TriangleAlert className="size-4 text-warn" />} title={t("collab.compare.caveatTitle")}>
          <span data-testid="gt-caveat">{t("collab.compare.caveat")}</span>
        </Callout>
      )}
      <FirstTip id="compare" title={t("collab.tip.compare.title")}>{t("collab.tip.compare.body")}</FirstTip>

      {data.passages.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<Columns2 className="size-7" />} title={t("collab.compare.emptyTitle")} body={t("collab.compare.emptyBody")} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("collab.compare.passages")}>
            {data.passages.map((p, i) => (
              <button key={p.base_page_id} type="button" role="tab" aria-selected={i === pi} onClick={() => setPi(i)} data-passage={p.base_page_id}
                className={cn("inline-flex items-center gap-2 min-h-11 rounded-[12px] border px-3 py-1.5 text-sm text-start", i === pi ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2")}>
                <span className="font-medium">{data.base.siglum ? `(${data.base.siglum}) ` : ""}{t("collab.pageN", { n: num(p.base_page_seq, locale) })}</span>
                <span className="text-ink-3">↔ {p.witnesses.map((w) => `(${w.siglum}) ${t("collab.pageNShort", { n: num(w.page_seq, locale) })}`).join(" · ")}</span>
                <Badge tone="violet" className="tabular">{t("collab.compare.variants", { n: num(p.apparatus.length, locale) })}</Badge>
              </button>
            ))}
          </div>

          {passage && (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
              <section className="flex flex-col gap-4 min-w-0" aria-labelledby="cmp-text">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="cmp-text" className="text-lg font-semibold">{t("collab.compare.baseText", { s: data.base.siglum ?? "" })}</h2>
                  {passage.witnesses.map((w) => (
                    <Badge key={w.page_id} tone={w.agreement > 0.9 ? "ok" : "neutral"} className="tabular">({w.siglum}) {t("collab.compare.agreement", { p: pct(w.agreement, locale, 0) })}</Badge>
                  ))}
                </div>
                <div className="rounded-[var(--radius)] border border-line bg-surface p-4 max-h-[48vh] overflow-y-auto scrollbar-thin" data-testid="compare-text">
                  {byLine.map((l) => (
                    <p key={l.line_id} dir="rtl" lang="ar" className={cn("ms-text text-[1.2rem] leading-[2.2] rounded-[8px] px-1", baseFocus.includes(l.line_id) && "bg-warn-soft/50")}>
                      <span className="text-[0.7rem] font-ui text-ink-3 tabular ms-1">{numLocal(l.n)}</span>{" "}
                      {l.words.map(({ w, i }) => {
                        const no = marks.get(i);
                        return (
                          <span key={i}>
                            {no ? (
                              <button type="button" onClick={() => setSel(no)} aria-label={t("collab.compare.footnote", { n: numLocal(no) })}
                                className={cn("rounded-[4px] px-0.5 underline decoration-dotted decoration-warn decoration-2 underline-offset-[0.4em]", sel === no ? "bg-warn-soft" : "hover:bg-warn-soft/60")}>
                                {w}<sup className="font-ui text-[0.6em] text-warn ms-0.5">{numLocal(no)}</sup>
                              </button>
                            ) : w}{" "}
                          </span>
                        );
                      })}
                    </p>
                  ))}
                </div>
                <section aria-labelledby="cmp-app" className="flex flex-col gap-2">
                  <h3 id="cmp-app" className="text-sm font-semibold">{t("collab.compare.apparatus")}</h3>
                  {passage.apparatus.length === 0 ? <p className="text-sm text-ink-3">{t("collab.compare.noVariants")}</p> : (
                    <ol className="flex flex-col gap-1 rounded-[var(--radius)] border border-line bg-surface p-2 max-h-[40vh] overflow-y-auto scrollbar-thin" data-testid="apparatus">
                      {passage.apparatus.map((e) => (
                        <li key={e.no}>
                          <button type="button" onClick={() => setSel(e.no)} aria-pressed={sel === e.no} data-entry={e.no}
                            className={cn("w-full text-start rounded-[10px] px-2.5 py-1.5 flex flex-col gap-0.5", sel === e.no ? "bg-warn-soft" : "hover:bg-surface-2")}>
                            <span dir="rtl" lang="ar" className="ms-text text-[1.1rem] leading-[1.9]">
                              <span className="font-ui text-xs text-warn tabular">{toAr(e.no)}</span>{" "}
                              {e.lemma ? <>{e.lemma}] </> : null}{e.readings.map(noteAr).join("؛ ")}
                            </span>
                            {locale === "en" && <span className="text-xs text-ink-3" dir="ltr">{e.no}. {e.lemma ? <bdi>{e.lemma}</bdi> : null}{e.lemma ? "] " : ""}{e.readings.map((r) => noteEn(r)).join("; ")}</span>}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="text-xs text-ink-3 inline-flex items-start gap-1.5"><Info className="size-3.5 mt-0.5 shrink-0" />{t("collab.compare.how")}</p>
                </section>
              </section>
              <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1 min-w-0" aria-label={t("collab.compare.images")}>
                <PagePane title={`${t("collab.compare.baseCopy")} · ${t("collab.pageN", { n: num(passage.base_page_seq, locale) })}`} siglum={data.base.siglum} image={passage.base_image} polygons={passage.base_polygons} focus={baseFocus}
                  href={`/portal/manuscripts/${data.base.id}/pages/${passage.base_page_id}${baseFocus[0] ? `?line=${encodeURIComponent(baseFocus[0])}` : ""}`} />
                {passage.witnesses.map((w) => (
                  <PagePane key={w.page_id} title={`${w.shelfmark ?? ""} · ${t("collab.pageN", { n: num(w.page_seq, locale) })}`} siglum={w.siglum} image={w.image} polygons={w.polygons} focus={witFocus(w.ms_id, w.page_id)}
                    href={`/portal/manuscripts/${w.ms_id}/pages/${w.page_id}${witFocus(w.ms_id, w.page_id)[0] ? `?line=${encodeURIComponent(witFocus(w.ms_id, w.page_id)[0])}` : ""}`} />
                ))}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
