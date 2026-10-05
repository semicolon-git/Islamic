"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { makeT, messages, type Locale } from "@/i18n";
import { RECITER, recitationUrl } from "@/lib/quran/recitation";
import { cn } from "./cn";

type Status = "idle" | "loading" | "playing" | "paused" | "error";
const PLAY_EVENT = "recitation:play";

/**
 * Plays the human recitation of the given verses, in order, by key (see src/lib/quran/recitation.ts).
 * Only one recitation plays at a time on a page. The reciter is always named.
 */
export function RecitationButton({ keys, locale, className }: { keys: string[]; locale: Locale; className?: string }) {
  const t = makeT(messages, locale);
  const id = useId();
  const urls = keys.map((k) => ({ key: k, url: recitationUrl(k) })).filter((x): x is { key: string; url: string } => !!x.url);
  const audio = useRef<HTMLAudioElement | null>(null);
  const index = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [current, setCurrent] = useState(0);
  const sig = urls.map((u) => u.key).join(",");

  const load = useCallback(
    (i: number) => {
      const a = audio.current!;
      index.current = i;
      setCurrent(i);
      a.src = urls[i].url;
      setStatus("loading");
      a.play().catch(() => setStatus((s) => (s === "loading" ? "error" : s)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  );

  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    audio.current = a;
    const onPlaying = () => setStatus("playing");
    const onWaiting = () => setStatus("loading");
    const onPause = () => setStatus((s) => (s === "playing" || s === "loading" ? "paused" : s));
    const onError = () => setStatus("error");
    const onEnded = () => {
      if (index.current + 1 < urls.length) load(index.current + 1);
      else {
        index.current = 0;
        setCurrent(0);
        setStatus("idle");
      }
    };
    a.addEventListener("playing", onPlaying);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id && !a.paused) a.pause();
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => {
      window.removeEventListener(PLAY_EVENT, onOther);
      a.pause();
      a.removeAttribute("src");
      a.load();
      audio.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, id, load]);

  if (!urls.length) return null;

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (status === "playing" || status === "loading") {
      a.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
    if (status === "paused") {
      setStatus("loading");
      a.play().catch(() => setStatus((s) => (s === "loading" ? "error" : s)));
    } else load(status === "error" ? index.current : 0);
  };

  const active = status === "playing" || status === "loading";
  const label = status === "error" ? t("quran.recitation.retry") : active ? t("quran.recitation.pause") : status === "paused" ? t("quran.recitation.resume") : t("quran.recitation.listen");
  const reciter = locale === "ar" ? RECITER.short_ar : RECITER.short_en;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={active}
        aria-label={`${label} · ${t("quran.recitation.by", { name: locale === "ar" ? RECITER.name_ar : RECITER.name_en })}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm font-medium text-ink transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98] pointer-coarse:h-11"
      >
        {status === "loading" ? (
          <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />
        ) : status === "playing" ? (
          <Pause className="size-4" aria-hidden />
        ) : status === "error" ? (
          <RotateCcw className="size-4" aria-hidden />
        ) : (
          <Play className="size-4 rtl:-scale-x-100" aria-hidden />
        )}
        <span>{label}</span>
        <span className="text-ink-3" aria-hidden>· {reciter}</span>
      </button>
      {urls.length > 1 && status !== "idle" && status !== "error" && (
        <span className="mono text-xs text-ink-3" dir="ltr" aria-live="polite">
          {urls[current].key}
        </span>
      )}
      {status === "error" && (
        <span role="alert" className="text-xs text-bad">
          {t("quran.recitation.error")}
        </span>
      )}
    </span>
  );
}
