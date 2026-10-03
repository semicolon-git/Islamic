"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, CheckCircle2, CircleQuestionMark, ExternalLink, EyeOff, Scale } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, Kbd, Skeleton } from "@/components/ui/feedback";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import { digitOf, isTyping } from "../../../manuscripts/components/workspace/keys";
import { MASK, type CantRead } from "../../hard-words";
import type { AdjudicationItem } from "../../types";
import { FirstTip, KeysSheet, Siglum } from "../bits";
import { WordCrop } from "./word-crop";

type Choice = { label: string; who: string; text: string | null; gap: CantRead | null };

function choicesOf(item: AdjudicationItem, t: (k: string, v?: Record<string, string | number>) => string, locale: string): Choice[] {
  const out: Choice[] = [];
  const seen = new Set<string>();
  for (const r of item.readings) {
    const key = r.cant_read ? `gap:${r.cant_read}` : `t:${r.reading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: r.cant_read ? t(`collab.hard.cant.${r.cant_read}`) : r.reading!, who: locale === "ar" ? r.name_ar : r.name_en, text: r.cant_read ? null : r.reading, gap: r.cant_read });
  }
  for (const [i, v] of [item.machine, ...item.alts].entries()) {
    if (seen.has(`t:${v}`)) continue;
    seen.add(`t:${v}`);
    out.push({ label: v, who: i === 0 ? t(item.source === "machine" ? "collab.hard.machineGuess" : "collab.hard.personGuess") : t("collab.hard.alt"), text: v, gap: null });
  }
  return out;
}

function DisputeCard({ item, active, onFocus, onDecided }: { item: AdjudicationItem; active: boolean; onFocus: () => void; onDecided: (id: string, v: number) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const ref = useRef<HTMLElement>(null);
  const choices = choicesOf(item, t, locale);
  const decide = useCallback(async (d: { text: string } | { gap: CantRead }, key: string) => {
    setBusy(key);
    try {
      const r = await api<{ version: number }>(`/api/ms-collab/hard-words/${item.id}/decide`, { method: "POST", json: d });
      toast({ tone: "ok", text: t("collab.adj.done") });
      onDecided(item.id, r.version);
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  }, [item.id, onDecided, t, toast]);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);
  useEffect(() => {
    if (!active || !item.can_decide) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      const d = digitOf(e);
      if (d && choices[d - 1]) {
        e.preventDefault();
        const c = choices[d - 1];
        void decide(c.gap ? { gap: c.gap } : { text: c.text! }, `c${d - 1}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, choices, decide, item.can_decide]);
  const href = `/portal/manuscripts/${item.ms_id}/pages/${item.page_id}?line=${encodeURIComponent(item.line_id)}`;
  return (
    <article ref={ref} onFocus={onFocus} onClick={onFocus} tabIndex={-1}
      className={cn("bg-surface rounded-[var(--radius)] border border-line shadow-card p-4 sm:p-5 flex flex-col gap-4 transition-shadow", active ? "ring-2 ring-accent/60 shadow-pop" : "")} data-testid="dispute" data-item={item.id} data-line={item.line_id}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Siglum s={item.siglum} size="sm" />
        <span className="font-ms text-base" dir="rtl" lang="ar">{locale === "ar" ? item.ms_title_ar : item.ms_title_en}</span>
        <span className="text-ink-3">· {t("collab.pageN", { n: num(item.page_seq, locale) })} · {t("collab.lineN", { n: num(item.line_n, locale) })}</span>
        <Link href={href} className="ms-auto inline-flex items-center gap-1 text-xs text-accent underline underline-offset-2">{t("collab.adj.openLine")}<ExternalLink className="size-3" /></Link>
      </div>
      <WordCrop image={item.image} polygon={item.polygon} baseline={item.baseline} box={item.approx_box} label={t("collab.hard.cropLabel", { n: num(item.line_n, locale) })} height={130} />
      <p className="ms-text text-[1.25rem] leading-[2.1] rounded-[12px] bg-surface-2 px-4 py-1.5" dir="rtl" lang="ar">
        <span className="text-ink-2">{item.before}</span><mark className="mx-1 px-2 rounded-[6px] bg-warn-soft text-warn font-ui text-sm tracking-widest">{MASK}</mark><span className="text-ink-2">{item.after}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {item.readings.map((r) => (
          <div key={r.author_id} className="rounded-[12px] border border-line p-3 flex items-center gap-3">
            <Avatar name={locale === "ar" ? r.name_ar : r.name_en} hue={r.hue} size={28} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-ink-3">{locale === "ar" ? r.name_ar : r.name_en}</span>
              <span className={cn(r.cant_read ? "text-sm text-ink-2" : "font-ms text-2xl leading-snug")} dir={r.cant_read ? undefined : "rtl"}>{r.cant_read ? t(`collab.hard.cant.${r.cant_read}`) : r.reading}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3 inline-flex items-center gap-1.5">
        <Bot className="size-3.5" />{t(item.source === "machine" ? "collab.hard.machineGuess" : "collab.hard.personGuess")}: <span className="font-ms text-base text-ink-2" dir="rtl">{item.machine}</span>
        {item.conf != null && <> · {t("collab.hard.modelScore", { n: num(item.conf, locale) })}</>}
      </p>
      {item.can_decide ? (
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          <span className="text-sm font-medium">{t("collab.adj.pick")}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("collab.adj.pick")}>
            {choices.map((c, i) => (
              <button key={i} type="button" disabled={!!busy} onClick={() => void decide(c.gap ? { gap: c.gap } : { text: c.text! }, `c${i}`)} data-choice={i}
                className="inline-flex items-center gap-2 min-h-11 ps-2 pe-3.5 rounded-full border border-line-strong bg-surface hover:border-accent hover:bg-accent-soft transition-colors disabled:opacity-50">
                {i < 9 && <Kbd>{i + 1}</Kbd>}
                <span className={cn(c.gap ? "text-sm" : "font-ms text-xl leading-none")} dir={c.gap ? undefined : "rtl"}>{c.label}</span>
                <span className="text-[0.7rem] text-ink-3">{c.who}</span>
                {busy === `c${i}` && <span className="size-3.5 rounded-full border-2 border-current border-e-transparent animate-spin" />}
              </button>
            ))}
          </div>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (own.trim()) void decide({ text: own.trim() }, "own"); }}>
            <input value={own} onChange={(e) => setOwn(e.target.value)} dir="rtl" lang="ar" aria-label={t("collab.adj.own")} placeholder={t("collab.adj.own")}
              className="h-11 flex-1 min-w-48 rounded-[12px] border border-line-strong bg-surface px-3 font-ms text-xl focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25" data-testid="adj-own" />
            <Button type="submit" disabled={!own.trim()} loading={busy === "own"}><Check className="size-4" />{t("collab.adj.useOwn")}</Button>
            <Button type="button" variant="ghost" onClick={() => void decide({ gap: "illegible" }, "gap")} loading={busy === "gap"}><EyeOff className="size-4" />{t("collab.adj.gap")}</Button>
          </form>
          <p className="text-[0.72rem] text-ink-3">{t("collab.adj.writes")}</p>
        </div>
      ) : (
        <Callout tone="neutral">{t("collab.adj.cantDecide")}</Callout>
      )}
    </article>
  );
}

/** Researcher: decide disputed words (both readings, machine guess, crop), and spot-check recent agreements. */
export function AdjudicateView({ pageId }: { pageId?: string }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<{ disputed: AdjudicationItem[]; agreed: AdjudicationItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [resolved, setResolved] = useState<{ id: string; version: number }[]>([]);
  const [keys, setKeys] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api(`/api/ms-collab/hard-words/adjudicate${pageId ? `?page=${encodeURIComponent(pageId)}` : ""}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("collab.error.load"));
    }
  }, [pageId, t]);
  useEffect(() => { void load(); }, [load]);
  const pages = [...new Set((data?.disputed ?? []).map((d) => d.page_id))];
  useEvents(pages.map((p) => `page:${p}`), (ev) => { if (ev.type.startsWith("hardword.")) void load(); });
  const list = (data?.disputed ?? []).filter((d) => !resolved.some((r) => r.id === d.id));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.code === "KeyJ") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
      if (e.code === "KeyK") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      if (e.key === "?") { e.preventDefault(); setKeys(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length]);
  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto animate-rise" data-testid="adjudicate">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5 max-w-2xl">
          <nav aria-label="breadcrumb"><Link href="/portal/manuscripts/queue" className="text-sm text-ink-2 hover:text-ink">{t("collab.queue.title")}</Link></nav>
          <h1 className="text-[1.6rem] font-semibold tracking-tight flex items-center gap-3">
            <span className="size-10 rounded-[12px] bg-warn-soft text-warn grid place-items-center"><Scale className="size-5" /></span>{t("collab.adj.title")}
          </h1>
          <p className="text-ink-2">{t("collab.adj.sub")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setKeys(true)}><CircleQuestionMark className="size-4" />{t("collab.keys.title")}</Button>
      </header>
      <FirstTip id="adjudicate" title={t("collab.tip.adj.title")}>{t("collab.tip.adj.body")}</FirstTip>
      {error && <Callout tone="bad">{error} <button type="button" className="underline" onClick={() => void load()}>{t("collab.retry")}</button></Callout>}
      {!data && !error && [0, 1].map((i) => <Skeleton key={i} className="h-72" />)}
      {resolved.length > 0 && <p className="text-sm text-ok inline-flex items-center gap-1.5" aria-live="polite"><CheckCircle2 className="size-4" />{t("collab.adj.decidedCount", { n: num(resolved.length, locale) })}</p>}
      {data && list.length === 0 && (
        <Card className="py-4"><EmptyState icon={<CheckCircle2 className="size-7" />} title={t("collab.adj.emptyTitle")} body={t("collab.adj.emptyBody")} /></Card>
      )}
      {list.map((d, i) => (
        <DisputeCard key={d.id} item={d} active={i === Math.min(active, list.length - 1)} onFocus={() => setActive(i)} onDecided={(id, version) => setResolved((r) => [...r, { id, version }])} />
      ))}
      {data && data.agreed.length > 0 && (
        <section aria-labelledby="agreed-h" className="flex flex-col gap-2 mt-4">
          <h2 id="agreed-h" className="text-lg font-semibold">{t("collab.adj.agreed")}</h2>
          <p className="text-sm text-ink-2">{t("collab.adj.agreedBody")}</p>
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {data.agreed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <Siglum s={a.siglum} size="sm" />
                <span className="text-ink-3">{t("collab.pageN", { n: num(a.page_seq, locale) })} · {t("collab.lineN", { n: num(a.line_n, locale) })}</span>
                <span className="font-ms text-xl" dir="rtl">{a.final_text ?? (a.final_gap ? t(`collab.hard.cant.${a.final_gap}`) : "")}</span>
                <span className="text-xs text-ink-3">{t("collab.adj.was", { w: a.machine })}</span>
                <Link href={`/portal/manuscripts/${a.ms_id}/pages/${a.page_id}?line=${encodeURIComponent(a.line_id)}`} className="ms-auto text-xs text-accent underline underline-offset-2">{t("collab.adj.openLine")}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <KeysSheet open={keys} onClose={() => setKeys(false)} rows={[
        [["J", "K"], t("collab.keys.adjNav")],
        [["1…9"], t("collab.keys.adjPick")],
        [["↵"], t("collab.keys.adjOwn")],
        [["?"], t("collab.keys.help")],
      ]} />
    </div>
  );
}
