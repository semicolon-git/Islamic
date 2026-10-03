"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, CircleDashed, Database, MessageCircleHeart, SearchX, ShieldCheck, Trash2, X, LoaderCircle, TriangleAlert } from "lucide-react";
import { Khatam } from "@/components/ui/khatam";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { dirOf } from "@/i18n/core";
import { MAX_QUESTION, detectLang } from "../text";
import type { AskResult, Stage } from "../types";
import { AnswerCard } from "./answer-card";
import { Rich } from "./blocks";
import { scrollBehavior } from "@/components/ui/motion";

interface Turn {
  id: string;
  q: string;
  cardId: string | null;
  status: "pending" | "done" | "error";
  stages: Stage["name"][];
  result?: AskResult;
}

const STORE = "ask.history.v1";
const SUGGESTIONS = ["ask.s.fast", "ask.s.kaaba", "ask.s.tawhid", "ask.s.quran", "ask.s.differ", "ask.s.pillars", "ask.s.mosque", "ask.s.jihad"];

/** Honest progress: a step is ticked only when the server reports that stage finished. */
function Progress({ stages, lang }: { stages: Stage["name"][]; lang: "en" | "ar" }) {
  const { t } = useI18n();
  const ai = stages.includes("router") || stages.includes("compose");
  const steps: { key: string; done: boolean }[] = [
    { key: "ask.progress.check", done: stages.includes("prechecks") },
    { key: "ask.progress.search", done: stages.includes("retrieve") || stages.includes("router") || stages.includes("verify") },
    ...(ai ? [{ key: "ask.progress.compose", done: stages.includes("compose") || stages.includes("verify") }] : []),
    { key: "ask.progress.verify", done: stages.includes("verify") },
  ];
  const active = steps.findIndex((s) => !s.done);
  return (
    <div lang={lang} className="rounded-[20px] border border-line bg-surface p-4 flex flex-col gap-2.5" aria-label={t("ask.progress.label")}>
      {steps.map((s, i) => (
        <div key={s.key} className={cn("flex items-center gap-2.5 text-sm transition-colors", s.done ? "text-ink" : i === active ? "text-ink" : "text-ink-3")}>
          {s.done ? (
            <span className="grid place-items-center size-5 rounded-full bg-ok-soft text-ok">
              <Check className="size-3.5" aria-hidden />
            </span>
          ) : i === active ? (
            <LoaderCircle className="size-5 text-accent animate-spin" aria-hidden />
          ) : (
            <CircleDashed className="size-5" aria-hidden />
          )}
          {t(s.key)}
        </div>
      ))}
    </div>
  );
}

export function AskScreen({ context, initialQuestion }: { context: { id: string; title_en: string; title_ar: string } | null; initialQuestion?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState(initialQuestion ?? "");
  const [ctx, setCtx] = useState(context);
  const [live, setLive] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((x) => x.status === "pending");

  // Session-only history (sessionStorage: this tab only, nothing persisted anywhere else).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setTurns((JSON.parse(raw) as Turn[]).filter((x) => x.status === "done"));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.filter((x) => x.status === "done").slice(-20)));
    } catch {}
  }, [turns]);
  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
  }, [turns]);

  const autosize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  useEffect(autosize, [text]);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || q.length > MAX_QUESTION || busy) return;
      const id = `${Date.now()}`;
      const cardId = ctx?.id ?? null;
      setTurns((ts) => [...ts, { id, q, cardId, status: "pending", stages: [] }]);
      setText("");
      setLive(t("ask.progress.check"));
      const patch = (p: Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...p } : x)));
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/x-ndjson" },
          body: JSON.stringify({ question: q, lang: locale, cardId }),
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const stages: Stage["name"][] = [];
        let result: AskResult | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line) as { type: "stage"; stage: Stage["name"] } | { type: "result"; data: AskResult } | { type: "error" };
            if (msg.type === "stage") {
              stages.push(msg.stage);
              patch({ stages: [...stages] });
            } else if (msg.type === "result") result = msg.data;
            else throw new Error("server");
          }
        }
        if (!result) throw new Error("no result");
        patch({ status: "done", result });
        setLive(t("ask.progress.done"));
      } catch {
        patch({ status: "error" });
        setLive(t("ask.error.title"));
      }
    },
    [busy, ctx, locale, t],
  );

  const clearCtx = () => {
    setCtx(null);
    router.replace("/ask", { scroll: false });
  };
  const clearHistory = () => {
    setTurns([]);
    try {
      sessionStorage.removeItem(STORE);
    } catch {}
    inputRef.current?.focus();
  };
  const retry = (turn: Turn) => {
    setTurns((ts) => ts.filter((x) => x.id !== turn.id));
    void send(turn.q);
  };
  const tooLong = text.length > MAX_QUESTION;
  const qLang = text ? detectLang(text, locale) : locale;

  return (
    <div className="flex flex-col gap-5 pb-48">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.65rem] font-semibold text-ink">{t("ask.title")}</h1>
          <p className="text-ink-2 text-[0.95rem]">{t("ask.subtitle")}</p>
        </div>
        {turns.length > 0 && (
          <button type="button" onClick={clearHistory} className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Trash2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("ask.clearHistory")}</span>
            <span className="sr-only sm:hidden">{t("ask.clearHistory")}</span>
          </button>
        )}
      </header>

      {turns.length === 0 && (
        <section className="flex flex-col gap-5 animate-rise">
          <div className="relative overflow-hidden rounded-[24px] bg-brand text-brand-ink p-5 sm:p-6">
            <span className="absolute -end-6 -top-6 text-white/10" aria-hidden>
              <Khatam size={150} strokeWidth={1} />
            </span>
            <h2 className="relative text-xl font-semibold max-w-[24ch]">{t("ask.welcome.title")}</h2>
            <p className="relative mt-2 text-[0.95rem] text-brand-ink/80 max-w-[46ch] leading-relaxed">{t("ask.welcome.body")}</p>
            <ul className="relative mt-4 flex flex-col gap-2.5 text-sm">
              {[
                [Database, "ask.promise.sources"],
                [SearchX, "ask.promise.honest"],
                [MessageCircleHeart, "ask.promise.person"],
              ].map(([Icon, key]) => {
                const I = Icon as React.ComponentType<{ className?: string }>;
                return (
                  <li key={key as string} className="flex items-center gap-2.5">
                    <span className="grid place-items-center size-7 rounded-full bg-white/10 shrink-0">
                      <I className="size-4 text-[#2FD3AE]" />
                    </span>
                    {t(key as string)}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-col gap-2.5">
            <h2 className="text-sm font-semibold text-ink-2">{t("ask.suggested")}</h2>
            <ul className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => send(t(k))}
                    className="min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-[0.93rem] text-ink text-start hover:border-accent hover:bg-accent-soft transition-colors"
                  >
                    {t(k)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-5" role="log" aria-label={t("ask.title")}>
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            <div className="flex justify-end">
              <p dir={dirOf(detectLang(turn.q, locale))} className="max-w-[85%] rounded-[20px] rounded-ee-[6px] bg-brand text-brand-ink px-4 py-2.5 text-[0.98rem] leading-relaxed whitespace-pre-wrap break-words">
                <span className="sr-only">{t("ask.you")}: </span>
                <Rich text={turn.q} />
              </p>
            </div>
            {turn.status === "pending" && <Progress stages={turn.stages} lang={locale} />}
            {turn.status === "error" && (
              <div role="alert" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
                <div className="flex gap-3">
                  <TriangleAlert className="size-5 text-bad shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="font-semibold text-ink">{t("ask.error.title")}</p>
                    <p className="text-sm text-ink-2">{t("ask.error.body")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => retry(turn)} className="h-11 px-4 rounded-[12px] bg-accent text-accent-ink font-medium">
                    {t("ask.retry")}
                  </button>
                  <a href="/talk" className="inline-flex items-center h-11 px-4 rounded-[12px] border border-line-strong text-ink font-medium">
                    {t("ask.talk")}
                  </a>
                </div>
              </div>
            )}
            {turn.status === "done" && turn.result && <AnswerCard r={turn.result} onAsk={(q) => send(q)} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        {live}
      </p>

      {/* Composer: fixed above the tab bar, thumb-reachable */}
      <div className="fixed inset-x-0 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom))] z-30 bg-[color-mix(in_oklab,var(--bg)_90%,transparent)] backdrop-blur-md border-t border-line/60">
        <form
          className="mx-auto w-full max-w-3xl px-4 pt-2.5 pb-2 flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          {ctx && (
            <div className="flex">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft ps-3 pe-1 h-9 text-sm text-ink max-w-full" data-testid="ask-context">
                <ShieldCheck className="size-4 text-accent shrink-0" aria-hidden />
                <span className="truncate">{t("ask.context", { title: locale === "ar" ? ctx.title_ar : ctx.title_en })}</span>
                <button type="button" onClick={clearCtx} aria-label={t("ask.context.clear")} className="grid place-items-center size-8 rounded-full hover:bg-surface/60">
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="ask-input" className="sr-only">
              {t("ask.input.label")}
            </label>
            <textarea
              id="ask-input"
              ref={inputRef}
              rows={1}
              value={text}
              dir={dirOf(qLang)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder={t("ask.input.placeholder")}
              aria-describedby="ask-hint"
              aria-invalid={tooLong || undefined}
              className="flex-1 resize-none rounded-[16px] border border-line-strong bg-surface text-ink placeholder:text-ink-3 px-4 py-2.5 min-h-12 max-h-40 leading-relaxed focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
            />
            <button
              type="submit"
              disabled={!text.trim() || tooLong || busy}
              aria-label={t("ask.input.send")}
              className="grid place-items-center size-12 rounded-full bg-accent text-accent-ink shadow-card disabled:opacity-40 transition-opacity shrink-0"
            >
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
            </button>
          </div>
          <p id="ask-hint" className={cn("text-[0.75rem] px-1", tooLong ? "text-bad" : "text-ink-3")}>
            {tooLong ? t("ask.input.tooLong", { max: MAX_QUESTION }) : turns.length ? t("ask.historyNote") : t("ask.input.hint")}
          </p>
        </form>
      </div>
    </div>
  );
}
