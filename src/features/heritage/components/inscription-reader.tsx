"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, ImageUp, Keyboard, Search, Sparkles, X } from "lucide-react";
import { Badge, Button, Callout, Chip, cn, Skeleton } from "@/components/ui";
import { Segmented } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/client";
import { hasArabic } from "@/lib/quran/normalize";
import type { InscriptionView } from "../inscription-view";
import { ArabicKeyboard } from "./arabic-keyboard";
import { InscriptionResult } from "./inscription-result";

/** Try-it examples. These are visitor inputs for the matcher, never displayed as Quran text. */
export const EXAMPLES = [
  { key: "heritage.ins.exLight", text: "الله نور السموات والأرض" },
  { key: "heritage.ins.exKursi", text: "الله لا إله إلا هو الحي القيوم" },
  { key: "heritage.ins.exAlhambra", text: "ولا غالب إلا الله" },
  { key: "heritage.ins.exShahada", text: "لا إله إلا الله محمد رسول الله" },
  { key: "heritage.ins.exSwapped", text: "هو الذي جعل القمر ضياء والشمس نورا" },
] as const;

interface Reading {
  text: string;
  words: { text: string; uncertain: boolean; alternatives: string[] }[];
  script_tier: string;
  legibility: string;
}

type Phase = "idle" | "checking" | "reading" | "done" | "error";

/** Downscale to ≤ 1600 px and re-encode as JPEG in the browser: this also drops EXIF (location, camera). */
async function toJpegBase64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function InscriptionReader({ aiEnabled }: { aiEnabled: boolean }) {
  const { t } = useI18n();
  const params = useSearchParams();
  const [mode, setMode] = useState<"type" | "photo">(aiEnabled && !params.get("text") ? "photo" : "type");
  const [text, setText] = useState(params.get("text") ?? "");
  const [kb, setKb] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<InscriptionView | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const showResult = useCallback(() => {
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const check = useCallback(
    async (value: string) => {
      const v = value.trim();
      setError(null);
      if (!v || !hasArabic(v)) {
        setError(t("heritage.ins.needArabic"));
        return;
      }
      setPhase("checking");
      setView(null);
      try {
        const res = await fetch("/api/inscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: v }) });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error?.message);
        setView(j.data.view);
        setPhase("done");
        showResult();
      } catch {
        setPhase("error");
        setError(t("heritage.ins.error"));
      }
    },
    [t, showResult],
  );

  // Deep link: /inscription?text=… checks immediately.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const q = params.get("text");
    if (q && hasArabic(q)) void check(q);
  }, [params, check]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setView(null);
    setReading(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    setPhase("reading");
    try {
      const base64 = await toJpegBase64(file);
      const res = await fetch("/api/inscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: { mediaType: "image/jpeg", base64 } }),
      });
      const j = await res.json();
      if (!j.ok) {
        setPhase("error");
        setError(j.error?.code === "ai_disabled" ? t("heritage.ins.noAiBody") : t("heritage.ins.photoFailed"));
        return;
      }
      setReading(j.data.reading);
      setText(j.data.reading?.text ?? "");
      if (!j.data.view) {
        setPhase("error");
        setError(t("heritage.ins.noText"));
        return;
      }
      setView(j.data.view);
      setPhase("done");
      showResult();
    } catch {
      setPhase("error");
      setError(t("heritage.ins.photoFailed"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const insert = (ch: string) => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + ch + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(start + ch.length, start + ch.length);
    });
  };
  const backspace = () => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    if (start === end && start === 0) return;
    const from = start === end ? Math.max(0, start - 1) : start;
    setText(text.slice(0, from) + text.slice(end));
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(from, from);
    });
  };

  const reset = () => {
    setView(null);
    setReading(null);
    setPhase("idle");
    setError(null);
    setText("");
    if (mode === "type") requestAnimationFrame(() => taRef.current?.focus());
  };

  const busy = phase === "checking" || phase === "reading";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <Segmented
            label={t("heritage.ins.mode")}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: "type", label: <span className="inline-flex items-center gap-1.5"><Keyboard className="size-4" aria-hidden />{t("heritage.ins.tabType")}</span> },
              { value: "photo", label: <span className="inline-flex items-center gap-1.5"><Camera className="size-4" aria-hidden />{t("heritage.ins.tabPhoto")}</span> },
            ]}
          />
        </div>

        {mode === "photo" ? (
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            {!aiEnabled ? (
              <div className="flex flex-col items-start gap-3 rounded-[var(--radius)] bg-surface-2 p-4" data-testid="no-ai">
                <h2 className="font-semibold text-ink flex items-center gap-2">
                  <Sparkles className="size-5 text-violet" aria-hidden />
                  {t("heritage.ins.noAiTitle")}
                </h2>
                <p className="text-ink-2 text-[0.95rem]">{t("heritage.ins.noAiBody")}</p>
                <Button
                  onClick={() => {
                    setMode("type");
                    requestAnimationFrame(() => taRef.current?.focus());
                  }}
                >
                  <Keyboard className="size-4" aria-hidden />
                  {t("heritage.ins.typeInstead")}
                </Button>
              </div>
            ) : (
              <>
                <label
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-line-strong bg-surface-2/60 min-h-56 p-6 text-center cursor-pointer hover:border-accent transition-colors overflow-hidden",
                    busy && "pointer-events-none",
                  )}
                >
                  {preview ? (
                    <img src={preview} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
                  ) : null}
                  <span className="relative size-14 rounded-full bg-accent text-accent-ink grid place-items-center shadow-card">
                    <ImageUp className="size-7" aria-hidden />
                  </span>
                  <span className="relative font-semibold text-ink text-lg">{phase === "reading" ? t("heritage.ins.photoReading") : t("heritage.ins.photoCta")}</span>
                  <span className="relative text-sm text-ink-2 max-w-[38ch]">{t("heritage.ins.photoHint")}</span>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} disabled={busy} />
                </label>
                {reading && (
                  <div className="rounded-[var(--radius)] border border-line p-4 flex flex-col gap-2" data-testid="ai-reading">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="violet">
                        <Sparkles className="size-3.5" aria-hidden />
                        {t("heritage.ins.readingLabel")}
                      </Badge>
                      {reading.script_tier !== "unsure" && (
                        <Badge tone="neutral">{t("heritage.ins.script", { script: t(`heritage.script.${reading.script_tier}`) })}</Badge>
                      )}
                    </div>
                    <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-xl leading-[2.1]">
                      {reading.words.map((w, i) => (
                        <span key={i}>
                          {w.uncertain ? (
                            <span className="underline decoration-dotted decoration-warn decoration-2 underline-offset-[7px]" title={w.alternatives.join(" · ")}>
                              {w.text}
                            </span>
                          ) : (
                            w.text
                          )}{" "}
                        </span>
                      ))}
                    </p>
                    <p className="text-sm text-ink-2">{t("heritage.ins.readingHelp")}</p>
                    <Button variant="secondary" size="sm" className="self-start" onClick={() => setMode("type")}>
                      <Keyboard className="size-4" aria-hidden />
                      {t("heritage.ins.tabType")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <form
            className="p-4 sm:p-5 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void check(text);
            }}
          >
            <label htmlFor="ins-text" className="text-sm font-medium text-ink">
              {t("heritage.ins.textLabel")}
            </label>
            <div className="relative">
              <textarea
                id="ins-text"
                ref={taRef}
                lang="ar"
                dir="rtl"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void check(text);
                  }
                }}
                placeholder={t("heritage.ins.textPlaceholder")}
                inputMode={kb ? "none" : "text"}
                className="w-full resize-y rounded-[14px] border border-line-strong bg-sand/40 pr-4 pl-12 py-3 text-[1.55rem] leading-[2.1] text-ink placeholder:text-ink-3 placeholder:text-lg font-[family-name:var(--font-ms)] focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
                aria-describedby={error ? "ins-error" : undefined}
                data-testid="inscription-input"
              />
              {text && (
                <button type="button" onClick={reset} aria-label={t("heritage.ins.clear")} title={t("heritage.ins.clear")} className="absolute top-2 left-2 size-9 grid place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {kb && <ArabicKeyboard onKey={insert} onBackspace={backspace} label={t("heritage.ins.kbLabel")} spaceLabel={t("heritage.ins.kbSpace")} deleteLabel={t("heritage.ins.kbDelete")} />}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
              <Button type="button" variant="ghost" className="self-start sm:self-auto" onClick={() => setKb((v) => !v)} aria-pressed={kb}>
                <Keyboard className="size-4" aria-hidden />
                {kb ? t("heritage.ins.hideKeyboard") : t("heritage.ins.keyboard")}
              </Button>
              <Button type="submit" size="lg" className="w-full sm:w-auto sm:ms-auto" loading={phase === "checking"}>
                <Search className="size-5" aria-hidden />
                {t("heritage.ins.check")}
              </Button>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("heritage.ins.examples")}</span>
              <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
                {EXAMPLES.map((ex) => (
                  <Chip
                    key={ex.key}
                    className="shrink-0 h-11"
                    onClick={() => {
                      setText(ex.text);
                      void check(ex.text);
                    }}
                  >
                    {t(ex.key)}
                  </Chip>
                ))}
              </div>
            </div>
          </form>
        )}
      </div>

      <div ref={resultRef} aria-live="polite" aria-busy={busy} className="scroll-mt-20 flex flex-col gap-3">
        {error && (
          <Callout tone={phase === "error" ? "warn" : "neutral"}>
            <span id="ins-error" className="text-ink">{error}</span>
          </Callout>
        )}
        {busy && (
          <div className="flex flex-col gap-3" aria-label={phase === "reading" ? t("heritage.ins.photoReading") : t("heritage.ins.checking")}>
            <p className="text-sm text-ink-2">{phase === "reading" ? t("heritage.ins.photoReading") : t("heritage.ins.checking")}</p>
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-36 w-full" />
          </div>
        )}
        {view && phase === "done" && (
          <section aria-label={t("heritage.ins.result")}>
            <InscriptionResult view={view} onReset={reset} />
          </section>
        )}
      </div>
    </div>
  );
}
