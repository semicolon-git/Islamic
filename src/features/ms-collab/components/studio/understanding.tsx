"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Check, CircleSlash, NotebookPen, RefreshCw, ScrollText, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { VerseBlock } from "@/components/ui/quran";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import type { WorkspaceContext } from "../../../manuscripts/extensions";
import { markInfo, type MarkKind } from "../../../manuscripts/marks";
import { QUOTE_CLASSES, type QuoteClass } from "../../quran-detect";
import type { QuoteAnnotation, Understanding } from "../../types";
import { FirstTip } from "../bits";
import { refreshSoon, useOverview } from "./store";

const DIFF_CLASS = {
  same: "",
  spelling: "underline decoration-dotted decoration-violet decoration-2 underline-offset-[0.45em]",
  differs: "bg-warn-soft text-warn rounded-[4px] px-0.5",
  extra: "bg-warn-soft text-warn rounded-[4px] px-0.5 line-through decoration-warn/60",
  missing: "",
} as const;

/** One proposed or confirmed Quran quotation: the manuscript reading beside the standard text, with a neutral diff. */
export function QuoteCard({ q, canConfirm, onChanged, onGoLine, compact }: { q: QuoteAnnotation; canConfirm: boolean; onChanged?: () => void; onGoLine?: (lineId: string) => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const diffs = q.diff.filter((d) => d.op !== "same");
  const review = async (status: "confirmed" | "rejected" | "suggested", classification?: QuoteClass | null) => {
    setBusy(status + (classification ?? ""));
    try {
      await api(`/api/ms-collab/annotations/${q.id}`, { method: "PATCH", json: { status, ...(classification !== undefined ? { classification } : {}) } });
      toast({ tone: "ok", text: t(`collab.quote.done.${status}`) });
      onChanged?.();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  };
  const lines = q.from_n === q.to_n ? t("collab.lineN", { n: num(q.from_n, locale) }) : t("collab.linesNM", { a: num(q.from_n, locale), b: num(q.to_n, locale) });
  return (
    <article className={cn("rounded-[16px] border flex flex-col gap-3 p-4", q.status === "confirmed" ? "border-ok/40 bg-ok-soft/30" : q.status === "rejected" ? "border-line bg-surface-2/50 opacity-80" : "border-accent/40 bg-surface")} data-testid="quote-card" data-status={q.status}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="size-8 rounded-[10px] bg-accent-soft text-accent grid place-items-center"><BookOpenText className="size-4" /></span>
        <span className="font-semibold">{locale === "ar" ? `سورة ${q.sura_name_ar}` : `Surah ${q.sura_name_en}`}</span>
        <bdi className="mono text-sm text-ink-2" dir="ltr">{q.verse_keys.join(", ")}</bdi>
        <Badge tone={q.status === "confirmed" ? "ok" : q.status === "rejected" ? "neutral" : "accent"}>{t(`collab.quote.status.${q.status}`)}</Badge>
        {q.match === "near" && <Badge tone="warn">{t("collab.quote.near")}</Badge>}
        {q.partial && <Badge>{t("collab.quote.partial")}</Badge>}
        {onGoLine && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => onGoLine(q.line_ids[0])}>{lines}</Button>}
      </header>
      <div className="grid gap-3">
        <section className="rounded-[12px] bg-sand/70 px-3 py-2 flex flex-col gap-1">
          <h4 className="text-xs font-semibold text-sand-ink">{t("collab.quote.inMs")}</h4>
          <p className="ms-text text-[1.3rem] leading-[2.1]" dir="rtl" lang="ar">
            {q.diff.filter((d) => d.op !== "missing").map((d, i) => <span key={i}><span className={DIFF_CLASS[d.op]} title={d.op !== "same" ? t(`collab.quote.diff.${d.op}`) : undefined}>{d.ms}</span>{" "}</span>)}
          </p>
        </section>
        <section className="rounded-[12px] bg-surface-2 px-3 py-2 flex flex-col gap-1">
          <h4 className="text-xs font-semibold text-ink-3">{t("collab.quote.standard")}</h4>
          <VerseBlock verses={q.verses.map((v) => ({ ...v, translation: v.translation }))} locale={locale} showTranslation={!compact} translationLabel={t("collab.quote.translation")} />
        </section>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {diffs.length === 0 ? (
          <p className="text-ink-2 inline-flex items-center gap-1.5"><Check className="size-4 text-ok" />{t("collab.quote.noDiff")}</p>
        ) : (
          <>
            <p className="text-ink-2">{t("collab.quote.differs", { n: num(diffs.length, locale) })}</p>
            <ul className="flex flex-wrap gap-1.5">
              {diffs.map((d, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 h-8 text-xs">
                  <span className="text-ink-3">{t(`collab.quote.diff.${d.op}`)}</span>
                  {d.ms && <span className="font-ms text-base" dir="rtl">{d.ms}</span>}
                  {d.ms && d.std && <span className="text-ink-3">·</span>}
                  {d.std && <span className="font-ms text-base text-ink-2" dir="rtl">{d.std}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-[0.72rem] text-ink-3">{t("collab.quote.never")}</p>
      </div>
      {q.classification && <p className="text-sm"><span className="text-ink-3">{t("collab.quote.class")}:</span> {t(`collab.quote.cls.${q.classification}`)}</p>}
      {q.reviewed_by && q.status !== "suggested" && <p className="text-xs text-ink-3">{t("collab.quote.reviewedBy", { name: locale === "ar" ? q.reviewed_by.name_ar : q.reviewed_by.name_en })}</p>}
      {canConfirm && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {q.status === "suggested" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => review("confirmed")} loading={busy === "confirmed"} data-testid="quote-confirm"><Check className="size-4" />{t("collab.quote.confirm")}</Button>
              <Button size="sm" variant="ghost" onClick={() => review("rejected")} loading={busy === "rejected"}><CircleSlash className="size-4" />{t("collab.quote.reject")}</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => review("suggested")} loading={busy === "suggested"}><Undo2 className="size-4" />{t("collab.quote.undo")}</Button>
          )}
          {diffs.length > 0 && q.status !== "rejected" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-ink-3">{t("collab.quote.classify")}</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("collab.quote.classify")}>
                {QUOTE_CLASSES.map((c) => (
                  <button key={c} type="button" aria-pressed={q.classification === c} onClick={() => review(q.status === "suggested" ? "suggested" : q.status, c)}
                    className={cn("h-9 px-3 rounded-full text-xs font-medium border transition-colors", q.classification === c ? "bg-ink text-bg border-ink" : "border-line-strong hover:bg-surface-2")}>
                    {t(`collab.quote.cls.${c}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!canConfirm && q.status === "suggested" && <p className="text-xs text-ink-3">{t("collab.quote.researcherConfirms")}</p>}
    </article>
  );
}

function useUnderstanding(pageId: string) {
  const { rev } = useOverview(pageId);
  const [data, setData] = useState<Understanding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Understanding>(`/api/ms-collab/pages/${pageId}/understanding`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "error");
    }
  }, [pageId]);
  useEffect(() => { void load(); }, [load, rev]);
  return { data, error, reload: load };
}

const NOTE_ICON: Record<string, string> = { add: "⇥", del: "⌫", gap: "[…]", supplied: "[ ]", gloss: "✎" };

/** "Understand this page": Quran quotations, abbreviations and glossary terms, and the marks and notes on the page. */
export function UnderstandingPanel({ ctx, close, initialTab = "quran" }: { ctx: WorkspaceContext; close: () => void; initialTab?: "quran" | "abbr" | "notes" }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const pageId = ctx.detail.page.id;
  const { data, error, reload } = useUnderstanding(pageId);
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const changed = () => { void reload(); refreshSoon(pageId, false); };
  const go = (lineId: string) => { close(); ctx.selectLine(lineId); };
  const rescan = async () => {
    setBusy("scan");
    try {
      const r = await api<{ added: number }>(`/api/ms-collab/pages/${pageId}/understanding`, { method: "POST", json: {} });
      toast({ tone: "ok", text: t("collab.quote.scanned", { n: num(r.added, locale) }) });
      changed();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  };
  const confirmAbbr = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      await api("/api/ms-collab/abbreviations", { method: "POST", json: body });
      toast({ tone: "ok", text: t("collab.abbr.confirmed") });
      changed();
      await ctx.reload();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  };
  const quotes = data?.quotes ?? [];
  const nQuotes = quotes.filter((x) => x.status !== "rejected").length;
  return (
    <Sheet open onClose={close} side="end" title={t("collab.und.title")} description={t("collab.und.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-4" data-testid="understanding-panel">
        <Segmented label={t("collab.und.title")} value={tab} onChange={setTab} size="sm" className="self-start flex-wrap"
          options={[
            { value: "quran", label: <>{t("collab.und.tab.quran")}{data && <span className="tabular text-xs text-ink-3">{num(nQuotes, locale)}</span>}</> },
            { value: "abbr", label: <>{t("collab.und.tab.abbr")}{data && <span className="tabular text-xs text-ink-3">{num(data.abbreviations.length + data.terms.length, locale)}</span>}</> },
            { value: "notes", label: <>{t("collab.und.tab.notes")}{data && <span className="tabular text-xs text-ink-3">{num(data.notes.length, locale)}</span>}</> },
          ]} />
        {error && <Callout tone="bad">{t("collab.error.load")} <button type="button" className="underline" onClick={() => void reload()}>{t("collab.retry")}</button></Callout>}
        {!data && !error && <><Skeleton className="h-40" /><Skeleton className="h-24" /></>}

        {data && tab === "quran" && (
          <div className="flex flex-col gap-3">
            <FirstTip id="quran" title={t("collab.tip.quran.title")}>{t("collab.tip.quran.body")}</FirstTip>
            {quotes.length === 0 ? (
              <EmptyState icon={<BookOpenText className="size-7" />} title={t("collab.quote.emptyTitle")} body={t("collab.quote.emptyBody")}
                action={<Button variant="secondary" onClick={rescan} loading={busy === "scan"}><RefreshCw className="size-4" />{t("collab.quote.rescan")}</Button>} />
            ) : (
              <>
                {quotes.map((x) => <QuoteCard key={x.id} q={x} canConfirm={data.can_confirm} onChanged={changed} onGoLine={go} />)}
                <Button variant="ghost" size="sm" className="self-start" onClick={rescan} loading={busy === "scan"}><RefreshCw className="size-4" />{t("collab.quote.rescan")}</Button>
              </>
            )}
          </div>
        )}

        {data && tab === "abbr" && (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t("collab.abbr.marked")}</h3>
              {data.abbreviations.length === 0 ? <p className="text-sm text-ink-3">{t("collab.abbr.none")}</p> : (
                <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
                  {data.abbreviations.map((a) => (
                    <li key={`${a.line_id}:${a.token_index}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <button type="button" className="text-xs text-accent hover:underline tabular" onClick={() => go(a.line_id)}>{t("collab.lineN", { n: num(a.line_n, locale) })}</button>
                      <span className="font-ms text-lg" dir="rtl">{a.written}</span><span className="text-ink-3">→</span><span className="font-ms text-lg" dir="rtl">{a.expan}</span>
                      <Badge tone={a.confirmed ? "ok" : "warn"} className="ms-auto">{t(a.confirmed ? "collab.abbr.isConfirmed" : "collab.abbr.unconfirmed")}</Badge>
                      {!a.confirmed && data.can_edit && (
                        <Button size="sm" onClick={() => confirmAbbr({ line_id: a.line_id, base_version: a.base_version, token_index: a.token_index, expan: a.expan }, `a${a.line_id}${a.token_index}`)} loading={busy === `a${a.line_id}${a.token_index}`}>{t("collab.abbr.confirm")}</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t("collab.abbr.possible")}</h3>
              <p className="text-xs text-ink-3">{t("collab.abbr.possibleHint")}</p>
              {data.possible.length === 0 ? <p className="text-sm text-ink-3">{t("collab.abbr.noPossible")}</p> : (
                <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
                  {data.possible.map((p) => {
                    const fit = p.suggestions.filter((s) => s.fits);
                    const others = p.suggestions.filter((s) => !s.fits);
                    return (
                      <li key={`${p.line_id}:${p.start}`} className="flex flex-col gap-1.5 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className="text-xs text-accent hover:underline tabular" onClick={() => go(p.line_id)}>{t("collab.lineN", { n: num(p.line_n, locale) })}</button>
                          <span className="font-ms text-lg" dir="rtl">«{p.written}»</span>
                          {fit.map((s) => (
                            data.can_edit
                              ? <Button key={s.expan} size="sm" variant="soft" onClick={() => confirmAbbr({ line_id: p.line_id, base_version: p.base_version, start: p.start, end: p.end, expan: s.expan }, `p${p.line_id}${p.start}${s.expan}`)} loading={busy === `p${p.line_id}${p.start}${s.expan}`}
                                  title={locale === "ar" ? s.note_ar : s.note_en}>{s.warn && <TriangleAlert className="size-3.5 text-warn" />}{t("collab.abbr.confirmAs", { x: s.expan })}</Button>
                              : <Badge key={s.expan} tone="violet" title={locale === "ar" ? s.note_ar : s.note_en}>{s.expan}</Badge>
                          ))}
                        </div>
                        {others.length > 0 && <p className="text-[0.72rem] text-ink-3">{t("collab.abbr.otherGenres")}: <span className="font-ms text-sm" dir="rtl">{others.map((s) => s.expan).join("، ")}</span></p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t("collab.terms.title")}</h3>
              {data.terms.length === 0 ? <p className="text-sm text-ink-3">{t("collab.terms.none")}</p> : (
                <ul className="flex flex-col gap-2">
                  {data.terms.map((g) => (
                    <li key={g.id} className="rounded-[12px] border border-line p-3 flex flex-col gap-1">
                      <span className="font-semibold"><span className="font-ms text-lg" dir="rtl">{g.term_ar}</span> · {g.term_en}</span>
                      <span className="text-sm text-ink-2">{locale === "ar" ? g.rule_ar : g.rule_en}</span>
                      <span className="text-xs text-ink-3">{g.lines.map((n) => t("collab.lineN", { n: num(n, locale) })).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {data && tab === "notes" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">{t("collab.notes.intro")}</p>
            {data.notes.length === 0 ? (
              <EmptyState icon={<NotebookPen className="size-7" />} title={t("collab.notes.emptyTitle")} body={t("collab.notes.emptyBody")} />
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
                {data.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                    <span className={cn("shrink-0 min-w-9 h-7 px-1.5 rounded-full grid place-items-center text-xs", n.kind === "mark" ? "bg-violet-soft text-violet font-ms text-sm" : "bg-surface-2 text-ink-2")}>
                      {n.kind === "mark" ? n.text : NOTE_ICON[n.kind] ?? "•"}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium">
                        {n.kind === "mark" ? <>{t(`manuscripts.mark.${n.mark}`)} <span className="text-ink-3 font-normal">«{markInfo(n.mark as MarkKind).term}»</span></> : t(`collab.notes.kind.${n.kind}`)}
                      </span>
                      {n.kind !== "mark" && n.kind !== "gap" && <span className="ms-text text-[1.05rem] text-ink-2 line-clamp-2" dir="rtl">{n.text}</span>}
                      {n.note && <span className="text-xs text-ink-3" dir="auto">{n.kind === "gap" ? t(`manuscripts.gap.${n.note}`) : n.kind === "add" ? t(`manuscripts.add.${n.note}`) : n.note}</span>}
                    </div>
                    <button type="button" className="shrink-0 text-xs text-accent hover:underline tabular" onClick={() => go(n.line_id)}>{t("collab.lineN", { n: num(n.line_n, locale) })}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[0.72rem] text-ink-3 inline-flex items-center gap-1.5 mt-1"><ScrollText className="size-3.5" />{t("collab.notes.howTo")}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
