"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleQuestionMark, EyeOff, Hourglass, Scale, SkipForward, Type } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState, Kbd, Skeleton } from "@/components/ui/feedback";
import { Card } from "@/components/ui/surface";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import { MOD_LABEL, modShift } from "../../../manuscripts/components/workspace/keys";
import { MASK, type CantRead, type Keying } from "../../hard-words";
import type { HardWordCard, KeyResult } from "../../types";
import { FirstTip, KeysSheet, Siglum } from "../bits";
import { WordCrop } from "./word-crop";

const shown = (k: Keying | null, t: (k: string) => string) => (!k ? "—" : k.cant_read ? t(`collab.hard.cant.${k.cant_read}`) : k.reading);

/** Blind double-keying for students: one hard word at a time, keyboard first. */
export function KeyingView({ pageId }: { pageId?: string }) {
  const { t, locale } = useI18n();
  const [item, setItem] = useState<HardWordCard | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KeyResult | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [keys, setKeys] = useState(false);
  const [done, setDone] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (skip: string[]) => {
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (pageId) qs.set("page", pageId);
      if (skip.length) qs.set("skip", skip.join(","));
      const r = await api<{ item: HardWordCard | null }>(`/api/ms-collab/hard-words/next?${qs}`);
      setItem(r.item);
      setReading("");
      setResult(null);
      requestAnimationFrame(() => input.current?.focus());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("collab.error.load"));
      setItem(null);
    }
  }, [pageId, t]);
  useEffect(() => { void load([]); }, [load]);
  useEffect(() => { if (result) requestAnimationFrame(() => nextBtn.current?.focus()); }, [result]);

  const submit = async (answer: Keying) => {
    if (!item || busy) return;
    if (!answer.cant_read && !answer.reading?.trim()) { input.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api<KeyResult>(`/api/ms-collab/hard-words/${item.id}/key`, { method: "POST", json: answer.cant_read ? { cant_read: answer.cant_read } : { reading: answer.reading!.trim() } });
      setResult(r);
      setDone((d) => d + 1);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "closed" || e.code === "already" || e.code === "frozen")) {
        setError(e.message);
        await load(skipped);
      } else setError(e instanceof ApiError ? e.message : t("collab.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  const skip = () => {
    if (!item) return;
    const s = [...skipped, item.id];
    setSkipped(s);
    void load(s);
  };
  const cant = (r: CantRead) => submit({ cant_read: r });

  // Keyboard: Enter submits (or goes to the next word), Esc skips, Ctrl+Shift+U / D = can't read (illegible / damaged), ? = help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (result) {
        if (e.key === "Enter") { e.preventDefault(); void load(skipped); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); skip(); return; }
      if (modShift(e, "KeyU")) { e.preventDefault(); void cant("illegible"); return; }
      if (modShift(e, "KeyD")) { e.preventDefault(); void cant("damage"); return; }
      if (e.key === "?" && (e.target as HTMLElement)?.tagName !== "INPUT") { e.preventDefault(); setKeys(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const M = MOD_LABEL();
  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5 max-w-2xl">
        <nav aria-label="breadcrumb"><Link href="/portal/manuscripts/queue" className="text-sm text-ink-2 hover:text-ink">{t("collab.queue.titleStudent")}</Link></nav>
        <h1 className="text-[1.6rem] font-semibold tracking-tight flex items-center gap-3">
          <span className="size-10 rounded-[12px] bg-sand text-sand-ink grid place-items-center"><Type className="size-5" /></span>{t("collab.hard.title")}
        </h1>
        <p className="text-ink-2">{t("collab.hard.sub")}</p>
      </div>
      <div className="flex items-center gap-2">
        {done > 0 && <Badge tone="ok" className="tabular"><CheckCircle2 className="size-3" />{t("collab.hard.doneCount", { n: num(done, locale) })}</Badge>}
        <Button variant="ghost" size="sm" onClick={() => setKeys(true)}><CircleQuestionMark className="size-4" />{t("collab.keys.title")}</Button>
      </div>
    </header>
  );

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto animate-rise" data-testid="keying">
      {header}
      <FirstTip id="hard-words" title={t("collab.tip.hard.title")}>{t("collab.tip.hard.body")}</FirstTip>
      {error && <Callout tone="warn">{error}</Callout>}
      {item === undefined && <Card className="p-5 flex flex-col gap-4"><Skeleton className="h-36" /><Skeleton className="h-12" /><Skeleton className="h-14" /></Card>}
      {item === null && (
        <Card className="py-4">
          <EmptyState icon={<CheckCircle2 className="size-7" />} title={t("collab.hard.emptyTitle")} body={skipped.length ? t("collab.hard.emptySkipped", { n: num(skipped.length, locale) }) : t("collab.hard.emptyBody")}
            action={<>{skipped.length > 0 && <Button variant="secondary" onClick={() => { setSkipped([]); void load([]); }}>{t("collab.hard.backToSkipped")}</Button>}<ButtonLink href="/portal/manuscripts/queue">{t("collab.hard.backToWork")}</ButtonLink></>} />
        </Card>
      )}
      {item && (
        <Card className="p-4 sm:p-6 flex flex-col gap-5" data-testid="hard-card-item" data-item={item.id}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Siglum s={item.siglum} size="sm" />
            <span className="font-ms text-base" dir="rtl" lang="ar">{locale === "ar" ? item.ms_title_ar : item.ms_title_en}</span>
            <span className="text-ink-3">· {t("collab.pageN", { n: num(item.page_seq, locale) })} · {t("collab.lineN", { n: num(item.line_n, locale) })}{item.zone && item.zone !== "main" ? ` · ${t(`manuscripts.region.${item.zone}`)}` : ""}</span>
            {item.second && !result && <Badge tone="violet" className="ms-auto">{t("collab.hard.second")}</Badge>}
            {!item.second && !result && <span className="ms-auto text-xs text-ink-3 tabular">{t("collab.hard.waiting", { n: num(item.remaining, locale) })}</span>}
          </div>

          <WordCrop image={item.image} polygon={item.polygon} baseline={item.baseline} box={item.approx_box} label={t("collab.hard.cropLabel", { n: num(item.line_n, locale) })} height={150} />

          <div className="rounded-[12px] bg-surface-2 px-4 py-2">
            <span className="text-xs text-ink-3">{t("collab.hard.context")}</span>
            <p className="ms-text text-[1.35rem] leading-[2.2]" dir="rtl" lang="ar" data-testid="hard-context">
              <span className="text-ink-2">{item.before}</span>
              <mark className="mx-1 px-2 rounded-[6px] bg-warn-soft text-warn font-ui text-base tracking-widest align-middle" aria-label={t("collab.hard.masked")}>{result ? (result.final ?? shown(result.mine, t)) : MASK}</mark>
              <span className="text-ink-2">{item.after}</span>
            </p>
          </div>

          {!result ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit({ reading }); }}>
              <label htmlFor="hw-input" className="text-sm font-medium">{t("collab.hard.prompt")}</label>
              <input id="hw-input" ref={input} value={reading} onChange={(e) => setReading(e.target.value)} dir="rtl" lang="ar" autoComplete="off" spellCheck={false}
                className="h-16 w-full rounded-[14px] border-2 border-line-strong bg-surface px-4 font-ms text-[1.8rem] leading-none focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                placeholder={t("collab.hard.placeholder")} data-testid="hw-input" />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="lg" loading={busy} disabled={!reading.trim()} data-testid="hw-submit">{t("collab.hard.submit")} <Kbd>↵</Kbd></Button>
                <Button type="button" variant="secondary" onClick={() => void cant("illegible")} disabled={busy} data-testid="hw-cant"><EyeOff className="size-4" />{t("collab.hard.cantRead")} <Kbd>{M} ⇧ U</Kbd></Button>
                <Button type="button" variant="ghost" onClick={() => void cant("damage")} disabled={busy}>{t("collab.hard.damaged")} <Kbd>{M} ⇧ D</Kbd></Button>
                <Button type="button" variant="ghost" onClick={skip} disabled={busy} className="ms-auto" data-testid="hw-skip"><SkipForward className="size-4" />{t("collab.hard.skip")} <Kbd>Esc</Kbd></Button>
              </div>
              <p className="text-xs text-ink-3">{t("collab.hard.blind")}</p>
            </form>
          ) : (
            <div className="flex flex-col gap-3" aria-live="polite" data-testid="hw-result" data-outcome={result.outcome}>
              <div className={cn("rounded-[14px] p-4 flex gap-3", result.outcome === "agreed" ? "bg-ok-soft" : result.outcome === "disputed" ? "bg-warn-soft" : "bg-surface-2")}>
                {result.outcome === "agreed" ? <CheckCircle2 className="size-5 text-ok shrink-0" /> : result.outcome === "disputed" ? <Scale className="size-5 text-warn shrink-0" /> : <Hourglass className="size-5 text-ink-2 shrink-0" />}
                <div className="flex flex-col gap-1">
                  <strong>{t(`collab.hard.outcome.${result.outcome}`)}</strong>
                  <span className="text-sm text-ink-2">{t(`collab.hard.outcomeBody.${result.outcome}`)}{result.vowels_differ ? ` ${t("collab.hard.vowelsDiffer")}` : ""}</span>
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="rounded-[12px] border border-line p-3"><dt className="text-xs text-ink-3">{t("collab.hard.yours")}</dt><dd className="font-ms text-xl" dir="rtl">{shown(result.mine, t)}</dd></div>
                <div className="rounded-[12px] border border-line p-3"><dt className="text-xs text-ink-3">{t("collab.hard.otherReader")}</dt><dd className="font-ms text-xl" dir="rtl">{result.other ? shown(result.other, t) : <span className="font-ui text-sm text-ink-3">{t("collab.hard.notYet")}</span>}</dd></div>
                <div className="rounded-[12px] border border-line p-3">
                  <dt className="text-xs text-ink-3">{t(result.source === "machine" ? "collab.hard.machineGuess" : "collab.hard.personGuess")}</dt>
                  <dd className="font-ms text-xl" dir="rtl">{result.machine}</dd>
                  {result.conf != null && <dd className="text-[0.7rem] text-ink-3">{t("collab.hard.modelScore", { n: num(result.conf, locale) })}</dd>}
                  {result.alts.length > 0 && <dd className="text-xs text-ink-3">{t("collab.hard.alts")}: <span className="font-ms text-sm" dir="rtl">{result.alts.join("، ")}</span></dd>}
                </div>
              </dl>
              <Button ref={nextBtn} size="lg" className="self-start" onClick={() => void load(skipped)} data-testid="hw-next">{t("collab.hard.next")} <Kbd>↵</Kbd><ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
            </div>
          )}
        </Card>
      )}
      <KeysSheet open={keys} onClose={() => setKeys(false)} rows={[
        [["↵"], t("collab.keys.hardSubmit")],
        [[`${M} ⇧ U`], t("collab.keys.hardIllegible")],
        [[`${M} ⇧ D`], t("collab.keys.hardDamage")],
        [["Esc"], t("collab.keys.hardSkip")],
        [["↵"], t("collab.keys.hardNext")],
        [["?"], t("collab.keys.help")],
      ]} />
    </div>
  );
}
