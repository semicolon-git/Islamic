"use client";
import { useEffect, useState } from "react";
import { Bot, BookOpenText, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import { TokenText } from "../../../manuscripts/components/token-view";
import type { ExplainResult } from "../../types";

/**
 * "Explain this line": the reading layer, confirmed references and abbreviation expansions — all deterministic.
 * An optional AI gloss is clearly labelled "AI draft — not reviewed" and never changes the text.
 */
export function ExplainSheet({ lineId, lineN, onClose, onUnderstand }: { lineId: string; lineN: number; onClose: () => void; onUnderstand: () => void }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api<ExplainResult>(`/api/ms-collab/lines/${lineId}/explain`, { method: "POST", json: { ai: false } })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : t("collab.error.load")));
    return () => { alive = false; };
  }, [lineId, t]);
  const askAi = async () => {
    setAiBusy(true);
    try {
      const d = await api<ExplainResult>(`/api/ms-collab/lines/${lineId}/explain`, { method: "POST", json: { ai: true } });
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("collab.error.generic"));
    } finally {
      setAiBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} side="end" title={t("collab.explain.title", { n: num(lineN, locale) })} description={t("collab.explain.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-4" data-testid="explain-sheet" aria-live="polite">
        {error && <Callout tone="bad">{error}</Callout>}
        {!data && !error && <><Skeleton className="h-16" /><Skeleton className="h-24" /></>}
        {data && (
          <>
            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t("collab.explain.reading")}</h3>
              <p className="rounded-[12px] bg-sand/70 px-3 py-2"><TokenText tokens={data.tokens} layer="reading" className="text-[1.35rem] leading-[2.1]" /></p>
              {data.reading !== data.diplomatic && (
                <p className="text-xs text-ink-3">{t("collab.explain.asWritten")} <span className="ms-text text-base text-ink-2" dir="rtl">{data.diplomatic}</span></p>
              )}
              {data.uncertain > 0 && <p className="text-xs text-warn inline-flex items-center gap-1.5"><TriangleAlert className="size-3.5" />{t("collab.explain.uncertain", { n: num(data.uncertain, locale) })}</p>}
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t("collab.explain.abbr")}</h3>
              {data.abbreviations.length === 0 ? <p className="text-sm text-ink-3">{t("collab.explain.noAbbr")}</p> : (
                <ul className="flex flex-wrap gap-1.5">
                  {data.abbreviations.map((a, i) => (
                    <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line h-9 px-3">
                      <span className="font-ms text-lg" dir="rtl">{a.written}</span><span className="text-ink-3">→</span><span className="font-ms text-lg" dir="rtl">{a.expan}</span>
                      {!a.confirmed && <Badge tone="warn">{t("collab.abbr.unconfirmed")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t("collab.explain.refs")}</h3>
              {data.quotes.length === 0 && data.hadith.length === 0 ? <p className="text-sm text-ink-3">{t("collab.explain.noRefs")}</p> : (
                <ul className="flex flex-col gap-1.5">
                  {data.quotes.map((x, i) => (
                    <li key={i}>
                      <button type="button" onClick={onUnderstand} className="inline-flex items-center gap-2 rounded-full bg-accent-soft h-9 px-3 text-sm hover:brightness-95">
                        <BookOpenText className="size-4 text-accent" />{locale === "ar" ? `سورة ${x.sura_name_ar}` : `Surah ${x.sura_name_en}`} <bdi className="mono" dir="ltr">{x.verse_keys.join(", ")}</bdi>
                      </button>
                    </li>
                  ))}
                  {data.hadith.map((h) => (
                    <li key={h.id} className="text-sm">{t("collab.explain.hadith", { c: h.collection, n: h.number })} · <span className="text-ink-3">{h.grade}</span></li>
                  ))}
                </ul>
              )}
            </section>

            {data.terms.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t("collab.terms.title")}</h3>
                {data.terms.map((g) => <p key={g.term_ar} className="text-sm"><span className="font-ms text-base" dir="rtl">{g.term_ar}</span> · {locale === "ar" ? g.rule_ar : g.rule_en}</p>)}
              </section>
            )}

            <section className="flex flex-col gap-2 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3 inline-flex items-center gap-1.5"><Sparkles className="size-3.5" />{t("collab.explain.ai")}</h3>
              {data.ai.gloss_en || data.ai.gloss_ar ? (
                <div className="rounded-[14px] border border-violet/40 bg-violet-soft/50 p-3 flex flex-col gap-2" data-testid="ai-gloss">
                  <Badge tone="violet" className="self-start"><Bot className="size-3.5" />{t("collab.explain.aiLabel")}</Badge>
                  <p className="text-sm leading-relaxed" dir="auto">{locale === "ar" ? data.ai.gloss_ar : data.ai.gloss_en}</p>
                  <p className="text-[0.72rem] text-ink-3">{t("collab.explain.aiNote", { model: data.ai.model ?? "" })}</p>
                </div>
              ) : data.ai.failure ? (
                <Callout tone="warn">{t(`collab.explain.aiFail.${data.ai.failure === "withheld_quran" ? "quran" : "other"}`)}</Callout>
              ) : data.ai.available ? (
                <Button variant="secondary" className="self-start" onClick={askAi} loading={aiBusy}><Sparkles className="size-4" />{t("collab.explain.aiAsk")}</Button>
              ) : (
                <p className="text-sm text-ink-3" data-testid="ai-off">{t("collab.explain.aiOff")}</p>
              )}
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}
